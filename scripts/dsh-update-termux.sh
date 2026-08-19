#!/data/data/com.termux/files/usr/bin/bash
# dsh-update-termux.sh — Termux 原生快速更新(仅核心: npm + 原生模块修补 + wrapper)
# 跳过: pkg update/upgrade(工具链已装) / SELinux patch(幂等无需重跑) / 插件安装 / 启动验证
# 用时: koffi 编译最耗时(约 2-5 分钟), 其余秒级
# 用法: bash dsh-update-termux.sh [版本]  (默认 latest; 例: bash dsh-update-termux.sh 0.1.0-rc.6)
set -euo pipefail
P='[dsh更新]'
VER="${1:-}"  # 可选版本参数

if [ -z "${PREFIX:-}" ] || [ ! -d "$PREFIX" ]; then
  echo "$P 错误: 请在 Termux 环境中运行 (缺少 $PREFIX)"
  exit 1
fi

echo "$P 1/5 安装 @deepseek-ai/dsh${VER:+@$VER} (--ignore-scripts)..."
if [ -n "$VER" ]; then
  npm i -g "@deepseek-ai/dsh@$VER" --ignore-scripts
else
  npm i -g @deepseek-ai/dsh --ignore-scripts
fi

P=$PREFIX/lib/node_modules/@deepseek-ai/dsh/node_modules

# 2. node-pty 编译
echo "$P 2/5 编译 node-pty (clang++)..."
NAPI_VER=7.1.1
if [ ! -f ~/.cache/napi/package/package.json ]; then
  mkdir -p ~/.cache
  curl -sL -o ~/.cache/napi.tgz "https://registry.npmjs.org/node-addon-api/-/node-addon-api-$NAPI_VER.tgz"
  mkdir -p ~/.cache/napi && tar xzf ~/.cache/napi.tgz -C ~/.cache/napi
fi
cd "$P/node-pty"
mkdir -p prebuilds/android-arm64
clang++ -std=c++17 -fPIC -shared -O2 \
  -I"$PREFIX/include/node" -I"$HOME/.cache/napi/package" \
  src/unix/pty.cc -lutil -o prebuilds/android-arm64/pty.node
echo "    pty.node OK"

# 3. spawn.h + koffi 编译
echo "$P 3/5 修补 spawn.h + 编译 koffi (最耗时)..."
if [ ! -f "$PREFIX/include/spawn.h" ]; then
  curl -sL -o "$PREFIX/include/spawn.h" \
    https://raw.githubusercontent.com/aosp-mirror/platform_bionic/master/libc/include/spawn.h
  sed -i 's/#if __BIONIC_AVAILABILITY_GUARD(28)/#if 1/; s/#if __BIONIC_AVAILABILITY_GUARD(34)/#if 1/; s/ __INTRODUCED_IN(28)//g; s/ __INTRODUCED_IN(34)//g' \
    "$PREFIX/include/spawn.h"
fi
cd "$P/koffi"
node ./cnoke.cjs -P . -D src/koffi --prebuild --release
echo "    koffi OK"

# 4. sharp-wasm32
echo "$P 4/5 安装 sharp-wasm32 ..."
cd "$PREFIX/lib/node_modules/@deepseek-ai/dsh"
npm i @img/sharp-wasm32 --no-save --ignore-scripts >/dev/null 2>&1

# 5. wrapper 重放(npm 覆盖了 /usr/bin/dsh symlink, 必须重写 --expose-internals wrapper)
echo "$P 5/5 重放 dsh wrapper ..."
cat > "$PREFIX/bin/dsh" <<WRAP
#!/data/data/com.termux/files/usr/bin/bash
# dsh wrapper (Termux 原生) — npm 更新 dsh 后此文件会被覆盖, 重放见 install 脚本第6步
BIN=$PREFIX/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
exec node --expose-internals "$BIN" "$@"
WRAP
chmod +x "$PREFIX/bin/dsh"

# 验证原生模块
echo "$P 验证:"
for m in node-pty koffi sharp; do
  if node -e "require('$P/$m')" >/dev/null 2>&1; then
    echo "    $m OK"
  else
    echo "    $m 失败!"
  fi
done
echo "$P 完成 — 重启 dsh web 生效 (bash dsh-web-restart)"
