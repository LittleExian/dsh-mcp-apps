import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createGitHubTrendingServer, TRENDING_RESOURCE_URI } from '../examples/github-trending/server'
import type { TrendingResult } from '../examples/github-trending/github'

const sample: TrendingResult = {
  approximate: true,
  cached: false,
  period: 'weekly',
  language: 'All',
  generatedAt: '2026-09-10T00:00:00.000Z',
  windowStart: '2026-09-03',
  totalCount: 1,
  incomplete: false,
  repositories: [{
    rank: 1,
    fullName: 'octo/spark',
    url: 'https://github.com/octo/spark',
    description: 'Useful project',
    language: 'TypeScript',
    stars: 321,
    forks: 12,
    openIssues: 4,
    createdAt: '2026-09-08T00:00:00Z',
    pushedAt: '2026-09-10T00:00:00Z',
  }],
}

describe('GitHub Trending MCP App server', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => { await Promise.allSettled(cleanups.splice(0).map(cleanup => cleanup())) })

  it('registers model and app tools plus the UI resource', async () => {
    const get = vi.fn(async () => structuredClone(sample))
    const server = createGitHubTrendingServer({ client: { get }, html: '<!doctype html><title>Trending</title>' })
    const client = new Client({ name: 'test-client', version: '1.0.0' }, {})
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    cleanups.push(async () => { await client.close(); await server.close() })

    const tools = await client.listTools()
    expect(tools.tools.map(tool => tool.name)).toEqual(['show-trending', 'refresh-trending'])
    expect(tools.tools[0]?._meta?.ui).toEqual({ resourceUri: TRENDING_RESOURCE_URI, visibility: ['model'] })
    expect(tools.tools[1]?._meta?.ui).toEqual({ resourceUri: TRENDING_RESOURCE_URI, visibility: ['app'] })

    const result = await client.callTool({ name: 'show-trending', arguments: { period: 'weekly', language: 'All', limit: 10 } })
    expect(result.structuredContent).toEqual(sample)
    expect(result.content).toEqual([{ type: 'text', text: 'GitHub Trending (weekly, All): 1. octo/spark ★321' }])
    expect(get).toHaveBeenCalledWith({ period: 'weekly', language: 'All', limit: 10 }, expect.any(AbortSignal))

    const resource = await client.readResource({ uri: TRENDING_RESOURCE_URI })
    expect(resource.contents).toEqual([{
      uri: TRENDING_RESOURCE_URI,
      mimeType: 'text/html;profile=mcp-app',
      text: '<!doctype html><title>Trending</title>',
    }])
  })

  it('returns a generic MCP error without leaking upstream details', async () => {
    const server = createGitHubTrendingServer({
      client: { get: async () => { throw new Error('Bearer secret-token upstream payload') } },
      html: '<!doctype html>',
    })
    const client = new Client({ name: 'test-client', version: '1.0.0' }, {})
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    cleanups.push(async () => { await client.close(); await server.close() })

    const result = await client.callTool({ name: 'show-trending', arguments: {} })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })
})
