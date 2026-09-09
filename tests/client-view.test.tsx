// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { McpAppToolView } from '../src/client/McpAppToolView.tsx'
import { mountApp } from '../src/sandbox/host.ts'
import type { McpAppToolViewProps } from '../src/client/McpAppToolView.tsx'
import { MIME } from '../src/shared.ts'
vi.mock('../src/sandbox/host.ts',()=>({mountApp:vi.fn(()=>vi.fn())}))
const tool={publicName:'wise_demo',rawName:'demo',serverName:'demo',resourceUri:'ui://demo/app'}
const preview=(sessionId='s1')=>({sessionId,tool,resource:{uri:tool.resourceUri,mimeType:MIME,text:'<html/>'},input:{},result:{content:[]}})
const block=(token='t1')=>({kind:'tool-result',callId:'c',call:{name:tool.publicName,argsRaw:'{}'},meta:{wiseMcpApp:{callToken:token,publicName:tool.publicName}},content:[{type:'text',text:'Original result'}]})
function setup(call=vi.fn(async(_channel:string,method:string)=>({ok:true,value:method==='apps/open'?preview():null}))) {
 const props={tool,toolName:tool.publicName,callId:'c',block:block(),openFile:vi.fn(),connection:{rpc:{call}}} as unknown as McpAppToolViewProps
 return {props,call}
}
afterEach(()=>{cleanup();vi.clearAllMocks()})
describe('MCP App view',()=>{
 it('keeps tool text, opens UI and closes when unmounted',async()=>{
  const {props,call}=setup(); const view=render(<McpAppToolView {...props}/>);
  expect(screen.getByText('Original result')).toBeTruthy(); await waitFor(()=>expect(mountApp).toHaveBeenCalledTimes(1));
  expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/open',{callToken:'t1'},expect.any(AbortSignal));
  view.unmount(); await waitFor(()=>expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/close',{sessionId:'s1'}));
 })
 it('does not replay missing-metadata results or running calls',()=>{
  const {props,call}=setup(); render(<McpAppToolView {...props} block={{...block(),meta:undefined} as never}/>);
  expect(screen.getByText(/无法恢复/)).toBeTruthy();expect(call).not.toHaveBeenCalled();
 })
 it('closes stale success on token change and keeps current UI',async()=>{
  let resolveFirst!:(value:unknown)=>void;
  const call=vi.fn((_c:string,m:string,p:unknown)=>m==='apps/open'&&(p as {callToken:string}).callToken==='t1'?new Promise(r=>{resolveFirst=r}):Promise.resolve({ok:true,value:m==='apps/open'?preview('s2'):null}));
  const {props}=setup(call as never);const view=render(<McpAppToolView {...props}/>);
  view.rerender(<McpAppToolView {...props} block={block('t2') as never}/>);
  await waitFor(()=>expect(mountApp).toHaveBeenCalledTimes(1));
  await act(async()=>resolveFirst({ok:true,value:preview('s1')}));
  expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/close',{sessionId:'s1'});
  expect(mountApp).toHaveBeenCalledTimes(1);
 })
 it('closes StrictMode stale sessions and aborts obsolete opens',async()=>{
  let serial=0; const {props,call}=setup(vi.fn(async(_c,m)=>({ok:true,value:m==='apps/open'?preview(`s${++serial}`):null})));
  const view=render(<StrictMode><McpAppToolView {...props}/></StrictMode>);
  await waitFor(()=>expect(mountApp).toHaveBeenCalledTimes(1));
  expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/close',{sessionId:'s1'});
  view.unmount();expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/close',{sessionId:'s2'});
 })
 it('shows errors and retries only apps/open',async()=>{
  const call=vi.fn().mockResolvedValueOnce({ok:false,error:{message:'Expired'}}).mockResolvedValue({ok:true,value:preview()});
  const {props}=setup(call);render(<McpAppToolView {...props}/>);
  await screen.findByRole('alert');expect(screen.getByText(/Expired/)).toBeTruthy();fireEvent.click(screen.getByText('重试加载界面'));
  await waitFor(()=>expect(mountApp).toHaveBeenCalledTimes(1));expect(call.mock.calls.every(args=>args[1]==='apps/open')).toBe(true);
 })
 it('bridges calls and closes on sandbox errors',async()=>{
  const {props,call}=setup();render(<McpAppToolView {...props}/>);await waitFor(()=>expect(mountApp).toHaveBeenCalled());
  const callbacks=vi.mocked(mountApp).mock.calls[0]![2];
  call.mockResolvedValueOnce({ok:true,value:{content:[]}} as never);
  await expect(callbacks.callTool('demo',{x:1})).resolves.toEqual({content:[]});
  expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/call',{sessionId:'s1',name:'demo',arguments:{x:1}},expect.any(AbortSignal));
  act(()=>callbacks.onError('Sandbox stopped'));expect(screen.getByRole('alert').textContent).toContain('Sandbox stopped');
  expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/close',{sessionId:'s1'});
  await expect(callbacks.callTool('demo',{})).rejects.toThrow('closed');
 })
 it('shows running state without an open request',()=>{
  const {props,call}=setup();render(<McpAppToolView {...props} block={{name:tool.publicName,argsRaw:'{}'} as never}/>);
  expect(screen.getByText(/正在等待/)).toBeTruthy();expect(call).not.toHaveBeenCalled();
 })
 it('closes malformed successful previews and exposes validation errors',async()=>{
  const call=vi.fn(async(_c,m)=>({ok:true,value:m==='apps/open'?{...preview(),input:null}:null}));
  const {props}=setup(call as never);render(<McpAppToolView {...props}/>);
  await screen.findByRole('alert');expect(call).toHaveBeenCalledWith('/wise-mcp-apps','apps/close',{sessionId:'s1'});expect(mountApp).not.toHaveBeenCalled();
 })
 it('handles sandbox-requested close and rejects failed or malformed tool RPC',async()=>{
  const {props,call}=setup();render(<McpAppToolView {...props}/>);await waitFor(()=>expect(mountApp).toHaveBeenCalled());
  const callbacks=vi.mocked(mountApp).mock.calls[0]![2];
  call.mockResolvedValueOnce({ok:false,error:{message:'Denied'}} as never);
  await expect(callbacks.callTool('demo',{})).rejects.toThrow('Denied');
  call.mockResolvedValueOnce({ok:true,value:{}} as never);
  await expect(callbacks.callTool('demo',{})).rejects.toThrow('Invalid');
  act(()=>callbacks.onClose());expect(screen.getByText('应用界面已关闭。')).toBeTruthy();
 })
 it('ignores callbacks after cleanup and rejects late call responses',async()=>{
  const {props,call}=setup();const view=render(<McpAppToolView {...props}/>);await waitFor(()=>expect(mountApp).toHaveBeenCalled());
  const callbacks=vi.mocked(mountApp).mock.calls[0]![2];
  let resolve!:(value:unknown)=>void;call.mockImplementationOnce(()=>new Promise(r=>{resolve=r}) as never);
  const pending=callbacks.callTool('demo',{});view.unmount();
  resolve({ok:true,value:{content:[]}});await expect(pending).rejects.toThrow('closed');
  act(()=>{callbacks.onError('ignored');callbacks.onClose()});
 })
 it('disposes bridges that fail synchronously during mount',async()=>{
  const dispose=vi.fn();vi.mocked(mountApp).mockImplementationOnce((_iframe,_preview,callbacks)=>{callbacks.onError('Early error');return dispose});
  const {props}=setup();render(<McpAppToolView {...props}/>);await screen.findByRole('alert');expect(dispose).toHaveBeenCalled();
 })
 it('logs failed cleanup without unhandled rejection',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const call=vi.fn(async(_c,m)=>m==='apps/open'?{ok:true,value:preview()}:{ok:false,error:{message:'Offline'}});
  const {props}=setup(call as never);const view=render(<McpAppToolView {...props}/>);await waitFor(()=>expect(mountApp).toHaveBeenCalled());view.unmount();
  await waitFor(()=>expect(warn).toHaveBeenCalled());warn.mockRestore();
 })

})
