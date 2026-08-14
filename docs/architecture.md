# 架构总览

三层 + 一条协议链，改任何功能前先定位它在哪一层。

## 三层

```
┌─ L1 文本层: README / scripts/*.sh / cordis.patch.yml / termux.properties
├─ L2 插件层: plugins/mobile-ui (client.js + index.js)
│             plugins/mobile-AndroidNotify (index.js + client.js)
└─ L3 壳层:   app/src/main/java/com/dsh/mobile/ (MainActivity + NotifyReceiver)
```

原则：**能放 L2 的绝不进 L3**（L3 要重编译，L2 重启/刷新即可）。

## 数据流（三跳）

```
dsh 事件 (host) ──→ 插件 index.js ──→ am broadcast (payload base64)
                                        ↓
                     NotifyReceiver ──→ 系统通知（渠道决定声音/常驻）
```

页面侧：

```
dsh web 页面 ──→ mobile-ui client.js（DOM 操作/React 设置面板）
              ──→ fetch /api/dsh-*（host 路由）
              ──→ AndroidShell.*（JS 桥，壳注入）
```

## 关键契约

### 通知 payload（index.js → NotifyReceiver）

| 字段 | 类型 | 说明 |
|---|---|---|
| title / body | string | 显示内容 |
| url | string | 点按跳转（`/api/dsh-*` 同源或 `http://127.0.0.1:3080/?session=...`） |
| id | number | 通知 id（常驻用 `ongoingId(sessionId)` 派生，固定不变） |
| ongoing | bool | 常驻（不可滑关；LOW 渠道 `dsh_status`） |
| cancel | bool | 注销指定 id |
| channel | string | 显式渠道（`dsh_notify_v2` 有声 / `dsh_notify_silent` 静音），非 ongoing/cancel 时由插件按声音开关自动注入 |

### 渠道（壳 NotifyReceiver）

| 渠道 | importance | 声音/震动 | 用途 |
|---|---|---|---|
| `dsh_notify_v2` | HIGH | 有 | 结果横幅（开关开） |
| `dsh_notify_silent` | HIGH | 无 | 结果横幅（开关关） |
| `dsh_status` | LOW | 无 | 常驻运行通知 |

> Android 渠道创建后属性不可改：新增"静音"靠**预建多渠道 + channel 参数切换**，不要删除重建。

### 事件（插件 host 监听）

- `agent/status`：`{agent, status}`，status = `running` | `idle`（只处理根 agent，`isRoot` 过滤）
- `agent/error`：`{agent, error}` → 故障横幅
- `agent/disposed`：`{agent}` → 注销常驻
- `session/event`：`{session, event}`，event.type = `assistant/message` | `user/message` | `finish`
  - `finish` 的 `event.data.reason.kind`：`stop`（正常完成）/ `max-tokens`（截断）/ `aborted`（手动暂停）/ `error` / `tool-calls`（继续）
- `tools/result`：`{exec}`，`exec.agent.id` / `exec.name` / `exec.arguments`（todo 提取等）

### JS 桥（壳注入 window.AndroidShell）

见 `docs/shell.md` 完整清单。web 侧调用前必须判空：`typeof AndroidShell !== 'undefined' && AndroidShell.xxx`。

### 插件路由（host webServer）

`/api/dsh-restart`、`/api/dsh-open-original`、`/api/dsh-progress-summary`（强化开关）、`/api/dsh-notify-settings`（声音开关）、`/api/dsh-diag`（已废弃）。

## 状态存储

插件侧 `~/.dsh/profiles/node_modules/mobile-AndroidNotify/state.json`：`{progressSummary: bool, sound: bool}`。
壳侧 SharedPreferences `dsh_shell`：`edge/top/bottom`（全面屏）、`remote_history`（连接历史，逗号分隔上限 5）。
