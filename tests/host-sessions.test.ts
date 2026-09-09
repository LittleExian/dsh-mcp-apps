import { describe, expect, it, vi } from 'vitest'
import { AppHost, type ServerConnection, type HostOptions } from '../src/host/manager'
const uri='ui://demo/app'
function fixture(options:HostOptions={}) {
  const call=vi.fn<ServerConnection['call']>().mockResolvedValue({content:[]})
  const read=vi.fn<ServerConnection['read']>().mockResolvedValue({contents:[{uri,mimeType:'text/html;profile=mcp-app',text:'<p>app</p>'}]})
  const connection:ServerConnection={name:'demo',tools:[{name:'show',inputSchema:{type:'object'},_meta:{ui:{resourceUri:uri}}},{name:'update',inputSchema:{type:'object'},_meta:{ui:{visibility:['app']}}},{name:'task',inputSchema:{type:'object'},execution:{taskSupport:'required'},_meta:{ui:{resourceUri:uri}}}],call,read,close:vi.fn().mockResolvedValue(undefined)}
  return {host:new AppHost([connection],options),call,read,connection}
}
describe('App mounting and session isolation',()=>{
  it('gives repeated mounts independent capabilities without replaying the original tool',async()=>{
    const {host,call}=fixture(); const result=await host.execute('demo','show',{})
    const [first,second]=await Promise.all([host.open(result.callToken!),host.open(result.callToken!)])
    expect(first.sessionId).not.toBe(second.sessionId); expect(call).toHaveBeenCalledOnce()
    host.close(first.sessionId); await expect(host.call(first.sessionId,'update',{})).rejects.toThrow()
    await expect(host.call(second.sessionId,'update',{})).resolves.toEqual({content:[]})
    const third=await host.open(result.callToken!); expect(third.sessionId).not.toBe(second.sessionId)
    await host.dispose()
  })
  it('bounds concurrently mounted sessions and frees slots when a mount closes',async()=>{
    const {host}=fixture({maxEntries:1}); const result=await host.execute('demo','show',{})
    const sessions=await Promise.all(Array.from({length:4},()=>host.open(result.callToken!)))
    await expect(host.open(result.callToken!)).rejects.toThrow('session limit')
    host.close(sessions[0].sessionId); await expect(host.open(result.callToken!)).resolves.toHaveProperty('sessionId')
    await host.dispose()
  })
  it('revokes all mounts on expiry while keeping another server isolated',async()=>{
    let now=0;const {connection}=fixture();const other={...connection,name:'other'}
    const host=new AppHost([connection,other],{ttlMs:10,now:()=>now})
    const result=await host.execute('demo','show',{});const [first,second]=await Promise.all([host.open(result.callToken!),host.open(result.callToken!)])
    now=5;const otherResult=await host.execute('other','show',{});const otherApp=await host.open(otherResult.callToken!)
    now=10;host.sweep()
    for(const session of [first,second]) await expect(host.call(session.sessionId,'update',{})).rejects.toThrow()
    await expect(host.call(otherApp.sessionId,'update',{})).resolves.toEqual({content:[]})
    await host.dispose()
  })
  it('handles aborts and invalidation that happen during resource loading',async()=>{
    const {host,read}=fixture(); const result=await host.execute('demo','show',{}); const signal=new AbortController()
    read.mockImplementationOnce(async()=>{signal.abort();return {contents:[{uri,mimeType:'text/html;profile=mcp-app',text:''}]}})
    await expect(host.open(result.callToken!,signal.signal)).rejects.toThrow()
    read.mockImplementationOnce(async()=>{host.invalidate('demo');return {contents:[{uri,mimeType:'text/html;profile=mcp-app',text:''}]}})
    await expect(host.open(result.callToken!)).rejects.toThrow()
  })
  it('rejects malformed resource responses and task-required tools',async()=>{
    const {host,read}=fixture();const result=await host.execute('demo','show',{})
    read.mockResolvedValueOnce({contents:null});await expect(host.open(result.callToken!)).rejects.toThrow('resource response')
    const app=await host.open(result.callToken!)
    await expect(host.call(app.sessionId,'task',{})).rejects.toThrow('not allowed')
    await expect(host.execute('demo','task',{})).rejects.toThrow('Task-based')
  })
  it('enforces concurrent call limits, restores them after completion, and rolls minute windows',async()=>{
    let now=0;const {host,call}=fixture({now:()=>now,maxConcurrentCalls:1,maxCallsPerMinute:2})
    const result=await host.execute('demo','show',{});const app=await host.open(result.callToken!)
    let resolve!:(value:unknown)=>void;call.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
    const pending=host.call(app.sessionId,'update',{})
    await expect(host.call(app.sessionId,'update',{})).rejects.toThrow('call limit')
    resolve({content:[]});await pending
    await host.call(app.sessionId,'update',{},new AbortController().signal)
    await expect(host.call(app.sessionId,'update',{})).rejects.toThrow('call limit')
    now=60_000;await expect(host.call(app.sessionId,'update',{})).resolves.toEqual({content:[]})
  })
  it('rejects duplicate configured connection names and cancelled execution results',async()=>{
    const {connection,host}=fixture(); expect(()=>new AppHost([connection,connection])).toThrow('Duplicate')
    await expect(host.execute('demo','show',{},AbortSignal.abort())).rejects.toThrow()
  })
})
