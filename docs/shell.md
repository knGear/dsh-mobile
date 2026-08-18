# 壳层开发指南（app/）

Java（MainActivity + NotifyReceiver），改动需重编译装 APK（`docs/build-release.md`）。

## MainActivity 职责（单一）

1. **WebView**：加载 `127.0.0.1:3080`；`LOAD_NO_CACHE` + `clearCache`（保证每次拿最新前端）
2. **edge-to-edge**：`setOnApplyWindowInsetsListener` 容器 padding（系统栏 insets + 用户偏移 `edge/top/bottom`），`applyDecorFits()` 切换
3. **离线状态机**：`offlineCheck`（15s 宽限）→ `showOffline()` → `retryProbe`（3s，`manualOffline` 时跳过）
4. **JS 桥**（`window.AndroidShell`）：完整清单 ↓
5. **离线页 HTML**：`OFFLINE_HTML` 常量（Java 字符串内嵌；结构：图标/标题/输入框/历史chips/链接/启动+安装区/内联 JS）

## JS 桥完整清单

| 方法 | 用途 | 备注 |
|---|---|---|
| `connect(host)` | 连接（空=本机；自动记远程历史） | 校验 `IP:端口` |
| `openUrl(url)` | 打开外链 | 仅放行 https |
| `openTermuxDownload()` | F-Droid API 查最新 Termux → 浏览器直下 | 兜底商店页 |
| `copyInstallCommand(script)` | 复制 curl 安装指令 | 白名单两脚本 |
| `launchTermuxInstall(script)` | 拉起 Termux 执行安装脚本 | RUN_COMMAND |
| `launchTermuxStart()` | 拉起 Termux 执行 dsh-web | RUN_COMMAND |
| `getRemoteHistory()` / `addRemoteHistory(host)` | 连接历史（上限5） | SharedPreferences `dsh_shell` |
| `setEdgeToEdge(json)` / `getEdgeToEdge()` | 全面屏开关+偏移 | |
| `setBackgroundColor(hex)` | 状态栏/容器同色 | web 上报 |
| `showOfflinePage()` | 手动进离线页 | 置 `manualOffline` |
| `copyInstallScript()` | 复制 raw 安装脚本 | 旧，新 UI 不用 |

## Termux 拉起（RUN_COMMAND）——最容易踩的坑

Termux 0.118+ **不是 Activity 而是 Service**：

```java
Intent i = new Intent("com.termux.RUN_COMMAND");
i.setClassName("com.termux", "com.termux.app.RunCommandService"); // Service！
i.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", new String[]{...}); // String[]
i.putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home");
startService(i); // 不是 startActivity！
```

前置条件（三选全）：
1. Manifest 声明 `com.termux.permission.RUN_COMMAND` + 运行时请求（`ensureTermuxRunCommandPermission`）
2. `~/.termux/termux.properties` 里 `allow-external-apps=true`（**安装脚本已自动写** + `termux-reload-settings`）
3. Termux 首次会弹授权窗

统一入口：`termuxRunCommand(String[] args)`（标准包名解析失败 → action 自动匹配兜底）。

## NotifyReceiver

- 解析 payload（base64 JSON）→ 建通知；`cancel` 分支注销
- 渠道：`ensureChannel()` 创建（见 architecture.md 渠道表）
- 点击跳转：PendingIntent → MainActivity + `url` extra
- ⚠ 不要删 `dsh_notify` 孤儿渠道逻辑（importance 已锁死无法复用）

## 改壳后的验证

```bash
bash build.sh          # proot Debian 内（见 build-release.md）
# 产物 out/DSHM-v<版本>.apk
```
