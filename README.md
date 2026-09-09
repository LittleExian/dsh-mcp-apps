# Wise MCP Apps for DSH

把 WiseWork 的双层 iframe 渲染宿主移植为独立的 DeepSeek Harness Web 插件。模型调用带 UI 的 MCP 工具后，聊天记录中显示交互界面；界面的操作通过宿主调用同一 MCP Server 的业务工具。

目标版本：**DSH 0.1.0-rc.7、Node.js 22.19+、Web profile**。包名为 `@exian/dsh-mcp-apps`。这是本地插件，尚未发布到 npm。

## 安装

在插件源码目录执行：

```bash
npm ci --legacy-peer-deps
npm run build
npm pack
```

将生成的 `exian-dsh-mcp-apps-0.1.0.tgz` 放到运行 DSH 的环境，在那个环境内执行：

```bash
dsh plugin --profile web add /absolute/path/exian-dsh-mcp-apps-0.1.0.tgz
```

本地开发也可以直接安装构建后的源码目录：

```bash
dsh plugin --profile web add /absolute/path/wise-mcp-apps
```

Docker 部署应在 DSH 容器内使用相同的 `DSH_HOME` 和 `web` profile。宿主机文件必须先挂载或复制进容器，不能把电脑上的路径直接填进服务器配置。安装不会自动连接外部 MCP 服务；默认 `servers` 为空。

## 连接 MCP Server

修改 Web profile 中安装时加入的 `wise-mcp-apps` 配置实例，保留它所在的原有 patch 结构。stdio 示例：

```yaml
id: wise-mcp-apps
name: '@exian/dsh-mcp-apps'
config:
  servers:
    - serverName: demo
      transport: stdio
      command: node
      args: ['/absolute/path/to/mcp-server.mjs']
      env: {}
  operationTimeoutMs: 20000
  ttlMs: 900000
  maxEntries: 32
```

远程 Streamable HTTP 示例：

```yaml
servers:
  - serverName: reports
    transport: streamable-http
    url: https://your-mcp-server.example/mcp
    headers: {}
```

stdio 的 `env`、HTTP 的 `headers` 留在 DSH 服务端，不传给浏览器。使用 DSH 支持的私密配置方式提供凭据，不把真实密钥写入共享文件。本插件不继承进程中的令牌等环境变量；服务需要的变量必须显式配置。

修改后重启对应 DSH profile。模型工具名以 `wise_mcp__<serverName>__` 开头。为避免同一服务重复连接，不要同时把该 MCP Apps Server 配置为原生 `mcp-client` 实例。

## 支持范围

- stdio 和 Streamable HTTP MCP 连接；声明 `io.modelcontextprotocol/ui` 扩展能力。
- 从工具 `_meta.ui.resourceUri`（兼容旧的 `_meta['ui/resourceUri']`）识别 UI。
- 读取 `ui://`、`text/html;profile=mcp-app` 的 HTML 资源。
- 官方 `AppBridge` 握手，向 UI 发送原始工具参数、结果与 UI 专用 `_meta`。
- 双层 iframe 内嵌渲染、受限高度调整、App 发起的工具调用与关闭。
- `model` / `app` 工具可见性；App 调用绑定原服务器和资源。
- 关闭、过期、服务器断线或工具列表变化时撤销相关交互会话。

**普通 MCP 工具不会自动生成 UI。** UI 仍由 MCP Server 提供；现有标准 MCP App 不需要为每个界面改动这个插件。

当前实现以原生模型工具调用的聊天卡片为入口。rc.7 的 Code Mode 子调用若缺少展示 metadata，会显示文本回退。历史记录中的结果超过保留期、或 DSH 重启后，需要用户明确再次调用工具；宿主不会自动重放可能带副作用的操作。

第一版不提供全屏/画中画、嵌套第三方 iframe、浏览器设备权限、文件下载、App 发消息到聊天、sampling、OAuth 登录流程及自动重连。需要这些能力的 App 可能无法完整运行。服务器断线或更新工具列表后，重新加载插件以恢复。

## 与 WiseWork 的关系

沿用 WiseWork 项目中的 AppBridge、双层 iframe、HTML/CSP 校验与会话隔离思路，替换了 Electron IPC、renderer owner 和 OpenCode 事件适配。原 WiseWork 项目不依赖此插件，迁移没有改动其源码。

插件拥有自己的 MCP 连接，不依赖 DSH 的 `ctx.mcpApps`。浏览器通过 DSH Connection RPC 访问宿主，工具卡片使用官方 `tool.call.toolview` slot，客户端构建为 DSH ModuleLoader 支持的格式。

详见 [架构与边界](docs/architecture.md)。

## 已验证结果

2026-09-09 验证：72 项单元/集成测试、4 项真实 Chrome 端到端测试通过；语句覆盖率 98%，分支覆盖率 95.59%，函数覆盖率 98.36%，行覆盖率 99.13%。构建、类型检查通过，完整依赖漏洞扫描为零项。

已在隔离的官方 DSH `0.1.0-rc.7` Web profile 中安装 tarball 并启动服务：浏览器成功加载插件客户端，`tools/list-ui` 返回真实 stdio 示例工具，无浏览器运行错误。没有修改或部署到用户的云服务器。完整验证范围见 [验证记录](docs/verification.md)。

源码目录的 `examples/README.md` 提供可运行的计数器示例，用于检查原始结果 → UI → 业务工具回调的完整链路；示例源码不包含在安装包中。

## 开发验证

```bash
npm test
npm run test:coverage
npm run typecheck
npm run build
npm run test:browser
```

开发依赖固定了 rc.7 的公开接口；`--legacy-peer-deps` 用于避免上游预发布版本 peer 范围自动混入 rc.8，运行期仍要求匹配的 DSH 版本。不要把这一选项理解为已经验证其他版本兼容。
