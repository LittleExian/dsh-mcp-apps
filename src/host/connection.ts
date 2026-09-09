import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ToolListChangedNotificationSchema, type Tool } from '@modelcontextprotocol/sdk/types.js'
import { metadata, safeEnvironment } from './contracts'
import type { ServerConfig } from './config'
import type { ServerConnection } from './manager'

export async function connectServer(config: ServerConfig, timeout: number, invalidated: () => void): Promise<ServerConnection> {
  const client = new Client({name: 'wise-mcp-apps', version: '0.1.0'}, {
    capabilities: {extensions: {'io.modelcontextprotocol/ui': {mimeTypes: ['text/html;profile=mcp-app']}}},
  })
  const transport = config.transport === 'stdio'
    ? new StdioClientTransport({command: config.command, args: config.args, env: safeEnvironment(config.env), cwd: config.cwd, stderr: 'ignore', maxBufferSize: 8 * 1024 * 1024})
    : new StreamableHTTPClientTransport(new URL(config.url), {requestInit: {headers: config.headers}})
  let active = true
  const controller = new AbortController()
  const close = async () => {active = false; controller.abort(); await Promise.allSettled([client.close(), transport.close()])}
  const invalidate = () => {if (active) {invalidated(); void close()}}
  client.onclose = invalidate
  // Metadata changes revoke every existing capability; reconnect requires plugin reload.
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => invalidate())
  try {
    await client.connect(transport, {timeout})
    const tools = await listTools(client, timeout)
    if (!active) throw new Error('MCP server disconnected during discovery.')
    const options = (signal?: AbortSignal) => ({timeout, signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal})
    return {name: config.serverName, tools, close,
      call: (name, args, signal) => client.callTool({name, arguments: args}, undefined, options(signal)),
      read: (uri, signal) => client.readResource({uri}, options(signal)),
    }
  } catch {
    await close()
    throw new Error('MCP connection or tool discovery failed. Check the server configuration.')
  }
}
async function listTools(client: Client, timeout: number): Promise<Tool[]> {
  const tools: Tool[] = []
  const names = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const result = await client.listTools(cursor ? {cursor} : undefined, {timeout})
    for (const tool of result.tools) {
      if (names.has(tool.name) || tools.length >= 1000) throw new Error('Invalid MCP tool list.')
      metadata(tool)
      names.add(tool.name)
      tools.push(tool)
    }
    if (!result.nextCursor) return tools
    if (cursors.has(result.nextCursor)) throw new Error('Invalid MCP pagination.')
    cursors.add(result.nextCursor)
    cursor = result.nextCursor
  }
  throw new Error('MCP tool page limit exceeded.')
}
