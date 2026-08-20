#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# dsh-mobile-ui 移动端插件 — 幂等安装
# 用法: bash install-dsh-mobile-ui.sh [本地插件目录]
#   - 无参: 从 GitHub raw 下载 (knGear/dsh-mobile main 分支)
#   - 带参: 用本地目录 (开发/离线用), 如 bash install-dsh-mobile-ui.sh /sdcard/1tui/dsh-mobile/plugins/dsh-mobile-ui
# 效果: ① 插件 → ~/.dsh/profiles/node_modules/dsh-mobile-ui/
#       ② web profile 补丁 → ~/.dsh/profiles/web/cordis.patch.yml (insert 去重)
#       ③ skill 规则 → ~/.agents/skills/dsh-mobile-ui-skill/SKILL.md
#       ④ 重启脚本 → $PREFIX/bin/dsh-web-restart (缺失才生成)
# 幂等: 可重复执行; 已安装则覆盖更新插件与 skill, patch 不重复挂载
# ============================================================

set -euo pipefail

P='[dsh-mobile-ui]'
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
BASE="https://raw.githubusercontent.com/knGear/dsh-mobile/main/plugins/dsh-mobile-ui"
PLUGIN_DIR="$DSH_HOME/profiles/node_modules/dsh-mobile-ui"
PATCH_FILE="$DSH_HOME/profiles/web/cordis.patch.yml"
SKILL_FILE="$HOME/.agents/skills/dsh-mobile-ui-skill/SKILL.md"
RESTART_BIN="${PREFIX:-/nonexistent}/bin/dsh-web-restart"
IS_TERMUX=0
[ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] && IS_TERMUX=1

SRC="${1:-}" 

# ---------- 1. 插件 ----------
echo "$P 1/4 安装插件 dsh-mobile-ui ..."
mkdir -p "$PLUGIN_DIR"
if [ -n "$SRC" ] && [ -d "$SRC" ]; then
  for f in index.js client.js package.json; do
    if [ -f "$SRC/$f" ]; then cp -f "$SRC/$f" "$PLUGIN_DIR/$f"; echo "  $f ✓ (本地)"; else echo "  $f 缺失 ⚠️"; fi
  done
else
  for f in index.js client.js package.json; do
    if curl -fsSL -o "$PLUGIN_DIR/$f" "$BASE/$f"; then echo "  $f ✓ (raw)"; else echo "  $f 下载失败 ⚠️"; fi
  done
fi

# ---------- 2. web profile 补丁 ----------
echo "$P 2/4 挂载 cordis.patch.yml ..."
mkdir -p "$(dirname "$PATCH_FILE")"
if [ ! -f "$PATCH_FILE" ]; then
  cat > "$PATCH_FILE" <<'PATCH'
# dsh-mobile-ui 移动端插件(本地, 位于 ~/.dsh/profiles/node_modules/dsh-mobile-ui/):
#   UA 含 DSHM/ 的壳内才激活; 浏览器/原版零影响(dsh 本体保持纯净)
- insert:
    - id: dsh-mobile-ui
      name: 'dsh-mobile-ui'
PATCH
  echo "  已生成 $PATCH_FILE"
elif ! grep -q "id: dsh-mobile-ui" "$PATCH_FILE"; then
  printf '\n- insert:\n    - id: dsh-mobile-ui\n      name: dsh-mobile-ui\n' >> "$PATCH_FILE"
  echo "  已挂载 dsh-mobile-ui"
else
  echo "  已挂载(跳过)"
fi

# ---------- 3. skill 规则 ----------
echo "$P 3/4 部署 skill (agent 工具规则) ..."
mkdir -p "$(dirname "$SKILL_FILE")"
if [ -n "$SRC" ] && [ -f "$SRC/SKILL.md" ]; then
  cp -f "$SRC/SKILL.md" "$SKILL_FILE"
  echo "  SKILL.md ✓ (本地)"
elif curl -fsSL -o "$SKILL_FILE" "$BASE/SKILL.md"; then
  echo "  SKILL.md ✓ (raw)"
else
  echo "  SKILL.md 下载失败 ⚠️"
fi

# ---------- 4. 重启脚本 (仅 Termux) ----------
echo "$P 4/4 确保重启脚本 ..."
if [ "$IS_TERMUX" != 1 ]; then
  echo "  非 Termux 环境, 跳过 (dsh-web-restart 仅 Termux/壳内重启需要)"
elif [ ! -s "$RESTART_BIN" ]; then
  cat > "$RESTART_BIN" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# dsh-web-restart: 重启 dsh web (由 dsh-mobile-ui /api/dsh-restart 调用)
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
  chmod +x "$RESTART_BIN"
  echo "  已生成 $RESTART_BIN"
else
  echo "  已存在(跳过)"
fi

if [ "$IS_TERMUX" = 1 ]; then
  echo "$P 完成。重启 dsh web 后生效: 长按侧栏左下角循环按钮可重载/重启"
else
  echo "$P 完成 (非 Termux)。重启 dsh web 后生效; APK 壳内长按循环按钮可重载/重启"
fi
