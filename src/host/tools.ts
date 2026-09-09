import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { record, withoutMeta } from './contracts'
import type { AppHost } from './manager'

type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue}

export function definitions(host: AppHost): {serverName: string; definition: ToolDefinition}[] {
  return host.modelTools().map(({serverName, tool, publicName}) => ({serverName, definition: {
    name: publicName,
    description: tool.description ?? `MCP tool ${tool.name}`,
    parameters: tool.inputSchema,
    output: {
      schema: {type: 'object', properties: {content: {type: 'array', items: {}}, structuredContent: {}, callToken: {type: 'string'}}, required: ['content'], additionalProperties: false},
      render(_args, value) {
        const body = record(value) && Array.isArray(value.content) ? value.content : []
        const text = body.flatMap(block => record(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n')
        return [{type: 'text', text: text || '(MCP tool completed; structured output available.)'}]
      },
      presentationMeta(_args, value) {
        if (!record(value) || typeof value.callToken !== 'string') return null
        return {wiseMcpApp: {callToken: value.callToken, publicName}} satisfies JsonValue
      },
    },
    async execute(args, exec) {
      try {
        const {result, callToken} = await host.execute(serverName, tool.name, args, exec.signal)
        if (result.isError) throw new Error('MCP tool returned an error.')
        // Embedded resources contain executable HTML; only the App capability receives them.
        const content = result.content.filter(block => record(block) && block.type !== 'resource' && block.type !== 'resource_link')
        return {content: withoutMeta(content), ...(result.structuredContent === undefined ? {} : {structuredContent: withoutMeta(result.structuredContent)}),
          ...(callToken ? {callToken} : {})}
      } catch {throw new Error('MCP tool call failed or was cancelled. Check the server and retry explicitly.')}
    },
  }}))
}
