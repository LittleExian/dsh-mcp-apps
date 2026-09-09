import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-tools'
import { CHANNEL } from './shared'
import { Config, configSchema } from './host/config'
import { connectServer } from './host/connection'
import { AppHost, type ServerConnection } from './host/manager'
import { definitions } from './host/tools'
import { rpcHandler } from './host/rpc'
export { Config }
export const name = 'wise-mcp-apps'
export const inject = ['tools', 'connection']

export async function apply(ctx: Context, rawConfig: unknown): Promise<void> {
  const parsed = configSchema.safeParse(rawConfig)
  if (!parsed.success) throw new Error('Invalid wise-mcp-apps configuration.')
  const config = parsed.data
  const connections: ServerConnection[] = []
  const registrations = new Map<string, (() => void)[]>()
  const invalidatedNames = new Set<string>()
  let host: AppHost | undefined
  let disposed = false
  ctx.effect(() => () => {
    disposed = true
    for (const disposers of registrations.values()) for (const dispose of disposers) dispose()
    return host ? host.dispose() : Promise.allSettled(connections.map(server => server.close())).then(() => {})
  }, 'wise-mcp-apps.host')
  try {
    for (const serverConfig of config.servers) {
      const connection = await connectServer(serverConfig, config.operationTimeoutMs, () => {
        invalidatedNames.add(serverConfig.serverName)
        host?.invalidate(serverConfig.serverName)
        for (const dispose of registrations.get(serverConfig.serverName) ?? []) dispose()
        registrations.delete(serverConfig.serverName)
      })
      connections.push(connection)
      if (disposed) {await connection.close(); throw new Error('Plugin disposed during startup.')}
    }
    if (invalidatedNames.size) throw new Error('MCP server disconnected during startup.')
    host = new AppHost(connections, config)
    for (const {serverName, definition} of definitions(host)) {
      const dispose = ctx.tools.register(definition)
      registrations.set(serverName, [...registrations.get(serverName) ?? [], dispose])
    }
    ctx.connection.rpc.handle(CHANNEL, rpcHandler(host), {authority: 'trusted-host'})
    const activeHost = host
    ctx.effect(() => {
      const timer = setInterval(() => activeHost.sweep(), Math.min(config.ttlMs, 30_000))
      timer.unref()
      return () => clearInterval(timer)
    }, 'wise-mcp-apps.expiry')
  } catch {
    for (const disposers of registrations.values()) for (const dispose of disposers) dispose()
    registrations.clear()
    if (host) await host.dispose()
    await Promise.allSettled(connections.map(server => server.close()))
    throw new Error('wise-mcp-apps could not start. Check MCP configuration and tool-name conflicts.')
  }
}
