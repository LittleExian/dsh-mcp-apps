# 验证记录

日期：2026-09-10。平台：macOS、Node.js 22.23.2、本机 Chrome。

| 检查 | 结果 |
| --- | --- |
| `npm run test:coverage` | 13 个测试文件、78 项测试通过；语句 97.52%、分支 93.86%、函数 97.81%、行 98.89% |
| `npm run typecheck` | 通过 |
| `npm run build` | 生成 ESM Host 和 DSH ModuleLoader Client bundle；demo 构建另生成两个 stdio MCP Server 和单文件 UI |
| `npm run test:browser` | 4 项真实浏览器测试通过 |
| `npm run test:trending` | 2 项（360px / 1040px）真实 GitHub REST API → stdio MCP → 双 iframe → App 刷新测试通过 |
| `npm audit` | 0 项已知漏洞 |
| `npm pack` | 生成 `exian-dsh-mcp-apps-0.1.0.tgz` |
| 官方 DSH rc.7 安装/启动 | 使用独立 `DSH_HOME` 和 profile，tarball 安装成功，Web 服务启动成功 |
| 官方 DSH rc.7 浏览器加载 | 插件 `/plugins/@exian/dsh-mcp-apps/client.js` 返回 200；无 pageerror 或 console error |
| 官方 DSH rc.7 模型工具回合 | 官方 Mock LLM 调用 `wise_mcp__github-trending__show-trending`；DSH 持久化一组成功的 `tool/call` / `tool/result`，回合以 `completed` 结束 |
| 官方 DSH rc.7 UI 承载 | 原生聊天工具卡片加载 GitHub Trending 双层 iframe；外层与内层均为 `sandbox="allow-scripts"`，设备权限为 `none` |
| 官方 DSH rc.7 App 回调 | 在 UI 中切换到“今日”后，AppBridge 经宿主调用 app-only `refresh-trending`，榜单和 API 余量均更新 |

## 浏览器端到端覆盖

示例并非只 mock 工具返回值：实际使用官方 App SDK、AppBridge、双层 iframe、生产 RPC handler、AppHost 与 stdio MCP Server。测试模型调用的入口由本地 harness 驱动，无需付费模型或 API Key。

- 在 360px、1200px 视口中加载初始计数 4，按钮调用 MCP `increment` 后显示 5，原始结果仍显示 4。
- React StrictMode 下重复挂载不会撤销当前视图的 session。
- App 不能读取父页面 DOM。
- 来自非预期窗口的伪造工具/resize 消息不生效；错误 nonce 不能替换 HTML。
- 顶层导航被 sandbox 阻止；内层导航后撤销视图。
- GitHub Trending MCP App 从官方 REST Search API 载入实时榜单，切换到“今日”后通过 App 专用工具重新查询并渲染。

单元/集成测试另覆盖原工具仅执行一次、UI 专用 metadata 不进入模型文本、app-only 可见性、跨资源调用拒绝、TTL、限额、取消、断线和工具列表变更失效、部分启动失败回滚，以及 GitHub API 输入白名单、响应校验、缓存、大小限制、限流错误和凭据隔离。

## 实际 DSH 验证的边界

官方 rc.7 源码使用其发布标签 `dsh-v0.1.0-rc.7` 和锁文件构建，避免上游预发布依赖漂移。验证确认了安装格式、配置层组合、Host 激活、Client ModuleLoader 加载、模型工具注册、DSH 原生卡片渲染以及 App 发起的后续工具调用。

完整模型回合使用 DSH 官方本地 Mock LLM，未调用付费模型，但工具注册、模型工具事件、MCP Server 执行、结果 metadata、原生聊天渲染 slot、双层 iframe 和 AppBridge 回调均运行在真实 DSH Web profile 中。没有验证云服务器反向代理、移动端插件共存、其他 DSH 版本或多用户隔离。

测试 screenshot/trace 由 Playwright 写入 `test-results/`，覆盖率明细在 `coverage/`；它们是本地产物，不包含在安装包中。
