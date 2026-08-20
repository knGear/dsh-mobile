# dsh-mobile

**非侵入 · 轻量 · 灵活**的移动适配 —— DeepSeek Harness（dsh web）的 Android 移动前端。

dsh 是 DeepSeek 官方的 AI 编码/任务框架，Web UI 运行在 `http://127.0.0.1:3080`。
本项目**零 fork**：不修改 dsh 本体，通过**薄壳 + 本地插件**为它适配移动端体验，
上游升级零冲突。**灵活**：插件实时加载——改 UI 刷新即所见即所得、改逻辑重启即生效，
随时二次开发，绝大部分改动无需重新编译 APK。

> **与 DeepSeek 官方无关**：本项目是独立开源项目，非 DeepSeek 出品、未经其认可或赞助；
> "DeepSeek" 及相关商标归其各自所有者所有。

## 核心设计

| 原则 | 做法 | 收益 |
|---|---|---|
| **非侵入** | 不 fork、不改上游；只依赖稳定语义锚点（`data-*` / `role=` / 事件名 / 官方接口） | 上游升级零冲突，永久可跟进 |
| **轻量** | 薄壳只管平台能力（WebView / 通知 / 安全区），UI 全在本地插件 | 改 UI 不重建 APK，插件即插即用 |
| **适配** | 移动端体验层：全面屏安全区 / 侧栏抽屉 / 通知状态机 / 移动设置 | 手机成为 dsh 的一等客户端 |
| **灵活** | 插件实时加载：client 改动刷新即见、host 改动重启即生效；仅壳层需重编译 | 随时二次开发，所见即所得 |

## 界面预览

| 对话 | 移动设置 | 排版优化 |
| --- | --- | --- |
| ![自我介绍](docs/screenshots/自我介绍.png) | ![移动设置](docs/screenshots/移动设置.png) | ![排版优化](docs/screenshots/排版优化.png) |

## 特性

**壳（APK）**
- 深色一体化：状态栏/手势条与页面同色，edge-to-edge 全面屏
- 原生 insets 安全区：内容自动避开状态栏/挖孔/手势条/输入法键盘，上下偏移可调
- 离线自动重试 + 内置离线页（远程连接 / 连接历史 / Termux 直链 / 一键启动 / 一键安装）
- 界面语言自动跟随系统（中/英）

**通知（本地插件）**
- 会话运行常驻通知（不可滑关）+ 完成/提问/截断/故障横幅，一会话一通知
- 手动暂停静默退出；点按通知跳转对应会话；重启无残留
- 声音/震动开关、AI 动作摘要（可选，额外消耗）

**移动 UI（本地插件）**
- 对话栏移动端适配（竖屏不溢出、统计条自适应转行、头部紧凑排布）
- 活动计数按钮（运行中/已完成未读，面板展开跳转）
- 移动端设置：连接地址 / 通知 / 全面屏 / 重启 / 安全模式（一键回原版）

## 安装

### ① termux 直装（推荐）

1. 安装 [Termux](https://f-droid.org/packages/com.termux/)（F-Droid 版，不要用 Play 商店版）
2. Termux 里执行（脚本自动：初始化 pkg → 工具链 → 装 dsh → 原生依赖修补 → SELinux 检测 → 插件挂载）：

```bash
pkg install -y curl
curl -L -o dsh-install-termux.sh https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-install-termux.sh
bash dsh-install-termux.sh
```

3. 安装 APK：点击 [Releases](https://github.com/knGear/dsh-mobile/releases) 下载最新版即可
4. 配置 API → 享用

### ② termux-ubuntu（稳定）

1. 安装 [Termux](https://f-droid.org/packages/com.termux/)（F-Droid 版）
2. Termux 里执行（脚本自动：初始化 → 安装 Ubuntu → 装 dsh → 插件挂载）：

```bash
pkg install -y curl
curl -L -o dsh-install-linux.sh https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-install-linux.sh
bash dsh-install-linux.sh
```

3. 安装 APK：点击 [Releases](https://github.com/knGear/dsh-mobile/releases) 下载最新版即可
4. 配置 API → 享用

### ③ addone-mobile（已有 dsh 追加）

适用于 PC / 服务器 / Termux 等任意环境。若尚未安装 dsh，先用官方命令安装：

**官方安装 dsh：**

```bash
npm i -g @deepseek-ai/dsh
dsh web
```

> ⚠ npm 直装的 dsh 直接跑 `dsh web` 可能加载不到本地插件（bin.js 缺 `--expose-internals`）。
> 两个安装脚本会自动生成 dsh wrapper 解决；手动环境可让 AI 按仓库脚本处理。

然后安装移动端插件，按你的平台选一个（任选其一，重复运行 = 更新到最新版）：

**bash 版（Linux / macOS / Termux）：**

```bash
curl -L -o dsh-addone-mobile.sh https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-addone-mobile.sh
bash dsh-addone-mobile.sh
```

**Node 跨平台版（Windows 等任意平台，需 Node 18+）：**

```powershell
curl.exe -L -o dsh-addone-mobile.mjs https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-addone-mobile.mjs
node dsh-addone-mobile.mjs
```

或者，复制下面的仓库链接直接贴给 AI，让它帮你完成安装配置：

```text
https://github.com/knGear/dsh-mobile
```

最后安装 APK：点击 [Releases](https://github.com/knGear/dsh-mobile/releases) 下载最新版即可，连接本机（默认 `127.0.0.1:3080`）或远程（离线页输入 `IP:端口`），配置 API → 享用。

## 从源码构建

```bash
# 环境: proot Debian(Trixie) + aapt/javac/d8/zipalign/apksigner
git clone git@github.com:knGear/dsh-mobile.git
cd dsh-mobile && bash build.sh
# 产物: out/DSHM-v<版本>.apk
```

> ⚠ 老 d8 不支持 lambda（`Unable to find method metafactory`）——Java 代码一律用匿名类。

## 项目结构

```
apk/                      # Android 壳 (com.dshm, minSdk 26 / target 34)
  src/main/java/          #   MainActivity(冷启动/连接/JS桥) + GuideActivity + ShellBridge 等
  src/main/assets/        #   first.html(引导页: 初始化/离线/设置统一)
  src/main/res/           #   图标/主题/多语言 strings
build.sh                  # 构建脚本(proot Debian 混合构建)
release.keystore          # 发布签名(alias dshmobile, 密码随仓库公开——FOSS 实践)
icon-master.svg           # 图标源
plugins/
  cordis.patch.yml        # 插件挂载示例
  dsh-mobile-ui/                # 移动 UI 插件(UA门控/移动设置/目录选择器/界面适配)
  # dsh-agenttask 有独立仓库 1.0, 不在此管理
task.md                   # task 相关处理记录(重启包装脚本等)
START.md                  # 移动端体验需求规格(跑分题原文)
scripts/
  dsh-install-termux.sh   # Termux 原生一键安装(含插件)
  dsh-install-linux.sh    # Termux 内 Ubuntu 一键安装(含插件)
  dsh-addone-mobile.sh    # 已有 dsh 追加插件(bash 版)
  dsh-addone-mobile.mjs   # 已有 dsh 追加插件(Node 跨平台版)
PROMPT.md                 # 项目总提示词(需求规格, 可作跑分题)
AGENT.md                  # AI 开发地图(铁律/修改路径/待办)
docs/                     # 架构/壳/双插件/自定义/构建发布指南
```

## 文档体系（AI 与维护者）

- `PROMPT.md` —— 需求规格（跑分题：功能/约束/验收，无实现线索）
- `AGENT.md` —— 开发地图（铁律/修改路径/待办/教训）
- `docs/` —— 架构总览、壳指南、双插件指南、自定义速查、构建发布

## 插件挂载

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: mobile-notify
      name: 'mobile-AndroidNotify'
    - id: mobile-ui
      name: 'mobile-ui'
```

⚠ 带 client 的包 `exports` 必须包含 `"."` 与 `"./package.json"`；插件 id 全树唯一，用 `mobile-` 前缀避免与上游撞名。

## 兼容性

- dsh：`@deepseek-ai/dsh@0.1.0-rc.6`（npm）
- Android：minSdk 26 / target 34（Android 8.0+）
- 界面语言：自动跟随系统（中/英，与官方一致，无切换按钮）
- **无 root 可用**：安装/通知/远程连接均不依赖 root（仅旧版设备的 SELinux 补丁为可选步骤，失败自动跳过）

## 版本历史

- **v0.01** — 首个公开版（本地 0.17 迭代重编号）

## Credits

本程序使用 **DeepSeek Pro / DeepSeek Flash** 进行构建（DeepSeek Harness agent 辅助开发）。

## License

MIT © knGear
