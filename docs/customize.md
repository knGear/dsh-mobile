# 自定义速查（给 AI：按示例改，不凭感觉）

## 1. 通知加 emoji / 改文案

改 `plugins/mobile-AndroidNotify/index.js` 的横幅广播处（或 `titleOf`），重启 dsh：

```js
// 完成横幅加 ✅（在 agent/status idle 分支的完成广播处）
broadcast({
  title: `${titleOf(agent)}-完成 ✅`,   // 或 body 里加
  body: body + ' ✅',
  url: sessionUrl(sid)
})
```

emoji 建议按状态：完成 ✅ / 故障 ⚠️ / 提问 ❓ / 截断 ✂️ / 进行中 ⏳。

## 2. 加一个新设置开关（四件套）

以"声音开关"为模板（`/api/dsh-notify-settings` + `soundEnabled` + `toggleSound`）：
1. `state.json` 加字段（`readState()/writeState()` 已封装）
2. `index.js` 加路由：GET 读 / POST 写
3. `client.js` MobileSection 加开关（useState + fetch 现有模式）
4. 逻辑处消费

## 3. 加一种新通知类型

照"截断"抄：
1. `session/event` finish 里打新标记（如 `reason.kind === 'xxx'` → `newKind.set(sid, true)`）
2. `agent/status` idle 分支消费标记 → 专属横幅
3. 别忘了 `agent/error`/`agent/disposed` 清标记

## 4. 移动 UI 加一个布局调整

在 `client.js` 写幂等函数 → 挂进 `applyLayout()`：

```js
function myLayoutThing() {
  try {
    const el = document.querySelector('[data-conversation-scroll]')
    if (!el || el.dataset.dshMine === '1') return
    el.dataset.dshMine = '1'          // 幂等标记
    el.style.paddingTop = '8px'
    // React 重建后标记丢失 → 循环自动重做，天然自愈
  } catch (e) { /* 忽略 */ }
}
```

## 5. 通知换音效（无需改代码）

系统级：长按通知 → 通知类别 → 声音，任意选。
内置专属音效才动壳：`res/raw/` 放音频 + `ensureChannel` 里 `ch.setSound(Uri.parse("android.resource://com.dshm/raw/xxx"))`。

## 6. 安装脚本改动

`scripts/*.sh` 幂等原则：重复跑安全；`grep -q` 防重复写入；步骤编号 `X/N` 同步更新。

## 验证清单（每次改动后）

- [ ] `node --check` 所有改过的 js
- [ ] client 改动：刷新页面看效果（不用重启）
- [ ] host 改动：重启 dsh
- [ ] 壳改动：`bash build.sh` + 安装
- [ ] 文档同步（AGENT.md / docs / README）


## 7. 主题/换肤（社区做，本项目不做）

### 现状：已有的换肤机制（全部在插件/壳层，未动上游）

- dsh 前端**全量 CSS 变量化**：`--dsw-alias-*`（背景/边框/文字）、`--dsw-specific-*`（侧栏等部位）、`--dsw-font-family`（字体）——覆盖变量即换肤
- 本项目已有的主题相关实现（改主题时参照）：
  - `SETTINGS_CSS`（mobile-ui client.js）：注入 `<style>` 覆盖 dsh 变量的现成模式
  - `syncBackgroundColor`：底色上报壳（`AndroidShell.setBackgroundColor`）——换背景色后状态栏同色是**自动的**
  - 壳 `injectTouchCss`：`@media (hover:none)` 注入的现成例子
- 静态资源可达性（实测结论）：
  - `/plugins/mobile-ui/package.json` → **404**（/plugins/<id>/ 只路由 client.js）
  - 工作区文件 `/xxx.png` → **200**（dsh 启动目录可直接引用）

### 可以怎么做（限已有机制）

1. 覆盖变量：照 `SETTINGS_CSS` 模式注入 `<style>`，改 `--dsw-alias-*` / `--dsw-font-family`
2. 素材引用：工作区直放 + `url('/bg.png')`（同源 200）；或 host 插件加 prefix 路由从 `~/.dsh/theme/` 读（照 `webServer.register` 现成模式）
3. 主题开关：四件套模板（state.json + 路由 + UI + 消费）
4. 参考社区 `dsh-web-ui` 的皮肤中心（8 款皮肤，同样插件注入路线）

### 不能怎么做（禁区）

- ❌ `url(file:///data/...)`：http 页面跨 scheme，WebView 直接拦截
- ❌ 依赖 `/plugins/<id>/` 下的任意静态文件：只路由 client.js，其余 404
- ❌ 改上游 hash 类名/组件：违反"不 fork"铁律，升级即碎
- ❌ 素材进 APK `res/raw`：那是壳层，任何资源改动都要重编译（除非愿意走 L3）
- ❌ 主题逻辑进本仓库内核：决策（2026-08）主题由社区以独立插件形式做
