#!/usr/bin/env bash
# ============================================================
# dsh 事故还原(比官方更进一步): 保留 会话历史 + API key,
# 其余全部还原为官方 + 本项目状态(插件/配置/前端/程序)——
# 适用于把前端/webui/dsh 改炸后, 干净还原但对话不丢。
# 用法: bash dsh-repair.sh [--linux]
# ============================================================
set -euo pipefail

P='[dsh还原]'
LINUX=0
[ "${1:-}" = "--linux" ] && LINUX=1

SCRIPT_URL=https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts
BK="$HOME/.cache/dsh-repair-backup"

if [ ! -d "$HOME/.dsh" ]; then
  echo "$P 未检测到 ~/.dsh, 直接全新安装"
else
  echo "$P 备份会话与密钥..."
  rm -rf "$BK"
  mkdir -p "$BK"
  if [ -d "$HOME/.dsh/sessions" ]; then
    cp -r "$HOME/.dsh/sessions" "$BK/"
    echo "  ✓ 会话已备份"
  fi
  if [ -f "$HOME/.dsh/.credentials.yaml" ]; then
    cp "$HOME/.dsh/.credentials.yaml" "$BK/"
    echo "  ✓ API key 已备份"
  fi
  echo "$P 清空 ~/.dsh(改炸的插件/配置/前端缓存一并清除)..."
  rm -rf "$HOME/.dsh"
fi

echo "$P 重装 dsh + 插件(全新状态)..."
# 先卸载全局包: 若前端/程序本体被改炸, 直接 npm i -g 可能不覆盖损坏文件,
# 卸载后重装保证 100% 干净(与 dsh-reinstall.sh 无损档一致)。
npm uninstall -g @deepseek-ai/dsh >/dev/null 2>&1 || true
if [ "$LINUX" = 1 ]; then
  curl -fsSL "$SCRIPT_URL/dsh-install-linux.sh" -o "$HOME/.cache/dsh-install-linux.sh"
  bash "$HOME/.cache/dsh-install-linux.sh"
else
  curl -fsSL "$SCRIPT_URL/dsh-install-termux.sh" -o "$HOME/.cache/dsh-install-termux.sh"
  bash "$HOME/.cache/dsh-install-termux.sh"
fi

echo "$P 恢复会话与密钥..."
mkdir -p "$HOME/.dsh"
[ -d "$BK/sessions" ] && cp -r "$BK/sessions" "$HOME/.dsh/"
[ -f "$BK/.credentials.yaml" ] && cp "$BK/.credentials.yaml" "$HOME/.dsh/"

echo "$P 完成:"
echo "  ✓ 会话历史已保留"
echo "  ✓ API key 已保留"
echo "  ✓ 插件/配置/前端/程序 = 全新还原状态"
echo "  启动: dsh-web"
