#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# dsh (DeepSeek Harness) 一键安装 — proot Debian 方案
# 适用: 另一台 Android 设备 (Termux 环境内运行)
# 用法: bash install-dsh.sh
# 备注: 全程需要网络; 首次装 Debian + 编译工具链约需 10~20 分钟
# ============================================================

set -euo pipefail

P='[dsh安装]'

# ---------- 1. 环境检查 ----------
if [ -z "${PREFIX:-}" ] || [ ! -d "$PREFIX" ]; then
  echo "$P 错误: 请在 Termux 环境中运行 (缺少 \$PREFIX)"
  exit 1
fi

echo "$P 1/7 安装 proot-distro / curl..."
pkg install -y proot-distro curl >/dev/null 2>&1 || pkg install -y proot-distro curl

# ---------- 2. 安装 Debian rootfs ----------
if ! proot-distro list 2>/dev/null | grep -q '^debian'; then
  echo "$P 2/7 安装 Debian proot (下载 rootfs, 请保持网络稳定)..."
  proot-distro install debian
else
  echo "$P 2/7 Debian 已存在, 跳过"
fi

# ---------- 3. Debian 内装 nodejs / npm / 编译工具链 ----------
echo "$P 3/7 Debian 内安装 nodejs/npm/build-essential (体积较大, 耐心等待)..."
proot-distro login debian -- bash -c '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq nodejs npm build-essential python3 curl
  node -v && npm -v
'

# ---------- 4. 安装 dsh ----------
echo "$P 4/7 安装 @deepseek-ai/dsh (全局)..."
proot-distro login debian -- npm i -g @deepseek-ai/dsh

# ---------- 5. 校验/修补原生模块 ----------
echo "$P 5/7 校验原生模块 (koffi / node-pty / sharp)..."
proot-distro login debian -- bash -c '
  set -e
  D=/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules
  ok() { node -e "require(\"$1\")" >/dev/null 2>&1; }
  if ! ok "$D/node-pty"; then
    echo "node-pty 未编译, 尝试 approve-scripts + rebuild..."
    npm approve-scripts --allow-scripts-pending --yes >/dev/null 2>&1 || true
    npm rebuild node-pty koffi 2>&1 | tail -2 || true
  fi
  for m in koffi node-pty sharp; do
    if ok "$D/$m"; then echo "  $m OK"; else echo "  $m 失败!"; fi
  done
'

# ---------- 6. SELinux hardlink 修复 (Android 16 的坑) ----------
echo "$P 6/7 检测 SELinux hardlink 限制..."
HAS_ROOT=0
if command -v su >/dev/null 2>&1 && su -c id >/dev/null 2>&1; then HAS_ROOT=1; fi

if [ "$HAS_ROOT" = 1 ] && su -c 'test -x /data/adb/ksud' 2>/dev/null; then
  echo "  检测到 KernelSU root, 应用 sepolicy patch..."
  su -c '/data/adb/ksud sepolicy patch "allow untrusted_app_27 app_data_file file link"' \
    && echo "  patch 已应用 ✅" \
    || echo "  ⚠️ patch 应用失败, 可稍后手动执行: su -c \"ksud sepolicy patch 'allow untrusted_app_27 app_data_file file link'\""
  # 持久化: 写临时脚本后用 root 执行, 避免引号嵌套
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
  su -c "sh $TMP_SH" && echo "  已写入 /data/adb/service.d/dsh-selinux.sh (开机自动执行)" \
    || echo "  ⚠️ 持久化写入失败 (不影响本次, 重启后需手动 patch)"
  rm -f "$TMP_SH"
elif [ "$HAS_ROOT" = 1 ]; then
  echo "  有 root 但非 KernelSU (无 ksud), 无法自动 patch"
  echo "  手动执行: su -c \"ksud sepolicy patch 'allow untrusted_app_27 app_data_file file link'\""
else
  echo "  ⚠️ 无 root, 无法自动修复 SELinux hardlink 限制"
  echo "     影响范围:"
  echo "       - dsh 工作区在 /sdcard (FUSE): link 基本必失败, 会话存不了"
  echo "       - 默认工作区在 Termux 家目录 (ext4): 多数设备无此问题;"
  echo "         但 Android 16 收紧策略的设备 (实测) 家目录也会受限"
  echo "     验证: touch t1 && ln t1 t2 (失败即中招)"
  echo "     规避: 工作区放 Termux 家目录; 或设备 root 后重跑本脚本自动修复"
fi

# ---------- 7. 验证 + 启动器 ----------
echo "$P 7/7 验证 dsh..."
proot-distro login debian -- dsh --version

# 启动器命令 (Termux 里直接输 dsh-web)
cat > "$PREFIX/bin/dsh-web" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
proot-distro login debian -- dsh web
EOF
chmod +x "$PREFIX/bin/dsh-web"
echo "$P 已生成启动命令: dsh-web"

# 试启动探测 (自动退出, 不影响结果)
echo "$P 试启动 dsh web 探测端口 3080..."
proot-distro login debian -- timeout 25 dsh web >/dev/null 2>&1 &
sleep 20
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/ 2>/dev/null || true)
if [ "$code" = "200" ]; then
  echo "$P ✅ 启动验证通过 (HTTP 200)"
else
  echo "$P ⚠️ 探测未通过 (HTTP ${code:-无响应}), 可手动运行 dsh-web 排查"
fi

echo ""
echo "================ 安装完成 ================"
echo "启动:   dsh-web         (Termux 里直接执行)"
echo "访问:   手机浏览器打开 http://127.0.0.1:3080  填 API key"
echo "升级:   proot-distro login debian -- npm i -g @deepseek-ai/dsh@latest"
echo "==========================================="
