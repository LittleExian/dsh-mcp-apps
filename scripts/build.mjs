import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..',import.meta.url)))
await mkdir('lib',{recursive:true})
await build({entryPoints:['src/index.ts'],outfile:'lib/index.js',bundle:true,format:'esm',platform:'node',target:'node22',external:['@deepseek-ai/*','@modelcontextprotocol/*','zod'],sourcemap:true})
const client=await build({entryPoints:['src/client/index.tsx'],bundle:true,format:'cjs',platform:'browser',target:'es2022',external:['react','react/jsx-runtime','@deepseek-ai/cordis','@deepseek-ai/dsh-client-ui-slots'],write:false,minify:true})
await writeFile('lib/client.js',`window.__ModuleLoader__.load({id:"@exian/dsh-mcp-apps",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`)
if(process.argv.includes('--demo')) {
  await mkdir('.demo',{recursive:true})
  const app=await build({entryPoints:['examples/app.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,minify:true})
  const html=(await readFile('examples/app.html','utf8')).replace('/* APP_BUNDLE */',()=>app.outputFiles[0].text.replaceAll('</script','<\\/script'))
  await writeFile('.demo/app.html',html)
  await build({entryPoints:['examples/mcp-server.ts','examples/server.ts'],outdir:'.demo',bundle:true,format:'esm',platform:'node',target:'node22',packages:'external',sourcemap:true})
  await build({entryPoints:['examples/harness.tsx'],outfile:'.demo/harness.js',bundle:true,format:'esm',platform:'browser',target:'es2022',sourcemap:true})
}
