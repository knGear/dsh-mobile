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

# ---------- 6. 生成启动命令 dsh-web ----------
echo "$P 6/9 生成启动命令 dsh-web ..."
cat > "$PREFIX/bin/dsh-web" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# dsh-web: 快速启动 DeepSeek Harness Web UI (Termux 原生)
BIN=$PREFIX/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
PORT=3080
URL="http://127.0.0.1:\$PORT"
LOG="\$HOME/.cache/dsh-web.log"

# 引导到工作区 (存在则以它为会话默认 cwd)
for W in /sdcard/1tui "\$HOME"; do
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
echo "$P 9/9 安装移动端插件 (mobile-ui / mobile-AndroidNotify)..."
PLUGIN_DIR="$HOME/.dsh/profiles/node_modules"
PATCH_FILE="$HOME/.dsh/profiles/web/cordis.patch.yml"
BASE="https://raw.githubusercontent.com/knGear/dsh-mobile/main/plugins"
mkdir -p "$PLUGIN_DIR/mobile-ui" "$PLUGIN_DIR/mobile-AndroidNotify" "$(dirname "$PATCH_FILE")"
for name in mobile-ui mobile-AndroidNotify; do
  for f in index.js client.js package.json; do
    if curl -fsSL -o "$PLUGIN_DIR/$name/$f" "$BASE/$name/$f"; then
      echo "  $name/$f ✓"
    else
      echo "  $name/$f 下载失败 ⚠️"
    fi
  done
done
if [ ! -f "$PATCH_FILE" ]; then
  cat > "$PATCH_FILE" <<'PATCH'
# 移动端本地插件
- insert:
    - id: mobile-notify
      name: 'mobile-AndroidNotify'
    - id: mobile-ui
      name: 'mobile-ui'
PATCH
  echo "  已生成 $PATCH_FILE"
else
  for id in mobile-notify mobile-ui; do
    if ! grep -q "id: $id" "$PATCH_FILE"; then
      case $id in
        mobile-notify) pname='mobile-AndroidNotify' ;;
        *) pname='mobile-ui' ;;
      esac
      printf '\n- insert:\n    - id: %s\n      name: %s\n' "$id" "$pname" >> "$PATCH_FILE"
      echo "  已挂载 $id"
    fi
  done
fi
echo "  插件就绪(重启 dsh 后生效)"
echo "插件:   已随本脚本装好 (mobile-ui / mobile-AndroidNotify)"
