import { App } from '@modelcontextprotocol/ext-apps'
const app = new App({name:'Wise Counter',version:'0.1.0'},{})
const count = document.querySelector<HTMLOutputElement>('[data-testid=count]')!
const error = document.querySelector<HTMLElement>('[role=alert]')!
let value = 0
const show = (result:{structuredContent?:Record<string,unknown>}) => {
  if (typeof result.structuredContent?.count === 'number') {
    value = result.structuredContent.count
    count.textContent = String(value)
  }
}
app.ontoolresult = show
app.ontoolinput = () => {}
document.querySelector<HTMLButtonElement>('#increment')!.onclick = async () => {
  try {show(await app.callServerTool({name:'increment',arguments:{value}}))}
  catch (reason) {error.textContent = reason instanceof Error ? reason.message : String(reason)}
}
try {
  void window.parent.document.body
  document.querySelector('[data-testid=isolation]')!.textContent = 'Parent DOM accessible'
} catch {document.querySelector('[data-testid=isolation]')!.textContent = 'Parent DOM blocked'}
document.querySelector<HTMLButtonElement>('#top-nav')!.onclick = () => {
  try {window.top!.location.href = 'about:blank'}
  catch {document.querySelector('[data-testid=navigation]')!.textContent = 'Top navigation blocked'}
}
document.querySelector<HTMLButtonElement>('#inner-nav')!.onclick = () => {window.location.href = 'about:blank'}
void app.connect().catch(reason => {error.textContent = String(reason)})
