import { z } from 'zod'
import { languages, periods, type TrendingInput, type TrendingResult } from './contract'
export type { TrendingInput, TrendingRepository, TrendingResult } from './contract'

const inputSchema = z.object({
  period: z.enum(periods).default('weekly'),
  language: z.enum(languages).default('All'),
  limit: z.number().int().min(5).max(15).default(10),
}).strict()

const apiRepositorySchema = z.object({
  id: z.number().int(),
  full_name: z.string().min(1).max(200),
  html_url: z.url().refine(value => {
    const url = new URL(value)
    return url.origin === 'https://github.com' && !url.username && !url.password
  }),
  description: z.string().nullable(),
  language: z.string().nullable(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  open_issues_count: z.number().int().nonnegative(),
  created_at: z.iso.datetime(),
  pushed_at: z.iso.datetime(),
}).passthrough()

const apiResponseSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.boolean(),
  items: z.array(apiRepositorySchema),
}).passthrough()

type Fetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
type ClientOptions = {
  fetcher?: Fetcher
  token?: string
  now?: () => Date
  cacheMs?: number
}

const windowDays: Record<TrendingInput['period'], number> = { daily: 1, weekly: 7, monthly: 30 }
const maxResponseBytes = 2 * 1024 * 1024

export function parseTrendingInput(value: unknown): TrendingInput {
  return inputSchema.parse(value) as TrendingInput
}

export function buildSearchUrl(input: TrendingInput, now = new Date()): URL {
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - windowDays[input.period])
  const qualifiers = [
    `created:>=${start.toISOString().slice(0, 10)}`,
    'archived:false',
    'fork:false',
    ...(input.language === 'All' ? [] : [`language:"${input.language}"`]),
  ]
  const url = new URL('https://api.github.com/search/repositories')
  url.searchParams.set('q', qualifiers.join(' '))
  url.searchParams.set('sort', 'stars')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', String(input.limit))
  return url
}

export function createTrendingClient(options: ClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? (() => new Date())
  const cacheMs = options.cacheMs ?? 300_000
  const cache = new Map<string, { expiresAt: number; value: TrendingResult }>()
  let blockedUntil = 0

  return {
    async get(rawInput: unknown, signal?: AbortSignal): Promise<TrendingResult> {
      const input = parseTrendingInput(rawInput)
      const current = now()
      if (current.getTime() < blockedUntil) {
        throw new Error('GitHub API rate limit reached; try again after the reset window.')
      }
      const key = JSON.stringify(input)
      const cached = cache.get(key)
      if (cached && cached.expiresAt > current.getTime()) {
        return { ...structuredClone(cached.value), cached: true }
      }

      const headers = new Headers({
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dsh-github-trending-mcp/0.1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      })
      if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
      const timeoutSignal = AbortSignal.timeout(12_000)
      const response = await fetcher(buildSearchUrl(input, current), {
        headers,
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      })
      if (response.status === 403 || response.status === 429) {
        const retryAfter = readNonnegativeInteger(response.headers.get('retry-after'))
        const reset = readNonnegativeInteger(response.headers.get('x-ratelimit-reset'))
        const requestedReset = retryAfter === undefined ? (reset ?? 0) * 1000 : current.getTime() + retryAfter * 1000
        blockedUntil = Math.min(current.getTime() + 300_000, Math.max(current.getTime() + 60_000, requestedReset))
        throw new Error('GitHub API rate limit reached; try again after the reset window.')
      }
      if (!response.ok) throw new Error(`GitHub API request failed with status ${response.status}.`)
      const length = Number(response.headers.get('content-length') ?? 0)
      if (Number.isFinite(length) && length > maxResponseBytes) throw new Error('GitHub API response was too large.')
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        throw new Error('GitHub API returned an unexpected content type.')
      }

      let parsed: z.output<typeof apiResponseSchema>
      try {
        const text = await response.text()
        if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) throw new Error('large')
        parsed = apiResponseSchema.parse(JSON.parse(text))
      } catch (error) {
        if (error instanceof Error && error.message === 'large') throw new Error('GitHub API response was too large.')
        throw new Error('GitHub API returned unexpected data.')
      }

      const reset = readNonnegativeInteger(response.headers.get('x-ratelimit-reset'))
      const remaining = readNonnegativeInteger(response.headers.get('x-ratelimit-remaining'))
      const result: TrendingResult = {
        approximate: true,
        cached: false,
        period: input.period,
        language: input.language,
        generatedAt: current.toISOString(),
        windowStart: buildSearchUrl(input, current).searchParams.get('q')!.match(/created:>=(\d{4}-\d{2}-\d{2})/)![1]!,
        totalCount: parsed.total_count,
        incomplete: parsed.incomplete_results,
        repositories: parsed.items.slice(0, input.limit).map((repository, index) => ({
          rank: index + 1,
          fullName: repository.full_name,
          url: repository.html_url,
          description: (repository.description ?? 'No description provided.').slice(0, 280),
          language: repository.language,
          stars: repository.stargazers_count,
          forks: repository.forks_count,
          openIssues: repository.open_issues_count,
          createdAt: repository.created_at,
          pushedAt: repository.pushed_at,
        })),
        ...(reset === undefined || remaining === undefined ? {} : {
          rateLimit: { remaining, resetAt: new Date(reset * 1000).toISOString() },
        }),
      }
      cache.set(key, { expiresAt: current.getTime() + cacheMs, value: structuredClone(result) })
      return result
    },
  }
}

function readNonnegativeInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}
