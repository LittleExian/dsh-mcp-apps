export const CHANNEL = '/wise-mcp-apps'
export const MIME = 'text/html;profile=mcp-app'
export interface UiTool {
  publicName: string
  rawName: string
  serverName: string
  resourceUri: string
}
export interface AppResource {
  uri: string
  mimeType: typeof MIME
  text: string
  _meta?: {ui?: Record<string, unknown>}
}
export interface AppResult {
  content: unknown[]
  structuredContent?: Record<string, unknown>
  _meta?: Record<string, unknown>
  isError?: boolean
}
export interface AppPreview {
  sessionId: string
  tool: UiTool
  resource: AppResource
  input: Record<string, unknown>
  result: AppResult
}
// Host RPC: tools/list-ui(null) -> UiTool[]; apps/open({callToken}) -> AppPreview;
// apps/call({sessionId,name,arguments}) -> AppResult; apps/close({sessionId}) -> null.
// Settled tool block.meta.wiseMcpApp = {callToken,publicName}.
// Tokens are ephemeral capabilities, never credentials or MCP connection settings.
