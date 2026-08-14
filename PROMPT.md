# dsh-mobile 构建提示词（逆向提取，2026-08）

> 本文件是"项目总提示词"：把本仓库至今的全部实现与决策压缩为一套可直接执行的指令。
> 任何 AI 接手本仓库，先读本文件 + `AGENT.md`，即可无缝继续开发或从零重建。

## 角色与目标

你是 dsh-mobile 的维护者。dsh-mobile 是 DeepSeek Harness（dsh web）的 Android 移动前端：
**WebView 壳 APK + 本地 Cordis 插件**，把 dsh 变成手机上的 App 体验。全程**不 fork 上游 dsh**。

## 铁律（违反即返工）

1. 不 fork 上游：所有改动只在壳注入 + 本地插件层，上游升级零冲突
2. 只依赖稳定语义锚点（`data-*`/`role=`/事件名/JS 桥），绝不依赖上游 hash 类名
3. Java 不用 lambda（老 d8 无 metafactory）——一律匿名类
4. 插件 package.json exports 必须含 `"."` `"./client"` `"./package.json"`（否则客户端模块静默不加载）
5. 插件 id 全树唯一（`mobile-` 前缀）；行内注释中文
6. client.js 改完**刷新页面即生效**；index.js/壳改动需重启 dsh / 重编译装 APK
7. 能放插件的绝不进壳；壳保持薄（WebView + 通知接收 + 安全区三件事）
8. 所有 DOM 改动函数幂等（dataset 标记防重复），React 重建后由 1.2s applyLayout 循环自愈

## 架构（三层）

```
L1 文本层: README / scripts/*.sh / cordis.patch.yml / termux.properties
L2 插件层: plugins/mobile-ui (client.js 页面注入 + index.js host 路由/工具)
           plugins/mobile-AndroidNotify (index.js 通知状态机 + client.js)
L3 壳层:   app/src/main/java/com/dsh/mobile/ (MainActivity + NotifyReceiver)
```

数据流：dsh 事件 → 插件 index.js → `am broadcast`(payload base64) → NotifyReceiver → 系统通知。

## 完整功能清单（现状快照 v0.30）

### 壳（MainActivity）
- WebView 加载 127.0.0.1:3080；`LOAD_NO_CACHE`+`clearCache`（每次拿最新前端）
- edge-to-edge：`setOnApplyWindowInsetsListener` 容器 padding = 系统栏 insets + 用户偏移（`edge/top/bottom`，SharedPreferences `dsh_shell` 持久化）；**IME 键盘 insets 取 max(bars, ime) 并入底部**（键盘弹出 composer 被顶起，无空隙）
- 离线状态机：连接失败 15s 宽限（offlineCheck）→ 离线页（`OFFLINE_HTML` 内嵌 Java 字符串）→ 3s 探测（retryProbe，`manualOffline` 时跳过）；手动进入离线页走 JS 桥 `showOfflinePage`
- 离线页布局：鲸鱼图标 → DSH 未启动 → IP输入框（空=本地默认，纯IP自动补:3080）→ 远程连接历史 chips（上限5，点击直连）→ `GitHub 仓库`/`下载 Termux（F-Droid）`/`一键启动`（启动按钮在下载右侧）→ 安装两行（Termux / Termux-Ubuntu，各配 一键安装 + 复制指令）
- JS 桥（window.AndroidShell）完整清单：connect / openUrl / openTermuxDownload(F-Droid API 查最新版直链) / copyInstallCommand(白名单) / launchTermuxInstall(script) / launchTermuxStart / getRemoteHistory / addRemoteHistory / setEdgeToEdge / getEdgeToEdge / setBackgroundColor / showOfflinePage / copyInstallScript
- **Termux 拉起（RUN_COMMAND）**：0.118+ 是 `RunCommandService`（startService 不是 startActivity）；需 Manifest 声明 `com.termux.permission.RUN_COMMAND` + 运行时请求；`~/.termux/termux.properties` 写 `allow-external-apps=true`（脚本已自动做 + termux-reload-settings）；标准包名解析失败 → action 自动匹配兜底
- 通知渠道（NotifyReceiver）：`dsh_notify_v2`（HIGH 有声）/ `dsh_notify_silent`（HIGH 静音）/ `dsh_status`（LOW 常驻）；payload 支持 channel 字段；渠道创建后属性不可改（静音靠预建渠道切换，不删除重建）

### 通知插件（mobile-AndroidNotify）
- **通知状态机**：开始运行→静默常驻（ongoing 不可滑关，LOW 渠道）；手动暂停（finish reason=aborted）→注销常驻无横幅；正常完成（stop）→注销+完成横幅；截断（max-tokens）→注销+"截断"横幅；故障（agent/error）→注销+故障横幅（错误码原文）；插件卸载→全量注销（防残留）；点按任意通知→跳对应会话（url=sessionUrl(sid)）
- **一会话一通知**：常驻 id = `ONGOING_BASE(1000)+hash(sid)%900000`；结果横幅 id = `NOTIFY_BASE(2000000)+hash(sid)`（同会话新横幅覆盖旧横幅）
- 事件映射：agent/status(running→postOngoing；idle→注销+按标记发横幅)、session/event(finish 的 reason.kind 打标记：aborted→paused、max-tokens→truncated)、tools/result(记 lastTool/todo 刷新常驻)、agent/error、agent/disposed
- 开关（state.json `{progressSummary, sound}`）：强化开关（LLM 摘要 ≤15字，默认关）+ 声音开关（默认开→广播自动注入渠道）
- notify 工具：description 即调用指南（何时用/参数/注意）
- 宽容性：`am broadcast` 直发优先，su 兜底

### UI 插件（mobile-ui）
- applyLayout 循环**无条件建立**（`setInterval(applyLayout, 1200)` + MutationObserver rAF 节流），不依赖 slots/body 时机（历史教训：依赖前置会导致重启后布局失效）
- DOM 锚点：frame=`[data-side="sidebar"/"details"]` 的 parentElement；会话根=`[data-conversation-scroll]` 的 parentElement；**header 在 scroll 前一个兄弟（slot 出口会包一层 div）内**；选项卡=`[role="tablist"]`；输入区=`[data-composer-seat]`；设置=`[data-slot="settings.section"]`
- 侧栏抽屉：展开 sidebarCol absolute 覆盖（grid 首列 0px）；收起=透明 `<button>` 遮罩（z35）点击→官方 `ctx.get('layout').toggleSidebar()`（inject 声明 layout）
- 移动设置（MobileSection，React，注册 settings.section id=mobile order=25）：连接地址+进入离线页 / 通知强化+声音开关 / 全面屏优化（开关+上下偏移滑杆）/ 重启 dsh（确认遮罩→10s 重连）/ 安全模式（纯净模式+原版UI）
- 纯净/原版模式：`?plain=1` 或 `dsh.pure=1` → 跳过全部注入

### 安装脚本（scripts/）
- `dsh-install-termux.sh`：Termux 原生（pkg 初始化→工具链→npm i --ignore-scripts→node-pty/koffi clang 编译（bionic 补 spawn.h）→sharp wasm→SELinux 检测→dsh wrapper(--expose-internals)→dsh-web 启动器→allow-external-apps→插件）
- `dsh-install-linux.sh`：proot Ubuntu（默认，无 Debian 选项）→ npm 原装 → wrapper → dsh-web → 插件
- `dsh-addone-mobile.sh` / `.mjs`：已有 dsh 追加插件（bash 版 + Node 跨平台版，Windows 用 curl.exe）
- 所有脚本幂等（grep -q 防重复），步骤编号 `X/N` 同步更新

## 关键教训（踩过的坑）

1. dsh client bundle **实时读文件**（改 client.js 不用重启服务器，刷新即生效）；host 插件是进程加载（要重启）
2. 页面重启后不自动重载旧 JS（曾加 rev 看门狗/自愈刷新，已撤——保持简单）
3. `getComputedStyle` 匹配条件会被自己的改动破坏（样式改后不再匹配）→ 用 dataset 标记进入"已处理"状态
4. slot 出口会包一层无 class 的 div（header 不在 root.children 直接子级）
5. 通知渠道创建后不可改属性（声音/震动）；RUN_COMMAND 是 Service 不是 Activity
6. 远程连接历史、全面屏偏移存 SharedPreferences `dsh_shell`；插件开关存 state.json
7. /sdcard 的 FUSE 不支持硬链接（write 工具会失败，用 bash 写文件）；git 需 safe.directory

## 开发流程

1. 读 AGENT.md + docs/ 相关主题 + PROMPT.md 本文件
2. 改完：`node --check`（js）/ `bash build.sh`（壳，proot Debian 内）
3. client 改动刷新验证；host 改动重启 dsh；壳改动安装 APK
4. 同步开发目录 ↔ 仓库（app/src、plugins、scripts）
5. 文档同步（AGENT.md / docs / README / PROMPT.md）

## 发布流程

1. bump `AndroidManifest.xml` versionCode/versionName
2. `git tag v<版本> && git push origin v<版本>`
3. Release 传**双资产**：`DSH-v<版本>.apk` + 固定名 `dsh-mobile.apk`（离线页"最新版"依赖 `releases/latest/download/dsh-mobile.apk`）
4. README 版本历史更新

## 待办

- 顶部元素修改：会话头部整理（去 Session log / agent 预设+后台任务按钮移"对话/轨迹"行）
- 底部元素修改：状态行（x轮x步）两行化/去空格/左对齐
- 主题/换肤：社区做（docs/customize.md §7 有路线图，本项目不做）
