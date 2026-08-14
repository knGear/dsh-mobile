# dsh-mobile

DeepSeek Harness **dsh web** 的 Android 移动前端：WebView 壳 APK + 本地 Cordis 插件，把 dsh 变成手机上的 App 体验。

dsh（DeepSeek Harness）是 DeepSeek 官方的 AI 编码/任务框架。本项目**不 fork 上游**：所有移动端改动通过壳注入与本地插件实现，上游升级不冲突。

> **与 DeepSeek 官方无关**：本项目是独立开源项目，非 DeepSeek 出品、未经其认可或赞助；"DeepSeek" 及相关商标归其各自所有者所有。

## 特性

**壳（APK）**
- 深色一体化：状态栏/手势条与页面同色，edge-to-edge 全面屏
- 原生 insets 安全区：内容自动避开状态栏/挖孔/手势条，上下偏移可调（-10~10 dp）
- 离线自动重试 + 内置离线页（IP:端口 远程连接 + 复制一键安装脚本）

**通知（本地插件）**
- 会话进行中/完成/提问/故障状态推送，标题 = 会话标题-状态
- 正文 = 运行时间 + 待办；可开启「通知内容强化」（AI 生成动作摘要，增加 token 消耗）
- 错误码原文展示

**移动 UI（本地插件）**
- 对话栏竖屏适配、agent 预设卡片自适应
- 移动端设置选项卡：连接地址 / 通知强化 / 全面屏优化（开关+偏移）/ 重启 dsh / 安全模式
- 纯净模式：一键禁用全部移动端改动，回到原版 UI

## 安装

### 1. Termux

从 [F-Droid](https://f-droid.org/packages/com.termux/) 安装 Termux（不要用 Play 商店版），打开后先执行：

```bash
pkg update && pkg upgrade -y
```

### 2. 后端：在 Termux 里安装 dsh 原版（二选一）

**快速上手（推荐完整流程）**：安装 Termux → 运行方式二脚本（自动装好 dsh + 两个移动端插件）→ 安装 APK → 首次打开自动申请通知授权 → 完成。

**方式一：Termux 内的 Linux 直接安装**（proot Debian 等标准 Linux 环境，npm 原样安装，无需任何修补）

```bash
# 前置: 装一个 Linux 发行版(Termux 内)
pkg install proot-distro
proot-distro install debian
proot-distro login debian
# 以下在 Linux 内执行
apt update && apt install -y nodejs npm
npm i -g @deepseek-ai/dsh
dsh web        # 启动, 终端会弹出网址信息(默认 http://127.0.0.1:3080)
```

**方式二：一键脚本（推荐，自动完成方式一全部步骤）**

```bash
# 在 Termux 内执行
pkg install -y curl
curl -L -o install-dsh.sh https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/install-dsh.sh
bash install-dsh.sh
```

脚本自动完成：装 proot-distro + Debian → 装 nodejs/npm → `npm i -g @deepseek-ai/dsh` → 校验原生模块
（koffi/node-pty/sharp）→ SELinux hardlink 检测（有 root 自动修复，无 root 给出指引与规避方案）→
生成 `dsh-web` 启动命令并探测验证 → **自动安装两个移动端插件并挂载**。首次约 10~20 分钟。

**方式三：独立插件安装（dsh 已用别的方式装好时）**

PC / 服务器 / Termux 等任意已装好 dsh 的环境，只需补装两个移动端插件：

```bash
curl -L -o install-plugins.sh https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/install-plugins.sh
bash install-plugins.sh    # 重复运行 = 更新到最新版
```

然后安装 APK，连接本机或远程（离线页输入 `IP:端口`）即可获得增强体验。

### 3. 前端：安装 APK

GitHub [Releases](https://github.com/knGear/dsh-mobile/releases) 下载 `DSH-v0.01.apk`（Android 8.0+，允许未知来源）。
打开即连本机 `127.0.0.1:3080`；首次启动会自动申请通知授权（Android 13+，会话状态/完成提醒需要）；局域网其他设备可在离线页输入 `IP:端口` 远程连接。

## 从源码构建

```bash
# 环境: proot Debian(Trixie) + aapt/javac/d8/zipalign/apksigner
git clone git@github.com:knGear/dsh-mobile.git
cd dsh-mobile && bash build.sh
# 产物: out/DSH-v<版本>.apk
```

> ⚠ 老 d8 不支持 lambda（`Unable to find method metafactory`）——Java 代码一律用匿名类。

## 项目结构

```
app/                      # Android 壳 (com.dsh.mobile, minSdk 26 / target 34)
  src/main/java/          #   MainActivity(安全区/离线重试/JS桥) + NotifyReceiver(通知)
  src/main/res/           #   图标/主题/一键安装脚本
build.sh                  # 构建脚本(proot Debian 混合构建)
release.keystore          # 发布签名(alias dshmobile, 密码随仓库公开——FOSS 实践)
icon-master.svg           # 图标源
plugins/
  cordis.patch.yml        # 插件挂载示例
  mobile-ui/              # 移动 UI 插件(设置/重启)
  mobile-AndroidNotify/   # 通知插件(状态推送/内容强化)
```

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
- 布局锚点只用 dsh 稳定语义属性（`data-*` / `role=`），不依赖 hash 类名，上游升级不碎
- **无 root 可用**：安装/通知/远程连接均不依赖 root（仅旧版设备的 SELinux 补丁为可选步骤，失败自动跳过）

## 版本历史

- **v0.01** — 首个公开版

## License

MIT © knGear
