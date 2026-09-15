const pages = [
  ['pages/01-system-map.html','全局架构','两条路径，共用一个受控能力边界'],
  ['pages/02-dsh-runtime.html','DSH 启动','插件建立运行面'],
  ['pages/03-model-entry.html','入口工具','模型调用 show-trending'],
  ['pages/04-retain-result.html','结果保留','callToken 能力签发'],
  ['pages/05-open-app.html','打开卡片','apps/open 与 sessionId'],
  ['pages/06-double-sandbox.html','双层沙箱','外层代理与内层 App'],
  ['pages/07-appbridge.html','AppBridge','Host 与 App 初始化握手'],
  ['pages/08-app-interaction.html','App 交互','callServerTool 回调'],
  ['pages/09-host-validation.html','Host 校验','六项能力边界'],
  ['pages/10-server-response.html','Server 执行','原 MCP Server 返回结果'],
  ['pages/11-state-update.html','状态更新','App 更新，模型记录不变'],
  ['pages/12-responsibilities.html','职责拆分','插件与 Server 各自负责什么'],
  ['pages/13-wisework-chain.html','WiseWork 链路','OpenCode 到 DTS MCP App'],
  ['pages/14-dsh-recording.html','DSH 录制','真实 GitHub Trending 调用'],
  ['pages/15-wisework-recording.html','WiseWork 录制','打开、填写并提交 DTS']
];
const frame = document.querySelector('#page-frame');
const current = document.querySelector('#current');
const total = document.querySelector('#total');
const title = document.querySelector('#page-title');
const subtitle = document.querySelector('#page-subtitle');
const bar = document.querySelector('#progress-bar');
const overview = document.querySelector('#overview');
const overviewGrid = document.querySelector('#overview-grid');
let index = Number(localStorage.getItem('mcp-apps-deck-page') || 0);
if (!Number.isInteger(index) || index < 0 || index >= pages.length) index = 0;
total.textContent = String(pages.length).padStart(2,'0');

pages.forEach((item, i) => {
  const button = document.createElement('button');
  button.className = 'overview-item';
  button.innerHTML = `<b>${String(i + 1).padStart(2,'0')} · ${item[1]}</b><span>${item[2]}</span><small>点击进入该页</small>`;
  button.addEventListener('click', () => { show(i); overview.classList.remove('open'); });
  overviewGrid.append(button);
});

function show(next) {
  index = (next + pages.length) % pages.length;
  const item = pages[index];
  frame.src = item[0];
  current.textContent = String(index + 1).padStart(2,'0');
  title.textContent = item[1];
  subtitle.textContent = item[2];
  bar.style.width = `${((index + 1) / pages.length) * 100}%`;
  [...overviewGrid.children].forEach((el, i) => el.classList.toggle('active', i === index));
  localStorage.setItem('mcp-apps-deck-page', String(index));
}
document.querySelector('#previous').addEventListener('click', () => show(index - 1));
document.querySelector('#next').addEventListener('click', () => show(index + 1));
document.querySelector('#replay').addEventListener('click', () => frame.contentWindow?.postMessage({ type: 'mcp-deck-replay' }, '*'));
document.querySelector('#open-overview').addEventListener('click', () => overview.classList.add('open'));
document.querySelector('#close-overview').addEventListener('click', () => overview.classList.remove('open'));
window.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'PageDown') show(index + 1);
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') show(index - 1);
  if (event.key.toLowerCase() === 'r') frame.contentWindow?.postMessage({ type: 'mcp-deck-replay' }, '*');
  if (event.key.toLowerCase() === 'o') overview.classList.toggle('open');
  if (event.key === 'Escape') overview.classList.remove('open');
});
show(index);
