import Schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
const common = {serverName: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)}
export const configSchema = z.object({
  servers: z.array(z.discriminatedUnion('transport', [
    z.object({...common, transport: z.literal('stdio'), command: z.string().min(1), args: z.array(z.string()).default([]),
      env: z.record(z.string(), z.string()).default({}), cwd: z.string().min(1).optional()}).strict(),
    z.object({...common, transport: z.literal('streamable-http'), url: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol) && !new URL(value).username && !new URL(value).password),
      headers: z.record(z.string(), z.string()).default({})}).strict(),
  ])).max(32).default([]).refine(servers => new Set(servers.map(s => s.serverName)).size === servers.length),
  operationTimeoutMs: z.number().int().min(100).max(300_000).default(20_000),
  ttlMs: z.number().int().min(1000).max(3_600_000).default(900_000),
  maxEntries: z.number().int().min(1).max(128).default(32),
  maxCallsPerMinute: z.number().int().min(1).max(600).default(60),
  maxConcurrentCalls: z.number().int().min(1).max(16).default(4),
}).strict()
export type HostConfig = z.output<typeof configSchema>
export type ServerConfig = HostConfig['servers'][number]
export const Config = Schema.object({
  servers: Schema.array(Schema.union([
    Schema.object({serverName: Schema.string().required(), transport: Schema.const('stdio'), command: Schema.string().required(),
      args: Schema.array(String).default([]), env: Schema.dict(String).default({}), cwd: Schema.string()}),
    Schema.object({serverName: Schema.string().required(), transport: Schema.const('streamable-http'), url: Schema.string().required(), headers: Schema.dict(String).default({})}),
  ])).default([]),
  operationTimeoutMs: Schema.number().default(20_000), ttlMs: Schema.number().default(900_000),
  maxEntries: Schema.number().default(32), maxCallsPerMinute: Schema.number().default(60), maxConcurrentCalls: Schema.number().default(4),
})
