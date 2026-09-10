# DSH 与 MCP Server 接入手册

本文把接入分成三层：DSH 安装插件、插件连接 MCP Server、MCP Server 提供可渲染的 MCP App。前两层完成后，普通 MCP 工具可以被模型调用；只有第三层也满足时，DSH 聊天卡片才会显示交互界面。

当前兼容目标是 **DeepSeek Harness 0.1.0-rc.7、Node.js 22.19+、Web profile**。插件实现了 MCP Apps 的核心内嵌流程，但不是全部可选能力。

## 1. 构建并安装插件

在插件源码目录生成安装包：

```bash
cd /absolute/path/to/dsh-mcp-apps
npm ci --legacy-peer-deps
npm run build
npm pack
```

在实际运行 DSH 的主机或容器中，把 tarball 安装到 `web` profile：

```bash
DSH_HOME=/absolute/path/to/dsh-home \
  dsh plugin --profile web add /absolute/path/exian-dsh-mcp-apps-0.1.0.tgz
```

如果 DSH 在 Docker 中运行，源码路径、tarball、stdio 服务脚本和 `node` 命令都必须是**容器内可访问的绝对路径**。先复制或挂载文件，再在容器内运行安装命令。插件安装后会新增 `wise-mcp-apps` 实例，默认不连接任何服务。

## 2. 配置 MCP Server

编辑 `$DSH_HOME/profiles/web/cordis.patch.yml` 中已有的 `wise-mcp-apps` 项。DSH patch 的同一配置项会整体替换，不会递归合并，因此修改时要保留完整 `config`。

本地 stdio 服务：

```yaml
- id: wise-mcp-apps
  name: '@exian/dsh-mcp-apps'
  config:
    servers:
      - serverName: github-trending
        transport: stdio
        command: /absolute/path/to/node
        args:
          - /absolute/path/to/dsh-mcp-apps/.demo/github-trending/server.js
        env: {}
        # cwd: /optional/working/directory
    operationTimeoutMs: 20000
    ttlMs: 900000
    maxEntries: 32
    maxCallsPerMinute: 60
    maxConcurrentCalls: 4
```

远程 Streamable HTTP 服务：

```yaml
- id: wise-mcp-apps
  name: '@exian/dsh-mcp-apps'
  config:
    servers:
      - serverName: reports
        transport: streamable-http
        url: https://mcp.example.com/mcp
        headers:
          Authorization: !!js '`Bearer ${process.env.MCP_ACCESS_TOKEN}`'
    operationTimeoutMs: 20000
    ttlMs: 900000
    maxEntries: 32
    maxCallsPerMinute: 60
    maxConcurrentCalls: 4
```

配置约束：

- 最多 32 个服务；`serverName` 只能包含字母、数字、下划线和连字符，长度 1–32。
- stdio 的 `command`、`args`、`cwd` 都按 DSH 进程所在环境解析。服务必须持续运行，并只用 stdout 传 MCP 协议消息。
- 插件只继承 `PATH`、locale、临时目录等安全环境变量。Token 和其他业务变量必须通过该服务的 `env` 明确提供。
- Streamable HTTP 的 URL 必须是 HTTP(S)，不能把用户名或密码嵌在 URL 中；认证信息放在服务端配置的 `headers`。
- 同一个 MCP Server 不要再配置为 DSH 原生 `mcp-client`，否则会重复连接并注册重复工具。

保存 profile patch 后，DSH 的配置热更新会重新加载插件；也可以重启 Web profile。插件连接服务、执行 `tools/list`，并把模型可见工具注册为：

```text
wise_mcp__<serverName>__<toolName>
```

插件在 MCP `initialize` 时声明客户端扩展能力 `io.modelcontextprotocol/ui`，支持的 MIME 类型为 `text/html;profile=mcp-app`。服务可以据此决定是否返回 MCP App UI。

## 3. MCP Server 必须提供的合同

### 3.1 `tools/list`

作为界面入口的工具必须同时满足：

1. 提供有效的 `name`、`description` 和 JSON Schema `inputSchema`。
2. `_meta.ui.resourceUri` 指向一个 `ui://` URI。
3. `visibility` 包含 `model`，或省略 `visibility` 使用默认的 `model + app`。

推荐使用当前字段；插件也兼容旧字段 `_meta["ui/resourceUri"]`。

```json
{
  "name": "show-dashboard",
  "description": "Show an interactive dashboard.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "period": { "type": "string", "enum": ["daily", "weekly"] }
    }
  },
  "_meta": {
    "ui": {
      "resourceUri": "ui://reports/dashboard.html",
      "visibility": ["model"]
    }
  }
}
```

供界面按钮调用的辅助工具应设置 `visibility: ["app"]`，这样不会进入模型工具列表。它必须属于同一个 MCP Server；如果也声明 `resourceUri`，URI 必须与入口工具一致。省略辅助工具的 `resourceUri` 也可以。

当前宿主不支持 `execution.taskSupport: "required"` 的 task-based tool。

### 3.2 `tools/call`

入口工具和 App 辅助工具都必须返回 MCP `CallToolResult`：

```json
{
  "content": [
    { "type": "text", "text": "Dashboard loaded: 10 records." }
  ],
  "structuredContent": {
    "records": [],
    "updatedAt": "2026-09-10T12:00:00Z"
  },
  "_meta": {
    "uiOnlyValue": "available to the UI, omitted from model text"
  }
}
```

本插件要求：

- `content` 必须是数组。应提供简短 text 回退，以便 UI 不可用时模型和聊天记录仍能解释结果。
- `structuredContent` 可省略；若提供，必须是 JSON object，不能是数组或标量。UI 需要展示结构化数据时应把数据放在这里。
- `_meta` 可省略；若提供，必须是 object。它会交给 UI，但不会拼进模型可见文本，适合放 UI 专用信息，不适合放长期凭据。
- `isError` 必须是 boolean。错误结果仍应带可读的 `content`。
- 单次工具参数 JSON 上限为 256 KiB，结果 JSON 上限为 5 MiB。

模型入口调用只执行一次。宿主保存原始结果并创建短期 `callToken`，打开或重新挂载界面不会再次执行该入口工具。

### 3.3 `resources/read`

当聊天卡片打开时，插件会直接对入口的 `resourceUri` 执行 `resources/read`。服务不必依赖 `resources/list` 才能被本插件发现，但必须能按 URI 返回资源。

```json
{
  "contents": [
    {
      "uri": "ui://reports/dashboard.html",
      "mimeType": "text/html;profile=mcp-app",
      "text": "<!doctype html><html>...</html>",
      "_meta": {
        "ui": {
          "csp": {
            "connectDomains": ["https://api.example.com"],
            "resourceDomains": ["https://static.example.com"]
          }
        }
      }
    }
  ]
}
```

本插件当前要求：

- 返回项的 `uri` 必须与请求完全一致，并使用 `ui://` scheme。
- MIME 必须精确为 `text/html;profile=mcp-app`。
- HTML 必须放在 UTF-8 `text` 中；当前不接受 `blob` 资源。HTML 上限 2 MiB。
- CSP 和权限元数据必须放在这条 resource content 的 `_meta.ui` 中。
- `connectDomains` 和 `resourceDomains` 只接受明确的 HTTP(S)/WS(S) origin，不接受通配符、路径或内嵌凭据。
- `frameDomains`、`baseUriDomains` 必须省略或为空；`permissions` 必须省略或为空对象。当前双层沙箱不开放第三方 iframe、camera、microphone、geolocation、clipboard-write、fullscreen、worker 和表单提交。

如果 App 的 JS/CSS/图片都内联到 HTML，可以省略 CSP 网络域。这样最容易跨部署环境运行。

## 4. UI 必须实现的能力

HTML 在双层 opaque-origin iframe 中运行，两层均为 `sandbox="allow-scripts"`。UI 应使用官方 `@modelcontextprotocol/ext-apps` App SDK：

```ts
import { App } from '@modelcontextprotocol/ext-apps'

const app = new App({ name: 'Reports dashboard', version: '1.0.0' }, {})

app.ontoolinput = input => {
  // 读取模型调用入口工具时的原始 arguments
}

app.ontoolresult = result => {
  // 使用 structuredContent、content 和 UI 专用 _meta 渲染初始状态
}

async function refresh(arguments_: Record<string, unknown>) {
  const result = await app.callServerTool({
    name: 'refresh-dashboard',
    arguments: arguments_,
  })
  // 渲染辅助工具的新结果
}

await app.connect()
await app.sendSizeChanged({ width: document.body.scrollWidth, height: document.body.scrollHeight })
```

对接本插件时，UI 至少需要：

- 调用 `app.connect()` 完成 AppBridge 初始化。
- 用 `ontoolinput` 接收入口参数，用 `ontoolresult` 接收入口结果。
- 需要交互刷新时，通过 `callServerTool` 调用同服务器的 app-visible 工具。
- 内容高度变化时调用 `sendSizeChanged`；宿主把内嵌高度限制在 160–720 px。
- 不依赖父页面 DOM、cookie、localStorage 同源访问、顶层导航或未声明网络域。

宿主当前只提供 inline display mode，不提供 fullscreen、picture-in-picture、App 向聊天发送消息、sampling、OAuth 登录流程或文件下载。依赖这些能力的 MCP App 需要先改造成可降级的内嵌版本。

## 5. 验收步骤

先构建本仓库自带的真实服务：

```bash
cd /absolute/path/to/dsh-mcp-apps
npm run build -- --demo
```

把 `.demo/github-trending/server.js` 按第 2 节加入 `config.servers`，重启 DSH，然后按顺序检查：

1. DSH 启动时插件没有报配置、MCP initialize 或 `tools/list` 错误。
2. 浏览器能加载 `/plugins/@exian/dsh-mcp-apps/client.js`。
3. 模型能看到并调用 `wise_mcp__github-trending__show-trending`。
4. 工具返回文本回退，同时聊天卡片出现 GitHub Trending UI。
5. UI 中切换日期或语言后，`refresh-trending` 被调用，榜单更新；该 app-only 工具不出现在模型工具列表。
6. 浏览器控制台没有 page error、CSP error 或 AppBridge 初始化错误。

`wise-mcp-apps/tools/list-ui` 是 DSH Connection RPC 名称，不是公开 HTTP 路由，不能用 `curl /wise-mcp-apps/tools/list-ui` 验证。应通过聊天模型工具列表和实际卡片交互完成验收。

当前已经在官方 DSH `0.1.0-rc.7` 的隔离 Web profile 中完成上述链路：Mock LLM 触发真实工具回合、GitHub REST API 返回结构化结果、DSH 原生工具卡片加载双层 iframe，AppBridge 再调用 `refresh-trending` 并更新 UI。详细证据见 [验证记录](verification.md)。

## 6. 服务兼容检查表

| 项目 | 接入要求 |
| --- | --- |
| 传输 | stdio 或 Streamable HTTP |
| 入口工具 | model-visible，带 `ui://` resource URI |
| 辅助工具 | app-visible，同一个 MCP Server，资源 URI 相同或省略 |
| 工具结果 | `content` 数组；UI 数据用 object 类型 `structuredContent` |
| UI 资源 | URI 精确匹配；MIME 为 `text/html;profile=mcp-app`；UTF-8 `text` |
| UI SDK | AppBridge connect、输入/结果监听；交互时 callServerTool |
| 外部网络 | 在 resource content `_meta.ui.csp` 中声明准确 origin |
| 沙箱适配 | 不依赖第三方 iframe、设备权限、父页面同源能力或顶层导航 |
| 凭据 | 只在 DSH 服务端 `env` / `headers` 中配置，不返回给 UI |
| 生命周期 | 服务断线或 `tools/list_changed` 后重新加载插件 |

## 7. 规范与实现参考

- [MCP Apps 概览](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/overview.md)
- [MCP Apps 类型定义](https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts)
- [把 App 加入 MCP Server 的官方指引](https://github.com/modelcontextprotocol/ext-apps/blob/main/plugins/mcp-apps/skills/add-app-to-server/SKILL.md)
- [本插件架构与安全边界](architecture.md)
- [GitHub Trending 服务示例](../examples/github-trending/README.md)
