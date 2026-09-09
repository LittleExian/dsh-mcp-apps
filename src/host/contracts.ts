import { createHash } from 'node:crypto'
import type { AppResource, AppResult, UiTool } from '../shared.ts'
import { MIME } from '../shared.ts'

const maxResourceBytes = 2 * 1024 * 1024
const maxToolResultBytes = 5 * 1024 * 1024
const maxNameLength = 64
const invalidPublicNameChars = /[^A-Za-z0-9_-]/g
const secretLikeEnv = /(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH|COOKIE|SESSION)/i
const safeAmbientEnv = new Set([
  'PATH',
  'Path',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMP',
  'TEMP',
  'TMPDIR',
  'SYSTEMROOT',
  'WINDIR',
])

export type ToolLike = {
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
  _meta?: unknown
}

export type AppMetadata = {
  resourceUri?: string
  visibility: Array<'model' | 'app'>
}

export function publicName(serverName: string, rawName: string): string {
  const joined = `wise_mcp__${serverName}__${rawName}`
  const normalized = joined.replace(invalidPublicNameChars, '_')
  if (normalized === joined && normalized.length <= maxNameLength) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, 12)
  return `${normalized.slice(0, maxNameLength - hash.length - 1)}_${hash}`
}

export function metadata(tool: Pick<ToolLike, '_meta'>): AppMetadata {
  const meta = asRecord(tool._meta)
  const ui = asRecord(meta?.ui)
  const nestedResourceUri = ui?.resourceUri
  const legacyResourceUri = meta?.['ui/resourceUri']
  if (nestedResourceUri !== undefined && typeof nestedResourceUri !== 'string') throw new Error('Invalid resource URI.')
  const resourceUri = typeof nestedResourceUri === 'string'
    ? nestedResourceUri
    : typeof legacyResourceUri === 'string'
      ? legacyResourceUri
      : undefined
  if (resourceUri !== undefined && !isUiUri(resourceUri)) {
    throw new Error('MCP App resource URI must use the ui:// scheme.')
  }
  return {
    resourceUri,
    visibility: readVisibility(ui?.visibility),
  }
}

export function toUiTool(serverName: string, tool: ToolLike): UiTool | null {
  const app = metadata(tool)
  if (app.resourceUri === undefined) return null
  return {
    publicName: publicName(serverName, tool.name),
    rawName: tool.name,
    serverName,
    resourceUri: app.resourceUri,
  }
}

export function resource(value: unknown, expectedUri: string): AppResource {
  const record = asRecord(value)
  if (record === undefined) throw new Error('MCP App resource content is invalid.')
  if (record.uri !== expectedUri || !isUiUri(record.uri)) {
    throw new Error('MCP App resource URI does not match the opened tool.')
  }
  if (record.mimeType !== MIME) {
    throw new Error(`MCP App resource MIME type must be ${MIME}.`)
  }
  if ('blob' in record || typeof record.text !== 'string') {
    throw new Error('MCP App resources must contain UTF-8 text.')
  }
  if (Buffer.byteLength(record.text, 'utf8') > maxResourceBytes) {
    throw new Error(`MCP App resource exceeds the ${maxResourceBytes} byte limit.`)
  }
  const meta = asRecord(record._meta)
  const ui = asRecord(meta?.ui)
  return {
    uri: record.uri,
    mimeType: MIME,
    text: record.text,
    ...ui === undefined ? {} : { _meta: { ui: readArguments(ui, 64 * 1024) } },
  }
}

export function toolResult(value: unknown): AppResult {
  const record = asRecord(value)
  if (record === undefined || !Array.isArray(record.content)) {
    throw new Error('MCP App tool result content must be an array.')
  }
  const serialized = stringifyJson(record)
  if (Buffer.byteLength(serialized, 'utf8') > maxToolResultBytes) {
    throw new Error(`MCP App tool result exceeds the ${maxToolResultBytes} byte limit.`)
  }
  if (record.structuredContent !== undefined && asRecord(record.structuredContent) === undefined) {
    throw new Error('MCP App structured tool result must be an object.')
  }
  if (record._meta !== undefined && !asRecord(record._meta)) throw new Error('Invalid result metadata.')
  if (record.isError !== undefined && typeof record.isError !== 'boolean') throw new Error('Invalid error flag.')
  return JSON.parse(serialized) as AppResult
}

export function readArguments(value: unknown, maxBytes = 256 * 1024): Record<string, unknown> {
  if (value === undefined) return {}
  const record = asRecord(value)
  if (record === undefined) throw new Error('MCP tool arguments must be an object.')
  const serialized = stringifyJson(record)
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new Error('MCP tool arguments are too large.')
  }
  return JSON.parse(serialized) as Record<string, unknown>
}

export function safeEnvironment(
  explicit: Record<string, string> = {},
  ambient: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(ambient)) {
    if (value === undefined || key.startsWith('DSH_') || key === 'NODE_OPTIONS') continue
    if (secretLikeEnv.test(key) && !safeAmbientEnv.has(key)) continue
    if (safeAmbientEnv.has(key) || key.startsWith('LC_')) kept[key] = value
  }
  return { ...kept, ...explicit }
}

export function isUiUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'ui:' && url.hostname.length > 0
  } catch {
    return false
  }
}

function readVisibility(value: unknown): Array<'model' | 'app'> {
  if (value === undefined) return ['model', 'app']
  if (!Array.isArray(value) || value.some(item => item !== 'model' && item !== 'app')) {
    throw new Error('MCP App tool visibility metadata is invalid.')
  }
  return [...new Set(value)]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    throw new Error('MCP App values must be JSON serializable.')
  }
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2048) throw new Error('Invalid identifier.')
  return value
}
export function jsonObject(value: unknown, maxBytes = 256 * 1024): Record<string, unknown> {
  if (!record(value)) throw new Error('Expected a JSON object.')
  return readArguments(value, maxBytes)
}
export function withoutMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMeta)
  if (!record(value)) return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_meta').map(([key, item]) => [key, withoutMeta(item)]))
}
