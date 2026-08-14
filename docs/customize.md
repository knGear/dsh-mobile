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
内置专属音效才动壳：`res/raw/` 放音频 + `ensureChannel` 里 `ch.setSound(Uri.parse("android.resource://com.dsh.mobile/raw/xxx"))`。

## 6. 安装脚本改动

`scripts/*.sh` 幂等原则：重复跑安全；`grep -q` 防重复写入；步骤编号 `X/N` 同步更新。

## 验证清单（每次改动后）

- [ ] `node --check` 所有改过的 js
- [ ] client 改动：刷新页面看效果（不用重启）
- [ ] host 改动：重启 dsh
- [ ] 壳改动：`bash build.sh` + 安装
- [ ] 文档同步（AGENT.md / docs / README）
