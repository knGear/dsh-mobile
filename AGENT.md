# dsh-mobile 交接文档 (2026-08-15 快照, 已接手同步)

> 本文件由旧会话交接生成, 新会话先读本文件再动手。
> 2026-08-15 新会话已接手: 全量同步 live → repo 并推送 (commit c5f20d2)。

## 项目三件套
1. **APK 壳** `/sdcard/1tui/apk/dsh/` (com.dshm, 当前版本 0.37)
2. **插件** 实际运行在 `~/.dsh/profiles/node_modules/{mobile-ui,mobile-AndroidNotify}/` (Termux 原生部署, dsh web 从磁盘实时加载 client.js, 改完刷新页面即生效; host 侧 index.js 需重启 dsh)
3. **GitHub repo** `/sdcard/1tui/dsh-mobile/` (镜像, 改动后手动同步推送; SSH 已配好, 推 main 分支)

## 当前页面模型(用户刚定稿)
- **引导页**(壳内离线/初始合一页面, 用户曾叫"初始页/离线页", 现统一叫**引导页**)
  - 触发: 连接失败/无缓存/手动入口(设置-移动端 → debug → 进入初始页, 壳 showOfflinePage('init'))
  - 两种视角: `showOfflinePage()` 无参=正常引导页(标题按心跳/配置显示运行状态); `showOfflinePage('init')`=初始页预览(标题"初来乍到?", 强制初次视角)
- 标题三态: 初来乍到?(init) / 本机 dsh 未运行 / 已运行于 Termux(-Linux)
- 布局(自上而下): 标题 → 下载(Termux)并部署(按钮在第二行缩进) → 已安装?运行(dsh-web)即可连接 → 输入框+连接 → 历史chips(本机只显端口) → 遇到困难?四档 → 双仓库 → [开启通知]获取增强体验(可选)✓(移到底部, 授权后灰+✓) → 底部代码块(点击复制 allow-external-apps 命令)
- 青色按钮(可长按执行): Termux(性能)/Termux-Ubuntu(兼容)/四档修复; 点击=复制+"已复制 ✓"就地反馈1.2s, 长按700ms=拉起Termux执行
- 链接按钮(蓝+下划线): Termux下载/双仓库
- 实心按钮(纯点击): 连接/开启通知/dsh-web青色边框

## 核心机制(已实现)
- **心跳**: mobile-AndroidNotify/index.js 每15s broadcast {heartbeat:true, instance}; NotifyReceiver 静态字段 lastHeartbeat/heartbeatInstance; 壳离线页渲染读心跳判断运行状态
- **实例配置**: 安装脚本写 /data/data/com.termux/files/usr/etc/dsh-instance.conf (instance=termux 或 termux-linux[:distro]); 壳读一次缓存 SharedPreferences
- **重启**: mobile-ui/index.js /api/dsh-restart spawn bash dsh-web-restart(孤儿进程); dsh-web-restart 由安装脚本生成(termux/linux 各有)
- **通知**: 渠道 dsh_notify_v2(有声)/dsh_notify_silent(静音)/dsh_status(常驻); payload base64 JSON 经 am broadcast 到 NotifyReceiver
- **安装脚本**: dsh-install-termux.sh(原生, 编译坑多) / dsh-install-linux.sh(proot, 省心); 都会装插件+挂载 cordis.patch.yml

## 已知问题/待办
1. ~~repo 落后~~ ✅ 2026-08-15 已全量同步并推送 (c5f20d2), raw 脚本全部 HTTP 200
2. ~~dsh-repair.sh / dsh-reinstall.sh 未推~~ ✅ 已推送, 四档一键执行可用
3. **浏览器纯净模式**: 插件 client.js ?plain=1 跳过注入
4. **更新检查**: 用户提过"内置检查更新(检查 dsh 和 mobile 两个)", 未实现, 优先级低
5. **proot 双实例/发行版**: 标题只显示 Termux-Linux(保守), 不做精确发行版(隐私考虑, 用户拍板)
6. **APK 内置 install_backend.sh 是旧版**: MainActivity.copyInstallScript() 复制的仍是 6 步旧脚本, 落后于 scripts/dsh-install-termux.sh (9 步新版); 下次构建 APK 时应替换
7. **脚本世代差异**: 新版 dsh-install-termux.sh 带 dsh-web-restart + instance.conf, 旧脚本无; 老设备升级路径未做

## 构建命令(proot debian)
```bash
proot-distro login debian -- bash -c '
SRC=/sdcard/1tui/apk/dsh/apk/src/main; BUILD=/root/dsh-build
SDK=/root/android-sdk; JAR=$SDK/platforms/android-34/android.jar
D8=$SDK/cmdline-tools/cmdline-tools/bin/d8
KS=/sdcard/1tui/apk/dsh/release.keystore
OUT=/sdcard/1tui/apk/dsh/out
rm -rf $BUILD; mkdir -p $BUILD/gen $BUILD/classes $OUT; cd $BUILD
/root/aapt package -f -M $SRC/AndroidManifest.xml -S $SRC/res -J gen -I $JAR -F base.unsigned.apk
javac -source 1.8 -target 1.8 -bootclasspath $JAR -d classes gen/R.java $(find $SRC/java -name "*.java") 2>/dev/null
$D8 --lib $JAR --min-api 26 --output . classes/com/dshm/*.class
zip -j base.unsigned.apk classes.dex
zipalign -f 4 base.unsigned.apk base.aligned.apk
apksigner sign --ks $KS --ks-pass pass:dshmobile123 --ks-key-alias dshmobile --out $OUT/DSHM-v0.37.apk base.aligned.apk'
# 安装: su -c "cp .../DSHM-v0.37.apk /data/local/tmp/dsh37.apk && chmod 644 ... && pm install -r /data/local/tmp/dsh37.apk"
```

## 版本历史
- v0.37: 引导页重构(初来乍到?标题/七行布局/通知行移底/代码块复制/青色按钮就地反馈/dsh-web青色/心跳机制)
- v0.36: 离线页按钮样式迭代(空心/实心/描边反复调整, 最终实心字无描边)
- v0.35: 离线页四档自救阶梯+历史chips+句内按钮

## 插件文件清单
- mobile-ui: client.js(UI/布局/重启按钮/活动任务管理器/横幅) index.js(重启API/原版webui/restart工具)
- mobile-AndroidNotify: index.js(通知/心跳/会话状态API) client.js(?session=跳转)
- 修改 client.js 只需刷新浏览器; 修改 index.js 需重启 dsh (bash dsh-web-restart)
