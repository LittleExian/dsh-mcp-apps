import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { languages, periods, type TrendingResult } from './contract'

export const TRENDING_RESOURCE_URI = 'ui://github-trending/app.html'

type TrendingClient = {
  get(input: unknown, signal?: AbortSignal): Promise<TrendingResult>
}

type ServerOptions = {
  client: TrendingClient
  html: string
}

const toolInput = {
  period: z.enum(periods).default('weekly').describe('Time window for recently created repositories.'),
  language: z.enum(languages).default('All').describe('Programming language filter.'),
  limit: z.number().int().min(5).max(15).default(10).describe('Number of repositories to return.'),
}

export function createGitHubTrendingServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: 'github-trending-mcp-app', version: '0.1.0' })
  const run = async (input: unknown, signal: AbortSignal) => {
    try {
      const value = await options.client.get(input, signal)
      return {
        content: [{ type: 'text' as const, text: summary(value) }],
        structuredContent: value,
      }
    } catch {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'GitHub Trending could not be loaded. Check connectivity or API rate limits and try again.' }],
      }
    }
  }

  registerAppTool(server, 'show-trending', {
    title: 'Show GitHub Trending',
    description: 'Show an interactive ranking of recently created GitHub repositories, approximated with the official GitHub Search API.',
    inputSchema: toolInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: TRENDING_RESOURCE_URI, visibility: ['model'] } },
  }, async (input, extra) => run(input, extra.signal))

  registerAppTool(server, 'refresh-trending', {
    title: 'Refresh GitHub Trending',
    description: 'Refresh the interactive GitHub repository ranking with a selected period and language.',
    inputSchema: toolInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: TRENDING_RESOURCE_URI, visibility: ['app'] } },
  }, async (input, extra) => run(input, extra.signal))

  registerAppResource(server, 'GitHub Trending dashboard', TRENDING_RESOURCE_URI, {
    description: 'Interactive repository ranking rendered entirely from MCP tool results.',
  }, async () => ({
    contents: [{ uri: TRENDING_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: options.html }],
  }))

  return server
}

function summary(result: TrendingResult): string {
  const repositories = result.repositories
    .slice(0, 5)
    .map(repository => `${repository.rank}. ${repository.fullName} ★${repository.stars}`)
    .join('; ')
  return `GitHub Trending (${result.period}, ${result.language}): ${repositories || 'no repositories found'}`
}
