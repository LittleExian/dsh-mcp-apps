import { describe, it, expect } from 'vitest'
import { buildPolicy, protectHtml } from '../src/sandbox/policy'
import { proxyHtml } from '../src/sandbox/proxy'

describe('double-iframe sandbox policy', () => {
  it('denies network, forms, nested frames and device permissions by default', () => {
    const p = buildPolicy({})
    expect(p.sandbox).toBe('allow-scripts')
    expect(p.allow).toContain("camera 'none'")
    for (const directive of ["connect-src 'none'", "frame-src 'none'", "form-action 'none'", "base-uri 'none'"]) expect(p.csp).toContain(directive)
  })
  it('allows only well formed declared origins', () => {
    const p = buildPolicy({csp:{connectDomains:['https://api.example.com','wss://api.example.com'],resourceDomains:['https://cdn.example.com']}})
    expect(p.csp).toContain('connect-src https://api.example.com wss://api.example.com')
    expect(p.csp).toContain("script-src 'unsafe-inline' https://cdn.example.com")
    for (const origin of ['*', 'https://*.example.com', 'https://a.test/path', 'https://a.test; script-src *', 'javascript:foo', 'https://u:p@a.test', 'https://a.test?q=x']) {
      expect(()=>buildPolicy({csp:{connectDomains:[origin]}})).toThrow()
    }
  })
  it('rejects malformed CSP instead of silently relaxing it', () => {
    for(const value of [null, [], 'bad']) expect(()=>buildPolicy({csp:value})).toThrow()
    for(const value of ['bad',[1],Array(101).fill('https://a.test')]) expect(()=>buildPolicy({csp:{resourceDomains:value}})).toThrow()
    expect(()=>buildPolicy({csp:{resourceDomains:['wss://a.test']}})).toThrow()
    expect(()=>buildPolicy({permissions:{camera:{}}})).toThrow('permissions')
  })
  it('places the policy before all untrusted document bytes', () => {
    const html = '<script>run()</script><html onload="run()"><head></head><body>Hello</body></html>'
    const result = protectHtml(html, 'default-src "none" & x')
    expect(result.indexOf('Content-Security-Policy')).toBeLessThan(result.indexOf('<script>'))
    expect(result).toContain('&quot;none&quot; &amp; x')
  })
  it('generates a nonce-bound relay without embedding App content or session capabilities', () => {
    const html = proxyHtml('12345678-1234-1234-1234-123456789abc', 'https://dsh.example.com')
    expect(html).toContain('12345678-1234-1234-1234-123456789abc')
    expect(html).toContain('https://dsh.example.com')
    expect(html).not.toContain('allow-same-origin')
    expect(()=>proxyHtml('</script>', 'https://dsh.example.com')).toThrow()
    expect(()=>proxyHtml('12345678-1234-1234-1234-123456789abc', 'null')).toThrow()
  })
})
