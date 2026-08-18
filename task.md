# task（dsh-agenttask）相关处理记录

> 本文件记录 dshm 项目中与 **task 插件（dsh-agenttask, 独立仓库 1.0）** 相关的处理与文件。
> **dshm-ui 不包含这些**（只做移动适配）; 重启/重载/任务监视全部归 task。

## dsh-web-restart-ui：AI 友好的重启包装脚本

| 项 | 值 |
|----|----|
| 位置 | `/data/data/com.termux/files/usr/bin/dsh-web-restart-ui` |
| 用途 | AI/bash 执行重启时触发前端模糊等待 + 倒计时 + 心跳重连 UX |
| 底层 | dsh-agenttask 插件的 `/api/dshat-restart` → SSE → 前端 → `/api/dshat-restart-go` |

### 为什么需要它

AI 习惯用 bash 执行重启（直接 `dsh-web-restart` 会 kill + nohup, 页面猝死无反馈）。
与其纠正 AI 改用 POST 端点, 不如把命令包装成内部走 POST——前端照样有完整重启 UX。

### 流程

```bash
bash /data/data/com.termux/files/usr/bin/dsh-web-restart-ui
  → ① curl POST /api/dshat-restart      # 推 SSE → 前端弹模糊遮罩 + 25s 倒计时
  → ② 前端自动调 /api/dshat-restart-go  # 3s 延迟 → spawn dsh-web-restart 真实重启
  → ③ 脚本轮询等旧进程消失 + 新端口通   # 确认前端已接管 → exit 0
  → ④ 兜底: 10s 前端未接管(无客户端)   # exec dsh-web-restart 直接重启
```

### 关键约束（死循环陷阱）

**不要改 `dsh-web-restart` 本体加 POST**：
- 前端收到 SSE restart 帧 → 自动调 `/api/dshat-restart-go`
- `restart-go` spawn 的就是 `dsh-web-restart` 脚本
- 若脚本开头再 POST `/api/dshat-restart` → 又推 SSE → 又调 restart-go → **无限循环**

所以包装脚本用"先 POST 试探 + 轮询确认前端接管 + 超时兜底"三保险：
- 前端在线 → 走完整模糊等待 UX（遮罩/转圈/25s 倒计时/心跳/✓就绪/reload）
- 前端不在线 → 10s 后 exec 原脚本直接重启, 不阻塞

### 重启时序（task 前端, 自动无需干预）

```
POST /api/dshat-restart
  → host 推 SSE {type:restart, req} 帧
  → 前端 requestRestart(true): 无其他运行会话 → ensureRestartUI()(遮罩+转圈+25s读秒)
     + 自动 fetch POST /api/dshat-restart-go
  → restart-go 延迟 3s → spawn dsh-web-restart(杀旧进程 + nohup 起新进程)
  → 前端心跳 fetch("/") 通(2xx~4xx) → ✓已就绪 → 等 1s → location.reload()
  → 25s 不通 → location.href="dshm://first?mode=offline" 跳离线页
```

### 铁律

- **restart ≈ 截断**: 杀掉 host 进程, 中断当前对话, 只能在会话末尾执行。
- 执行后立即结束本轮工作, 严禁等重启后继续查数据。
- reload（`/api/dshat-reload-sse` + `dshat_reload` 工具）不是截断: 只刷前端, host 存活, 可继续。

## task 插件自身（独立仓库 1.0, 不在本目录管理）

- 位置: `~/.dsh/profiles/node_modules/dsh-agenttask/`（index.js 209 行 + client.js 478 行）
- 端点: `/api/dshat-reload-sse` / `/api/dshat-restart` / `/api/dshat-restart-confirm` / `/api/dshat-restart-go` / `/api/dshat-agents`
- 工具: `dshat_reload` / `dshat_restart`
- 接管: 侧栏重载/重启按钮（`priority:-10` shadow dshm-ui）; `window.__dshAgentTask=true`
- 安装: `cordis.patch.yml` 里 `- insert: { id: dsh-agenttask, name: dsh-agenttask }`

## 相关文件

| 文件 | 说明 |
|------|------|
| `/data/data/com.termux/files/usr/bin/dsh-web-restart-ui` | AI 友好重启包装（本记录） |
| `/data/data/com.termux/files/usr/bin/dsh-web-restart` | 真实重启执行体（restart-go spawn 它, 勿加 POST） |
| `~/.dsh/profiles/node_modules/dsh-agenttask/` | task 插件源码 |
| `~/.dsh/profiles/web/cordis.patch.yml` | 插件挂载（dshm-ui + dsh-agenttask） |

