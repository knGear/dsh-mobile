#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# dsh-mobile-ui 移动端插件 — 卸载
# 用法: bash uninstall-dsh-mobile-ui.sh
# 效果: ① 删插件目录 ~/.dsh/profiles/node_modules/dsh-mobile-ui/
#       ② cordis.patch.yml 移除 dsh-mobile-ui insert 条目
#       ③ 删 skill ~/.agents/skills/dsh-mobile-ui-skill/
#       ④ 保留 dsh-web-restart 与 dsh 本体不动
# ============================================================

set -euo pipefail

P='[dsh-mobile-ui]'
PLUGIN_DIR="$HOME/.dsh/profiles/node_modules/dsh-mobile-ui"
PATCH_FILE="$HOME/.dsh/profiles/web/cordis.patch.yml"
SKILL_DIR="$HOME/.agents/skills/dsh-mobile-ui-skill"

# ① 插件
if [ -d "$PLUGIN_DIR" ]; then
  rm -rf "$PLUGIN_DIR"
  echo "$P 1/3 已删插件目录 $PLUGIN_DIR"
else
  echo "$P 1/3 插件目录不存在(跳过)"
fi

# ② patch 移除条目(仅删 dsh-mobile-ui 的 insert 块, 保留其他内容)
if [ -f "$PATCH_FILE" ]; then
  python3 - "$PATCH_FILE" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
parts = s.split('\n')
out, i = [], 0
while i < len(parts):
    line = parts[i]
    if line.strip().startswith('- insert:'):
        # 收集块
        j = i + 1
        block = [line]
        while j < len(parts) and (parts[j].startswith('    ') or parts[j].strip() == ''):
            block.append(parts[j]); j += 1
        text = '\n'.join(block)
        if 'dsh-mobile-ui' in text and 'id: dsh-mobile-ui' in text:
            # 跳过整个块(含前导空行)
            i = j
            continue
        out.extend(block); i = j
        continue
    out.append(line); i += 1
res = '\n'.join(out)
# 清理多余空行
res = re.sub(r'\n{3,}', '\n\n', res)
open(p, 'w', encoding='utf-8').write(res)
print('  patch 已移除 dsh-mobile-ui 条目')
PY
else
  echo "$P 2/3 patch 文件不存在(跳过)"
fi

# ③ skill
if [ -d "$SKILL_DIR" ]; then
  rm -rf "$SKILL_DIR"
  echo "$P 3/3 已删 skill $SKILL_DIR"
else
  echo "$P 3/3 skill 不存在(跳过)"
fi

echo "$P 完成。重启 dsh web 后 dsh-mobile-ui 完全移除"
