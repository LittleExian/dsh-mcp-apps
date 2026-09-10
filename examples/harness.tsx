import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import type { McpAppToolViewProps } from '../src/client/McpAppToolView'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
const rpc:ClientConnectionRpc = {call:async(_channel,endpoint,payload,signal)=>{
  const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint,payload}),signal})
  if (!response.ok) throw new Error('Demo RPC failed')
  return response.json()
}}
// Emulate only the DSH module/slot composition; execute the real published client bundle.
type ClientPlugin = {apply(ctx:ClientContext):Promise<void>}
type ModuleRegistration = {id:string;factory(require:(name:string)=>unknown):ClientPlugin}
let plugin:ClientPlugin
Object.assign(window,{__ModuleLoader__:{load(registration:ModuleRegistration){
  if(registration.id!=='@exian/dsh-mcp-apps') throw new Error('Unexpected plugin module')
  plugin=registration.factory(name=>{
    if(name==='react') return React
    if(name==='react/jsx-runtime') return jsxRuntime
    throw new Error(`Unexpected browser dependency: ${name}`)
  })
}}})
await new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='/plugin.js'
  script.onload=()=>resolve();script.onerror=()=>reject(new Error('Plugin bundle failed to load'));document.head.appendChild(script)
})
const bootstrap = await fetch(`/bootstrap${location.search}`).then(response=>response.json()) as {tool:McpAppToolViewProps['tool'];block:McpAppToolViewProps['block']}
let renderTool:((props:ToolCallOwnerProps)=>React.ReactNode)|undefined
await plugin!.apply({connection:{rpc},effect:(callback:()=>unknown)=>callback(),slots:{
  inject:(_name:string,callback:()=>unknown)=>callback(),
  register:(slot:{key:string},component:typeof renderTool)=>{if(slot.key===bootstrap.tool.publicName) renderTool=component;return ()=>{}},
}} as unknown as ClientContext)
if(!renderTool) throw new Error('Client plugin did not register the requested UI tool')
const view=renderTool({block:bootstrap.block,toolName:bootstrap.tool.publicName,callId:'demo-call',openFile:()=>{}})
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('strict')?<React.StrictMode>{view}</React.StrictMode>:view)
