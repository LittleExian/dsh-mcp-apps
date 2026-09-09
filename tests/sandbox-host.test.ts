// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
const sdk = vi.hoisted(() => ({instances:[] as any[], fail:false}))
vi.mock('@modelcontextprotocol/ext-apps/app-bridge', () => ({
  AppBridge: class {
    oninitialized?:()=>void
    connect = vi.fn(async()=>{if(sdk.fail)throw new Error('connect failed')})
    sendSandboxResourceReady = vi.fn(async()=>this.oninitialized?.())
    sendToolInput = vi.fn(async()=>{})
    sendToolResult = vi.fn(async()=>{})
    close = vi.fn(async()=>{})
    constructor(){sdk.instances.push(this)}
  },
  PostMessageTransport: class {},
}))
import { mountApp } from '../src/sandbox/host'
import type { AppPreview } from '../src/shared'
const preview: AppPreview = {sessionId:'session',tool:{publicName:'show',rawName:'show',serverName:'demo',resourceUri:'ui://demo/app'},input:{n:1},result:{content:[]},resource:{uri:'ui://demo/app',mimeType:'text/html;profile=mcp-app',text:'<p>Hello</p>'}}
function setup(value=preview) {
  const iframe=document.createElement('iframe');document.body.appendChild(iframe)
  const callbacks={callTool:vi.fn(async()=>({content:[]})),onError:vi.fn(),onClose:vi.fn()}
  const dispose=mountApp(iframe,value,callbacks)
  const html=atob(iframe.src.split(',')[1] || '')
  const nonce=/const nonce = "([a-f0-9-]+)"/.exec(html)?.[1]
  const emit=(method:string, extra:Record<string,unknown>={})=>window.dispatchEvent(new MessageEvent('message',{source:iframe.contentWindow,origin:'null',data:{jsonrpc:'2.0',method,params:{nonce}},...extra}))
  return {iframe,callbacks,dispose,emit}
}
afterEach(()=>{document.body.innerHTML='';sdk.instances=[];sdk.fail=false;vi.useRealTimers()})
describe('sandbox bridge lifecycle',()=>{
  it('hydrates once after trusted ready and delegates only tools without sending sessionId into the App',async()=>{
    const f=setup();f.emit('ui/notifications/sandbox-proxy-ready',{origin:'https://evil.test'})
    expect(sdk.instances).toHaveLength(0)
    f.emit('ui/notifications/sandbox-proxy-ready'); await vi.waitFor(()=>expect(sdk.instances[0]?.sendToolResult).toHaveBeenCalled())
    const b=sdk.instances[0];expect(b.sendToolInput).toHaveBeenCalledWith({arguments:{n:1}})
    expect(JSON.stringify(b.sendSandboxResourceReady.mock.calls)).not.toContain('sessionId')
    await b.oncalltool({name:'update',arguments:{a:1}});expect(f.callbacks.callTool).toHaveBeenCalledWith('update',{a:1})
    b.onsizechange({height:3000});expect(f.iframe.style.height).toBe('720px')
    b.onsizechange({height:NaN});expect(f.iframe.style.height).toBe('720px')
    b.onsizechange({height:1});expect(f.iframe.style.height).toBe('160px')
    b.onrequestteardown();expect(f.callbacks.onClose).toHaveBeenCalled()
    f.dispose();expect(b.close).toHaveBeenCalled()
  })
  it('revokes and stops forwarding after navigation',async()=>{
    const f=setup();f.emit('ui/notifications/sandbox-proxy-ready');await vi.waitFor(()=>expect(sdk.instances[0]?.sendToolResult).toHaveBeenCalled())
    f.emit('wise/sandbox-revoked');expect(f.callbacks.onError).toHaveBeenCalled()
    await expect(sdk.instances[0].oncalltool({name:'update'})).rejects.toThrow()
    f.dispose()
  })
  it('cleans up pre-ready disposal and reports timeouts',async()=>{
    vi.useFakeTimers();const f=setup();f.dispose();f.emit('ui/notifications/sandbox-proxy-ready');await vi.runAllTimersAsync()
    expect(sdk.instances).toHaveLength(0);expect(f.callbacks.onError).not.toHaveBeenCalled()
    const next=setup();await vi.advanceTimersByTimeAsync(10001);expect(next.callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('timed out'));next.dispose()
  })
  it('reports initialization errors and rejects requested device access',async()=>{
    sdk.fail=true;const f=setup();f.emit('ui/notifications/sandbox-proxy-ready');await vi.waitFor(()=>expect(f.callbacks.onError).toHaveBeenCalled());f.dispose()
    const callbacks={callTool:vi.fn(),onError:vi.fn(),onClose:vi.fn()};const frame=document.createElement('iframe')
    const dispose=mountApp(frame,{...preview,resource:{...preview.resource,_meta:{ui:{permissions:{camera:{}}}}}},callbacks)
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('permissions'));dispose()
  })
})
