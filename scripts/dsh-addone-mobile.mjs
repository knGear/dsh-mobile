#!/usr/bin/env node
// ============================================================
// dsh-addone-mobile.mjs — 跨平台移动端插件安装 (Windows/macOS/Linux/Termux)
// 适用: 已用任意方式装好 dsh 的环境, 补装 mobile-ui + mobile-AndroidNotify。
// 用法: node dsh-addone-mobile.mjs      (重复运行 = 更新到最新版)
// 依赖: Node.js 18+ (dsh 环境必备, 零第三方依赖)
// ============================================================

import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs'

const BASE = 'https://raw.githubusercontent.com/knGear/dsh-mobile/main/plugins'
const FILES = ['index.js', 'client.js', 'package.json']
const PLUGINS = ['mobile-ui', 'mobile-AndroidNotify']
const ROWS = [
  { id: 'mobile-notify', name: 'mobile-AndroidNotify' },
  { id: 'mobile-ui', name: 'mobile-ui' },
]

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const dir = join(dshHome, 'profiles', 'node_modules')
const patchFile = join(dshHome, 'profiles', 'web', 'cordis.patch.yml')

async function download(url, dest) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`)
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
}

console.log('[dsh插件] 1/2 下载插件文件...')
mkdirSync(dir, { recursive: true })
for (const name of PLUGINS) {
  mkdirSync(join(dir, name), { recursive: true })
  for (const f of FILES) {
    await download(`${BASE}/${name}/${f}`, join(dir, name, f))
    console.log(`  ${name}/${f} ✓`)
  }
}

console.log('[dsh插件] 2/2 挂载 cordis.patch.yml ...')
mkdirSync(join(dshHome, 'profiles', 'web'), { recursive: true })
let patch = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : ''
if (!patch.trim()) {
  patch = '# 移动端本地插件\n- insert:\n' +
    ROWS.map((r) => `    - id: ${r.id}\n      name: '${r.name}'`).join('\n') + '\n'
  writeFileSync(patchFile, patch)
  console.log(`  已生成 ${patchFile}`)
} else {
  for (const r of ROWS) {
    if (!patch.includes(`id: ${r.id}`)) {
      appendFileSync(patchFile, `\n- insert:\n    - id: ${r.id}\n      name: '${r.name}'\n`)
      console.log(`  已挂载 ${r.id}`)
    } else {
      console.log(`  ${r.id} 已挂载, 跳过`)
    }
  }
}

console.log('\n================ 完成 ================')
console.log(`插件位置: ${dir}`)
console.log(`挂载文件: ${patchFile}`)
console.log('重启 dsh 后生效 (dsh web)')
console.log('======================================')
