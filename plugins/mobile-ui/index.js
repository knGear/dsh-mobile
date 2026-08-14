import { defineTool } from '@deepseek-ai/dsh-tools'
import { spawn, spawnSync } from 'node:child_process'

const name = 'mobile-ui'
const inject = ['webServer', 'tools']

const RESTART_SCRIPT = '/data/data/com.termux/files/usr/bin/dsh-web-restart'
const ORIGINAL_URL = 'http://127.0.0.1:3080/?plain=1'

function apply(ctx) {
  // 重启 dsh web: 客户端(侧栏按钮 + 移动设置重启条目) fetch POST /api/dsh-restart
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-restart',
    handler: (_req, res) => {
      try {
        const child = spawn('bash', [RESTART_SCRIPT], { detached: true, stdio: 'ignore' })
        child.unref()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, message: String(error) }))
      }
    },
  })

  // 拉起外部浏览器打开原版 webui(带 ?plain=1, mobile-ui 跳过注入)
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

  // 供 agent 调用的重启工具: 延迟 6s 触发, 让本回复先送达持久化, 再杀进程重启
  ctx.tools.register(defineTool({
    name: 'restart',
    description: '重启 dsh web 后端（会话短暂中断，约 6 秒后生效并自动恢复）。用户明确要求重启服务时使用。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true }
        }
      },
      render: (_args, value) => [{ type: 'text', text: value.message }]
    },
    execute() {
      try {
        const child = spawn('bash', ['-c', `sleep 6; ${RESTART_SCRIPT}`], { detached: true, stdio: 'ignore' })
        child.unref()
        return { ok: true, message: '已触发重启，约 6 秒后生效，稍后自动重连' }
      } catch (error) {
        return { ok: false, message: `重启失败: ${error}` }
      }
    }
  }))
}

export { name, inject, apply }
