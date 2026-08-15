#!/usr/bin/env bash
# ============================================================
# dsh 重装命令(非官方, dsh-mobile 提供)
# 默认: 无损重装 — 卸载并重装 dsh 程序, 保留 ~/.dsh 全部数据(配置/API key/会话/插件)
# --purge: 彻底重装 — 连 ~/.dsh(配置/API key/会话/插件)一起删除后全新安装
# --linux: 走 proot Ubuntu 方案重装(默认 Termux 原生方案)
# 用法: bash dsh-reinstall.sh [--purge] [--linux]
# ============================================================
set -euo pipefail

P='[dsh重装]'
PURGE=0
LINUX=0
for a in "$@"; do
  case "$a" in
    --purge) PURGE=1 ;;
    --linux) LINUX=1 ;;
    *) echo "$P 未知参数: $a (支持 --purge / --linux)"; exit 1 ;;
  esac
done

SCRIPT_URL=https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts

if [ "$PURGE" = 1 ]; then
  echo "$P ⚠️  彻底重装: 将删除 ~/.dsh(配置 / API key / 会话历史 / 插件), 不可恢复!"
  read -r -p "确认输入 yes 继续: " ans
  if [ "$ans" != "yes" ]; then echo "$P 已取消"; exit 1; fi
  rm -rf "$HOME/.dsh"
  echo "$P 已清空 ~/.dsh"
else
  echo "$P 无损重装: 保留 ~/.dsh 全部数据, 仅重装 dsh 程序"
fi

echo "$P 1/3 卸载旧 dsh(忽略不存在)..."
npm uninstall -g @deepseek-ai/dsh >/dev/null 2>&1 || true

echo "$P 2/3 重新安装 dsh + 插件..."
if [ "$LINUX" = 1 ]; then
  curl -fsSL "$SCRIPT_URL/dsh-install-linux.sh" -o "$HOME/.cache/dsh-install-linux.sh"
  bash "$HOME/.cache/dsh-install-linux.sh"
else
  curl -fsSL "$SCRIPT_URL/dsh-install-termux.sh" -o "$HOME/.cache/dsh-install-termux.sh"
  bash "$HOME/.cache/dsh-install-termux.sh"
fi

echo "$P 3/3 完成"
if [ "$PURGE" = 1 ]; then
  echo "  注意: 已清空配置 — 打开 App 后需重新填写 API key"
fi
echo "  启动: dsh-web"
