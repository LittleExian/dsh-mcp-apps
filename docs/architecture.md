# 架构与技术

插件同时运行在 DSH Host 和浏览器两个执行面。Host 负责 MCP 连接、工具调用和会话能力；浏览器负责把可信 Host 提供的数据送入受限 iframe，并转发被允许的 AppBridge 请求。

## 组件

| 组件 | 运行位置 | 职责 | 主要技术 |
| --- | --- | --- | --- |
| DSH 插件入口 | Node.js Host | 连接 MCP Server、注册模型工具和 RPC handler | Cordis、DSH Tools、TypeScript |
| MCP connection | Node.js Host | initialize、tools/list、tools/call、resources/read | MCP TypeScript SDK、stdio、Streamable HTTP |
| AppHost | Node.js Host | 保存结果、签发 token、校验 App 工具调用、限流 | Map、AbortController、Zod 边界校验 |
| DSH 工具视图 | 浏览器父页面 | 从工具 metadata 恢复 callToken，打开和关闭 App session | React、DSH UI slots、Connection RPC |
| sandbox proxy | 外层 iframe | 校验 nonce、窗口来源、opaque origin 和导航 | iframe sandbox、postMessage、CSP |
| MCP App | 内层 iframe | 渲染数据、处理筛选和发起后续工具调用 | HTML/CSS/JavaScript、MCP Apps SDK |
| GitHub Trending Server | stdio 子进程 | 查询 GitHub、返回结果和 App HTML | MCP Server SDK、Zod、GitHub REST API |

## 入口工具数据流

~~~mermaid
sequenceDiagram
  participant M as DSH Model
  participant T as DSH Tool Registry
  participant H as MCP Apps Host
  participant S as MCP Server
  participant C as DSH Chat Card

  M->>T: wise_mcp__server__tool(args)
  T->>H: execute(server, tool, args)
  H->>S: tools/call
  S-->>H: content + structuredContent + _meta
  H->>H: retain result and issue callToken
  H-->>T: model-safe result + callToken
  T-->>M: text/structured result
  T-->>C: presentationMeta.wiseMcpApp
~~~

入口工具只执行一次。模型得到去除 UI 专用 metadata 和可执行资源后的结果；原始结果保存在 Host 内存中，供卡片初始化使用。

## 卡片打开与交互

~~~mermaid
sequenceDiagram
  participant C as DSH Chat Card
  participant R as Connection RPC
  participant H as AppHost
  participant S as MCP Server
  participant A as Sandboxed MCP App

  C->>R: apps/open(callToken)
  R->>H: open
  H->>S: resources/read(ui://...)
  S-->>H: text/html;profile=mcp-app
  H-->>C: HTML + original result + sessionId
  C->>A: AppBridge tool input/result
  A->>C: tools/call(refresh-trending)
  C->>R: apps/call(sessionId, name, args)
  R->>H: validate session/tool/resource
  H->>S: tools/call
  S-->>A: updated CallToolResult
~~~

sessionId 只保留在可信父页面的闭包中。App iframe 只能提交工具名和参数，不能选择 MCP Server 地址。Host 从 session 解析原服务器，并要求目标工具包含 app visibility；如果它声明 UI resource，该 URI 必须与入口工具一致。

AppBridge 的 apps/call 是插件自己的 Connection RPC，不经过 DSH 模型工具事件流。因此入口 show-trending 会出现在 session.jsonl，而卡片里的 refresh-trending 默认只改变 App 状态，不写入模型会话日志。

## 双层 iframe

~~~text
DSH 页面
└── 外层代理 iframe
    sandbox="allow-scripts"
    └── 内层 MCP App iframe
        sandbox="allow-scripts"
        origin="null"
~~~

外层只包含插件生成的代理脚本，内层执行 MCP Server 返回的 HTML。两层都没有 allow-same-origin：

- 代理验证父页面来源、初始 nonce 和消息窗口。
- 内层消息必须来自预期 window，且 origin 为 opaque null。
- App 不能读取 DSH 父页面 DOM、cookie 或同源存储。
- 内层导航会撤销当前视图，避免导航后的文档继承会话能力。
- CSP 在不可信 HTML 执行之前注入。

UI 网络来源必须在 resource content 的 <code>_meta.ui.csp</code> 中声明为完整 HTTP(S)/WS(S) origin。当前版本拒绝通配符、URL 凭据、第三方 frame、外部 base URI、设备权限、worker 和表单提交。

## 会话和限额

callToken 表示一条仍在内存保留的工具结果。每次打开视图创建独立 sessionId，所以 React 重复挂载、多个浏览器视图或迟到的响应不会关闭其他视图。

默认限制：

| 项目 | 默认值 |
| --- | --- |
| 结果保留时间 | 15 分钟 |
| 保留结果数 | 32 |
| 每个 App 并发调用 | 4 |
| 每个 App 每分钟调用 | 60 |
| HTML 大小 | 2 MiB |
| 工具结果 JSON | 5 MiB |
| 工具参数 JSON | 256 KiB |
| iframe 高度 | 160–720 px |

关闭视图会撤销 sessionId 并取消仍在等待的请求。取消信号不能撤销 MCP Server 已经完成的外部副作用。DSH 重启、服务器断线、TTL 到期或工具列表变化都会使相关能力失效。

## GitHub Trending 示例映射

~~~text
examples/github-trending/
├── stdio.ts       MCP stdio 进程入口
├── server.ts      注册 show-trending、refresh-trending 和 ui:// resource
├── github.ts      GitHub REST Search、输入校验、缓存和限流处理
├── contract.ts    Server 与 App 共用的数据合同
├── app.ts         AppBridge 生命周期和交互逻辑
└── app.html       单文件界面模板
~~~

示例查询最近 1、7 或 30 天创建的非 fork、非 archived 公开仓库，并按 stars 降序排列。GitHub 没有公开官方 Trending API，所以该结果用于验证 MCP Apps 链路，不复刻 github.com/trending 的私有排名算法。

## DSH 集成点

- <code>ctx.tools.register</code>：把 model-visible MCP 工具注册给模型。
- <code>output.presentationMeta</code>：把短期 callToken 交给聊天工具卡片。
- <code>tool.call.toolview</code>：在 DSH 原生消息流中渲染 React 视图。
- <code>ctx.connection.rpc</code>：承载 tools/list-ui、apps/open、apps/call 和 apps/close。
- DSH ModuleLoader：加载插件浏览器 bundle。

## 认证边界

DSH rc.7 的 trusted-host RPC 校验主机/来源，但不提供独立的多租户 ACL。插件适合部署在已经由 DSH 登录或反向代理保护的单一信任域中。callToken 和 sessionId 是短期能力标识，不是用户身份。

stdio 环境变量和 Streamable HTTP headers 只存在于 DSH Host。插件不会把凭据放进 App HTML、工具结果或浏览器配置。需要互不信任的用户隔离时，应在 DSH 外层增加用户认证和逐用户授权。

## 参考

- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps)
- [DSH rc.7 Connection RPC](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/client/connection/src/rpc.ts)
- [DSH rc.7 工具渲染 slot](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/client/ui-tool/src/client/contract/slots.ts)
- [MCP Server 接入手册](integration-guide.md)

当前实现覆盖 MCP Apps 的核心 inline 宿主能力，不宣称支持全部可选扩展。
