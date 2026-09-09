import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import { jsonObject } from './contracts'
import type { AppHost } from './manager'
export function rpcHandler(host: AppHost): ConnectionRpcHandler {
  return async (endpoint, payload, signal) => {
    try {
      signal.throwIfAborted()
      if (endpoint === 'tools/list-ui') return {ok: true, value: host.listUi()}
      const input = jsonObject(payload)
      if (endpoint === 'apps/open') return {ok: true, value: await host.open(input.callToken, signal)}
      if (endpoint === 'apps/call') return {ok: true, value: await host.call(input.sessionId, input.name, input.arguments, signal)}
      if (endpoint === 'apps/close') {host.close(input.sessionId); return {ok: true, value: null}}
      throw new Error('Unknown endpoint.')
    } catch {
      return {ok: false, error: {code: 'internal', details: {}, message: 'App request rejected, expired, or failed. Re-run the original tool explicitly if needed.'}}
    }
  }
}
