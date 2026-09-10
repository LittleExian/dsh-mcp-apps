import { readFile } from 'node:fs/promises'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createTrendingClient } from './github'
import { createGitHubTrendingServer } from './server'

const html = await readFile(new URL('./app.html', import.meta.url), 'utf8')
const client = createTrendingClient({ token: process.env.GITHUB_TOKEN })
const server = createGitHubTrendingServer({ client, html })
await server.connect(new StdioServerTransport())
