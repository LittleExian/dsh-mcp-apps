import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { CHANNEL } from '../shared.ts'
import { parseUiTools } from './contract.ts'
import { McpAppToolView } from './McpAppToolView.tsx'

export const inject = ['connection','slots']

export async function apply(ctx: ClientContext): Promise<void> {
  // Host and browser connection declarations share one package; this entry runs only in the browser.
  const connection = (ctx as unknown as {connection:ConnectionHandle}).connection
  const response = await connection.rpc.call(CHANNEL,'tools/list-ui',null)
  if (!response.ok) throw new Error(response.error.message)
  const tools = parseUiTools(response.value)
  for (const tool of tools) {
    ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      {name:'tool.call.toolview',key:tool.publicName},
      props => <McpAppToolView {...props} tool={tool} connection={connection}/>,
    )),`wise-mcp-apps: ${tool.publicName}`)
  }
}
