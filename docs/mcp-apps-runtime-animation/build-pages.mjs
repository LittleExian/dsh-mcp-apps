import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('docs/mcp-apps-runtime-animation/pages');
await mkdir(output, { recursive: true });

const pageNotes = {
  '01': ['橙色链路由模型发起，蓝色链路由卡片内的 App 发起。', 'MCP Apps Host 保存调用绑定，并控制两条链路的权限。', 'MCP App 通过 Host 回调原 MCP Server，不会自行直连其他服务。'],
  '02': ['启动 dsh web 后，DSH 组合 web profile、加载插件并连接 MCP Server。', '插件的 apply(ctx) 创建连接、AppHost 和模型可见工具。', '完成 initialize、tools/list 与 UI 扩展声明后，MCP App 才具备运行条件。'],
  '03': ['模型根据用户意图选择 show-trending，并把参数交给 MCP Server。', '入口工具对 model 可见，同时声明对应的 UI resource URI。', '这一调用既返回模型结果，也为后续打开交互卡片提供依据。'],
  '04': ['插件把一次 CallToolResult 分成模型结果和 Host 保留结果。', 'AppHost 保存原结果、输入、服务器身份与资源 URI，并签发 callToken。', '模型无需接触运行 UI 所需的全部元数据，卡片也不能伪造原调用。'],
  '05': ['工具卡片用 callToken 请求 apps/open，Host 再读取绑定的 HTML 资源。', 'AppHost 恢复原服务器与原工具关系，并为当前视图创建 sessionId。', 'callToken 只能恢复原调用，不能被用来选择另一个 MCP Server。'],
  '06': ['外层代理 iframe 建立边界，MCP Server 返回的 HTML 只在内层执行。', '外层检查 nonce、消息来源和导航；内层运行 CSP 保护后的 App。', '两个 iframe 都没有 allow-same-origin，因此 App 得不到宿主页面权限。'],
  '07': ['Host 与 App 通过 initialize、toolInput、toolResult 等消息完成握手。', '官方 AppBridge 与 PostMessageTransport 定义消息格式和回调方式。', '双层 iframe 负责隔离，AppBridge 才负责 MCP Apps 协议通信。'],
  '08': ['用户点击 Today，App 调用 refresh-trending 并传入 period=day。', 'AppBridge 把 callServerTool 请求交给可信父页面和 Host。', '这是卡片内交互，模型不会重新选择工具或参与本次回调。'],
  '09': ['Host 对 session、服务器、工具可见性、资源、数据边界和限额逐项校验。', 'AppHost 是 App 调用 MCP Server 前的唯一授权入口。', 'App 只能调用同一服务器、同一资源所允许的 app-visible 工具。'],
  '10': ['校验通过后，请求沿 apps/call 回到原 MCP Server 的 tools/call。', 'MCP Server 执行业务逻辑并返回新的 CallToolResult。', 'Host 负责安全转发和会话绑定，具体业务仍属于 MCP Server。'],
  '11': ['refresh-trending 的 structuredContent 返回后，卡片重新渲染为 Today。', 'MCP App 维护当前交互状态，DSH 会话保留最初的 weekly 工具记录。', '卡片内回调不会追加为一次新的模型工具调用。'],
  '12': ['左侧列出插件运行时能力，右侧列出 MCP Server 与 App 的业务能力。', '插件负责连接、隔离、会话和校验；Server 负责工具、数据、UI 与业务。', '接入新 MCP App 时，通常扩展标准 Server/App，无需修改 DSH 核心。'],
  '13': ['OpenCode 的 ACP 工具事件依次经过 Runtime Broker、Session Manager 和 IPC。', 'WiseWork 主进程维护会话，Renderer 用双层 iframe 与 AppBridge 承载 DTS App。', '这条模拟链路与 DSH 插件采用相同的 Host、沙箱和 App 回调思路。'],
  '14': ['实录展示输入请求、模型调用 show-trending、卡片出现并点击 Today。', 'DSH 负责模型与工具事件，插件负责 MCP Apps 的加载和回调。', '录制证明 GitHub Trending MCP Server 能在真实 DSH 中完整运行。'],
  '15': ['实录展示打开 DTS 表单、填写字段并调用 App-only 提交工具。', 'OpenCode 触发入口工具，WiseWork Host 与 AppBridge 承接后续表单交互。', '最终生成模拟 DTS 编号，验证此前 WiseWork MCP App 链路可交互。'],
};

function page({ no, chapter, title, subtitle, body, footer }) {
  const [process, owner, conclusion] = pageNotes[no];
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${no} · ${title}</title><link rel="stylesheet" href="../page.css"></head>
<body><main class="page"><div class="grid-bg"></div><header class="page-header"><div class="chapter">${chapter}</div><h1>${title}</h1><p>${subtitle}</p><span class="page-no">${no}</span></header><section class="visual">${body}</section><aside class="page-note rise" style="--delay:.2s" aria-label="本页说明"><strong>本页说明</strong><div><b>发生过程</b><span>${process}</span></div><div><b>负责组件</b><span>${owner}</span></div><div><b>页面结论</b><span>${conclusion}</span></div></aside><footer class="page-footer"><span>${footer}</span><span>MCP Apps Host for DSH</span></footer><span class="watermark">Created by Huashu-Design</span></main><script src="../page.js"></script></body></html>`;
}

const pages = [
  {
    file: '01-system-map.html', no: '01', chapter: 'SYSTEM MAP', title: '两条路径，共用一个受控能力边界', subtitle: '橙色：模型入口调用 · 蓝色：App 交互回调', footer: '全局架构',
    body: `<div class="node-row"><article class="flow-node rise" style="--delay:.1s"><small>INTENT</small><b>DSH 模型</b><code>show-trending</code></article><i class="arrow fade" style="--delay:.45s"></i><article class="flow-node rise" style="--delay:.3s"><small>PLUGIN</small><b>MCP Apps Host</b><code>retain · validate</code></article><i class="arrow fade" style="--delay:.65s"></i><article class="flow-node server rise" style="--delay:.5s"><small>SERVICE</small><b>MCP Server</b><code>tools · resources</code></article><i class="arrow fade" style="--delay:.85s"></i><article class="flow-node active rise" style="--delay:.7s"><small>BRIDGE</small><b>AppBridge</b><code>postMessage</code></article><i class="arrow fade" style="--delay:1.05s"></i><article class="flow-node sandbox rise" style="--delay:.9s"><small>OPAQUE ORIGIN</small><b>MCP App</b><code>structuredContent</code></article></div><div class="trace" style="left:7%;top:69%;width:55%;--delay:1.4s"></div><div class="trace blue" style="left:38%;top:77%;width:54%;--delay:2s"></div><i class="packet" style="left:8%;top:66.5%;--tx:720px;--delay:1.5s"></i>`
  },
  {
    file: '02-dsh-runtime.html', no: '02', chapter: 'DSH RUNTIME', title: 'DSH 启动时，插件先建立运行面', subtitle: 'Profile composition → plugin apply → MCP connection → tool registration', footer: '真实 DSH 插件启动过程',
    body: `<div class="node-row"><article class="flow-node rise" style="--delay:.1s"><small>CLI</small><b>dsh web</b><code>profile = web</code></article><i class="arrow fade" style="--delay:.4s"></i><article class="flow-node rise" style="--delay:.3s"><small>COMPOSE</small><b>加载插件包</b><code>@exian/dsh-mcp-apps</code></article><i class="arrow fade" style="--delay:.6s"></i><article class="flow-node active rise" style="--delay:.5s"><small>HOST</small><b>apply(ctx)</b><code>Connection · AppHost</code></article><i class="arrow fade" style="--delay:.8s"></i><article class="flow-node server rise" style="--delay:.7s"><small>CHILD PROCESS</small><b>GitHub Trending</b><code>stdio initialize</code></article><i class="arrow fade" style="--delay:1s"></i><article class="flow-node rise" style="--delay:.9s"><small>MODEL SURFACE</small><b>注册工具</b><code>wise_mcp__…</code></article></div><div class="chips" style="position:absolute;left:23%;right:23%;bottom:5%;justify-content:center"><span class="chip ok pop" style="--delay:1.4s">✓ MCP initialized</span><span class="chip ok pop" style="--delay:1.65s">✓ tools/list</span><span class="chip ok pop" style="--delay:1.9s">✓ UI extension declared</span></div>`
  },
  {
    file: '03-model-entry.html', no: '03', chapter: 'ENTRY TOOL', title: '模型只调用一次入口工具', subtitle: '入口工具对 model 可见，并通过 resourceUri 声明交互界面', footer: 'DSH Model → Tool Registry → MCP Server',
    body: `<div class="split"><article class="panel rise" style="--delay:.1s"><span class="label">USER INTENT</span><h2>“显示本周 GitHub Trending”</h2><p>DSH 模型选择 <code>wise_mcp__github-trending__show-trending</code>。</p><div class="chips"><span class="chip">period = week</span><span class="chip">language = all</span></div></article><article class="codebox rise" style="--delay:.5s"><b>MODEL</b> tools/call show-trending<br><b>SERVER</b> content + structuredContent<br><b>META</b> ui://github-trending/app.html<br><b>VISIBILITY</b> ["model"]</article></div><div class="trace" style="left:43%;top:49%;width:13%;--delay:1s"></div><i class="packet" style="left:43%;top:47.5%;--tx:180px;--delay:1.05s"></i>`
  },
  {
    file: '04-retain-result.html', no: '04', chapter: 'RETAIN RESULT', title: '插件把一次结果拆成两个出口', subtitle: '模型拿到安全结果，浏览器卡片拿到短期能力标识', footer: 'AppHost · retained result · callToken',
    body: `<div class="split"><article class="panel green rise" style="--delay:.15s"><span class="label">MODEL SAFE RESULT</span><h2>进入模型上下文</h2><div class="chips"><span class="chip ok">content</span><span class="chip ok">structuredContent</span><span class="chip">UI metadata removed</span></div></article><article class="panel blue rise" style="--delay:.65s"><span class="label">RETAINED IN HOST</span><h2>供 App 初始化</h2><div class="chips"><span class="chip blue">original result</span><span class="chip blue">tool input</span><span class="chip blue">server identity</span><span class="chip blue">resource URI</span></div></article></div><div class="chip pop" style="position:absolute;left:46%;top:44%;background:var(--orange);font-size:13px;--delay:1.35s">callToken</div>`
  },
  {
    file: '05-open-app.html', no: '05', chapter: 'OPEN VIEW', title: '工具卡片恢复一个独立 App 会话', subtitle: 'callToken 不能选择服务器，只能恢复原调用绑定的资源', footer: 'Tool Card → Connection RPC → AppHost',
    body: `<div class="node-row"><article class="flow-node rise" style="--delay:.1s"><small>DSH CLIENT</small><b>工具卡片</b><code>presentationMeta</code></article><i class="arrow fade" style="--delay:.4s"></i><article class="flow-node active rise" style="--delay:.35s"><small>CONNECTION RPC</small><b>apps/open</b><code>{ callToken }</code></article><i class="arrow fade" style="--delay:.65s"></i><article class="flow-node rise" style="--delay:.6s"><small>APPHOST</small><b>恢复绑定</b><code>server · tool · result</code></article><i class="arrow fade" style="--delay:.9s"></i><article class="flow-node server rise" style="--delay:.85s"><small>MCP</small><b>resources/read</b><code>ui://…/app.html</code></article><i class="arrow fade" style="--delay:1.15s"></i><article class="flow-node active pop" style="--delay:1.1s"><small>CAPABILITY</small><b>sessionId</b><code>per open view</code></article></div>`
  },
  {
    file: '06-double-sandbox.html', no: '06', chapter: 'DOUBLE SANDBOX', title: '不可信 HTML 只在内层 iframe 执行', subtitle: '外层代理只负责检查来源和转发协议消息', footer: 'Browser · opaque origin · CSP',
    body: `<div class="nested pop" style="right:34%;--delay:.15s"><div class="nested-inner pop" style="--delay:.7s"><div><small>INNER MCP APP · origin = null</small><b>GitHub Trending</b><code>srcdoc = CSP-wrapped HTML resource</code></div></div></div><div class="chips" style="position:absolute;right:2%;top:12%;width:27%;align-content:flex-start"><span class="chip ok rise" style="--delay:1.3s">allow-scripts only</span><span class="chip ok rise" style="--delay:1.5s">nonce + source window</span><span class="chip ok rise" style="--delay:1.7s">CSP before execution</span><span class="chip ok rise" style="--delay:1.9s">navigation revokes view</span></div>`
  },
  {
    file: '07-appbridge.html', no: '07', chapter: 'APPBRIDGE', title: '官方 SDK 建立 Host 与 App 的协议', subtitle: '双层 iframe 只是隔离层，AppBridge 才是 MCP Apps 通信层', footer: 'AppBridge · PostMessageTransport',
    body: `<div class="bridge-layout"><div class="bridge-end rise" style="--delay:.1s">TRUSTED PARENT<br><small>DSH tool card</small></div><div class="bridge-core pop" style="--delay:.45s">APP<br>BRIDGE</div><div class="bridge-end rise" style="--delay:.8s">INNER APP<br><small>App.connect()</small></div></div><div class="message-lane"><span class="rise" style="--delay:1.2s">initialize</span><span class="rise" style="--delay:1.55s">initialized</span><span class="rise" style="--delay:1.9s">sendToolInput</span><span class="rise" style="--delay:2.25s">sendToolResult</span><span class="rise" style="--delay:2.6s">sizeChanged</span></div>`
  },
  {
    file: '08-app-interaction.html', no: '08', chapter: 'APP PROCESS', title: '用户在卡片中直接调用 App 可见工具', subtitle: '点击 Today 后，App 发起 refresh-trending，模型不参与这次交互', footer: 'MCP App → callServerTool()',
    body: `<div class="split" style="grid-template-columns:34% 1fr"><article class="panel rise" style="--delay:.1s"><span class="label">APP EVENTS</span><h2>Today</h2><div class="codebox" style="box-shadow:none"><b>APP</b> callServerTool({<br>&nbsp; name: "refresh-trending",<br>&nbsp; arguments: { period: "day" }<br>})</div></article><div class="browser-shot pop" style="position:relative;inset:auto;--delay:.5s"><img src="../../images/github-trending-desktop.png" alt="GitHub Trending MCP App"><i class="cursor"></i><i class="click-ring"></i></div></div>`
  },
  {
    file: '09-host-validation.html', no: '09', chapter: 'VALIDATE & CALL', title: 'Host 决定 App 请求是否被允许', subtitle: 'App 只能提交工具名和参数，不能指定 MCP Server 地址', footer: 'AppHost policy gates',
    body: `<div class="gate-grid"><article class="gate rise" style="--delay:.1s"><b>01 SESSION</b><span>sessionId 仍有效</span></article><article class="gate rise" style="--delay:.35s"><b>02 SERVER</b><span>绑定同一 MCP Server</span></article><article class="gate rise" style="--delay:.6s"><b>03 VISIBILITY</b><span>工具包含 app</span></article><article class="gate rise" style="--delay:.85s"><b>04 RESOURCE</b><span>UI resource URI 匹配</span></article><article class="gate rise" style="--delay:1.1s"><b>05 BOUNDARY</b><span>参数与结果大小合法</span></article><article class="gate rise" style="--delay:1.35s"><b>06 LIMITS</b><span>并发和频率未超限</span></article></div><div class="trace blue" style="left:4%;right:4%;bottom:5%;--delay:1.9s"></div>`
  },
  {
    file: '10-server-response.html', no: '10', chapter: 'MCP SERVER', title: '业务仍然由原 MCP Server 执行', subtitle: 'Host 通过保留会话解析服务器，调用 app-visible 的 refresh-trending', footer: 'AppBridge callback → apps/call → MCP tools/call',
    body: `<div class="node-row"><article class="flow-node sandbox rise" style="--delay:.1s"><small>INNER APP</small><b>refresh-trending</b><code>{ period: day }</code></article><i class="arrow fade" style="--delay:.4s"></i><article class="flow-node active rise" style="--delay:.35s"><small>APPBRIDGE</small><b>oncalltool</b><code>trusted callback</code></article><i class="arrow fade" style="--delay:.65s"></i><article class="flow-node rise" style="--delay:.6s"><small>CONNECTION RPC</small><b>apps/call</b><code>{ sessionId }</code></article><i class="arrow fade" style="--delay:.9s"></i><article class="flow-node rise" style="--delay:.85s"><small>APPHOST</small><b>validate</b><code>same server</code></article><i class="arrow fade" style="--delay:1.15s"></i><article class="flow-node server pop" style="--delay:1.1s"><small>MCP SERVER</small><b>tools/call</b><code>CallToolResult</code></article></div><div class="trace blue" style="left:8%;top:75%;width:83%;--delay:1.5s"></div>`
  },
  {
    file: '11-state-update.html', no: '11', chapter: 'STATE UPDATE', title: '新结果只更新 App，模型记录保持原样', subtitle: 'AppBridge 的 apps/call 不进入 DSH 模型工具事件流', footer: 'structuredContent rerender',
    body: `<div class="compare"><article class="state rise" style="--delay:.15s"><small>DSH SESSION</small><h2>模型看到的结果</h2><code>show-trending · weekly</code><em>UNCHANGED</em></article><article class="state updated rise" style="--delay:.7s"><small>MCP APP</small><h2>卡片当前状态</h2><code>refresh-trending · today</code><em>UPDATED</em></article></div><div class="trace blue" style="left:51%;top:80%;width:39%;--delay:1.4s"></div>`
  },
  {
    file: '12-responsibilities.html', no: '12', chapter: 'RESPONSIBILITIES', title: '插件提供运行时，Server 提供业务与界面', subtitle: '新增标准 MCP App 时，通常只需要扩展对应 MCP Server', footer: 'Host surface and extension boundary',
    body: `<div class="split"><article class="panel green rise" style="--delay:.1s"><span class="label">PLUGIN HOST</span><h2>连接 · 隔离 · 渲染 · 回调</h2><div class="chips"><span class="chip ok">stdio / HTTP</span><span class="chip ok">session capability</span><span class="chip ok">double iframe</span><span class="chip ok">AppBridge host</span><span class="chip ok">validation</span></div></article><article class="panel blue rise" style="--delay:.55s"><span class="label">MCP SERVER + APP</span><h2>工具 · 数据 · UI · 业务</h2><div class="chips"><span class="chip blue">entry tool</span><span class="chip blue">app-only tool</span><span class="chip blue">UI resource</span><span class="chip blue">structuredContent</span><span class="chip blue">App.connect()</span></div></article></div>`
  },
  {
    file: '14-dsh-recording.html', no: '14', chapter: 'REAL RECORDING · DSH', title: '真实 DSH：模型调用到卡片交互', subtitle: '本地 DSH 0.1.0-rc 环境 · GitHub Trending MCP Server · AppBridge 回调', footer: 'Actual browser recording',
    body: `<div class="recording"><div class="media-frame pop" style="--delay:.15s"><video autoplay muted loop controls playsinline src="../dsh-github-trending.webm"></video></div><aside class="record-meta rise" style="--delay:.7s"><span class="label">RECORDED FLOW</span><b>Prompt → Tool → App</b><p>输入明确的工具请求，模型调用 <code>show-trending</code>，DSH 插件加载交互卡片，再点击 Today 触发 App 工具回调。</p><code>1440×900 · WebM · real DSH UI</code></aside></div>`
  },
  {
    file: '13-wisework-chain.html', no: '13', chapter: 'WISEWORK SIMULATION', title: 'WiseWork 用 Runtime Broker 接住 OpenCode 工具事件', subtitle: '此前模拟链路增加了主进程会话、IPC/Preload、双层沙箱与 DTS MCP App', footer: 'Referenced WiseWork implementation',
    body: `<div class="ww-chain"><article class="ww-node rise" style="--delay:.1s"><small>MODEL</small><b>OpenCode</b><code>ACP tool event</code></article><i class="arrow fade" style="--delay:.35s"></i><article class="ww-node rise" style="--delay:.3s"><small>ADAPTER</small><b>Runtime Broker</b><code>merge running/completed</code></article><i class="arrow fade" style="--delay:.55s"></i><article class="ww-node rise" style="--delay:.5s"><small>MAIN</small><b>Session Manager</b><code>resource · tool · session</code></article><i class="arrow fade" style="--delay:.75s"></i><article class="ww-node rise" style="--delay:.7s"><small>BOUNDARY</small><b>IPC / Preload</b><code>open · call · close</code></article><i class="arrow fade" style="--delay:.95s"></i><article class="ww-node rise" style="--delay:.9s"><small>RENDERER</small><b>双层 iframe</b><code>opaque origin</code></article><i class="arrow fade" style="--delay:1.15s"></i><article class="ww-node rise" style="--delay:1.1s"><small>BRIDGE</small><b>AppBridge</b><code>callServerTool</code></article><i class="arrow fade" style="--delay:1.35s"></i><article class="ww-node rise" style="--delay:1.3s"><small>SERVICE</small><b>DTS Server</b><code>MockDtsGateway</code></article></div>`
  },
  {
    file: '15-wisework-recording.html', no: '15', chapter: 'REAL RECORDING · WISEWORK', title: 'WiseWork：打开、填写并提交 DTS MCP App', subtitle: '此前测试的完整录制 · 模型触发工具 · 沙箱表单 · App-only 提交', footer: 'Recorded 2026-08-26 · mock DTS backend',
    body: `<div class="recording"><div class="media-frame pop" style="--delay:.15s"><img src="../wisework-dts-test.gif" alt="WiseWork DTS MCP App recording"></div><aside class="record-meta rise" style="--delay:.7s"><span class="label">RECORDED FLOW</span><b>Open → Fill → Submit</b><p>输入“请打开 DTS 表单”，OpenCode 触发入口工具；用户填写级联表单并通过 AppBridge 调用只对 App 可见的提交工具。</p><code>23s · 775×618 · cropped app surface</code></aside></div>`
  }
];

await Promise.all(pages.map(item => writeFile(resolve(output, item.file), page(item))));
console.log(`Generated ${pages.length} animated pages in ${output}`);
