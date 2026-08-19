#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# dshm-ui 插件 — 幂等安装 (update.md 方式 B)
# 用法: bash install-dshm-ui.sh [本地插件目录]
#   - 无参: 从 GitHub raw 下载 (knGear/dsh-mobile main 分支 plugins/dshm-ui)
#   - 带参: 本地目录 (开发/离线)
# 效果: ① 插件包 → ~/.dsh/profiles/node_modules/dshm-ui/
#       ② web profile 补丁 → ~/.dsh/profiles/web/cordis.patch.yml (insert 去重)
# ============================================================
set -euo pipefail

P='[dshm-ui]'
BASE="https://raw.githubusercontent.com/knGear/dsh-mobile/main/plugins/dshm-ui"
PLUGIN_DIR="$HOME/.dsh/profiles/node_modules/dshm-ui"
PATCH_FILE="$HOME/.dsh/profiles/web/cordis.patch.yml"
SRC="${1:-}"

FILES="index.js client.js package.json cordis.patch.yml dsh.plugin.json index.d.ts SKILL.md"
echo "$P 1/3 安装插件 dshm-ui ..."
mkdir -p "$PLUGIN_DIR"
if [ -n "$SRC" ] && [ -d "$SRC" ]; then
  for f in $FILES; do
    [ -f "$SRC/$f" ] && cp -f "$SRC/$f" "$PLUGIN_DIR/$f" && echo "  $f ✓ (本地)" || echo "  $f 缺失 ⚠️"
  done
else
  for f in $FILES; do
    curl -fsSL -o "$PLUGIN_DIR/$f" "$BASE/$f" && echo "  $f ✓ (raw)" || echo "  $f 下载失败 ⚠️"
  done
fi

echo "$P 2/3 挂载 cordis.patch.yml ..."
mkdir -p "$(dirname "$PATCH_FILE")"
if [ ! -f "$PATCH_FILE" ]; then
  cp -f "$PLUGIN_DIR/cordis.patch.yml" "$PATCH_FILE"
  echo "  已生成 $PATCH_FILE"
elif ! grep -q "id: dshm-ui" "$PATCH_FILE"; then
  printf '\n- insert:\n    - id: dshm-ui\n      name: dshm-ui\n' >> "$PATCH_FILE"
  echo "  已挂载 dshm-ui"
else
  echo "  已挂载(跳过)"
fi

echo "$P 完成。重启 dsh web 后生效"
