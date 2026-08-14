# mobile-ui 插件开发指南

**移动 UI 插件**：client.js（页面注入）+ index.js（host 路由/工具）。改 client.js 刷新即生效；改 index.js 需重启 dsh。

## 目录职责

| 文件 | 职责 |
|---|---|
| `client.js` | 布局注入（applyLayout 循环）、侧栏抽屉、设置面板（React）、重启按钮 |
| `index.js` | `/api/dsh-restart`、`/api/dsh-open-original`、`restart` 工具 |

## client.js 关键机制

### applyLayout 循环（一切布局改动的入口）

```js
function applyLayout() {
  syncBackgroundColor()      // 底色上报壳
  tagAgentPresets()          // 设置卡片自适应
  fixAgentPresetTitle()      // "Agent 预设"标题
  applySidebarOverlay()      // 侧栏抽屉
}
```

- 调用来源：`apply()` 里无条件 `setInterval(applyLayout, 1200)` + MutationObserver（rAF 节流）
- **新布局函数就加进 applyLayout**；幂等设计（dataset 标记防重复）
- 循环建立不依赖任何前置（slots 失败也不影响布局——这是历史教训，勿回退）

### DOM 锚点速查（稳定语义，勿换 hash 类名）

| 目标 | 锚点 |
|---|---|
| 三列 frame | `[data-side="sidebar"]/[data-side="details"]` 的 parentElement |
| 会话滚动区 | `[data-conversation-scroll]`（其 parentElement = 会话根） |
| 会话头部 | scroll 的 previousElementSibling 内 `<header>`（slot 出口会包一层 div！） |
| 选项卡行 | header 内 `[role="tablist"]` |
| 输入区 | `[data-composer-seat]` |
| 设置分区 | `[data-slot="settings.section"]` / `settings.general.item` |
| 侧栏槽 | `sidebar.footer.action`、`sidebar.settings` |

### 设置面板（MobileSection）

React 组件，注册到 `settings.section`（id `mobile`，order 25）。新设置项照现有分组抄：
状态（useState）→ fetch host 路由 → 开关/输入 UI → 即时生效。

### 侧栏抽屉

- 展开：`applySidebarOverlay` 把 sidebarCol 改 absolute 覆盖（grid 首列置 0）
- 收起：**不可见 `<button>` 遮罩**（z35，语义化）点击 → `collapseSidebar()` → 官方 `ctx.get('layout').toggleSidebar()`（inject 声明 `layout`）
- `data-sidebar-collapsed` 是 dsh 的状态反射，别手动改（走官方 API）

## index.js

- 路由：`ctx.webServer.register({kind:'exact', path, handler})`
- 工具：`ctx.tools.register(defineTool({name, description, parameters, execute}))`——**description 就是给 agent 的调用指南**，写清楚何时用/参数/注意事项

## 纯净模式/原版模式

- `?plain=1`（URL）或 `dsh.pure=1`（localStorage）→ 跳过全部注入，仅保留设置入口
- 新功能记得遵守（pure 分支）
