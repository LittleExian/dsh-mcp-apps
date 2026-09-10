import { describe, expect, it, vi } from 'vitest'
import { buildSearchUrl, createTrendingClient, parseTrendingInput } from '../examples/github-trending/github'

const repository = {
  id: 7,
  name: 'spark',
  full_name: 'octo/spark',
  html_url: 'https://github.com/octo/spark',
  description: '<img src=x onerror=alert(1)> useful',
  language: 'TypeScript',
  stargazers_count: 321,
  forks_count: 12,
  open_issues_count: 4,
  created_at: '2026-09-08T00:00:00Z',
  pushed_at: '2026-09-10T00:00:00Z',
  owner: { login: 'octo' },
}

describe('GitHub Trending API client', () => {
  it('validates filters and builds a fixed GitHub Search URL', () => {
    expect(parseTrendingInput({})).toEqual({ period: 'weekly', language: 'All', limit: 10 })
    expect(() => parseTrendingInput({ period: 'yearly' })).toThrow()
    expect(() => parseTrendingInput({ language: 'x language:Rust' })).toThrow()

    const url = buildSearchUrl(
      { period: 'daily', language: 'C++', limit: 8 },
      new Date('2026-09-10T12:00:00Z'),
    )
    expect(url.origin).toBe('https://api.github.com')
    expect(url.pathname).toBe('/search/repositories')
    expect(url.searchParams.get('q')).toBe('created:>=2026-09-09 archived:false fork:false language:"C++"')
    expect(url.searchParams.get('sort')).toBe('stars')
    expect(url.searchParams.get('order')).toBe('desc')
    expect(url.searchParams.get('per_page')).toBe('8')
  })

  it('maps the official API response without exposing credentials or rendering HTML', async () => {
    const fetcher = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token')
      return new Response(JSON.stringify({ total_count: 1, incomplete_results: false, items: [repository] }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-ratelimit-remaining': '29',
          'x-ratelimit-reset': '1789000000',
        },
      })
    })
    const client = createTrendingClient({ fetcher, token: 'test-token', now: () => new Date('2026-09-10T12:00:00Z') })
    const result = await client.get({ period: 'weekly', language: 'TypeScript', limit: 10 })

    expect(result.approximate).toBe(true)
    expect(result.repositories).toEqual([{
      rank: 1,
      fullName: 'octo/spark',
      url: 'https://github.com/octo/spark',
      description: '<img src=x onerror=alert(1)> useful',
      language: 'TypeScript',
      stars: 321,
      forks: 12,
      openIssues: 4,
      createdAt: '2026-09-08T00:00:00Z',
      pushedAt: '2026-09-10T00:00:00Z',
    }])
    expect(JSON.stringify(result)).not.toContain('test-token')
    expect(result.rateLimit).toEqual({ remaining: 29, resetAt: '2026-09-10T00:26:40.000Z' })
  })

  it('caches identical queries and returns independent values', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ total_count: 1, incomplete_results: false, items: [repository] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    let timestamp = Date.parse('2026-09-10T12:00:00Z')
    const client = createTrendingClient({ fetcher, now: () => new Date(timestamp), cacheMs: 300_000 })
    const first = await client.get({})
    first.repositories[0]!.stars = 0
    timestamp += 30_000
    const second = await client.get({})

    expect(fetcher).toHaveBeenCalledOnce()
    expect(second.repositories[0]!.stars).toBe(321)
    expect(second.cached).toBe(true)
  })

  it('rejects rate limits, oversized bodies, and malformed payloads safely', async () => {
    const rateLimitedFetch = vi.fn(async () => new Response('{"message":"secret upstream detail"}', { status: 429, headers: { 'retry-after': '60' } }))
    const limited = createTrendingClient({
      fetcher: rateLimitedFetch,
    })
    await expect(limited.get({})).rejects.toThrow('GitHub API rate limit reached')
    await expect(limited.get({})).rejects.not.toThrow('secret upstream detail')
    expect(rateLimitedFetch).toHaveBeenCalledOnce()

    const oversized = createTrendingClient({
      fetcher: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'content-length': '3000000' } }),
    })
    await expect(oversized.get({})).rejects.toThrow('response was too large')

    const malformed = createTrendingClient({
      fetcher: async () => new Response('{"items":[{"name":"missing fields"}]}', { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    await expect(malformed.get({})).rejects.toThrow('unexpected data')

    const credentialUrl = createTrendingClient({
      fetcher: async () => new Response(JSON.stringify({
        total_count: 1,
        incomplete_results: false,
        items: [{ ...repository, html_url: 'https://user:password@github.com/octo/spark' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    await expect(credentialUrl.get({})).rejects.toThrow('unexpected data')
  })
})
