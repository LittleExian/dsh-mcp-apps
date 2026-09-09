# 架构与边界

```text
DSH 模型工具调用
  → 插件 Host 的单一 MCP Client
  → 原始 CallToolResult（只执行一次）
  → 内存中保留结果，生成短期 callToken
  → DSH presentationMeta / tool.call.toolview
  → Connection RPC apps/open
  → 外层代理 iframe
      → 内层 opaque-origin iframe
          → MCP App HTML + App SDK
              → AppBridge tools/call
              → 绑定会话的 Host RPC
              → 原 MCP Client 的业务工具
```

## 会话

callToken 表示一条仍在内存保留的工具结果。每次打开视图都会创建独立 sessionId，因此 React 重复挂载、多个浏览器视图或迟到的打开响应不会关闭其他视图。关闭视图撤销其 sessionId；原结果按 TTL 保留，重新打开只读取资源，不重新执行业务工具。进程重启不会恢复旧 capability。

sessionId 只保留在可信父页面的闭包中，App iframe 只提交工具名和参数。Host 从 sessionId 解析原服务器，浏览器不能指定任意服务器地址。仅允许 app-visible 工具；声明了另一 UI resource 的工具不可调用。未声明 UI resource 的业务工具可被同服务器的 App 使用。

每条结果默认保留 15 分钟，最多 32 条；交互会话上限为结果数量上限的四倍。每个会话默认最多 4 个并发调用、每分钟 60 次调用。HTML 上限 2 MiB，结果上限 5 MiB，参数上限 256 KiB。关闭后未完成的工具请求会收到取消信号；取消不能撤销服务器已经发生的副作用。

## 浏览器边界

外层只包含插件生成的代理脚本，内层执行 MCP Server 返回的 HTML。两层均使用 `sandbox="allow-scripts"`，不授予 `allow-same-origin`。代理验证父页面来源与初始 nonce，内层消息验证 source 和 opaque origin，沙箱控制消息不能从 App 伪造转发。

CSP 在所有不可信 HTML 之前生效。UI 网络源必须是声明的完整 HTTP(S)/WS(S) origin；通配符、URL 凭据及指令注入被拒绝。第一版拒绝设备权限、嵌套框架、外部 base URL、表单提交和 worker。外层的框架加载策略限制内层跳转，导航后的视图被断开。

DSH 父页面的 CSP 还必须允许插件的 data iframe；反向代理新增 CSP 时需要同时检查这一点。不能为了让某个 App 工作而给内层添加同源权限。

## 认证边界

DSH rc.7 的 `trusted-host` RPC 只校验请求的主机/来源，**不是用户登录或多租户 ACL**。此插件面向已有访问控制的单一信任域，继承 DSH 部署的登录/反向代理认证。callToken 和 sessionId 是短期能力标识，不是独立用户身份。

具备 DSH 管理权限的访问者本来就能配置和调用 MCP 服务。要给互不信任的用户提供隔离，需要额外的用户认证与每用户授权层，不能只靠本插件的随机 token。

## 参考

- [DSH rc.7 RPC 合同](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/client/connection/src/rpc.ts)
- [DSH rc.7 工具渲染 slot](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/client/ui-tool/src/client/contract/slots.ts)
- [MCP Apps 官方 SDK](https://github.com/modelcontextprotocol/ext-apps)

实现是对 MCP Apps 基础宿主能力的支持，不宣称覆盖全部可选扩展，也不等同于独立安全认证。
