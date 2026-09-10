export const periods = ['daily', 'weekly', 'monthly'] as const
export const languages = ['All', 'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java', 'C#', 'C++', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'Dart', 'Shell'] as const

export type TrendingInput = {
  period: typeof periods[number]
  language: typeof languages[number]
  limit: number
}

export type TrendingRepository = {
  rank: number
  fullName: string
  url: string
  description: string
  language: string | null
  stars: number
  forks: number
  openIssues: number
  createdAt: string
  pushedAt: string
}

export type TrendingResult = {
  approximate: true
  cached: boolean
  period: TrendingInput['period']
  language: TrendingInput['language']
  generatedAt: string
  windowStart: string
  totalCount: number
  incomplete: boolean
  repositories: TrendingRepository[]
  rateLimit?: { remaining: number; resetAt: string }
}
