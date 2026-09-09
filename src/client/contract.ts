import type { AppPreview, UiTool } from '../shared.ts'
import { MIME } from '../shared.ts'

export function parseUiTools(value: unknown): UiTool[] {
  if (!Array.isArray(value)) throw new Error('MCP App UI tool list must be an array.')
  const seen = new Set<string>()
  return value.map((item) => {
    const tool = parseUiTool(item)
    if (seen.has(tool.publicName)) throw new Error(`MCP App UI tool "${tool.publicName}" is duplicated.`)
    seen.add(tool.publicName)
    return tool
  })
}

export function parsePreview(value: unknown, expected: UiTool): AppPreview {
  const preview = asRecord(value)
  if (preview === undefined) throw new Error('MCP App preview is invalid.')
  if (typeof preview.sessionId !== 'string' || preview.sessionId.length === 0) {
    throw new Error('MCP App preview session ID is invalid.')
  }
  const tool = parseUiTool(preview.tool)
  if (
    tool.publicName !== expected.publicName
    || tool.rawName !== expected.rawName
    || tool.serverName !== expected.serverName
    || tool.resourceUri !== expected.resourceUri
  ) {
    throw new Error('MCP App preview tool does not match the requested tool.')
  }
  const resource = asRecord(preview.resource)
  if (resource === undefined || resource.uri !== expected.resourceUri || resource.mimeType !== MIME || typeof resource.text !== 'string') {
    throw new Error('MCP App preview resource is invalid.')
  }
  if (asRecord(preview.input) === undefined) throw new Error('MCP App preview input is invalid.')
  const result = asRecord(preview.result)
  if (result === undefined || !Array.isArray(result.content)) throw new Error('MCP App preview result is invalid.')
  return preview as unknown as AppPreview
}

export function resolveCallToken(block: unknown, tool: UiTool, toolName: string): string | null {
  const record = asRecord(block)
  if (record?.kind !== 'tool-result') return null
  const call = asRecord(record.call)
  if (call?.name !== toolName || call.name !== tool.publicName) return null
  const meta = asRecord(record.meta)
  const app = asRecord(meta?.wiseMcpApp)
  if (app?.publicName !== tool.publicName || typeof app.callToken !== 'string' || app.callToken.length === 0) {
    return null
  }
  return app.callToken
}

export function resultText(block: unknown): string {
  const record = asRecord(block)
  if (record === undefined || !Array.isArray(record.content)) return ''
  return record.content.map((item) => {
    const entry = asRecord(item)
    if (entry?.type === 'text' && typeof entry.text === 'string') return entry.text
    return `[${String(entry?.type ?? 'unknown')} content]`
  }).join('\n')
}

export function record(value: unknown): value is Record<string, unknown> {
  return asRecord(value) !== undefined
}

function parseUiTool(value: unknown): UiTool {
  const record = asRecord(value)
  if (
    record === undefined
    || typeof record.publicName !== 'string'
    || record.publicName.length === 0
    || typeof record.rawName !== 'string'
    || record.rawName.length === 0
    || typeof record.serverName !== 'string'
    || record.serverName.length === 0
    || typeof record.resourceUri !== 'string'
    || !record.resourceUri.startsWith('ui://')
  ) {
    throw new Error('MCP App UI tool descriptor is invalid.')
  }
  return {
    publicName: record.publicName,
    rawName: record.rawName,
    serverName: record.serverName,
    resourceUri: record.resourceUri,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
