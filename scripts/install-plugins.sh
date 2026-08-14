#!/usr/bin/env bash
# ============================================================
# dsh-mobile 移动端插件独立安装 (mobile-ui / mobile-AndroidNotify)
# 适用: 已用任意方式装好 dsh 的环境 (PC / 服务器 / Termux / proot),
#       补装两个移动端插件, 再用 dsh-mobile APK 获得增强体验。
# 用法: bash install-plugins.sh      (重复运行 = 更新到最新版)
# ============================================================
set -euo pipefail

P='[dsh插件]'
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PLUGIN_DIR="$DSH_HOME/profiles/node_modules"
PATCH_FILE="$DSH_HOME/profiles/web/cordis.patch.yml"
BASE="https://raw.githubusercontent.com/knGear/dsh-mobile/main/plugins"

if ! command -v curl >/dev/null 2>&1; then
  echo "$P 缺少 curl, 请先安装 (Debian/Ubuntu: apt install curl; Termux: pkg install curl; macOS 自带)"
  exit 1
fi

mkdir -p "$PLUGIN_DIR/mobile-ui" "$PLUGIN_DIR/mobile-AndroidNotify" "$(dirname "$PATCH_FILE")"

echo "$P 1/2 下载插件文件 (github raw)..."
for name in mobile-ui mobile-AndroidNotify; do
  for f in index.js client.js package.json; do
    if curl -fsSL -o "$PLUGIN_DIR/$name/$f" "$BASE/$name/$f"; then
      echo "  $name/$f ✓"
    else
      echo "$P $name/$f 下载失败" >&2
      exit 1
    fi
  done
done

echo "$P 2/2 挂载到 cordis.patch.yml ..."
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
    else
      echo "  $id 已挂载, 跳过"
    fi
  done
fi

echo ""
echo "================ 完成 ================"
echo "插件位置: $PLUGIN_DIR"
echo "挂载文件: $PATCH_FILE"
echo "重启 dsh 后生效 (Termux: dsh-web / PC: dsh web)"
echo "然后安装 dsh-mobile APK 连接本机或远程(IP:端口) 获得增强体验"
echo "======================================"
