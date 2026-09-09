import { describe, expect, it, vi } from 'vitest'
import { configSchema } from '../src/host/config'
import { rpcHandler } from '../src/host/rpc'
import { definitions } from '../src/host/tools'

describe('host RPC surface', () => {
  it('routes known endpoints through the AppHost and normalizes failures', async () => {
    const host = {
      listUi: vi.fn(() => [{publicName: 'wise', rawName: 'show', serverName: 'demo', resourceUri: 'ui://demo/app'}]),
      open: vi.fn(async () => ({sessionId: 's1'})),
      call: vi.fn(async () => ({content: []})),
      close: vi.fn(),
    }
    const handle = rpcHandler(host as never)
    const signal = new AbortController().signal

    await expect(handle('tools/list-ui', null, signal)).resolves.toEqual({ok: true, value: host.listUi()})
    await expect(handle('apps/open', {callToken: 't1'}, signal)).resolves.toEqual({ok: true, value: {sessionId: 's1'}})
    await expect(handle('apps/call', {sessionId: 's1', name: 'update', arguments: {x: 1}}, signal))
      .resolves.toEqual({ok: true, value: {content: []}})
    await expect(handle('apps/close', {sessionId: 's1'}, signal)).resolves.toEqual({ok: true, value: null})
    expect(host.open).toHaveBeenCalledWith('t1', signal)
    expect(host.call).toHaveBeenCalledWith('s1', 'update', {x: 1}, signal)
    expect(host.close).toHaveBeenCalledWith('s1')

    const rejected = await handle('missing', {}, signal)
    expect(rejected).toMatchObject({ok: false, error: {code: 'internal'}})
  })
})

describe('host tool definitions', () => {
  it('registers model tools that hide executable resource content from model output', async () => {
    const host = {
      modelTools: () => [{
        serverName: 'demo',
        publicName: 'wise_mcp__demo__show',
        tool: {
          name: 'show',
          description: 'Show an App',
          inputSchema: {type: 'object', properties: {x: {type: 'number'}}},
        },
      }],
      execute: vi.fn(async () => ({
        callToken: 'capability-token',
        result: {
          content: [
            {type: 'text', text: 'visible'},
            {type: 'resource', text: '<script>hidden()</script>'},
            {type: 'resource_link', uri: 'ui://demo/app'},
          ],
          structuredContent: {_meta: {secret: true}, value: 1},
        },
      })),
    }
    const [entry] = definitions(host as never)
    expect(entry?.serverName).toBe('demo')
    expect(entry?.definition.name).toBe('wise_mcp__demo__show')

    const value = await entry!.definition.execute({x: 1}, {signal: new AbortController().signal} as never)
    expect(value).toEqual({content: [{type: 'text', text: 'visible'}], structuredContent: {value: 1}, callToken: 'capability-token'})
    expect(entry!.definition.output.render({}, value as never)).toEqual([{type: 'text', text: 'visible'}])
    expect(entry!.definition.output.presentationMeta?.({}, value as never)).toEqual({
      wiseMcpApp: {callToken: 'capability-token', publicName: 'wise_mcp__demo__show'},
    })
  })

  it('turns MCP App tool errors into a retryable DSH tool failure', async () => {
    const host = {
      modelTools: () => [{serverName: 'demo', publicName: 'wise_mcp__demo__show', tool: {name: 'show', inputSchema: {type: 'object'}}}],
      execute: vi.fn(async () => ({result: {content: [], isError: true}})),
    }
    const [entry] = definitions(host as never)
    await expect(entry!.definition.execute({}, {signal: new AbortController().signal} as never)).rejects.toThrow(/failed|cancelled/i)
  })
})

describe('host config validation', () => {
  it('accepts stdio and streamable-http server configs and rejects duplicate namespaces', () => {
    expect(configSchema.parse({
      servers: [
        {serverName: 'local', transport: 'stdio', command: 'node', args: ['server.js'], env: {}, cwd: '/tmp'},
        {serverName: 'remote', transport: 'streamable-http', url: 'https://example.com/mcp', headers: {}},
      ],
    }).servers.map(server => server.serverName)).toEqual(['local', 'remote'])

    expect(() => configSchema.parse({
      servers: [
        {serverName: 'dup', transport: 'streamable-http', url: 'https://example.com/a', headers: {}},
        {serverName: 'dup', transport: 'streamable-http', url: 'https://example.com/b', headers: {}},
      ],
    })).toThrow()
  })
})
