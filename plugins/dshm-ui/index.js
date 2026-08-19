// dshm-ui host 侧 — 移动设置面板所需端点(仅壳内使用, 不影响 dsh 本体行为)
//
// 职责边界: 本插件只做移动适配(原版 UI 拉起/版本检查/目录选择器/session log 开关)。
//           无任何 restart/reload 能力(危险, 调用不准确会杀 dsh; 属 task 插件职责)。
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, statSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const name = 'dshm-ui'
const inject = ['webServer', 'loader']

const require = createRequire(import.meta.url)
const ORIGINAL_URL = 'http://127.0.0.1:3080/?plain=1'

function apply(ctx) {
  // 逃生: 系统浏览器开原版 UI(壳外, 无任何注入)
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-open-original',
    handler: (_req, res) => {
      try {
        spawnSync('termux-open-url', [ORIGINAL_URL])
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, message: String(error) }))
      }
    },
  })

  // 环境检测: termux-native(PREFIX 特征, 可靠) / npm(dsh 全局路径, proot+linux+wsl 通用) / unknown
  // proot/Linux/WSL 更新命令都是 npm, 只需区分 Termux 原生 vs 其他
  function detectEnv() {
    try {
      if (process.env.PREFIX && existsSync(process.env.PREFIX)) return 'termux-native'
      const dshPath = require.resolve('@deepseek-ai/dsh/package.json')
      if (dshPath.includes('/usr/local/lib/node_modules/') || dshPath.includes('/usr/lib/node_modules/')) return 'npm'
      return 'unknown'
    } catch (e) { return 'unknown' }
  }
  // 当前版本: dsh(读已装 package.json) + dshmUi(本插件自身 package.json) + dshmShell(壳, 由 UA 经 query 传入) + env
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dshm-versions',
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://x')
        const pkg = require('@deepseek-ai/dsh/package.json')
        let uiVer = '?'
        try { uiVer = require('./package.json').version || '?' } catch (e) { uiVer = '?' }
        const shellVer = u.searchParams.get('shell') || '?'
        const env = detectEnv()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          dsh: pkg.version || '?', dshmUi: uiVer, dshmShell: shellVer, env,
          npmCmd: 'npm i -g @deepseek-ai/dsh',
        }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ dsh: '?', dshmUi: '?', dshmShell: '?', env: 'unknown', message: String(error) }))
      }
    },
  })


  // dsh 应用内更新: 环境分派更新命令, SSE 流式回传输出(前端绘制更新终端)
  // termux-native → 安装脚本(含修补); npm(proot/linux/wsl) → npm i -g
  // 环境 unknown → 返回 400, 前端兜底复制 npm 命令
  function updateCommand(env) {
    if (env === 'termux-native') {
      // Termux 原生: 拉安装脚本跑(幂等 = 更新到最新, 含 6 步修补)
      const script = process.env.HOME + '/dsh-install-termux.sh'
      if (existsSync(script)) return { cmd: 'bash', args: [script] }
      return { cmd: 'bash', args: ['-c', 'curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-install-termux.sh -o $HOME/dsh-install-termux.sh && bash $HOME/dsh-install-termux.sh'] }
    }
    if (env === 'npm') return { cmd: 'npm', args: ['i', '-g', '@deepseek-ai/dsh'] }
    return null
  }
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-update',
    handler: (req, res) => {
      const env = detectEnv()
      const plan = updateCommand(env)
      if (!plan) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: '环境未知, 请复制 npm 命令手动更新', npmCmd: 'npm i -g @deepseek-ai/dsh' }))
        return
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      })
      res.write(': dsh update started\n\n')
      const child = spawn(plan.cmd, plan.args, { stdio: ['ignore', 'pipe', 'pipe'] })
      const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n') } catch (e) {} }
      child.stdout.on('data', (d) => send({ line: String(d) }))
      child.stderr.on('data', (d) => send({ line: String(d) }))
      child.on('close', (code) => {
        send({ done: true, code: code || 0 })
        try { res.end() } catch (e) {}
      })
      req.on('close', () => { try { child.kill() } catch (e) {} })
    },
  })

  // 目录列表(移动版工作区选择器用, 走 host fs 绕开 connection inject)
  // 返回 parent(上一层路径) + hasRoot(能否列 / → root 权限)
  // 无 root 时: "/" 是虚拟根, 只含 内部存储(/sdcard) + Termux(/data/data/com.termux/files/home)
  //   两者的上一层都回到虚拟根; 虚拟根无上一层(封顶)
  // 有 root 时: "/" 是真实根, 正常列举
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dshm-list-dir',
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://x')
        const raw = u.searchParams.get('path') || '/'
        const target = resolve(raw)
        const home = process.env.HOME || '/data/data/com.termux/files/home'
        const SDCARD = '/storage/emulated/0'
        const TERMUX = '/data/data/com.termux/files/home'
        // 检测 root 权限: 能列 / 的子目录 → root
        let hasRoot = false
        try {
          const rootNames = readdirSync('/')
          hasRoot = rootNames.length > 0
        } catch (e) { hasRoot = false }

        // ── 无 root: 虚拟根层 ──
        if (!hasRoot && target === '/') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({
            path: '/', parent: null, home, hasRoot: false, truncated: false,
            entries: [
              { name: '内部存储', path: SDCARD, hidden: false },
              { name: 'com.termux', path: '/data/data/com.termux', hidden: false },
            ],
            hint: '受限视图 · 仅显示可访问目录。Termux 获取 root 权限后，以 su 提权重启 dsh-web 即可浏览完整文件系统。',
          }))
          return
        }

        // ── parent 计算 ──
        let parent = null
        if (target !== '/' && target.length > 1) {
          const parts = target.replace(/\/+$/, '').split('/')
          parts.pop()
          parent = parts.length === 0 ? '/' : parts.join('/') || '/'
          if (!parent.startsWith('/')) parent = '/' + parent
          if (!hasRoot) {
            // 无 root: sdcard 和 termux 的上一层都回到虚拟根 "/"
            // 更深层目录: 如果 parent 不可列举(EACCES/ENOENT), 回退到虚拟根
            if (target === SDCARD || target === TERMUX) {
              parent = '/'
            } else {
              // 检查 parent 是否可列举, 不可列举则回退到虚拟根
              try { readdirSync(parent) }
              catch (e) {
                // parent 不可列举: 如果在 /sdcard 或 /data/data/com.termux 下, 回退到对应根
                if (target.startsWith(SDCARD)) parent = SDCARD
                else if (target.startsWith(TERMUX)) parent = TERMUX
                else parent = '/'
              }
            }
          }
        }

        // ── 列举目录 ──
        const entries = []
        const names = readdirSync(target)
        for (const n of names) {
          try {
            const full = join(target, n)
            const st = statSync(full)
            if (!st.isDirectory()) continue
            entries.push({ name: n, path: full, hidden: n.startsWith('.') })
          } catch (e) { /* 跳过无权限项 */ }
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ path: target, parent, home, hasRoot, entries, truncated: false }))
      } catch (error) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String((error && error.message) || error) }))
      }
    },
  })

  // 新建目录
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dshm-mkdir',
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://x')
        const base = u.searchParams.get('path') || '/'
        const name = u.searchParams.get('name') || ''
        if (!name || /[\\/]/.test(name)) throw new Error('非法目录名')
        const full = join(resolve(base), name)
        mkdirSync(full, { recursive: false })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, path: full }))
      } catch (error) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String((error && error.message) || error) }))
      }
    },
  })

  // 禁用 session log(仅一个插件: @deepseek-ai/dsh-session-log-export, id: session-log-download)
  // 机制: 经 ctx.loader 热切换 entry.options.disabled —— 运行时即时生效(dispose/init) + 持久化(tree.write)
  // 不需要重启 dsh; GET 读 entry.disabled 返回当前状态
  const SESSIONLOG_ID = 'session-log-download'
  function sessionLogEntry() {
    try {
      for (const e of ctx.loader.entries()) {
        if (String(e.id).includes(SESSIONLOG_ID)) return e
      }
    } catch (e) {}
    return null
  }
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dshm-sessionlog',
    handler: async (req, res) => {
      try {
        const u = new URL(req.url, 'http://x')
        const onParam = u.searchParams.get('on')
        const entry = sessionLogEntry()
        if (onParam === null) {
          // GET: 查询状态(entry 不存在 = 未挂载 = 视为启用中 disabled=false)
          const disabled = entry ? !!entry.disabled : false
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, disabled }))
          return
        }
        const on = onParam === '1' || onParam === 'true'
        if (!entry) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: '未找到插件条目 ' + SESSIONLOG_ID }))
          return
        }
        if (on !== !!entry.disabled) {
          // 热切换: 运行时卸载/启动 + 持久化到 profile patch
          await entry.update({ disabled: on })
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, disabled: on, needsRestart: false }))
      } catch (error) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String((error && error.message) || error) }))
      }
    },
  })

}

export { name, inject, apply }
