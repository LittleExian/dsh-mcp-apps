import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
const mocks=vi.hoisted(()=>({connect:vi.fn()}))
vi.mock('../src/host/connection',()=>({connectServer:mocks.connect}))
import { apply } from '../src/index'
import { AppHost, type ServerConnection } from '../src/host/manager'
function fixture() {
  const cleanups:Array<()=>unknown>=[]
  const unregister=vi.fn()
  const definitions:ToolDefinition[]=[]
  const register=vi.fn((definition:ToolDefinition)=>{definitions.push(definition);return unregister})
  const handle=vi.fn()
  const context={effect:(setup:()=>()=>unknown)=>{const cleanup=setup();cleanups.push(cleanup);return cleanup},tools:{register},connection:{rpc:{handle}}} as unknown as Context
  const server:ServerConnection={name:'demo',tools:[{name:'show',inputSchema:{type:'object'},_meta:{ui:{resourceUri:'ui://demo/app'}}}],call:vi.fn().mockResolvedValue({content:[]}),read:vi.fn().mockResolvedValue({contents:[]}),close:vi.fn().mockResolvedValue(undefined)}
  mocks.connect.mockResolvedValue(server)
  return {context,cleanups,unregister,definitions,register,handle,server}
}
const config={servers:[{serverName:'demo',transport:'stdio',command:'node'}]}
beforeEach(()=>{vi.useFakeTimers();mocks.connect.mockReset()})
afterEach(()=>vi.useRealTimers())
describe('Cordis Host lifecycle',()=>{
  it('registers tools and trusted-host RPC with scoped expiry and shutdown',async()=>{
    const f=fixture(); const sweep=vi.spyOn(AppHost.prototype,'sweep')
    await apply(f.context,config)
    expect(f.register).toHaveBeenCalledOnce(); expect(f.handle).toHaveBeenCalledWith('/wise-mcp-apps',expect.any(Function),{authority:'trusted-host'})
    await vi.advanceTimersByTimeAsync(30_000); expect(sweep).toHaveBeenCalled()
    for(const cleanup of [...f.cleanups].reverse()) await cleanup()
    expect(f.unregister).toHaveBeenCalledOnce(); expect(f.server.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    sweep.mockRestore()
  })
  it('removes tool registrations when a server invalidates and does not resurrect it',async()=>{
    const f=fixture(); await apply(f.context,config)
    const invalidate=mocks.connect.mock.calls[0][2]; invalidate(); invalidate()
    expect(f.unregister).toHaveBeenCalledOnce()
    const handler=f.handle.mock.calls[0][1]; expect(await handler('tools/list-ui',null,new AbortController().signal)).toEqual({ok:true,value:[]})
    for(const cleanup of [...f.cleanups].reverse()) await cleanup()
  })
  it('closes a connection that resolves after the plugin was disposed',async()=>{
    const f=fixture(); let resolve!:(server:ServerConnection)=>void
    mocks.connect.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
    const pending=apply(f.context,config); const rejection=expect(pending).rejects.toThrow('could not start')
    await f.cleanups[0](); resolve(f.server); await rejection
    expect(f.server.close).toHaveBeenCalled(); expect(f.register).not.toHaveBeenCalled()
  })
  it('rejects malformed configuration before effects or connections',async()=>{
    const f=fixture(); await expect(apply(f.context,{servers:[{transport:'stdio'}]})).rejects.toThrow('Invalid')
    expect(f.cleanups).toHaveLength(0); expect(mocks.connect).not.toHaveBeenCalled()
  })
  it('closes already connected servers on a later startup failure',async()=>{
    const f=fixture(); mocks.connect.mockResolvedValueOnce(f.server).mockRejectedValueOnce(new Error('private stack'))
    await expect(apply(f.context,{servers:[...config.servers,{serverName:'second',transport:'stdio',command:'node'}]})).rejects.toThrow('could not start')
    expect(f.server.close).toHaveBeenCalledOnce(); expect(f.register).not.toHaveBeenCalled()
    for(const cleanup of f.cleanups) await cleanup()
  })
  it('rolls back partial tool registrations immediately on a registration conflict',async()=>{
    const f=fixture(); f.server.tools=[...f.server.tools,{name:'second',inputSchema:{type:'object'}}]
    f.register.mockImplementationOnce(()=>f.unregister).mockImplementationOnce(()=>{throw new Error('conflict')})
    await expect(apply(f.context,config)).rejects.toThrow('could not start')
    expect(f.server.close).toHaveBeenCalled()
    expect(f.unregister).toHaveBeenCalledOnce()
  })
  it('supports empty configuration without launching external servers',async()=>{
    const f=fixture(); await apply(f.context,{servers:[]})
    expect(mocks.connect).not.toHaveBeenCalled(); expect(f.register).not.toHaveBeenCalled()
    for(const cleanup of [...f.cleanups].reverse()) await cleanup()
  })
  it('rejects a server that disconnects while a later server is still starting',async()=>{
    const f=fixture()
    mocks.connect.mockResolvedValueOnce(f.server).mockImplementationOnce(async()=>{
      mocks.connect.mock.calls[0][2]()
      return {...f.server,name:'second'}
    })
    await expect(apply(f.context,{servers:[...config.servers,{serverName:'second',transport:'stdio',command:'node'}]})).rejects.toThrow('could not start')
    expect(f.register).not.toHaveBeenCalled()
  })
})
