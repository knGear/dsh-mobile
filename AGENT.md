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
