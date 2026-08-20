#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# dsh (DeepSeek Harness) Termux 原生一键安装 — Android shell 直接运行
# 适用: Android (Termux) 设备, 与 pi 同层权限 (可 bash 执行/读写文件)
# 用法: bash install-dsh-native.sh
# 注意: koffi 需 clang 现场编译, 全程约 10~30 分钟, 请勿中断
# ============================================================

set -euo pipefail

P='[dsh原生]'

# ---------- 0. 环境检查 ----------
if [ -z "${PREFIX:-}" ] || [ ! -d "$PREFIX" ]; then
  echo "$P 错误: 请在 Termux 环境中运行 (缺少 \$PREFIX)"
  exit 1
fi

echo "$P 0/9 初始化 pkg (update/upgrade) + 安装工具链 (cmake/make/clang/curl)..."
pkg update -y >/dev/null 2>&1 || pkg update -y
pkg upgrade -y >/dev/null 2>&1 || pkg upgrade -y
pkg install -y cmake make clang curl >/dev/null 2>&1 || pkg install -y cmake make clang curl

# 允许外部应用执行命令(RUN_COMMAND 拉起需要; termux.properties 用户可写, 无需 root)
mkdir -p "$HOME/.termux"
PROP="$HOME/.termux/termux.properties"
if [ -f "$PROP" ] && grep -q '^allow-external-apps' "$PROP"; then
  sed -i 's/^allow-external-apps=.*/allow-external-apps=true/' "$PROP"
else
  echo 'allow-external-apps=true' >> "$PROP"
fi
if command -v termux-reload-settings >/dev/null 2>&1; then
  termux-reload-settings 2>/dev/null || true
  echo "$P   已开启 allow-external-apps (立即生效)"
else
  echo "$P   已开启 allow-external-apps (重启 Termux 后生效)"
fi

# ---------- 1. 安装 dsh (跳过 install 脚本, 避免 node-pty gyp 崩溃) ----------
echo "$P 1/9 安装 @deepseek-ai/dsh (--ignore-scripts)..."
npm i -g @deepseek-ai/dsh --ignore-scripts

P=$PREFIX/lib/node_modules/@deepseek-ai/dsh/node_modules

# ---------- 2. node-pty: 手动 clang++ 编译 (Termux 无 NDK, node-gyp 必崩) ----------
echo "$P 2/9 编译 node-pty (clang++)..."
NAPI_VER=7.1.1
if [ ! -f ~/.cache/napi/package/package.json ]; then
  echo "    下载 node-addon-api 头文件 v$NAPI_VER ..."
  mkdir -p ~/.cache
  curl -sL -o ~/.cache/napi.tgz "https://registry.npmjs.org/node-addon-api/-/node-addon-api-$NAPI_VER.tgz"
  mkdir -p ~/.cache/napi && tar xzf ~/.cache/napi.tgz -C ~/.cache/napi
fi
cd "$P/node-pty"
mkdir -p prebuilds/android-arm64
clang++ -std=c++17 -fPIC -shared -O2 \
  -I"$PREFIX/include/node" \
  -I"$HOME/.cache/napi/package" \
  src/unix/pty.cc -lutil -o prebuilds/android-arm64/pty.node
echo "    pty.node: $(ls -la prebuilds/android-arm64/pty.node | awk '{print $5}') bytes"

# ---------- 3. spawn.h (Termux bionic 缺头文件) + koffi 编译 ----------
echo "$P 3/9 修补 spawn.h + 编译 koffi (最耗时, 请耐心)..."
if [ ! -f "$PREFIX/include/spawn.h" ]; then
  echo "    拉取 AOSP spawn.h ..."
  curl -sL -o "$PREFIX/include/spawn.h" \
    https://raw.githubusercontent.com/aosp-mirror/platform_bionic/master/libc/include/spawn.h
  sed -i 's/#if __BIONIC_AVAILABILITY_GUARD(28)/#if 1/; s/#if __BIONIC_AVAILABILITY_GUARD(34)/#if 1/; s/ __INTRODUCED_IN(28)//g; s/ __INTRODUCED_IN(34)//g' \
    "$PREFIX/include/spawn.h"
fi
cd "$P/koffi"
node ./cnoke.cjs -P . -D src/koffi --prebuild --release
KOFI_OUT=$(find build -name "koffi.node" | head -1)
echo "    koffi.node: ${KOFI_OUT:-未找到!}"

# ---------- 4. sharp: wasm 版 (无 android 二进制) ----------
echo "$P 4/9 安装 sharp-wasm32 ..."
cd "$PREFIX/lib/node_modules/@deepseek-ai/dsh"
npm i @img/sharp-wasm32 --no-save --ignore-scripts >/dev/null 2>&1

# ---------- 5. SELinux hardlink 修复 (Android 16 的坑, 会话存储依赖 link) ----------
echo "$P 5/9 检测 SELinux hardlink 限制..."
if command -v su >/dev/null 2>&1 && su -c id >/dev/null 2>&1 && su -c 'test -x /data/adb/ksud' 2>/dev/null; then
  su -c '/data/adb/ksud sepolicy patch "allow untrusted_app_27 app_data_file file link"' \
    && echo "    patch 已应用 ✅" \
    || echo "    ⚠️ patch 失败, 可手动: su -c \"ksud sepolicy patch 'allow untrusted_app_27 app_data_file file link'\""
  TMP_SH="$HOME/.cache/dsh-selinux-install.sh"
  cat > "$TMP_SH" <<'EOT'
#!/system/bin/sh
mkdir -p /data/adb/service.d
cat > /data/adb/service.d/dsh-selinux.sh <<"EOF2"
#!/system/bin/sh
if [ -x /data/adb/ksud ]; then
  /data/adb/ksud sepolicy patch "allow untrusted_app_27 app_data_file file link"
fi
EOF2
chmod 755 /data/adb/service.d/dsh-selinux.sh
EOT
  chmod 755 "$TMP_SH"
  su -c "sh $TMP_SH" && echo "    已持久化 (开机自动执行)" || echo "    ⚠️ 持久化失败"
  rm -f "$TMP_SH"
else
  echo "    ⚠️ 无 root/KernelSU, 会话可能存不了"
  echo "       验证: cd ~ && touch t1 && ln t1 t2 && echo OK"
fi

# ---------- 6. 生成启动命令 dsh-web + dsh wrapper ----------
echo "$P 6/9 生成启动命令 dsh-web + dsh wrapper ..."
# dsh wrapper: npm 装的 bin.js shebang 不带 --expose-internals,
# 直接 `dsh web` 时 cordis-plugin-loader 解析不到本地插件 → 必须显式传参。
# ⚠ npm 更新 @deepseek-ai/dsh 后 /usr/bin/dsh 会被 symlink 覆盖, 需重放本 wrapper。
cat > "$PREFIX/bin/dsh" <<WRAP
#!/data/data/com.termux/files/usr/bin/bash
# dsh wrapper (Termux 原生) — npm 更新 dsh 后此文件会被覆盖, 重放: bash $PREFIX/bin/dsh 安装脚本第6步
BIN=$PREFIX/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
exec node --expose-internals "\$BIN" "\$@"
WRAP
chmod +x "$PREFIX/bin/dsh"
cat > "$PREFIX/bin/dsh-web" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# dsh-web: 快速启动 DeepSeek Harness Web UI (Termux 原生)
BIN=$PREFIX/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
PORT=3080
URL="http://127.0.0.1:\$PORT"
LOG="\$HOME/.cache/dsh-web.log"

# 引导到工作区 (存在则以它为会话默认 cwd)
for W in "\$HOME"; do
  if [ -d "\$W" ]; then cd "\$W"; break; fi
done

if curl -s -o /dev/null --max-time 2 "\$URL/"; then
  echo "✓ dsh web 已在运行: \$URL"
else
  echo "启动 dsh web ..."
  mkdir -p "\$HOME/.cache"
  nohup node --expose-internals "\$BIN" web > "\$LOG" 2>&1 &
  for _ in \$(seq 1 25); do
    sleep 1
    curl -s -o /dev/null --max-time 2 "\$URL/" && break
  done
  if curl -s -o /dev/null --max-time 2 "\$URL/"; then
    echo "✓ 就绪: \$URL"
  else
    echo "✗ 启动失败, 日志: \$LOG"
    tail -5 "\$LOG"
    exit 1
  fi
fi
command -v termux-open-url >/dev/null && termux-open-url "\$URL"
EOF
chmod +x "$PREFIX/bin/dsh-web"

# dsh-web-restart: 重启 dsh web (由 dsh-mobile-ui 插件 /api/dsh-restart 调用, 侧栏长按重启)
# 脱钩后台执行: sleep 1 让当前 HTTP 响应先返回, 再杀旧进程起新进程。
# 用 ^node 锚点 + 等端口释放, 修复 pgrep -f 自匹配导致的 EADDRINUSE。
cat > "$PREFIX/bin/dsh-web-restart" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# dsh-web-restart: 重启 dsh web (由 dsh-mobile-ui 插件 /api/dsh-restart 调用)
BIN=$PREFIX/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
LOG="\\$HOME/.cache/dsh-web.log"
sleep 1
PID=\\$(pgrep -f "^node .*lib/bin\\.js web" | head -1)
if [ -n "\\$PID" ]; then
  kill "\\$PID"
  for _ in \\$(seq 1 30); do
    kill -0 "\\$PID" 2>/dev/null || break
    sleep 0.5
  done
fi
sleep 1
mkdir -p "\\$HOME/.cache"
nohup node --expose-internals "\\$BIN" web >> "\\$LOG" 2>&1 &
EOF
chmod +x "$PREFIX/bin/dsh-web-restart"
echo "$P 已生成重启命令: dsh-web-restart"

# 本机实例探测(一次性, 写壳可读配置): Termux 原生无 /etc/os-release → instance=termux
# proot 场景由 dsh-install-linux.sh 负责写 termux-linux; 此处只写原生
echo "instance=termux" > "$PREFIX/../usr/etc/dsh-instance.conf" 2>/dev/null \
  || echo "instance=termux" > /data/data/com.termux/files/usr/etc/dsh-instance.conf
chmod 644 /data/data/com.termux/files/usr/etc/dsh-instance.conf 2>/dev/null || true
echo "$P 已写入本机实例配置: instance=termux"

# ---------- 7. 验证 ----------
echo "$P 7/9 验证原生模块..."
for m in node-pty koffi sharp; do
  if node -e "require('$P/$m')" >/dev/null 2>&1; then
    echo "    $m OK ✅"
  else
    echo "    $m 失败 ❌"
  fi
done

echo "$P 8/9 启动验证..."
timeout 25 node --expose-internals "$PREFIX/lib/node_modules/@deepseek-ai/dsh/lib/bin.js" web >/dev/null 2>&1 &
sleep 20
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/ 2>/dev/null || true)
if [ "$code" = "200" ]; then
  echo "$P ✅ 启动验证通过 (HTTP 200)"
else
  echo "$P ⚠️ 探测未通过 (HTTP ${code:-无响应}), 可手动运行 dsh-web 排查"
fi

echo ""
echo "================ 安装完成 ================"
echo "启动:   dsh-web"
echo "访问:   手机浏览器 http://127.0.0.1:3080  填 API key"
echo "注意:   dsh 带 bash 执行/文件读写等强权限工具, 仅自用"
echo "==========================================="

# ---------- 9. 安装移动端插件 (dsh-mobile 仓库) ----------
echo "$P 9/9 安装移动端插件 (dsh-mobile-ui)..."
BASE="https://raw.githubusercontent.com/knGear/dsh-mobile/main"
if curl -fsSL -o "$HOME/.cache/install-dsh-mobile-ui.sh" "$BASE/scripts/install-dsh-mobile-ui.sh"; then
  bash "$HOME/.cache/install-dsh-mobile-ui.sh"
else
  echo "$P   install-dsh-mobile-ui.sh 下载失败 ⚠️ (插件未装, 可稍后手动: bash <(curl -fsSL $BASE/scripts/install-dsh-mobile-ui.sh))"
fi
echo "插件:   dsh-mobile-ui 就绪 (重启 dsh 后生效)"
