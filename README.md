# MCP Apps Host for DeepSeek Harness

为 DeepSeek Harness（DSH）Web profile 提供 MCP Apps 渲染能力。模型调用带 UI 的 MCP 工具后，插件在原生聊天工具卡片中加载交互界面；界面还可以通过 AppBridge 调用同一个 MCP Server 的业务工具。

当前兼容目标：**DSH 0.1.0-rc.7、Node.js 22.19+、Web profile**。npm 包名为 <code>@exian/dsh-mcp-apps</code>。

![GitHub Trending MCP App 桌面端演示](docs/images/github-trending-desktop.png)

截图保留了入口工具返回的 weekly 文本，同时卡片已经通过 `refresh-trending` 切换到 Today，展示了模型结果与 App 后续交互相互独立。

## 能力

- 连接 stdio 和 Streamable HTTP MCP Server。
- 声明 <code>io.modelcontextprotocol/ui</code> 客户端扩展能力。
- 识别工具 <code>_meta.ui.resourceUri</code>，读取 <code>ui://</code> HTML 资源。
- 使用官方 MCP Apps AppBridge 传递工具输入、结果和 UI 专用 metadata。
- 在双层 <code>sandbox="allow-scripts"</code> iframe 中加载不可信 App HTML。
- 支持 <code>model</code> / <code>app</code> 工具可见性以及 UI 内的后续工具调用。
- 使用短期 <code>callToken</code> 和 <code>sessionId</code> 隔离每一次卡片交互。
- 对参数、结果、HTML、并发数、调用频率和资源 CSP 设置限制。

普通 MCP 工具不会自动变成界面。MCP Server 需要同时提供带 resource URI 的工具、HTML App 资源和适合 UI 使用的结构化结果。

## GitHub Trending 示例

仓库包含一个可运行的 GitHub Trending MCP App：

- <code>show-trending</code>：模型可见的入口工具。
- <code>refresh-trending</code>：只允许 App 调用的筛选/刷新工具。
- <code>ui://github-trending/app.html</code>：交互式排行榜资源。
- GitHub REST Search API：查询近期创建的公开仓库并按 stars 排序。

### 本地快速演示

~~~bash
git clone https://github.com/LittleExian/dsh-mcp-apps.git
cd dsh-mcp-apps
npm ci --legacy-peer-deps
npm run build -- --demo
node .demo/server.js
~~~

打开：

~~~text
http://127.0.0.1:43187/?app=trending
~~~

点击日期、语言或刷新按钮时，iframe 内的 App 会调用 <code>refresh-trending</code>，宿主再把请求转发给同一个 stdio MCP Server。详细实现见 [GitHub Trending 示例](examples/github-trending/README.md)。

## 架构

~~~mermaid
flowchart LR
  Model[DSH 模型] -->|模型工具调用| Tools[DSH Tool Registry]
  Tools --> Host[MCP Apps Host]
  Host -->|tools/call| Server[MCP Server]
  Server -->|CallToolResult| Host
  Host -->|callToken| Card[DSH 工具卡片]
  Card --> Outer[代理 iframe]
  Outer --> Inner[MCP App iframe]
  Inner -->|AppBridge tools/call| RPC[DSH Connection RPC]
  RPC --> Host
  Host -->|同服务器 app-visible 工具| Server
~~~

入口工具只执行一次。插件保存原始 CallToolResult，为聊天卡片签发短期 callToken；卡片打开后读取 <code>text/html;profile=mcp-app</code> 资源并创建独立 sessionId。App 只能调用原 MCP Server 中对 <code>app</code> 可见、且属于同一 UI 资源的工具。

双层 iframe 都不包含 <code>allow-same-origin</code>。外层负责 nonce、消息来源和导航检查，内层执行 MCP Server 返回的 HTML。完整的数据流、安全边界和生命周期见 [架构与技术](docs/architecture.md)。

## 技术栈

| 层 | 技术 |
| --- | --- |
| DSH 插件 | TypeScript、ESM、Cordis、DSH Tools、Connection RPC、tool.call.toolview |
| MCP 客户端 | @modelcontextprotocol/sdk、stdio、Streamable HTTP |
| MCP Apps | @modelcontextprotocol/ext-apps、AppBridge、PostMessageTransport |
| Web 视图 | React、双层 iframe、CSP、opaque origin |
| 构建 | Node.js 22、TypeScript、esbuild |
| 验证 | Vitest、Playwright、真实 GitHub REST API |

## 安装到 DSH

生成插件 tarball：

~~~bash
npm ci --legacy-peer-deps
npm run build
npm pack
~~~

在运行 DSH 的主机或容器内安装：

~~~bash
dsh plugin --profile web add /absolute/path/exian-dsh-mcp-apps-0.1.0.tgz
~~~

Docker 部署时，tarball、stdio MCP Server 和 node 命令都必须使用容器内可访问的路径。安装完成后，<code>servers</code> 默认为空。

## 连接 GitHub Trending MCP Server

先构建示例：

~~~bash
npm run build -- --demo
~~~

修改 <code>$DSH_HOME/profiles/web/cordis.patch.yml</code> 中安装产生的 <code>wise-mcp-apps</code> 配置：

~~~yaml
- id: wise-mcp-apps
  config:
    servers:
      - serverName: github-trending
        transport: stdio
        command: /absolute/path/to/node
        args:
          - /absolute/path/to/dsh-mcp-apps/.demo/github-trending/server.js
        env: {}
    operationTimeoutMs: 20000
    ttlMs: 900000
    maxEntries: 32
    maxCallsPerMinute: 60
    maxConcurrentCalls: 4
~~~

修改同一 patch 项时必须重述完整 <code>config</code>。stdio 服务需要的 Token 必须在该服务的 <code>env</code> 中明确提供；插件不会把环境变量或 HTTP headers 传给浏览器。

重载配置或重启 DSH 后，让模型调用：

~~~text
wise_mcp__github-trending__show-trending
~~~

远程 MCP Server 可以改用 Streamable HTTP。完整配置、服务返回合同、UI SDK 最小实现和验收步骤见 [接入手册](docs/integration-guide.md)。

## 当前边界

当前版本提供 inline 卡片，不提供全屏/画中画、第三方嵌套 iframe、设备权限、文件下载、App 向聊天发送消息、sampling、OAuth 流程或自动重连。依赖这些能力的 App 需要提供可降级的内嵌模式。

历史结果超过 TTL 或 DSH 重启后，原 callToken 会失效。用户需要重新调用入口工具，宿主不会自动重放可能带副作用的操作。服务器断线或通知工具列表变化后，需要重新加载插件。

## 验证结果

2026-09-10 验证结果：

- 78 项单元/集成测试通过。
- 4 项双层 iframe 安全浏览器测试通过。
- 2 项 GitHub API → stdio MCP → AppBridge 响应式浏览器测试通过。
- 语句覆盖率 97.52%，分支 93.86%，函数 97.81%，行 98.89%。
- 构建、类型检查和完整依赖漏洞扫描通过。
- 在官方 DSH 0.1.0-rc.7 Web profile 中完成模型工具调用、原生聊天卡片渲染和 <code>refresh-trending</code> 回调。

完整范围与限制见 [验证记录](docs/verification.md)。

## 开发检查

~~~bash
npm test
npm run test:coverage
npm run typecheck
npm run build
npm run test:browser
npm run test:trending
~~~

开发依赖固定为 DSH rc.7 的公开接口。<code>--legacy-peer-deps</code> 用于避免上游预发布 peer 范围自动混入其他版本，不代表已经验证 rc.7 以外的兼容性。
