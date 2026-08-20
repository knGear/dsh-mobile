#!/usr/bin/env bash
# ============================================================
# dsh-mobile-ui 移动端插件独立安装 (跨平台入口, 转发 install-dsh-mobile-ui.sh)
# 适用: 已用任意方式装好 dsh 的环境 (PC / 服务器 / Termux / proot),
#       补装 dsh-mobile-ui 插件, 再用 dshm APK 获得移动增强体验。
# 用法: bash dsh-addone-mobile.sh [本地插件目录]   (重复运行 = 更新到最新版)
# 支持: DSH_HOME 覆盖 dsh 配置目录 (默认 $HOME/.dsh)
# ============================================================
set -euo pipefail

BASE="https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/install-dsh-mobile-ui.sh"
if [ -n "${1:-}" ]; then
  # 本地目录模式: 直接调本地 install 脚本(需同目录存在)
  DIR="$(cd "$(dirname "$0")" && pwd)"
  bash "$DIR/install-dsh-mobile-ui.sh" "$1"
else
  bash <(curl -fsSL "$BASE")
fi
