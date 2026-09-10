import { App } from '@modelcontextprotocol/ext-apps'
import { languages, periods, type TrendingInput, type TrendingRepository, type TrendingResult } from './contract'

const app = new App({ name: 'GitHub Trending', version: '0.1.0' }, {})
const list = required<HTMLElement>('[data-testid=repository-list]')
const status = required<HTMLElement>('[data-testid=status]')
const error = required<HTMLElement>('[role=alert]')
const languageSelect = required<HTMLSelectElement>('#language')
const refreshButton = required<HTMLButtonElement>('#refresh')
const periodLabel = required<HTMLElement>('[data-testid=period-label]')
const languageLabel = required<HTMLElement>('[data-testid=language-label]')
const periodButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-period]')]

let filters: TrendingInput = { period: 'weekly', language: 'All', limit: 10 }
let loading = false
let sizeFrame = 0

for (const language of languages) {
  const option = document.createElement('option')
  option.value = language
  option.textContent = language === 'All' ? 'All languages' : language
  languageSelect.append(option)
}

app.ontoolinput = input => {
  filters = readFilters(input.arguments, filters)
  syncControls()
}
app.ontoolresult = result => {
  const value = readResult(result.structuredContent)
  if (value) render(value)
  else showError('The server returned data in an unsupported format.')
}

for (const button of periodButtons) {
  button.addEventListener('click', () => {
    const period = button.dataset.period
    if (periods.includes(period as TrendingInput['period'])) void refresh({ ...filters, period: period as TrendingInput['period'] })
  })
}
languageSelect.addEventListener('change', () => {
  if (languages.includes(languageSelect.value as TrendingInput['language'])) {
    void refresh({ ...filters, language: languageSelect.value as TrendingInput['language'] })
  }
})
refreshButton.addEventListener('click', () => void refresh(filters))

async function refresh(next: TrendingInput) {
  if (loading) return
  filters = next
  setLoading(true)
  syncControls()
  try {
    const result = await app.callServerTool({ name: 'refresh-trending', arguments: next })
    const value = readResult(result.structuredContent)
    if (!value) throw new Error('unsupported')
    render(value)
  } catch {
    showError('Could not refresh GitHub Trending. Check the server connection or API rate limit.')
  } finally {
    setLoading(false)
  }
}

function render(value: TrendingResult) {
  filters = { period: value.period, language: value.language, limit: filters.limit }
  error.textContent = ''
  list.replaceChildren(...value.repositories.map(repositoryCard))
  if (value.repositories.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No repositories found for this combination. Try a longer time range.'
    list.append(empty)
  }
  const generated = new Date(value.generatedAt)
  const time = Number.isNaN(generated.getTime()) ? 'just now' : generated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const remaining = value.rateLimit ? ` · ${value.rateLimit.remaining} API requests left` : ''
  status.textContent = `${value.cached ? 'Cached' : 'Updated'} ${time}${remaining}`
  syncControls()
  queueSizeSync()
}

function repositoryCard(repository: TrendingRepository): HTMLElement {
  const article = document.createElement('article')
  article.className = 'repo'
  article.dataset.testid = 'repository-card'

  const rank = document.createElement('div')
  rank.className = 'rank'
  rank.textContent = String(repository.rank).padStart(2, '0')

  const body = document.createElement('div')
  const title = document.createElement('h2')
  title.textContent = repository.fullName
  const description = document.createElement('p')
  description.textContent = repository.description
  const metrics = document.createElement('div')
  metrics.className = 'metrics'
  metrics.append(
    metric('★', compact(repository.stars)),
    metric('Forks', compact(repository.forks)),
    metric('Issues', compact(repository.openIssues)),
    metric('', repository.language ?? 'Other', 'lang'),
  )
  const url = document.createElement('div')
  url.className = 'url'
  url.textContent = repository.url
  body.append(title, description, metrics, url)
  article.append(rank, body)
  return article
}

function metric(label: string, value: string, extraClass = ''): HTMLElement {
  const element = document.createElement('span')
  element.className = `metric ${extraClass}`.trim()
  element.textContent = `${label}${label ? ' ' : ''}${value}`
  return element
}

function syncControls() {
  for (const button of periodButtons) button.setAttribute('aria-pressed', String(button.dataset.period === filters.period))
  languageSelect.value = filters.language
  periodLabel.textContent = ({ daily: 'Today', weekly: 'This week', monthly: 'This month' })[filters.period]
  languageLabel.textContent = filters.language === 'All' ? 'All languages' : filters.language
}

function setLoading(value: boolean) {
  loading = value
  refreshButton.disabled = value
  languageSelect.disabled = value
  for (const button of periodButtons) button.disabled = value
  document.body.setAttribute('aria-busy', String(value))
  if (value) status.textContent = 'Refreshing…'
  queueSizeSync()
}

function showError(message: string) {
  error.textContent = message
  queueSizeSync()
}

function queueSizeSync() {
  if (sizeFrame) cancelAnimationFrame(sizeFrame)
  sizeFrame = requestAnimationFrame(() => {
    sizeFrame = 0
    void app.sendSizeChanged({
      width: Math.ceil(document.documentElement.getBoundingClientRect().width || window.innerWidth),
      height: Math.ceil(document.body.scrollHeight),
    }).catch(() => undefined)
  })
}

function readFilters(value: unknown, fallback: TrendingInput): TrendingInput {
  if (!isRecord(value)) return fallback
  const period = periods.includes(value.period as TrendingInput['period']) ? value.period as TrendingInput['period'] : fallback.period
  const language = languages.includes(value.language as TrendingInput['language']) ? value.language as TrendingInput['language'] : fallback.language
  const limit = typeof value.limit === 'number' && Number.isInteger(value.limit) && value.limit >= 5 && value.limit <= 15 ? value.limit : fallback.limit
  return { period, language, limit }
}

function readResult(value: unknown): TrendingResult | undefined {
  if (!isRecord(value) || value.approximate !== true || !Array.isArray(value.repositories)) return undefined
  const filters = readFilters(value, { period: 'weekly', language: 'All', limit: 10 })
  const repositories = value.repositories.flatMap((item): TrendingRepository[] => {
    if (!isRecord(item) || typeof item.rank !== 'number' || typeof item.fullName !== 'string' || typeof item.url !== 'string' ||
      typeof item.description !== 'string' || typeof item.stars !== 'number' || typeof item.forks !== 'number' ||
      typeof item.openIssues !== 'number' || typeof item.createdAt !== 'string' || typeof item.pushedAt !== 'string') return []
    let url: URL
    try { url = new URL(item.url) } catch { return [] }
    if (url.origin !== 'https://github.com') return []
    return [{
      rank: item.rank,
      fullName: item.fullName.slice(0, 200),
      url: url.href,
      description: item.description.slice(0, 280),
      language: typeof item.language === 'string' ? item.language.slice(0, 80) : null,
      stars: item.stars,
      forks: item.forks,
      openIssues: item.openIssues,
      createdAt: item.createdAt,
      pushedAt: item.pushedAt,
    }]
  })
  return {
    approximate: true,
    cached: value.cached === true,
    period: filters.period,
    language: filters.language,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
    windowStart: typeof value.windowStart === 'string' ? value.windowStart : '',
    totalCount: typeof value.totalCount === 'number' ? value.totalCount : repositories.length,
    incomplete: value.incomplete === true,
    repositories,
    ...(isRecord(value.rateLimit) && typeof value.rateLimit.remaining === 'number' && typeof value.rateLimit.resetAt === 'string'
      ? { rateLimit: { remaining: value.rateLimit.remaining, resetAt: value.rateLimit.resetAt } }
      : {}),
  }
}

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing UI element: ${selector}`)
  return element
}

void app.connect().catch(() => showError('Could not connect the GitHub Trending view to its host.'))
