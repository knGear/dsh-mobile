# dsh-mobile

DeepSeek Harness **dsh web** 的 Android 移动前端：WebView 壳 APK + 本地 Cordis 插件。

> 目标：**不 fork 上游 dsh**。所有移动端 UI 改动走壳注入 + 本地插件（`~/.dsh/profiles/node_modules/`），
> 上游升级不冲突；插件只依赖 dsh 的稳定语义锚点（`data-*` / `role=`），不依赖 hash 类名。

## 结构

```
app/                  # Android 壳(com.dsh.mobile, minSdk 26 / target 34)
  src/main/java/      #   MainActivity(edge-to-edge 安全区/离线重试/JS 桥) + NotifyReceiver(通知)
  src/main/res/       #   图标/样式/一键安装脚本 install_backend.sh
build.sh              # 构建脚本(proot Debian: aapt + javac + d8 + apksigner)
release.keystore      # 发布签名(alias dshmobile / 密码 dshmobile123, FOSS 实践随仓库公开)
icon-master.svg       # 应用图标源
plugins/
  cordis.patch.yml    # 插件挂载示例(插入 ~/.dsh/profiles/web/cordis.patch.yml)
  mobile-ui/          # 移动端 UI: 侧栏抽屉/透明遮罩收起/安全区设置/移动端选项卡/重启
  mobile-AndroidNotify/ # Android 通知: 会话进度/完成/提问/故障推送
```

## 构建 APK

```bash
# 在 proot Debian(Trixie)内, 已装 aapt/javac/d8/zipalign/apksigner
cd /path/to/dsh-mobile && bash build.sh
# 产物: out/DSH-v<versionName>.apk
```

> ⚠ 老 d8 不支持 lambda(metafactory), Java 代码一律用匿名类。

## 后端一键安装

壳内置「复制安装脚本」(离线页) 或直接执行 `app/src/main/res/raw/install_backend.sh`：
在 Termux 里运行, 自动安装并启动 dsh web(含 Termux 原生 6 步修补 + 目录选择器 /sdcard 修补)。

## 插件挂载

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml 插入
- insert:
    - id: mobile-notify
      name: 'mobile-AndroidNotify'
    - id: mobile-ui
      name: 'mobile-ui'
```

插件目录放 `~/.dsh/profiles/node_modules/`。⚠ 带 client 的包 `exports` 必须含
`"."` 与 `"./package.json"`；id 全树唯一, 用 `mobile-` 前缀避免撞上游。

## 功能一览

- **壳**: 深色一体化状态栏 + 原生 insets 安全区(容器 padding, 可调上下偏移) + 离线自动重试 + 远程连接(IP:端口)
- **通知**: 会话标题-状态, 正文=运行时间+待办/AI 摘要(可关); 完成/提问/故障横幅; 错误码原文
- **移动 UI**: 侧栏抽屉(展开覆盖对话不压缩) + 透明按钮遮罩点击收起 + 设置面板竖屏适配 + 纯净模式/原版 UI 逃生口

## 版本

- v0.01: 首个公开版(自 0.17 本地迭代重编号; 安装需先卸载旧版, versionCode 从 1 重新计数)
