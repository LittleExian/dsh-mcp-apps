import { randomUUID } from 'node:crypto'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { AppPreview, AppResult, UiTool } from '../shared'
import { identifier, jsonObject, metadata, publicName, record, resource, toolResult } from './contracts'

export interface ServerConnection {
  name: string
  tools: Tool[]
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  read(uri: string, signal?: AbortSignal): Promise<unknown>
  close(): Promise<void>
}
interface RetainedCall {
  token: string
  server: ServerConnection
  tool: UiTool
  input: Record<string, unknown>
  result: AppResult
  expires: number
}
interface Session {
  id: string
  call: RetainedCall
  active: number
  windowStart: number
  count: number
  controller: AbortController
}
export interface HostOptions {
  ttlMs?: number
  maxEntries?: number
  maxCallsPerMinute?: number
  maxConcurrentCalls?: number
  now?: () => number
}
export class AppHost {
  private readonly servers: Map<string, ServerConnection>
  private readonly calls = new Map<string, RetainedCall>()
  private readonly sessions = new Map<string, Session>()
  private readonly now: () => number
  private readonly limits: Required<Omit<HostOptions, 'now'>>
  private disposed = false
  constructor(connections: ServerConnection[], options: HostOptions = {}) {
    this.servers = new Map(connections.map(server => [server.name, server]))
    if (this.servers.size !== connections.length) throw new Error('Duplicate MCP server name.')
    this.now = options.now ?? Date.now
    this.limits = {ttlMs: options.ttlMs ?? 15 * 60_000, maxEntries: options.maxEntries ?? 32,
      maxCallsPerMinute: options.maxCallsPerMinute ?? 60, maxConcurrentCalls: options.maxConcurrentCalls ?? 4}
    for (const limit of Object.values(this.limits)) if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid Host limit.')
  }
  modelTools() {
    return [...this.servers.values()].flatMap(server => server.tools.filter(tool => metadata(tool).visibility.includes('model'))
      .map(tool => ({serverName: server.name, tool, publicName: publicName(server.name, tool.name)})))
  }
  listUi(): UiTool[] {
    return this.modelTools().flatMap(({serverName, tool, publicName}) => {
      const {resourceUri} = metadata(tool)
      return resourceUri ? [{serverName, rawName: tool.name, publicName, resourceUri}] : []
    })
  }
  async execute(serverName: string, name: string, args: unknown, signal?: AbortSignal) {
    const server = this.server(serverName)
    const tool = server.tools.find(tool => tool.name === name)
    if (!tool || !metadata(tool).visibility.includes('model')) throw new Error('Tool is not model-visible.')
    if (tool.execution?.taskSupport === 'required') throw new Error('Task-based tools are not supported.')
    const input = jsonObject(args)
    const result = toolResult(await server.call(name, input, signal))
    this.server(serverName)
    signal?.throwIfAborted()
    const {resourceUri} = metadata(tool)
    if (!resourceUri || result.isError) return {result}
    this.sweep()
    while (this.calls.size >= this.limits.maxEntries) this.remove(this.calls.keys().next().value!)
    const token = randomUUID()
    this.calls.set(token, {token, server, input, result: structuredClone(result), expires: this.now() + this.limits.ttlMs,
      tool: {serverName, rawName: name, publicName: publicName(serverName, name), resourceUri}})
    return {result, callToken: token}
  }
  async open(rawToken: unknown, signal?: AbortSignal): Promise<AppPreview> {
    this.sweep()
    const retained = this.calls.get(identifier(rawToken))
    if (!retained) throw new Error('App result expired or unavailable.')
    this.assertRetained(retained)
    return structuredClone(await this.prepare(retained, signal))
  }
  private async prepare(call: RetainedCall, signal?: AbortSignal): Promise<AppPreview> {
    const response = await call.server.read(call.tool.resourceUri, signal)
    if (!record(response) || !Array.isArray(response.contents)) throw new Error('Invalid resource response.')
    const content = response.contents.find(item => record(item) && item.uri === call.tool.resourceUri)
    const appResource = resource(content, call.tool.resourceUri)
    this.assertRetained(call)
    signal?.throwIfAborted()
    if (this.sessions.size >= this.limits.maxEntries * 4) throw new Error('App session limit exceeded.')
    const id = randomUUID()
    const preview: AppPreview = {sessionId: id, tool: call.tool, input: call.input, result: call.result, resource: appResource}
    this.sessions.set(id, {id, call, active: 0, count: 0, windowStart: this.now(), controller: new AbortController()})
    return preview
  }
  async call(rawId: unknown, rawName: unknown, args: unknown, signal?: AbortSignal): Promise<AppResult> {
    this.sweep()
    const session = this.sessions.get(identifier(rawId))
    if (!session) throw new Error('App session expired or unavailable.')
    this.assertRetained(session.call)
    const name = identifier(rawName)
    const tool = session.call.server.tools.find(tool => tool.name === name)
    const meta = tool ? metadata(tool) : undefined
    if (!tool || !meta?.visibility.includes('app') || (meta.resourceUri && meta.resourceUri !== session.call.tool.resourceUri) || tool.execution?.taskSupport === 'required') {
      throw new Error('Tool is not allowed for this App resource.')
    }
    const input = jsonObject(args)
    this.enter(session)
    const combined = signal ? AbortSignal.any([signal, session.controller.signal]) : session.controller.signal
    try {
      const result = toolResult(await session.call.server.call(name, input, combined))
      this.assertRetained(session.call)
      combined.throwIfAborted()
      return result
    } finally {session.active -= 1}
  }
  private enter(session: Session) {
    if (this.now() - session.windowStart >= 60_000) {session.windowStart = this.now(); session.count = 0}
    if (session.active >= this.limits.maxConcurrentCalls || session.count >= this.limits.maxCallsPerMinute) throw new Error('App call limit exceeded.')
    session.active += 1
    session.count += 1
  }
  close(rawId: unknown): void {
    const session = this.sessions.get(identifier(rawId))
    if (session) {
      this.sessions.delete(session.id)
      session.controller.abort()
    }
  }
  sweep(): void {
    for (const call of this.calls.values()) if (call.expires <= this.now()) this.remove(call.token)
  }
  invalidate(name: string): void {
    this.servers.delete(name)
    for (const call of this.calls.values()) if (call.server.name === name) this.remove(call.token)
  }
  private remove(token: string) {
    this.calls.delete(token)
    for (const session of this.sessions.values()) if (session.call.token === token) this.close(session.id)
  }
  private server(name: string): ServerConnection {
    const server = this.servers.get(name)
    if (this.disposed || !server) throw new Error('MCP server is unavailable.')
    return server
  }
  private assertRetained(call: RetainedCall): void {
    this.sweep()
    if (this.calls.get(call.token) !== call || this.server(call.server.name) !== call.server) throw new Error('App session expired or unavailable.')
  }
  async dispose(): Promise<void> {
    this.disposed = true
    for (const token of this.calls.keys()) this.remove(token)
    const servers = [...this.servers.values()]
    this.servers.clear()
    await Promise.allSettled(servers.map(server => server.close()))
  }
}
