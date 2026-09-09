const noncePattern = /^[A-Za-z0-9._-]{8,128}$/

export function proxyHtml(nonce: string, parentOrigin: string): string {
  if (!noncePattern.test(nonce)) throw new Error('MCP App sandbox nonce is invalid.')
  const origin = normalizeOrigin(parentOrigin)
  const nonceJson = JSON.stringify(nonce)
  const originJson = JSON.stringify(origin)
  const csp = "default-src 'none'; script-src 'unsafe-inline' http: https:; style-src 'unsafe-inline' http: https:; img-src data: blob: http: https:; font-src data: blob: http: https:; media-src data: blob: http: https:; connect-src http: https: ws: wss:; frame-src about:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}iframe{display:block;width:100%;height:100%;border:0;background:transparent}</style></head><body><script>
(() => {
  const READY = 'ui/notifications/sandbox-proxy-ready';
  const RESOURCE = 'ui/notifications/sandbox-resource-ready';
  const nonce = ${nonceJson};
  const PARENT_ORIGIN = ${originJson};
  const inner = document.createElement('iframe');
  inner.setAttribute('sandbox', 'allow-scripts');
  inner.setAttribute('referrerpolicy', 'no-referrer');
  let assigned = false, loaded = false, revoked = false;
  inner.addEventListener('load', () => {
    if (loaded) {
      revoked = true;
      window.parent.postMessage({jsonrpc:'2.0',method:'wise/sandbox-revoked',params:{nonce}}, PARENT_ORIGIN);
      inner.remove();
    }
    loaded = true;
  });
  window.addEventListener('message', (event) => {
    if (revoked || !event.data || event.data.jsonrpc !== '2.0') return;
    if (event.source === window.parent) {
      if (event.origin !== PARENT_ORIGIN) return;
      if (event.data && event.data.method === RESOURCE) {
        const params = event.data.params || {};
        if (assigned || params.nonce !== nonce || typeof params.html !== 'string') return;
        assigned = true;
        inner.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-write 'none'; fullscreen 'none'");
        inner.srcdoc = params.html;
        document.body.appendChild(inner);
        return;
      }
      if (assigned && inner.contentWindow) inner.contentWindow.postMessage(event.data, '*');
      return;
    }
    if (assigned && event.source === inner.contentWindow && event.origin === 'null') {
      const method = event.data.method;
      if (typeof method === 'string' && (method.startsWith('wise/') || method.startsWith('ui/notifications/sandbox-'))) return;
      window.parent.postMessage(event.data, PARENT_ORIGIN);
    }
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: READY, params: { nonce } }, PARENT_ORIGIN);
})();
</script></body></html>`
}

function normalizeOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('MCP App parent origin is invalid.')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MCP App parent origin must be an http(s) origin.')
  }
  return url.origin
}
