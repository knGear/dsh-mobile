// dsh-mobile-ui host 侧 — 移动设置面板所需端点(仅壳内使用, 不影响 dsh 本体行为)
//
// 职责边界: 本插件只做移动适配(移动设置面板/目录选择器/session log 开关)。
//           无任何 restart/reload/update 能力 —— 在 dsh 内杀进程/跑更新太危险,
//           维护(启停/更新/修复)全部收敛到 APK 引导页完成, 只对本机实例负责。
//           (曾有的 /api/dsh-update、/api/dsh-update-log、/api/dshm-versions 已删)
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const name = 'dsh-mobile-ui'
const inject = ['webServer', 'loader']

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
