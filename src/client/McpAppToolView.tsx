import { useEffect, useRef, useState } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { CHANNEL, type AppResult, type UiTool } from '../shared.ts'
import { mountApp } from '../sandbox/host.ts'
import { parsePreview, record, resolveCallToken, resultText } from './contract.ts'

export interface McpAppToolViewProps extends ToolCallOwnerProps {
  tool: UiTool
  connection: Pick<ConnectionHandle, 'rpc'>
}
type SessionProps = Pick<McpAppToolViewProps, 'tool' | 'connection'> & {callToken:string}
type State = {status:'loading' | 'ready' | 'closed' | 'error'; message?:string}

/** Every keyed card owns exactly the sessions returned by its open requests. */
function AppSession({tool,connection,callToken}: SessionProps) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const [attempt,setAttempt] = useState(0)
  const [state,setState] = useState<State>({status:'loading'})
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let sessionId: string | undefined
    let dispose: (() => void) | undefined
    const close = (id:string) => {
      void connection.rpc.call(CHANNEL,'apps/close',{sessionId:id}).then(result => {
        if (!result.ok) console.warn('MCP App session cleanup failed')
      }).catch(() => console.warn('MCP App session cleanup failed'))
    }
    const stop = () => {
      active = false
      controller.abort()
      dispose?.()
      dispose = undefined
      if (sessionId) {close(sessionId);sessionId = undefined}
    }
    const fail = (reason:unknown) => {
      if (!active) return
      stop()
      setState({status:'error',message:reason instanceof Error ? reason.message : String(reason)})
    }
    setState({status:'loading'})
    void connection.rpc.call(CHANNEL,'apps/open',{callToken},controller.signal).then(response => {
      if (!response.ok) throw new Error(response.error.message)
      // Remember the capability before parsing so malformed successes cannot leak it.
      const id = record(response.value) && typeof response.value.sessionId === 'string' ? response.value.sessionId : undefined
      if (!active) {if (id) close(id);return}
      sessionId = id
      const preview = parsePreview(response.value,tool)
      const cleanup = mountApp(iframe.current!,preview,{
        callTool: async (name: string, args: Record<string, unknown>) => {
          if (!active) throw new Error('MCP App session is closed')
          const result = await connection.rpc.call(CHANNEL,'apps/call',{sessionId:preview.sessionId,name,arguments:args},controller.signal)
          if (!active) throw new Error('MCP App session is closed')
          if (!result.ok) throw new Error(result.error.message)
          if (!record(result.value) || !Array.isArray(result.value.content)) throw new Error('Invalid MCP App tool result')
          return result.value as unknown as AppResult
        },
        onError: fail,
        onClose: () => {if (active) {stop();setState({status:'closed'})}},
      })
      if (!active) {cleanup();return}
      dispose = cleanup
      setState({status:'ready'})
    }).catch(fail)
    return stop
  },[connection,tool,callToken,attempt])
  return <>
    {state.status === 'loading' && <p role="status">正在加载 MCP App…</p>}
    {state.status === 'error' && <p role="alert">界面加载失败：{state.message}</p>}
    {state.status === 'closed' && <p>应用界面已关闭。</p>}
    {(state.status === 'error' || state.status === 'closed') && <button type="button" onClick={()=>setAttempt(value=>value+1)}>重试加载界面</button>}
    <iframe ref={iframe} title={`${tool.rawName} MCP App`} hidden={state.status !== 'ready'} sandbox="allow-scripts" style={{display:state.status === 'ready'?'block':'none',width:'100%',height:360,border:0}} />
  </>
}

export function McpAppToolView({tool,connection,block,toolName}:McpAppToolViewProps) {
  const token = resolveCallToken(block,tool,toolName)
  const settled = 'kind' in block
  const text = resultText(block)
  return <section data-mcp-app-tool={tool.publicName} style={{border:'1px solid color-mix(in srgb, currentColor 20%, transparent)',borderRadius:8,padding:12}}>
    <div style={{fontWeight:600}}>{tool.rawName}</div>
    {text && <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</pre>}
    {token ? <AppSession key={token} tool={tool} connection={connection} callToken={token}/> : <p role="status">{settled ? '此调用缺少可用的应用会话，无法恢复交互界面；原始结果保留。' : '正在等待工具调用结果…'}</p>}
  </section>
}
