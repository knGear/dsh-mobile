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

function readFlag() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
      return data.progressSummary === true
    }
  } catch (e) { /* 忽略 */ }
  return false
}
function writeFlag(on) {
  try { writeFileSync(STATE_FILE, JSON.stringify({ progressSummary: on === true })) } catch (e) { /* 忽略 */ }
}

function broadcast(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64')
  const cmd = `am broadcast -a com.dsh.mobile.NOTIFY -n com.dsh.mobile/.NotifyReceiver --es payload '${data}'`
  const r = spawnSync('su', ['-c', cmd], { timeout: 10000 })
  return r.status === 0 && String(r.stdout || '').includes('result=0')
}

function ongoingId(sessionId) {
  let h = 0
  const s = String(sessionId || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return ONGOING_BASE + (h % 900000)
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
  let progressOn = readFlag() // 通知内容强化开关(默认关)

  // ── 1) notify 工具 ─────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'notify',
    description: 'Send an Android system notification through the DSH shell APK (com.dsh.mobile). Use it to alert the user when a long-running task finishes, a goal is reached, or attention is needed. The notification appears in the Android notification shade; tapping it opens the shell (optionally at a specific URL).',
    parameters: {
      title: { type: 'string', required: true, description: 'Notification title (short).' },
      body: { type: 'string', required: true, description: 'Notification body text.' },
      url: { type: 'string', description: 'Optional URL to open when the notification is tapped. Defaults to the dsh web home.' }
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
      const data = { title: args.title, body: args.body }
      if (args.url) data.url = args.url
      const ok = broadcast(data)
      return { ok, message: ok ? args.title : 'broadcast 失败' }
    }
  }))

  // ── 2) 内容强化开关路由 ────────────────────────────────────
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-progress-summary',
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1')
        if (req.method === 'POST') {
          progressOn = u.searchParams.get('on') === '1'
          writeFlag(progressOn)
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, on: progressOn }))
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

  // 捕获用户/助手消息文本
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
        return
      }
      if (status === 'idle') {
        const st = state.get(sid)
        if (st) st.running = false
        broadcast({ id: ongoingId(sid), cancel: true })
        if (notified.has(sid)) { notified.delete(sid); return }
        const tool = st && st.lastTool
        if (tool === 'ask_user_question') {
          const q = st.lastArgs && st.lastArgs.questions && st.lastArgs.questions[0]
          const text = (q && (q.question || q.header)) || ''
          broadcast({ title: `${titleOf(agent)}-提问`, body: clamp(text, 100) || '等你回复', url: sessionUrl(sid) })
        } else {
          const gen = epoch.get(sid) || 0
          void (async () => {
            // 强化开: AI 摘要; 关: todo 兜底
            const summary = progressOn ? await generateSummary(sid, agent) : ''
            if ((epoch.get(sid) || 0) !== gen) return
            const body = summarize(summary) || todoText(st) || '已完成'
            broadcast({ title: `${titleOf(agent)}-完成`, body, url: sessionUrl(sid) })
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
      notified.add(sid)
      broadcast({ id: ongoingId(sid), cancel: true })
      broadcast({ title: `${titleOf(agent)}-故障`, body: errorCode(error), url: sessionUrl(sid) })
    } catch (e) { /* 忽略 */ }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    try {
      const sid = agent?.id
      if (!sid) return
      const st = state.get(sid)
      if (st) st.running = false
      broadcast({ id: ongoingId(sid), cancel: true })
    } catch (e) { /* 忽略 */ }
  })

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
}

export { name, inject, apply }
