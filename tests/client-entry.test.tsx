import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.tsx'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
vi.mock('../src/client/McpAppToolView.tsx',()=>({McpAppToolView:()=>null}))
const tool={publicName:'wise_demo',rawName:'demo',serverName:'demo',resourceUri:'ui://demo/app'}
function context(value:unknown,ok=true) {
 const slots={inject:vi.fn((_name,callback)=>callback()),register:vi.fn((_key,component)=>{component({});return vi.fn()})}
 return {connection:{rpc:{call:vi.fn(async()=>ok?{ok,value}:{ok,error:{message:'Offline'}})}},slots,effect:vi.fn(callback=>callback())}
}
describe('DSH rc7 slot adapter',()=>{
 it('registers the exact public name through managed effects',async()=>{
  const ctx=context([tool]);await apply(ctx as unknown as ClientContext)
  expect(inject).toEqual(['connection','slots']);expect(ctx.slots.register).toHaveBeenCalledWith({name:'tool.call.toolview',key:'wise_demo'},expect.any(Function))
  expect(ctx.connection.rpc.call).toHaveBeenCalledWith('/wise-mcp-apps','tools/list-ui',null)
 })
 it('rejects RPC errors and malformed whole lists before any registrations',async()=>{
  const offline=context(null,false);await expect(apply(offline as unknown as ClientContext)).rejects.toThrow('Offline')
  const invalid=context([tool,{}]);await expect(apply(invalid as unknown as ClientContext)).rejects.toThrow();expect(invalid.slots.register).not.toHaveBeenCalled()
 })
})
