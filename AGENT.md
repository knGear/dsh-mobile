# AGENT.md — dsh-mobile 开发地图（AI 与维护者第一入口）

改这个仓库前先读本文档 + `docs/` 相关主题。目标是让任何 AI/维护者**按文档改，不凭感觉**。

## 这是什么

DeepSeek Harness（dsh）的 Android 移动前端，三部分：
- `app/` — Android 壳（com.dsh.mobile）：WebView + 通知接收 + 安全区 + JS 桥
- `plugins/mobile-ui/` — 移动 UI 插件（侧栏/设置/布局适配）
- `plugins/mobile-AndroidNotify/` — 通知插件（状态机/工具/开关）
- `scripts/` — 安装脚本（termux 原生 / proot ubuntu / 插件追加）

## 铁律

1. **不 fork 上游 dsh**：所有改动只在壳注入 + 本地插件层；上游升级零冲突
2. **只依赖稳定语义锚点**：`data-*` / `role=` / 事件名 / JS 桥——绝不依赖上游 hash 类名
3. **Java 不用 lambda**（老 d8：`Unable to find method metafactory`）——匿名类
4. **插件 package.json exports 必须完整**：`"."` `"./client"` `"./package.json"`，否则客户端模块静默不加载
5. **插件 id 全树唯一**：`mobile-` 前缀防撞上游
6. **client.js 实时生效**（改完刷新页面即可）；**index.js/壳要重启/重编译**
7. **能放插件的绝不进壳**：壳保持薄（WebView/通知接收/安全区三件事）

## 修改路径速查

| 想改 | 文件 | 生效 |
|---|---|---|
| 移动 UI 布局/样式/设置项 | `plugins/mobile-ui/client.js` | 刷新页面 |
| 通知文案/emoji/规则/开关 | `plugins/mobile-AndroidNotify/index.js` | 重启 dsh |
| 通知渠道/音效、JS 桥、离线页 | `app/src/main/java/com/dsh/mobile/` | 重编译装 APK |
| 安装脚本 | `scripts/*.sh` | 重跑 |

## 验证

- JS：`node --check <file>`
- Java：proot Debian 内 `bash build.sh`（工具链见 `docs/build-release.md`）
- 通知 payload 协议见 `docs/plugin-mobile-androidnotify.md`；JS 桥清单见 `docs/shell.md`

## 发布

见 `docs/build-release.md`（双资产：版本名 + 固定名 `dsh-mobile.apk`）。

## 待办（TODO）

- **顶部元素修改**：会话头部整理——去掉 Session log 按钮、把 agent 预设 + 后台任务按钮移到"对话/轨迹"选项卡行（结构已诊断：slot 出口包一层 div，header 定位法见 docs/plugin-mobile-ui.md DOM 锚点表；之前因插件加载问题搁置，wrapper 修复后根因已除）
- **底部元素修改**：状态行（x轮x步）两行化/去空格/左对齐——方案已设计（组 span 计数 + br 插入 + dataset 幂等标记），此前撤销，可重做
- **右上角运行状态入口（对话 x/x）**：Session log 位置替换为"对话 运行中/完成"按钮，点开展开面板（运行中置顶点击跳转不注销；完成项 ×仅注销 / 点本体注销+跳转）；完成横幅在状态区弹出。host 基础设施已就绪（`/api/dsh-session-status` GET 快照 / POST ?removeDone= + `dsh-notify/sessions` 事件 + runningSessions/doneSessions 集合），client UI 已撤销待重做。教训：client 改动页面必须刷新才可见；dsh-web-restart 杀进程逻辑不可靠（旧进程占端口致"假重启"），彻底重启需"杀光所有 + 等端口释放"
