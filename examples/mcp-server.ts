import { readFile } from 'node:fs/promises'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
const server = new McpServer({name:'wise-counter-demo',version:'0.1.0'})
const uri = 'ui://wise-counter/app.html'
const result = (count:number) => ({content:[{type:'text' as const,text:`Original count: ${count}`}],structuredContent:{count}})
registerAppTool(server,'show-counter',{description:'Show an interactive counter',inputSchema:{initial:z.number().int().min(0).max(1000).default(4)},_meta:{ui:{resourceUri:uri,visibility:['model']}}},async({initial})=>result(initial))
registerAppTool(server,'increment',{description:'Increment the counter',inputSchema:{value:z.number().int().min(0).max(1000)},_meta:{ui:{resourceUri:uri,visibility:['app']}}},async({value})=>result(value+1))
registerAppResource(server,'Wise Counter',uri,{},async()=>({contents:[{uri,mimeType:RESOURCE_MIME_TYPE,text:await readFile(new URL('./app.html',import.meta.url),'utf8')}]}))
await server.connect(new StdioServerTransport())
