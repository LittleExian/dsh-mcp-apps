export type SandboxPolicy = {
  sandbox: 'allow-scripts'
  allow: string
  csp: string
}

const permissionPolicyDeny = [
  "camera 'none'",
  "microphone 'none'",
  "geolocation 'none'",
  "clipboard-write 'none'",
  "fullscreen 'none'",
].join('; ')

export function buildPolicy(meta: Record<string, unknown> = {}): SandboxPolicy {
  const csp = readCsp(meta.csp)
  const connectDomains = readOrigins(csp.connectDomains, ['http:', 'https:', 'ws:', 'wss:'], 'connectDomains')
  const resourceDomains = readOrigins(csp.resourceDomains, ['http:', 'https:'], 'resourceDomains')
  const frameDomains = readOrigins(csp.frameDomains, ['http:', 'https:'], 'frameDomains')
  const baseDomains = readOrigins(csp.baseUriDomains, ['http:', 'https:'], 'baseUriDomains')
  if (frameDomains.length || baseDomains.length) throw new Error('Nested frames and external base URLs are not supported.')
  const sources = resourceDomains.join(' ')
  if (meta.permissions !== undefined && (!isRecord(meta.permissions) || Object.keys(meta.permissions).length > 0)) {
    throw new Error('MCP App browser permissions are not supported by this sandbox host.')
  }
  return {
    sandbox: 'allow-scripts',
    allow: permissionPolicyDeny,
    csp: [
      "default-src 'none'",
      `script-src 'unsafe-inline'${sources ? ` ${sources}` : ''}`,
      `style-src 'unsafe-inline'${sources ? ` ${sources}` : ''}`,
      `img-src data: blob:${sources ? ` ${sources}` : ''}`,
      `font-src data: blob:${sources ? ` ${sources}` : ''}`,
      `media-src data: blob:${sources ? ` ${sources}` : ''}`,
      "worker-src 'none'",
      `connect-src ${connectDomains.length === 0 ? "'none'" : connectDomains.join(' ')}`,
      `frame-src ${frameDomains.length === 0 ? "'none'" : frameDomains.join(' ')}`,
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'none'",
    ].join('; '),
  }
}

export function protectHtml(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">`
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`
}

function readCsp(value: unknown): Record<string, unknown> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error('MCP App CSP metadata must be an object.')
  return value
}

function readOrigins(value: unknown, protocols: readonly string[], label: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string')) {
    throw new Error(`MCP App CSP ${label} must be a string array.`)
  }
  return value.map(origin => normalizeOrigin(origin, protocols, label))
}

function normalizeOrigin(value: string, protocols: readonly string[], label: string): string {
  if (value.includes('*') || /[\s;'"<>]/.test(value)) {
    throw new Error(`MCP App CSP ${label} contains an unsafe origin.`)
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`MCP App CSP ${label} contains an invalid origin.`)
  }
  if (!protocols.includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`MCP App CSP ${label} must contain an allowed origin only.`)
  }
  return url.origin
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
