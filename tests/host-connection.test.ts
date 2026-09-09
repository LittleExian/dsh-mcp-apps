import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(()=>({clients:[] as any[],transports:[] as any[],connect:vi.fn(),list:vi.fn(),call:vi.fn(),read:vi.fn(),close:vi.fn(),transportClose:vi.fn()}))
vi.mock('@modelcontextprotocol/sdk/client/index.js',()=>({Client:class {
  onclose?:()=>void; notification?:()=>void
  constructor(public identity:any,public options:any){mocks.clients.push(this)}
  connect=mocks.connect; listTools=mocks.list; callTool=mocks.call; readResource=mocks.read; close=mocks.close
  setNotificationHandler(_schema:any,handler:()=>void){this.notification=handler}
}}))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js',()=>({StdioClientTransport:class {
  close=mocks.transportClose
  constructor(public options:any){mocks.transports.push(this)}
}}))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js',()=>({StreamableHTTPClientTransport:class {
  close=mocks.transportClose
  constructor(public url:any,public options:any){mocks.transports.push(this)}
}}))
import { connectServer } from '../src/host/connection'
const stdio={serverName:'demo',transport:'stdio' as const,command:'node',args:[],env:{EXPLICIT:'value'}}
const tool={name:'show',inputSchema:{type:'object'},_meta:{ui:{resourceUri:'ui://demo/app'}}}
beforeEach(()=>{
  vi.clearAllMocks(); mocks.clients.length=0; mocks.transports.length=0
  mocks.connect.mockResolvedValue(undefined); mocks.list.mockReset().mockResolvedValue({tools:[tool]}); mocks.call.mockResolvedValue({content:[]}); mocks.read.mockResolvedValue({contents:[]}); mocks.close.mockResolvedValue(undefined); mocks.transportClose.mockResolvedValue(undefined)
})
describe('MCP connection adapter',()=>{
  it('uses one initialized stdio client, paginates discovery and forwards cancellation',async()=>{
    mocks.list.mockResolvedValueOnce({tools:[tool],nextCursor:'next'}).mockResolvedValueOnce({tools:[{...tool,name:'second'}]})
    const onInvalidated=vi.fn(); const server=await connectServer(stdio,1000,onInvalidated)
    expect(mocks.clients).toHaveLength(1); expect(server.tools).toHaveLength(2)
    expect(mocks.clients[0].options.capabilities.extensions['io.modelcontextprotocol/ui'].mimeTypes).toContain('text/html;profile=mcp-app')
    expect(mocks.transports[0].options).toMatchObject({command:'node',stderr:'ignore',env:{EXPLICIT:'value'}})
    expect(mocks.list).toHaveBeenNthCalledWith(2,{cursor:'next'},{timeout:1000})
    const controller=new AbortController(); await server.call('show',{},controller.signal); await server.read('ui://demo/app');
    expect(mocks.call).toHaveBeenCalledWith({name:'show',arguments:{}},undefined,{timeout:1000,signal:expect.any(AbortSignal)})
    controller.abort(); expect(mocks.call.mock.calls[0][2].signal.aborted).toBe(true)
    await server.read('ui://demo/app',new AbortController().signal); await server.call('show',{})
    const pendingSignal=mocks.call.mock.calls[1][2].signal; await server.close(); expect(pendingSignal.aborted).toBe(true)
    mocks.clients[0].onclose(); expect(onInvalidated).not.toHaveBeenCalled()
  })
  it('keeps HTTP authentication headers in the transport and invalidates on metadata changes',async()=>{
    const invalidated=vi.fn(); const server=await connectServer({transport:'streamable-http',serverName:'web',url:'https://example.com/mcp',headers:{Authorization:'Bearer private'}},500,invalidated)
    expect(mocks.transports[0].options).toEqual({requestInit:{headers:{Authorization:'Bearer private'}}})
    expect(JSON.stringify(server.tools)).not.toContain('private')
    await mocks.clients[0].notification(); expect(invalidated).toHaveBeenCalledOnce(); expect(mocks.close).toHaveBeenCalled()
  })
  it('invalidates a disconnected client once',async()=>{
    const invalidated=vi.fn(); await connectServer(stdio,500,invalidated)
    mocks.clients[0].onclose(); mocks.clients[0].onclose(); expect(invalidated).toHaveBeenCalledOnce()
  })
  it('closes partial connections and hides upstream credentials on failure',async()=>{
    mocks.connect.mockRejectedValueOnce(new Error('Bearer credential and stacktrace'))
    await expect(connectServer(stdio,500,vi.fn())).rejects.toThrow('MCP connection or tool discovery failed')
    expect(mocks.close).toHaveBeenCalledOnce(); expect(mocks.transportClose).toHaveBeenCalledOnce()
  })
  it('refuses tool discovery that disconnects before becoming ready',async()=>{
    mocks.list.mockImplementationOnce(async()=>{mocks.clients[0].onclose(); return {tools:[]}})
    await expect(connectServer(stdio,500,vi.fn())).rejects.toThrow('discovery failed')
  })
  it.each(['duplicate','tool-limit','cycle','pages','metadata'])('bounds malformed discovery: %s',async(kind)=>{
    if(kind==='duplicate') mocks.list.mockResolvedValue({tools:[tool,tool]})
    if(kind==='tool-limit') mocks.list.mockResolvedValue({tools:Array.from({length:1001},(_,i)=>({...tool,name:`tool${i}`}))})
    if(kind==='cycle') mocks.list.mockResolvedValue({tools:[],nextCursor:'same'})
    if(kind==='pages') mocks.list.mockImplementation(async()=>({tools:[],nextCursor:`page${mocks.list.mock.calls.length}`}))
    if(kind==='metadata') mocks.list.mockResolvedValue({tools:[{...tool,_meta:{ui:{visibility:['invalid']}}}]})
    await expect(connectServer(stdio,500,vi.fn())).rejects.toThrow('discovery failed')
    expect(mocks.close).toHaveBeenCalledOnce()
  })
})
