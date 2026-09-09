import { describe, it, expect, vi } from 'vitest'
import { AppHost, type ServerConnection } from '../src/host/manager'
import { metadata, resource, safeEnvironment, publicName } from '../src/host/contracts'
const ui = 'ui://demo/view'
const tool = (name: string, visibility?: string[], resourceUri = ui) => ({name,inputSchema:{type:'object' as const},_meta:{ui:{resourceUri,...visibility ? {visibility} : {}}}})
function fixture(options = {}) {
  const call = vi.fn(async () => ({content:[{type:'text',text:'done'}],_meta:{secretForApp:'only-ui'},structuredContent:{value:1}}))
  const read = vi.fn(async (uri: string) => ({contents:[{uri,mimeType:'text/html;profile=mcp-app',text:'<p>app</p>'}]}))
  const connection: ServerConnection = {name:'demo',tools:[tool('show'),tool('update',['app']),tool('hidden',['model']),tool('other',['app'],'ui://demo/other')],call,read,close:vi.fn(async()=>{})}
  const host = new AppHost([connection],options)
  return {host,call,read,connection}
}
describe('host capabilities',()=>{
 it('retains original result and opens without replaying the model tool',async()=>{
   const {host,call}=fixture(); const result=await host.execute('demo','show',{x:1})
   expect(result.result._meta).toEqual({secretForApp:'only-ui'})
   const preview=await host.open(result.callToken!)
   expect(preview.input).toEqual({x:1}); expect(preview.result).toEqual(result.result); expect(call).toHaveBeenCalledTimes(1)
   const second=await host.open(result.callToken!); expect(second.sessionId).not.toBe(preview.sessionId)
   host.close(second.sessionId)
   await host.call(preview.sessionId,'update',{}); expect(call).toHaveBeenCalledTimes(2)
 })
 it('defaults visibility to model and app; explicit app-only tools stay out of model list',()=>{
   const {host}=fixture(); expect(host.modelTools().map(t=>t.tool.name)).toEqual(['show','hidden'])
   expect(metadata(tool('a')).visibility).toEqual(['model','app'])
 })
 it('rejects cross-resource, model-only and forged calls',async()=>{
   const {host}=fixture(); const initial=await host.execute('demo','show',{}); const p=await host.open(initial.callToken!)
   for(const name of ['hidden','other','demo__update','missing']) await expect(host.call(p.sessionId,name,{})).rejects.toThrow()
   await expect(host.call('forged','update',{})).rejects.toThrow(); await expect(host.open('forged')).rejects.toThrow()
   await expect(host.execute('demo','update',{})).rejects.toThrow()
 })
 it('revokes only the closed view while allowing a fresh view of the retained result',async()=>{
   const {host}=fixture(); const r=await host.execute('demo','show',{}); const p=await host.open(r.callToken!)
   host.close(p.sessionId); await expect(host.call(p.sessionId,'update',{})).rejects.toThrow()
   const fresh=await host.open(r.callToken!); expect(fresh.sessionId).not.toBe(p.sessionId)
   await expect(host.call(fresh.sessionId,'update',{})).resolves.toBeDefined()
 })
 it('expires capabilities, limits retention and invalidates servers',async()=>{
   let now=100; const {host}=fixture({now:()=>now,ttlMs:10,maxEntries:1})
   const first=await host.execute('demo','show',{}); await host.execute('demo','show',{})
   await expect(host.open(first.callToken!)).rejects.toThrow()
   const r=await host.execute('demo','show',{}); now=111; await expect(host.open(r.callToken!)).rejects.toThrow()
   const next=await host.execute('demo','show',{}); host.invalidate('demo'); await expect(host.open(next.callToken!)).rejects.toThrow(); await expect(host.execute('demo','show',{})).rejects.toThrow()
 })
 it('limits calls and rejects an oversized argument',async()=>{
   const {host}=fixture({maxCallsPerMinute:1}); const r=await host.execute('demo','show',{}); const p=await host.open(r.callToken!)
   await host.call(p.sessionId,'update',{}); await expect(host.call(p.sessionId,'update',{})).rejects.toThrow('limit')
   await expect(host.execute('demo','show',{a:'x'.repeat(262145)})).rejects.toThrow()
 })
 it('rejects wrong resource and never retains error-result launch tokens',async()=>{
   const {host,call,read}=fixture(); call.mockResolvedValueOnce({content:[],isError:true} as never)
   expect((await host.execute('demo','show',{})).callToken).toBeUndefined()
   const r=await host.execute('demo','show',{}); read.mockResolvedValueOnce({contents:[{uri:'ui://evil/view',mimeType:'text/html;profile=mcp-app',text:''}]})
   await expect(host.open(r.callToken!)).rejects.toThrow()
 })
 it('rejects results of calls that finish after close',async()=>{
   const {host,call}=fixture(); const r=await host.execute('demo','show',{}); const p=await host.open(r.callToken!)
   let resolve!: (value:any)=>void; call.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
   const pending=host.call(p.sessionId,'update',{}); host.close(p.sessionId); resolve({content:[]}); await expect(pending).rejects.toThrow()
 })
})
describe('contract validation',()=>{
 it('validates resource MIME, uri, visibility, content and sizes',()=>{
   expect(()=>metadata(tool('x',['invalid']))).toThrow(); expect(()=>metadata(tool('x',undefined,'https://evil'))).toThrow()
   for(const value of [null,{uri:ui,mimeType:'text/html',text:''},{uri:ui,mimeType:'text/html;profile=mcp-app',blob:'a'},{uri:ui,mimeType:'text/html;profile=mcp-app',text:'a'.repeat(2097153)}]) expect(()=>resource(value,ui)).toThrow()
 })
 it('never inherits process secrets and uses collision-resistant public tool names',()=>{
   expect(safeEnvironment({API_TOKEN:'explicit'},{PATH:'/bin',SECRET:'hidden',NODE_OPTIONS:'bad'})).toEqual({PATH:'/bin',API_TOKEN:'explicit'})
   expect(publicName('demo','show')).toBe('wise_mcp__demo__show'); expect(publicName('a','b.c')).not.toBe(publicName('a','b_c'))
   expect(publicName('a','x'.repeat(100))).toHaveLength(64)
 })
})
