import { describe, it, expect, vi } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { AppHost, type ServerConnection } from '../src/host/manager'
import { definitions } from '../src/host/tools'
import { rpcHandler } from '../src/host/rpc'
import { configSchema, Config } from '../src/host/config'
import { metadata, resource, toolResult, readArguments, toUiTool, safeEnvironment, isUiUri, identifier } from '../src/host/contracts'
const uri = 'ui://fixture/app'
function fixture() {
  const call = vi.fn<ServerConnection['call']>().mockResolvedValue({content: [{type:'text',text:'done',_meta:{hidden:1}},{type:'resource',resource:{text:'<script>private</script>'}}], structuredContent:{rows:[{_meta:{secret:1},value:2}]},_meta:{onlyUi:'private'}})
  const connection: ServerConnection = {name:'demo',tools:[{name:'show',description:'Demo',inputSchema:{type:'object'},_meta:{ui:{resourceUri:uri}}},{name:'plain',inputSchema:{type:'object'}}],call,
    read: vi.fn().mockResolvedValue({contents:[{uri,mimeType:'text/html;profile=mcp-app',text:'<p>app</p>',_meta:{ui:{prefersBorder:true}}}]}),close:vi.fn().mockResolvedValue(undefined)}
  const host = new AppHost([connection])
  return {host, call, connection, definition: definitions(host)[0].definition}
}
const exec = {signal: new AbortController().signal} as Parameters<ToolDefinition['execute']>[1]
describe('model and App projections',()=>{
  it('keeps original UI metadata outside model content while preserving the original for App initialization',async()=>{
    const {host,definition,call} = fixture()
    const value = await definition.execute({},exec) as any
    expect(value.content).toEqual([{type:'text',text:'done'}])
    expect(value.structuredContent).toEqual({rows:[{value:2}]})
    const rendered = definition.output.render({},value)
    expect(rendered).toEqual([{type:'text',text:'done'}])
    expect(JSON.stringify(rendered)).not.toContain(value.callToken)
    expect(definition.output.presentationMeta!({},value)).toEqual({wiseMcpApp:{callToken:value.callToken,publicName:'wise_mcp__demo__show'}})
    expect((await host.open(value.callToken)).result._meta).toEqual({onlyUi:'private'})
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('supports model-visible tools without App resources and sanitizes failed MCP calls',async()=>{
    const {host,call}=fixture(); const plain=definitions(host)[1].definition
    call.mockResolvedValueOnce({content:[]})
    const result = await plain.execute({},exec)
    expect(result).toEqual({content:[]}); expect(plain.output.presentationMeta!({},result as any)).toBeNull()
    expect(plain.output.render({},null)[0]).toHaveProperty('text',expect.stringContaining('completed'))
    expect(plain.output.render({},{content:[{type:'image'},{type:'text',text:2}]} as any)[0]).toHaveProperty('type','text')
    call.mockRejectedValueOnce(new Error('Bearer CREDENTIAL secret stacktrace'))
    await expect(plain.execute({},exec)).rejects.toThrow('MCP tool call failed')
    call.mockResolvedValueOnce({content:[],isError:true}); await expect(plain.execute({},exec)).rejects.not.toThrow('CREDENTIAL')
  })
  it('routes App operations and contains transport failures in the RPC envelope',async()=>{
    const {host,call}=fixture(); const handler=rpcHandler(host); const signal=exec.signal
    const list=await handler('tools/list-ui',null,signal); expect(list).toMatchObject({ok:true,value:[{rawName:'show'}]})
    const r=await host.execute('demo','show',{}); const opened=await handler('apps/open',{callToken:r.callToken},signal)
    expect(opened.ok).toBe(true); if(!opened.ok) return
    const sessionId=(opened.value as any).sessionId
    expect(await handler('apps/call',{sessionId,name:'show',arguments:{}},signal)).toMatchObject({ok:true})
    expect(await handler('apps/close',{sessionId},signal)).toEqual({ok:true,value:null})
    for(const [endpoint,payload] of [['apps/call',{sessionId,name:'show',arguments:{}}],['unknown',{}],['apps/open',null]]) {
      expect(await handler(endpoint as string,payload,signal)).toMatchObject({ok:false,error:{code:'internal',details:{}}})
    }
    call.mockRejectedValueOnce(new Error('credential')); const failed=await handler('apps/open',{callToken:'forged'},signal)
    expect(JSON.stringify(failed)).not.toContain('credential')
    expect(await handler('tools/list-ui',null,AbortSignal.abort())).toMatchObject({ok:false})
  })
  it('disposes connections, clears discovery and refuses work after shutdown',async()=>{
    const {host,connection}=fixture(); const r=await host.execute('demo','show',{}); const preview=await host.open(r.callToken!)
    await host.dispose(); expect(connection.close).toHaveBeenCalledOnce(); expect(host.listUi()).toEqual([])
    await expect(host.call(preview.sessionId,'show',{})).rejects.toThrow(); await expect(host.execute('demo','show',{})).rejects.toThrow()
  })
})
describe('configuration and contracts',()=>{
  it('validates both transports and bounds security-sensitive configuration',()=>{
    expect(configSchema.parse({}).servers).toEqual([]); expect(Config({servers:[]}).servers).toEqual([])
    expect(configSchema.parse({servers:[{serverName:'demo',transport:'stdio',command:'node'}]}).servers[0]).toMatchObject({args:[],env:{}})
    expect(configSchema.parse({servers:[{serverName:'web',transport:'streamable-http',url:'https://example.com/mcp',headers:{Authorization:'explicit'}}]}).servers).toHaveLength(1)
    for(const url of ['file:///tmp/mcp','https://user:password@example.com/mcp','https://user@example.com']) expect(configSchema.safeParse({servers:[{serverName:'web',transport:'streamable-http',url}]}).success).toBe(false)
    expect(configSchema.safeParse({servers:[{serverName:'same',transport:'stdio',command:'node'},{serverName:'same',transport:'stdio',command:'node'}]}).success).toBe(false)
    expect(configSchema.safeParse({maxEntries:129}).success).toBe(false)
    expect(()=>new AppHost([],{ttlMs:0})).toThrow()
  })
  it('rejects malformed transport values and oversized metadata without sharing mutable originals',()=>{
    expect(toUiTool('s',{name:'plain'})).toBeNull(); expect(toUiTool('s',{name:'app',_meta:{'ui/resourceUri':uri}})).toHaveProperty('resourceUri',uri)
    expect(metadata({_meta:{ui:{visibility:[]}}}).visibility).toEqual([])
    expect(()=>metadata({_meta:{ui:{resourceUri:5}}})).toThrow()
    expect(isUiUri('%%%')).toBe(false); expect(isUiUri(4)).toBe(false); expect(()=>identifier('')).toThrow()
    const original={content:[],_meta:{ui:{test:1}}}; const copy=toolResult(original); original._meta.ui.test=2; expect(copy._meta).toEqual({ui:{test:1}})
    for(const value of [null,{content:'bad'},{content:[],structuredContent:[]},{content:[],_meta:[]},{content:[],isError:'true'},{content:[{text:'a'.repeat(5*1024*1024)}]}]) expect(()=>toolResult(value)).toThrow()
    const cycle:any={}; cycle.self=cycle; expect(()=>readArguments(cycle)).toThrow()
    expect(readArguments(undefined)).toEqual({}); expect(()=>readArguments([])).toThrow()
    expect(()=>resource({uri,mimeType:'text/html;profile=mcp-app',text:'',_meta:{ui:{big:'x'.repeat(65537)}}},uri)).toThrow()
    expect(safeEnvironment({}, {DSH_TOKEN:'bad',NODE_OPTIONS:'bad',HOME:'/home',SECRET:'bad',LC_CTYPE:'UTF-8',PATH:'/bin',MISSING:undefined})).toEqual({LC_CTYPE:'UTF-8',PATH:'/bin'})
  })
})
