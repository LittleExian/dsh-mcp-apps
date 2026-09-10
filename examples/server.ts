/** Local-only integration harness. DSH itself owns authentication in real deployments. */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { AppHost } from '../src/host/manager'
import { connectServer } from '../src/host/connection'
import { rpcHandler } from '../src/host/rpc'
const origin='http://127.0.0.1:43187'
let host:AppHost
const counter=await connectServer({serverName:'demo',transport:'stdio',command:process.execPath,args:[fileURLToPath(new URL('./mcp-server.js',import.meta.url))],env:{}},10_000,()=>host?.invalidate('demo'))
const trending=await connectServer({serverName:'github-trending',transport:'stdio',command:process.execPath,args:[fileURLToPath(new URL('./github-trending/server.js',import.meta.url))],env:process.env.GITHUB_TOKEN ? {GITHUB_TOKEN:process.env.GITHUB_TOKEN} : {}},10_000,()=>host?.invalidate('github-trending'))
host=new AppHost([counter,trending])
const handler=rpcHandler(host)
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wise MCP Apps demo</title><style>body{margin:0;background:#fff;color:#24362d;font:15px/1.5 system-ui}main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:22px}pre{font-size:13px}*{box-sizing:border-box}</style></head><body><main><h1>Wise MCP Apps · DSH host</h1><p>Real MCP server → retained result → double iframe → tool callback</p><div id="root"></div></main><script type="module" src="/harness.js"></script></body></html>'
const server=createServer(async(req,res)=>{
  const send=(status:number,value:unknown,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(value):value as string)}
  try {
    if(req.headers.host!=='127.0.0.1:43187') return send(403,{error:'Invalid host'})
    const path=new URL(req.url??'/',origin).pathname
    if(req.method==='GET'&&path==='/') return send(200,html,'text/html')
    if(req.method==='GET'&&path==='/plugin.js') return send(200,await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),'text/javascript')
    if(req.method==='GET'&&path==='/harness.js') return send(200,await readFile(new URL('./harness.js',import.meta.url),'utf8'),'text/javascript')
    if(req.method==='GET'&&path==='/bootstrap') {
      const showTrending=new URL(req.url??'/',origin).searchParams.get('app')==='trending'
      const serverName=showTrending?'github-trending':'demo'
      const toolName=showTrending?'show-trending':'show-counter'
      const args=showTrending?{period:'weekly',language:'All',limit:10}:{initial:4}
      const execution=await host.execute(serverName,toolName,args)
      const tool=host.listUi().find(item=>item.serverName===serverName&&item.rawName===toolName)!
      return send(200,{tool,block:{kind:'tool-result',callId:`${serverName}-call`,call:{name:tool.publicName,argsRaw:JSON.stringify(args)},content:execution.result.content,meta:{wiseMcpApp:{callToken:execution.callToken,publicName:tool.publicName}}}})
    }
    if(req.method==='POST'&&path==='/rpc'&&req.headers.origin===origin&&req.headers['content-type']==='application/json') {
      const controller=new AbortController()
      res.on('close',()=>{if(!res.writableEnded) controller.abort()})
      let body=''
      for await (const chunk of req) {body+=String(chunk);if(body.length>256*1024) return send(413,{error:'Too large'})}
      const input=JSON.parse(body) as {endpoint:string;payload:unknown}
      return send(200,await handler(input.endpoint,input.payload,controller.signal))
    }
    send(404,{error:'Not found'})
  } catch {if(!res.writableEnded) send(500,{error:'Demo request failed'})}
})
server.listen(43187,'127.0.0.1')
const close=async()=>{server.close();await host.dispose();process.exit(0)}
process.once('SIGTERM',()=>void close())
process.once('SIGINT',()=>void close())
