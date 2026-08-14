#!/data/data/com.termux/files/usr/bin/bash
# dsh web 后端一键安装脚本 (Termux 原生)
# 用法: 复制本脚本全部内容, 粘贴到 Termux 执行
# 装完: dsh-web 启动 / dsh-web-stop 停止 (http://127.0.0.1:3080)
set -e
BIN_DIR=/data/data/com.termux/files/usr/bin
PKG_DIR=/data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh

echo "== 1/6 安装工具链 =="
pkg install -y nodejs npm cmake make clang curl

echo "== 2/6 安装 dsh (--ignore-scripts 跳过 install, 避免 node-pty gyp 崩溃) =="
npm i -g @deepseek-ai/dsh --ignore-scripts

echo "== 3/6 手动编译 node-pty =="
P=$PKG_DIR/node_modules
cd "$HOME/.cache" || exit 1
curl -sL -o napi.tgz https://registry.npmjs.org/node-addon-api/-/node-addon-api-7.1.1.tgz
mkdir -p napi && tar xzf napi.tgz -C napi
mkdir -p "$P/node-pty/prebuilds/android-arm64"
clang++ -std=c++17 -fPIC -shared -O2 \
  -I/data/data/com.termux/files/usr/include/node \
  -I"$HOME/.cache/napi/package" \
  "$P/node-pty/src/unix/pty.cc" -lutil \
  -o "$P/node-pty/prebuilds/android-arm64/pty.node"

echo "== 4/6 编译 koffi (先补 bionic 缺失的 spawn.h) =="
curl -sL -o /data/data/com.termux/files/usr/include/spawn.h \
  https://raw.githubusercontent.com/aosp-mirror/platform_bionic/master/libc/include/spawn.h
sed -i 's/#if __BIONIC_AVAILABILITY_GUARD(28)/#if 1/; s/#if __BIONIC_AVAILABILITY_GUARD(34)/#if 1/; s/ __INTRODUCED_IN(28)//g; s/ __INTRODUCED_IN(34)//g' /data/data/com.termux/files/usr/include/spawn.h
cd "$P/koffi" && node ./cnoke.cjs -P . -D src/koffi --prebuild --release

echo "== 5/6 sharp 用 wasm 版 (无 android 二进制) =="
cd "$PKG_DIR" && npm i @img/sharp-wasm32 --no-save --ignore-scripts

echo "== 5.5/6 目录选择器默认 /sdcard (移动端) =="
PB="$PKG_DIR/node_modules/@deepseek-ai/dsh-host-directory-picker-browse/lib/index.js"
if [ -f "$PB" ]; then
  sed -i 's|resolve(path ?? home)|resolve(path ?? "/sdcard")|' "$PB"
  echo "已打补丁: 工作区目录选择器默认从 /sdcard 开始"
else
  echo "跳过(未找到 browse 选择器)"
fi

echo "== 6/6 启动脚本 + SELinux 补丁(需 root, 失败不阻塞) =="
cat > "$BIN_DIR/dsh-web" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
BIN=/data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
LOG="$HOME/.cache/dsh-web.log"
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:3080/; then
  echo "dsh web 已在运行"
else
  mkdir -p "$HOME/.cache"
  nohup node --expose-internals "$BIN" web > "$LOG" 2>&1 &
  for _ in $(seq 1 25); do sleep 1; curl -s -o /dev/null --max-time 2 http://127.0.0.1:3080/ && break; done
fi
EOF
cat > "$BIN_DIR/dsh-web-stop" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
PID=$(pgrep -f "lib/bin.js" | head -1)
[ -n "$PID" ] && kill "$PID" && echo "dsh web 已停止"
EOF
chmod +x "$BIN_DIR/dsh-web" "$BIN_DIR/dsh-web-stop"

if command -v su >/dev/null 2>&1; then
  su -c "ksud sepolicy patch 'allow untrusted_app_27 app_data_file file link'" 2>/dev/null \
    && echo "SELinux 补丁已应用" || echo "WARN: SELinux 补丁失败(可稍后手动执行)"
fi

echo ""
echo "✔ 安装完成! 启动: dsh-web  → 浏览器 http://127.0.0.1:3080"
echo "  停止: dsh-web-stop"
