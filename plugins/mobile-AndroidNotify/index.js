import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const name = 'mobile-AndroidNotify'
const inject = ['tools', 'webServer']

const ONGOING_BASE = 1000

// 通知内容强化开关状态文件(本插件目录, 跨重启持久)
const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'state.json')

function readState() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
      if (data && typeof data === 'object') return data
    }
  } catch (e) { /* 忽略 */ }
  return {}
}
function writeState(s) {
  try { writeFileSync(STATE_FILE, JSON.stringify(s)) } catch (e) { /* 忽略 */ }
}

// 通知声音开关(模块级, 广播时注入渠道; 默认开)
let soundEnabled = true

function broadcast(payload) {
  const p = { ...payload }
  // 结果横幅(非 ongoing/cancel)按声音开关选渠道: 有声 dsh_notify_v2 / 静音 dsh_notify_silent
  if (!p.ongoing && !p.cancel) {
    p.channel = soundEnabled ? 'dsh_notify_v2' : 'dsh_notify_silent'
  }
  const data = Buffer.from(JSON.stringify(p)).toString('base64')
  // Android 14+ 的 am broadcast 不再等待结果(帮助文档明示 exit code 恒为 0),
  // stdout 永远没有 "result=0", 无法从输出判断成败。因此:
  // ① 先确认壳应用已安装(pm path 校验真实存在, 这是最主要的失败场景);
  // ② 加 --include-stopped-packages, 应用处于 stopped 态(强停/重启未打开)也能收到;
  // ③ 发送进程退出码 0 视为成功(解析/权限错误会以非 0 退出)。
  const pkg = spawnSync('pm', ['path', 'com.dsh.mobile'], { timeout: 10000 })
  if (pkg.status !== 0 || !String(pkg.stdout || '').includes('base.apk')) return false
  const direct = spawnSync('am', ['broadcast', '--include-stopped-packages', '-a', 'com.dsh.mobile.NOTIFY', '-n', 'com.dsh.mobile/.NotifyReceiver', '--es', 'payload', data], { timeout: 10000 })
  if (direct.status === 0) return true
  const cmd = `am broadcast --include-stopped-packages -a com.dsh.mobile.NOTIFY -n com.dsh.mobile/.NotifyReceiver --es payload '${data}'`
  const r = spawnSync('su', ['-c', cmd], { timeout: 10000 })
  return r.status === 0
}

function ongoingId(sessionId) {
  let h = 0
  const s = String(sessionId || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return ONGOING_BASE + (h % 900000)
}

// 结果横幅通知 id(与常驻不同号段, 互不覆盖): 同一会话的新横幅覆盖旧横幅,
// 保证"每个对话最多一个通知"(三轮问答 = 三条横幅堆叠 → 旧销新替)
const NOTIFY_BASE = 2000000
function notifyId(sessionId) {
  let h = 0
  const s = String(sessionId || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return NOTIFY_BASE + (h % 900000)
}

function sessionUrl(sessionId) {
  return `http://127.0.0.1:3080/?session=${encodeURIComponent(sessionId)}`
}

function clamp(s, n) {
  return String(s || '').slice(0, n)
}

function summarize(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > 15 ? t.slice(0, 15) + '…' : t
}

function errorCode(error) {
  try {
    if (error && typeof error === 'object') {
      const c = error.status ?? error.statusCode ?? error.code
      if (typeof c === 'number' || (typeof c === 'string' && /^\d+$/.test(c))) return String(c)
    }
    const msg = error instanceof Error ? error.message : String(error)
    const m = msg.match(/\b(\d{3})\b/)
    if (m) return m[1]
    return (msg || '未知错误').slice(0, 120)
  } catch (e) { return '未知错误' }
}

function textOf(event) {
  try {
    const data = event && event.data
    const msg = data && (data.message || data)
    const content = msg && msg.content
    if (Array.isArray(content)) {
      const parts = []
      for (let i = 0; i < content.length; i++) {
        const b = content[i]
        if (b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
      }
      return parts.join(' ').trim()
    }
    return ''
  } catch (e) { return '' }
}

function apply(ctx) {
  const sessionTitle = ctx.get('sessionTitle')
  const llm = ctx.get('llm')
  const agentDefaultModel = ctx.get('agentDefaultModel')
  const timer = ctx.get('timer')
  let progressOn = readState().progressSummary === true // 通知内容强化(默认关)

  // 结果横幅统一出口: 系统通知(broadcast) + 页面内浮窗事件(click 跳会话)
  // kind: complete/question/truncated/error/tool
  // 注意: 必须 return broadcast 的结果 — notify 工具靠它判断发送成败(ok 字段)
  function banner(payload) {
    const ok = broadcast(payload)
    try {
      ctx.emit('dsh-notify/banner', {
        sessionId: payload.sessionId,
        kind: payload.kind,
        title: payload.title,
        body: payload.body,
        url: payload.url
      })
    } catch (e) { /* 忽略 */ }
    return ok
  }
  soundEnabled = readState().sound !== false // 通知声音/震动(默认开)

  // ── 1) notify 工具 ─────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'notify',
    description: [
      '向 Android 手机发送系统通知（经 dsh-mobile 壳显示在通知栏，点按打开 dsh）。适合主动提醒用户的场景：',
      '- 长任务/后台任务完成、到达关键节点、或中途需要用户注意时',
      '- 达成目标、需要用户回来操作、或用户可能没在看屏幕时',
      '调用要点：',
      '- title：简短标题（尽量 ≤15 字，直接说明事件，如"备份完成-进行中"）',
      '- body：正文第一行写最关键结论，再补充少量细节；不要贴大段代码或日志',
      '- url：可选，点按通知跳转的地址；默认打开 dsh 主页',
      '- 同一任务只在状态变化时发，不要频繁重复发送以免打扰',
    ].join('\n'),
    parameters: {
      title: { type: 'string', required: true, description: '通知标题(简短, ≤15 字)。' },
      body: { type: 'string', required: true, description: '通知正文(第一行写关键结论)。' },
      url: { type: 'string', description: '可选: 点按通知跳转的 URL, 默认 dsh 主页。' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok ? `通知已发送: ${value.message}` : `通知发送失败: ${value.message}`
      }]
    },
    execute(args) {
      const data = { title: args.title, body: args.body, kind: 'tool' }
      if (args.url) data.url = args.url
      const ok = banner(data)
      return { ok, message: ok ? args.title : 'broadcast 失败' }
    }
  }))

  // ── 2) 内容强化 + 声音开关路由 ─────────────────────────────
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-progress-summary',
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1')
        if (req.method === 'POST') {
          progressOn = u.searchParams.get('on') === '1'
          writeState({ progressSummary: progressOn, sound: soundEnabled })
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, on: progressOn }))
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false }))
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-notify-settings',
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1')
        if (req.method === 'POST') {
          soundEnabled = u.searchParams.get('sound') === '1'
          writeState({ progressSummary: progressOn, sound: soundEnabled })
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, sound: soundEnabled }))
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false }))
      }
    },
  })

  // ── 3) 生命周期感知 ────────────────────────────────────────
  const state = new Map()
  const notified = new Set()
  const lastUser = new Map()

  // 会话状态面板数据: 运行中集合(置顶) + 最近完成队列(上限 5, 点击即移除)
  const runningSessions = new Map() // sid → title
  const doneSessions = [] // [{sid, title}]

  function sessionsSnapshot() {
    return {
      running: [...runningSessions.entries()].map(([sid, title]) => ({ sessionId: sid, title })),
      done: doneSessions.map((d) => ({ sessionId: d.sid, title: d.title }))
    }
  }
  function emitSessions() {
    try { ctx.emit('dsh-notify/sessions', sessionsSnapshot()) } catch (e) { /* 忽略 */ }
  }
  function markDone(sid, agent) {
    if (!runningSessions.has(sid)) return
    runningSessions.delete(sid)
    try {
      doneSessions.unshift({ sid, title: titleOf(agent) })
      if (doneSessions.length > 5) doneSessions.length = 5
    } catch (e) { /* 忽略 */ }
    emitSessions()
  }

  // 状态快照路由: GET 拉取 / POST ?removeDone=<sid> 移除完成项(点击即消失)
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-session-status',
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1')
        if (req.method === 'POST') {
          const sid = u.searchParams.get('removeDone')
          if (sid) {
            const i = doneSessions.findIndex((d) => d.sid === sid)
            if (i >= 0) doneSessions.splice(i, 1)
          }
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(sessionsSnapshot()))
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false }))
      }
    },
  })
  const lastAssistant = new Map()
  const epoch = new Map()
  const agents = ctx.get('agents')
  const isRoot = (sid) => !agents || agents.roots().some((a) => a.id === sid)

  function ensure(sid) {
    let st = state.get(sid)
    if (!st) {
      st = { running: false, lastTool: null, lastArgs: null, todo: null, startedAt: 0, agent: null, lastSummary: '' }
      state.set(sid, st)
    }
    return st
  }

  function titleOf(agent) {
    try {
      if (sessionTitle && agent && agent.session) {
        const t = sessionTitle.get(agent.session)
        if (t && t.title) return String(t.title).slice(0, 15)
      }
    } catch (e) { /* 忽略 */ }
    return '新对话'
  }

  function todoOf(args) {
    if (!args || !Array.isArray(args.todos) || args.todos.length === 0) return null
    const todos = args.todos
    const done = todos.filter((t) => t && t.status === 'completed').length
    const cur = todos.find((t) => t && t.status === 'in_progress')
      || todos.find((t) => t && t.status === 'pending')
    return { total: todos.length, done, current: (cur && cur.content) || null }
  }

  function todoText(st) {
    return st && st.todo ? `${st.todo.done}/${st.todo.total} ${st.todo.current || '处理中'}` : null
  }

  // 运行时间(分钟)前缀
  function timePrefix(st) {
    if (!st || !st.startedAt) return ''
    const mins = Math.floor((Date.now() - st.startedAt) / 60000)
    return mins >= 1 ? `${mins}分钟 ` : ''
  }

  // 常驻正文: 运行时间 + (强化开→AI内容 / 强化关→todo)
  function ongoingBody(sid) {
    const st = state.get(sid)
    if (!st) return '处理中…'
    const t = timePrefix(st)
    if (progressOn && st.lastSummary) return t + st.lastSummary
    return t + (todoText(st) || '处理中…')
  }

  function postOngoing(sid) {
    const st = state.get(sid)
    if (!st) return
    broadcast({
      id: ongoingId(sid),
      title: `${titleOf(st.agent)}-进行中`,
      body: ongoingBody(sid),
      url: sessionUrl(sid),
      ongoing: true
    })
  }

  function modelOf(agent) {
    try {
      if (agent && agent.options && agent.options.provider && agent.options.model) {
        return { provider: agent.options.provider, model: agent.options.model }
      }
      if (agentDefaultModel) {
        const sel = agentDefaultModel.currentSelection()
        if (sel && sel.provider && sel.model) return { provider: sel.provider, model: sel.model }
      }
    } catch (e) { /* 忽略 */ }
    return null
  }

  async function llmSummarize(sid, agent, prompt) {
    try {
      const model = modelOf(agent)
      if (!model || !llm) return ''
      const msg = createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })
      const stream = llm.stream({
        provider: model.provider,
        model: model.model,
        messages: [msg],
        sessionId: sid,
        signal: AbortSignal.timeout(15000),
        purpose: 'session-title',
      })
      let text = ''
      for await (const chunk of stream) {
        if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      }
      return text.replace(/\s+/g, ' ').trim()
    } catch (e) { return '' }
  }

  // 结束时摘要: 概括上一段对话
  async function generateSummary(sid, agent) {
    const userText = lastUser.get(sid) || ''
    const assistantText = lastAssistant.get(sid) || ''
    const content = [userText, assistantText].filter(Boolean).join('\n')
    if (!content) return ''
    return llmSummarize(sid, agent, `用不超过15个字概括下面这段对话的主要内容，只输出概括，不要标点符号：\n${content}`)
  }

  // 过程中摘要: 概括当前进度
  async function generateStepSummary(sid, agent, todo, tool) {
    const parts = []
    if (todo && todo.current) parts.push(`任务「${todo.current}」${todo.done}/${todo.total}`)
    if (tool && tool !== 'todo_write') parts.push(`刚执行了 ${tool}`)
    if (parts.length === 0) return ''
    return llmSummarize(sid, agent, `用不超过15个字概括当前进度，只输出进度描述，不要标点：\n${parts.join('，')}`)
  }

  const lastGenAt = new Map()
  const genBusy = new Map()
  function scheduleProgressRefresh(sid, agent) {
    if (!progressOn) return // 强化关: 不生成 AI 内容
    const now = Date.now()
    if (now - (lastGenAt.get(sid) || 0) < 6000) return
    if (genBusy.get(sid)) return
    lastGenAt.set(sid, now)
    genBusy.set(sid, true)
    void (async () => {
      try {
        const st = state.get(sid)
        const sentence = await generateStepSummary(sid, agent, st && st.todo, st && st.lastTool)
        if (!st || !st.running) return
        if (sentence) {
          st.lastSummary = summarize(sentence)
          postOngoing(sid)
        }
      } catch (e) { /* 忽略 */ }
      finally { genBusy.delete(sid) }
    })()
  }

  // 捕获用户/助手消息文本 + finish 原因(区分 手动暂停/截断/正常完成)
  const paused = new Map()    // sid → true: 用户手动暂停(aborted)
  const truncated = new Map() // sid → true: 输出截断(max-tokens)
  ctx.on('session/event', (session, event) => {
    try {
      const sid = session && session.id
      if (!sid || !event) return
      if (event.type === 'assistant/message') {
        const text = textOf(event)
        if (text) lastAssistant.set(sid, text)
      } else if (event.type === 'user/message') {
        const data = event.data
        if (data && data.source && data.source.kind === 'user') {
          const text = textOf(event)
          if (text) lastUser.set(sid, text)
        }
      } else if (event.type === 'finish') {
        const kind = event.data && event.data.reason && event.data.reason.kind
        if (kind === 'aborted') paused.set(sid, true)
        else if (kind === 'max-tokens') truncated.set(sid, true)
      }
    } catch (e) { /* 忽略 */ }
  })

  ctx.on('tools/result', (exec) => {
    try {
      const sid = exec?.agent?.id
      const nm = exec?.name
      if (!sid || !nm) return
      const st = ensure(sid)
      st.lastTool = nm
      if (exec.arguments !== undefined) st.lastArgs = exec.arguments
      if (nm === 'todo_write') {
        const t = todoOf(exec.arguments)
        if (t) {
          st.todo = t
          if (st.running) postOngoing(sid)
        }
      }
      if (st.running) scheduleProgressRefresh(sid, exec.agent)
    } catch (e) { /* 忽略 */ }
  })

  ctx.on('agent/status', ({ agent, status }) => {
    try {
      const sid = agent?.id
      if (!sid) return
      if (status === 'running') {
        if (!isRoot(sid)) return
        const st = ensure(sid)
        st.running = true
        st.startedAt = Date.now()
        st.agent = agent
        st.lastTool = null
        st.lastArgs = null
        st.lastSummary = ''
        epoch.set(sid, (epoch.get(sid) || 0) + 1)
        notified.delete(sid)
        postOngoing(sid)
        runningSessions.set(sid, titleOf(agent))
        emitSessions()
        return
      }
      if (status === 'idle') {
        const st = state.get(sid)
        if (st) st.running = false
        broadcast({ id: ongoingId(sid), cancel: true })
        markDone(sid, agent)
        // 手动暂停(aborted): 注销常驻, 什么都不发
        if (paused.has(sid)) { paused.delete(sid); return }
        // 截断(max-tokens): 注销常驻 + 截断横幅
        if (truncated.has(sid)) {
          truncated.delete(sid)
          if (notified.has(sid)) { notified.delete(sid); return }
          banner({
            id: notifyId(sid),
            sessionId: sid,
            kind: 'truncated',
            title: `${titleOf(agent)}-截断`,
            body: '达到输出上限已截断，发送"继续"可接着输出',
            url: sessionUrl(sid)
          })
          return
        }
        if (notified.has(sid)) { notified.delete(sid); return }
        const tool = st && st.lastTool
        if (tool === 'ask_user_question') {
          const q = st.lastArgs && st.lastArgs.questions && st.lastArgs.questions[0]
          const text = (q && (q.question || q.header)) || ''
          banner({ id: notifyId(sid), sessionId: sid, kind: 'question', title: `${titleOf(agent)}-提问`, body: clamp(text, 100) || '等你回复', url: sessionUrl(sid) })
        } else {
          const gen = epoch.get(sid) || 0
          void (async () => {
            // 强化开: AI 摘要; 关: todo 兜底
            const summary = progressOn ? await generateSummary(sid, agent) : ''
            if ((epoch.get(sid) || 0) !== gen) return
            const body = summarize(summary) || todoText(st) || '已完成'
            banner({ id: notifyId(sid), sessionId: sid, kind: 'complete', title: `${titleOf(agent)}-完成`, body, url: sessionUrl(sid) })
          })()
        }
      }
    } catch (e) { /* 忽略 */ }
  })

  ctx.on('agent/error', ({ agent, error }) => {
    try {
      const sid = agent?.id
      if (!sid) return
      const st = state.get(sid)
      if (st) st.running = false
      paused.delete(sid)
      truncated.delete(sid)
      notified.add(sid)
      broadcast({ id: ongoingId(sid), cancel: true })
      markDone(sid, agent)
      banner({ id: notifyId(sid), sessionId: sid, kind: 'error', title: `${titleOf(agent)}-故障`, body: errorCode(error), url: sessionUrl(sid) })
    } catch (e) { /* 忽略 */ }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    try {
      const sid = agent?.id
      if (!sid) return
      const st = state.get(sid)
      if (st) st.running = false
      paused.delete(sid)
      truncated.delete(sid)
      broadcast({ id: ongoingId(sid), cancel: true })
      markDone(sid, agent)
    } catch (e) { /* 忽略 */ }
  })

  // ── 心跳: 每 15s 广播一次(不显示通知, 壳离线页标题据此判断本机 dsh 是否在运行) ──
  // instance 自报: Termux 原生无 /etc/os-release → termux; proot 读 os-release ID → termux-linux:debian
  let heartbeatInstance = 'termux'
  try {
    const osr = readFileSync('/etc/os-release', 'utf8')
    const m = /^ID=(.+)$/m.exec(osr)
    if (m) heartbeatInstance = 'termux-linux:' + m[1].trim().replace(/^"|"$/g, '')
  } catch (e) { /* Termux 原生无 os-release */ }
  const HEARTBEAT_MS = 15000
  const heartbeatTimer = setInterval(() => {
    try { broadcast({ heartbeat: true, instance: heartbeatInstance }) } catch (e) { /* 忽略 */ }
  }, HEARTBEAT_MS)
  // 立即发一次(让壳快速知道状态), 并确保 timer 清理
  try { broadcast({ heartbeat: true, instance: heartbeatInstance }) } catch (e) { /* 忽略 */ }
  ctx.effect(() => () => { try { clearInterval(heartbeatTimer) } catch (e) { /* 忽略 */ } })

  // 每分钟刷新运行中会话的运行时间
  if (timer) {
    ctx.effect(() => timer.interval(() => {
      try {
        for (const [sid, st] of state) {
          if (st.running && isRoot(sid)) postOngoing(sid)
        }
      } catch (e) { /* 忽略 */ }
    }, 60000))
  }

  // 插件卸载/dsh 重启兜底: 取消所有运行中的常驻通知, 防止通知栏残留
  ctx.effect(() => () => {
    try {
      for (const [sid, st] of state) {
        if (st && st.running) broadcast({ id: ongoingId(sid), cancel: true })
      }
    } catch (e) { /* 忽略 */ }
  })
}

export { name, inject, apply }
