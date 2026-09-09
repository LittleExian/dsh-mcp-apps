# 验证记录

日期：2026-09-09。平台：macOS、Node.js 22.23.2、本机 Chrome。

| 检查 | 结果 |
| --- | --- |
| `npm run test:coverage` | 11 个测试文件、72 项测试通过；语句 98%、分支 95.59%、函数 98.36%、行 99.13% |
| `npm run typecheck` | 通过 |
| `npm run build` | 生成 ESM Host 和 DSH ModuleLoader Client bundle |
| `npm run test:browser` | 4 项真实浏览器测试通过 |
| `npm audit --audit-level=moderate` | 0 项已知漏洞 |
| `npm pack` | 生成 `exian-dsh-mcp-apps-0.1.0.tgz` |
| 官方 DSH rc.7 安装/启动 | 使用独立 `DSH_HOME` 和 profile，tarball 安装成功，Web 服务启动成功 |
| 官方 DSH rc.7 浏览器加载 | 插件 `/plugins/@exian/dsh-mcp-apps/client.js` 返回 200；无 pageerror 或 console error |
| 官方 DSH rc.7 Host/Client 通信 | `/wise-mcp-apps/tools/list-ui` 返回 `wise_mcp__demo__show-counter` 和 `ui://wise-counter/app.html` |

## 浏览器端到端覆盖

示例并非只 mock 工具返回值：实际使用官方 App SDK、AppBridge、双层 iframe、生产 RPC handler、AppHost 与 stdio MCP Server。测试模型调用的入口由本地 harness 驱动，无需付费模型或 API Key。

- 在 360px、1200px 视口中加载初始计数 4，按钮调用 MCP `increment` 后显示 5，原始结果仍显示 4。
- React StrictMode 下重复挂载不会撤销当前视图的 session。
- App 不能读取父页面 DOM。
- 来自非预期窗口的伪造工具/resize 消息不生效；错误 nonce 不能替换 HTML。
- 顶层导航被 sandbox 阻止；内层导航后撤销视图。

单元/集成测试另覆盖原工具仅执行一次、UI 专用 metadata 不进入模型文本、app-only 可见性、跨资源调用拒绝、TTL、限额、取消、断线和工具列表变更失效、部分启动失败回滚，以及启动期间服务器失效。

## 实际 DSH 验证的边界

官方 rc.7 的所有 186 个 DSH 依赖包在隔离测试环境中固定到 rc.7，避免上游 `^0.1.0-rc.7` 自动解析成其他版本。验证确认了安装格式、配置层组合、Host 激活、Client ModuleLoader 加载与 UI 工具发现。

没有在官方 DSH 中连接付费模型来发起真实模型回合；工具调用到渲染的完整回路由本地真实 MCP 浏览器 harness 验证。没有验证云服务器反向代理、移动端插件共存、其他 DSH 版本或多用户隔离。

测试 screenshot/trace 由 Playwright 写入 `test-results/`，覆盖率明细在 `coverage/`；它们是本地产物，不包含在安装包中。
