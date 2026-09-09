import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { AppPreview, AppResult } from '../shared'
import { buildPolicy, protectHtml } from './policy'
import { proxyHtml } from './proxy'

export interface AppCallbacks {
  callTool(name: string, args: Record<string, unknown>): Promise<AppResult>
  onError(message: string): void
  onClose(): void
}

/** Mount WiseWork's rendering surface without Electron IPC or any credentials. */
export function mountApp(iframe: HTMLIFrameElement, preview: AppPreview, callbacks: AppCallbacks): () => void {
  let bridge: AppBridge | undefined
  let stopped = false
  let ready = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const nonce = crypto.randomUUID()

  const dispose = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    window.removeEventListener('message', onMessage)
    iframe.removeAttribute('src')
    if (bridge) void bridge.close().catch(() => console.warn('MCP App bridge cleanup failed.'))
  }
  const fail = (reason: unknown) => {
    if (stopped) return
    callbacks.onError(reason instanceof Error ? reason.message : 'MCP App could not be opened.')
    dispose()
  }
  const timeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => fail(new Error('MCP App initialization timed out.')), 10_000)
  }

  async function start() {
    const policy = buildPolicy(preview.resource._meta?.ui ?? {})
    if (!iframe.contentWindow) throw new Error('MCP App frame is unavailable.')
    const current = new AppBridge(null, {name:'Wise MCP Apps for DSH',version:'0.1.0'}, {serverTools:{}}, {
      hostContext:{platform:'web',theme:window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        locale:navigator.language,displayMode:'inline',availableDisplayModes:['inline'],containerDimensions:{maxHeight:720}},
    })
    bridge = current
    current.oncalltool = async ({name, arguments: args}) => {
      if (stopped) throw new Error('MCP App session is closed.')
      const result = await callbacks.callTool(name, args ?? {})
      if (stopped) throw new Error('MCP App session is closed.')
      return result as never
    }
    current.onsizechange = ({height}) => {
      if (!stopped && typeof height === 'number' && Number.isFinite(height)) iframe.style.height = `${Math.min(720,Math.max(160,Math.round(height)))}px`
    }
    current.onrequestteardown = () => { if (!stopped) callbacks.onClose() }
    current.oninitialized = () => {
      void (async () => {
        if (stopped) return
        await current.sendToolInput({arguments:preview.input})
        if (stopped) return
        await current.sendToolResult(preview.result as never)
        clearTimeout(timer)
      })().catch(fail)
    }
    await current.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow))
    if (stopped) return
    await current.sendSandboxResourceReady({html:protectHtml(preview.resource.text,policy.csp),sandbox:policy.sandbox,allow:policy.allow,nonce} as never)
  }
  function onMessage(event: MessageEvent) {
    if (stopped || event.source !== iframe.contentWindow || event.origin !== 'null' || event.data?.params?.nonce !== nonce) return
    if (event.data.method === 'wise/sandbox-revoked') {
      fail(new Error('MCP App navigated away; its session was disconnected.'))
    } else if (!ready && event.data.method === 'ui/notifications/sandbox-proxy-ready') {
      ready = true
      timeout()
      void start().catch(fail)
    }
  }
  try {
    buildPolicy(preview.resource._meta?.ui ?? {})
    iframe.setAttribute('sandbox','allow-scripts')
    iframe.referrerPolicy = 'no-referrer'
    iframe.style.width = '100%'
    iframe.style.height = '360px'
    iframe.style.border = '0'
    window.addEventListener('message',onMessage)
    timeout()
    iframe.src = `data:text/html;base64,${btoa(proxyHtml(nonce,window.location.origin))}`
  } catch (error) { fail(error) }
  return dispose
}
