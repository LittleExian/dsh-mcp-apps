# 本地 MCP Apps 示例

这个计数器演示实际 MCP Apps 链路：DSH 客户端插件 bundle → React 工具卡片 → 双层 iframe → 官方 App / AppBridge → HTTP RPC → AppHost → stdio MCP Server。

```sh
npm run build -- --demo
node .demo/server.js
```

在浏览器打开 `http://127.0.0.1:43187/?strict=1`。初始工具结果为 4，点击 **Add one** 会经 MCP 调用 `increment` 返回 5，原始工具结果仍保留。`strict=1` 打开 React StrictMode，用于检查异步打开和清理。展开 **Sandbox checks** 可检查顶层导航限制和内层导航后的会话撤销。

```sh
npm run test:browser
```

测试默认使用本机 Chrome，验证 360px / 1200px 宽度、真实业务工具回调、父 DOM 隔离、伪造消息、导航及会话清理；失败时保留 Playwright trace 和截图。这里只模拟 DSH 的 ModuleLoader 和 slot 组合，不需要启动完整 DSH，也不证明某台部署环境中的插件加载成功。

## 接入 DSH

`npm run build -- --demo` 会生成 `.demo/mcp-server.js` 和 `.demo/app.html`。在插件 Host 配置的 `servers` 中添加：

```yaml
- serverName: demo
  transport: stdio
  command: /absolute/path/to/node
  args:
    - /absolute/path/to/wise-mcp-apps/.demo/mcp-server.js
```

替换成 DSH **服务器环境**中的绝对路径。示例工具 `show-counter` 对模型可见，`increment` 仅允许 App 调用；资源使用 `text/html;profile=mcp-app`。

本地 HTTP 服务只绑定 `127.0.0.1`，属于测试夹具，不应用作生产网关。生产环境的传输和鉴权由 DSH Connection 提供。
