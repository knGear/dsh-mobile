# mobile-AndroidNotify 插件开发指南

**通知插件**：会话状态 → Android 通知。改 `index.js` 需重启 dsh。核心文件 ~450 行，通知逻辑 99% 在此。

## 通知状态机（对照"用户可见行为"）

```
开始运行 ──→ 静默常驻通知（ongoing，不可滑关，LOW 渠道 dsh_status）
  ├─ 手动暂停（finish reason=aborted）──→ 注销常驻，无横幅
  ├─ 正常完成（finish reason=stop）──→ 注销常驻 + 完成横幅
  ├─ 截断（finish reason=max-tokens）──→ 注销常驻 + "截断"横幅
  ├─ 故障（agent/error）──→ 注销常驻 + 故障横幅（错误码原文）
  └─ 插件卸载/dsh 重启（ctx.effect cleanup）──→ 全部常驻注销（防残留）
点按任意通知 ──→ 跳到对应会话（url=sessionUrl(sid)）
```

## 事件 → 动作映射（改规则就看这里）

| 事件 | 处理 |
|---|---|
| `agent/status` running（根 agent） | 置 running 状态 + `postOngoing` |
| `agent/status` idle | 注销常驻；按标记发 暂停(静默)/截断/完成/提问 横幅 |
| `session/event` finish | 打标记：`aborted`→paused、`max-tokens`→truncated |
| `tools/result` | 记 lastTool/lastArgs；`todo_write` 刷新常驻；进度刷新 |
| `agent/error` | 清标记 + 注销 + 故障横幅 |
| `agent/disposed` | 清标记 + 注销 |

## 关键函数

| 函数 | 说明 |
|---|---|
| `broadcast(payload)` | 统一出口：非 ongoing/cancel 自动注入 channel（声音开关）；`am broadcast` 直发 → su 兜底 |
| `postOngoing(sid)` | 常驻通知（title=会话标题-进行中，body=运行时间+todo/AI） |
| `ongoingId(sid)` | 常驻通知固定 id（hash 派生）——cancel 用同一 id |
| `titleOf(agent)` | 标题：`会话标题(≤15字)` 或 `新对话` |
| `sessionUrl(sid)` | `http://127.0.0.1:3080/?session=<sid>` |
| `ensure(sid)` | 会话状态（running/startedAt/todo/lastTool/lastSummary） |
| `generateSummary` / `generateStepSummary` | 强化模式 LLM 摘要（内置提示词，≤15字） |

## 加一个设置开关（四件套模板——照"声音开关"抄）

1. `state.json` 字段 + `readState()/writeState()`（已封装，加字段即可）
2. host 路由 `/api/dsh-xxx`（GET 读 / POST 写）
3. client.js MobileSection 加开关 UI（useState + fetch）
4. 逻辑处读取（如 `broadcast` 注入 channel、`generateSummary` 条件）

## 修改注意事项

- `broadcast` 是唯一通知出口：加字段/改格式都在这
- 标题格式约定：`标题-状态`（进行中/完成/提问/故障/截断）
- 强化开关：`progressOn`（LLM 摘要额外消耗，默认关）
- 声音开关：`soundEnabled`（默认开）→ 渠道 `dsh_notify_v2` / `dsh_notify_silent`
- 错误消息原文展示（`errorCode`，clamp 120 字），不本地化
