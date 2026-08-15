// mobile-ui 客户端 bundle(手写, 与 dsh client bundle 格式一致)
// 1. 侧栏脚部齿轮旁: "重启 dsh" 按钮 (sidebar.footer.action)
// 2. 设置-移动端 选项卡 (settings.section):
//      连接地址 / 通知内容强化 / 重启 dsh / 安全模式(纯净模式 + 原版 webui)
// 默认全面屏; 侧栏抽屉覆盖对话, 点击正文收起
// 布局钩子只用稳定语义锚点, 不依赖上游 hash 类名
window.__ModuleLoader__.load({
  id: 'mobile-ui',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var name = 'mobile-ui'
    var inject = ['slots', 'layout', 'sessions']

    var KEY_HOST = 'dsh.host'
    var KEY_PURE = 'dsh.pure'
    var DEFAULT_HOST = '127.0.0.1:3080'

    // 设置面板竖屏适配(始终生效): 左导航栏压缩 + 通用设置文本/按钮上下布局
    var SETTINGS_CSS = [
      // 导航栏 188px → 116px, 给右侧正文更多宽度
      '[role="dialog"][aria-modal="true"] > nav{width:116px !important;padding:16px 8px 0 !important;gap:10px !important}',
      // 通用设置行: 横排(文本左+按钮右) → 上下布局(文本上, 按钮下全宽)
      '[data-slot="settings.general.item"] > *{flex-direction:column !important;align-items:stretch !important;gap:10px !important}',
      '[data-slot="settings.general.item"] > * > *:first-child{padding-right:0 !important}',
      // agent 预设卡片: 窄屏单列自适应(不横向溢出) + 内容防溢出换行
      '.dsh-cp-cards{grid-template-columns:repeat(auto-fill,minmax(min(100%,268px),1fr)) !important}',
      '@media (max-width:600px){.dsh-cp-cards{grid-template-columns:1fr !important}}',
      '.dsh-cp-cardmain{padding:10px 10px 8px !important}',
      '.dsh-cp-cards>li{min-width:0 !important;max-width:100% !important}',
      '.dsh-cp-cardmain,.dsh-cp-cardmain *{min-width:0 !important;max-width:100% !important;overflow-wrap:anywhere !important}',
      // agent 预设标题: 强制不折叠, 溢出可见
      '[data-slot="settings.section"] h2{white-space:nowrap !important;overflow:visible !important}',
      '[role="dialog"][aria-modal="true"] nav button span{white-space:nowrap !important;overflow:visible !important}',
      // ── 顶部 header 三行版: 第一行标题 / 第二行原版按钮(除 session log) / 第三行 tabs + 活动任务管理器 ──
      // 标题禁省略完整显示; session log 隐藏; tabs 下移 44px 给第二行腾空间; actions/utilities absolute 到第二行(左/右)
      // 活动按钮 containing block 是 utilities(absolute), 相对偏移 top:42px + translateY(-10px) 落到第三行右侧
      '[data-slot="conversation.session.header"] header nav{overflow:visible !important;white-space:normal !important}',
      '[data-slot="conversation.session.header"] header nav button{max-width:none !important;overflow:visible !important}',
      '[data-slot="conversation.session.header"] header button[class*="sessionLogButton"]{display:none !important}',
      '[data-slot="conversation.session.header"] header:has([role="tablist"]) [role="tablist"]{margin-top:44px !important}',
      '[data-slot="conversation.session.header"] header:has([role="tablist"]) > div:first-child > div:first-child > div:nth-child(2){position:absolute !important;top:48px !important;left:20px !important;z-index:2 !important}',
      '[data-slot="conversation.session.header"] header:has([role="tablist"]) > div:first-child > div:nth-child(2){position:absolute !important;top:48px !important;right:20px !important;z-index:2 !important}',
      '[data-slot="conversation.session.header"] header:has([role="tablist"]) .dsh-activity-wrap{position:absolute !important;top:42px !important;right:0 !important;bottom:auto !important;z-index:2 !important;transform:translateY(-10px) !important}',
      // ── 活动任务管理器样式: 入口气泡 x/y + 面板(运行中转圈/绿黄点+标题, ✕标记已读) ──
      '.dsh-activity-wrap{position:relative;display:inline-flex;align-items:center}',
      '.dsh-activity-btn{display:inline-flex !important;align-items:center;gap:2px;height:22px !important;padding:0 6px !important;border-radius:11px !important;border:1px solid var(--dsw-alias-border-l1,#2a2a36) !important;background:var(--dsw-alias-bg-layer-1,#16161f) !important;color:inherit;font-size:10px;line-height:1;cursor:pointer;font-variant-numeric:tabular-nums}',
      '.dsh-activity-btn:disabled{opacity:.45;cursor:default}',
      '.dsh-activity-x{display:inline-flex;align-items:center;gap:2px;color:var(--dsw-static-deepseek-450,#4f7cff)}',
      '.dsh-activity-sep{color:var(--dsw-alias-label-tertiary,#888)}',
      '.dsh-activity-y{color:var(--dsw-alias-state-success-primary,#4caf50)}',
      '@keyframes dsh-activity-rot{to{transform:rotate(360deg)}}',
      '.dsh-activity-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:9999;min-width:220px;max-width:min(320px,calc(100vw - 24px));max-height:60vh;overflow-y:auto;background:var(--dsw-alias-bg-layer-2,#1a1a24);border:1px solid var(--dsw-alias-border-l1,#2a2a36);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45);padding:8px;text-align:left}',
      '.dsh-activity-group+.dsh-activity-group{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,#2a2a36)}',
      '.dsh-activity-group-title{font-size:11px;color:var(--dsw-alias-label-tertiary,#888);margin-bottom:4px}',
      '.dsh-activity-item{display:flex;align-items:center;gap:6px;padding:6px;border-radius:8px;cursor:pointer;min-width:0}',
      '.dsh-activity-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.dsh-activity-item.running .dsh-activity-spin{width:10px !important;height:10px !important;border:2px solid var(--dsw-static-deepseek-450,#4f7cff);border-top-color:transparent;border-radius:50%;animation:dsh-activity-rot .8s linear infinite;flex:none}',
      '.dsh-activity-item.done .dsh-activity-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#4caf50);flex:none}',
      '.dsh-activity-item.warn .dsh-activity-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#ffb74d);flex:none}',
      '.dsh-activity-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-primary,#e6e6ef)}',
      '.dsh-activity-dismiss{flex:none;border:none;background:none;color:var(--dsw-alias-label-tertiary,#888);font-size:12px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:6px}',
      '.dsh-activity-dismiss:hover{color:#e06c6c;background:rgba(224,108,108,.12)}',
    ].join('\n')

    // ── 存储 ────────────────────────────────────────────────

    function getStored(key, dflt) {
      try {
        var v = localStorage.getItem(key)
        return v === null ? dflt : v
      } catch (e) { return dflt }
    }
    function setStored(key, value) {
      try { localStorage.setItem(key, value) } catch (e) { /* 忽略 */ }
    }
    function numStored(key, dflt) {
      var n = parseInt(getStored(key, String(dflt)), 10)
      return isNaN(n) ? dflt : n
    }

    function findFrame() {
      // 拖拽手柄 data-side="sidebar"/"details" 唯一标识 frame(避免 Tooltip 的 data-side=top/bottom 误匹配)
      var handle = document.querySelector('[data-side="sidebar"], [data-side="details"]')
      if (handle && handle.parentElement) return handle.parentElement
      return document.querySelector('[data-sidebar-collapsed], [data-details-collapsed]') || null
    }

    // 安全区改由壳层原生 insets 处理(见 MainActivity.setOnApplyWindowInsetsListener):
    // WebView 视口已自动避开状态栏/手势条/挖孔, 此处不再做 JS 内边距, 避免双重内缩。
    // (历史: 曾用 AndroidShell.getSafeArea + env() 探针给 frame 加 padding, 已废弃)

    // 统一底色: 读 frame 实际背景色(如 rgb(21,21,23) → #151517)上报壳层,
    // 使上下安全区与内容底色一致, 支持深/浅主题切换。
    var lastBg = null
    function syncBackgroundColor() {
      try {
        if (typeof AndroidShell === 'undefined' || !AndroidShell.setBackgroundColor) return
        var frame = findFrame()
        var el = frame || document.body
        if (!el) return
        var c = getComputedStyle(el).backgroundColor
        if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return
        var m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
        if (!m) return
        var hex = '#' + [m[1], m[2], m[3]].map(function (n) {
          var s = parseInt(n, 10).toString(16)
          return s.length === 1 ? '0' + s : s
        }).join('')
        if (hex !== lastBg) {
          lastBg = hex
          AndroidShell.setBackgroundColor(hex)
        }
      } catch (e) { /* 忽略 */ }
    }

    function applyLayout() {
      syncBackgroundColor()
      tagAgentPresets()
      fixAgentPresetTitle()
      applySidebarOverlay()
    }

    // agent 预设标题: "Agent 预设" → "Agent预设"(删中间空格)
    function fixAgentPresetTitle() {
      try {
        var targets = document.querySelectorAll(
          '[data-slot="settings.section"] h2, [role="dialog"][aria-modal="true"] nav button span'
        )
        for (var i = 0; i < targets.length; i++) {
          if (targets[i].textContent === 'Agent 预设') targets[i].textContent = 'Agent预设'
        }
      } catch (e) { /* 忽略 */ }
    }

    // ── 侧栏抽屉化: 展开时覆盖对话(对话不压缩), 收起时还原 ─────

    var overlayState = { active: false, width: null, details: null }

    // ── 侧栏展开时: 一个不可见按钮盖住正文, 点击 = 收起侧栏 ────
    // 用 <button> 而非 div: 语义化可点击元素(可聚焦/无障碍); 透明无样式;
    // z35 低于侧栏(z40), 侧栏及其切换钮始终可点; 点击走官方 layout.toggleSidebar()
    var MASK_ID = 'dsh-sidebar-mask'

    function showMask(frame) {
      try {
        var m = document.getElementById(MASK_ID)
        if (!m) {
          m = document.createElement('button')
          m.id = MASK_ID
          m.type = 'button'
          m.setAttribute('aria-label', '收起侧边栏')
          m.style.cssText =
            'position:absolute;inset:0;z-index:35;background:transparent;border:none;' +
            'padding:0;margin:0;outline:none;cursor:pointer;-webkit-tap-highlight-color:transparent;'
          m.addEventListener('click', function (e) {
            e.preventDefault()
            e.stopPropagation()
            collapseSidebar()
          })
        }
        if (m.parentElement !== frame) frame.appendChild(m)
      } catch (e) { /* 忽略 */ }
    }

    function hideMask() {
      try {
        var m = document.getElementById(MASK_ID)
        if (m) m.remove()
      } catch (e) { /* 忽略 */ }
    }

    function applySidebarOverlay() {
      try {
        var frame = findFrame()
        if (!frame) return
        var sidebarCol = frame.firstElementChild
        var centerCol = frame.children[1]
        var detailsCol = frame.children[2]
        if (!sidebarCol || !centerCol) return
        var expanded = !frame.hasAttribute('data-sidebar-collapsed')

        if (expanded) {
          // 首次进入展开态时, 从 grid 首列读原始宽度(尾列 = 详情列)
          if (!overlayState.active) {
            var tokens = (frame.style.gridTemplateColumns || '').split(' ').filter(Boolean)
            overlayState.width = tokens[0] || '240px'
            overlayState.details = tokens[tokens.length - 1] || '0px'
            overlayState.active = true
          }
          // 侧栏列置 0; 侧栏脱离流(abs 覆盖), 显式把正文/详情钉回各自轨道, 否则自动排位会挤进 0px 轨
          // 安全区已由壳层原生 insets 处理(WebView 视口已避开状态栏/手势条), 侧栏铺满 frame 即可
          frame.style.gridTemplateColumns = '0px minmax(0, 1fr) ' + overlayState.details
          sidebarCol.style.position = 'absolute'
          sidebarCol.style.left = '0'
          sidebarCol.style.top = '0'
          sidebarCol.style.bottom = '0'
          sidebarCol.style.width = overlayState.width
          sidebarCol.style.zIndex = '40'
          sidebarCol.style.boxShadow = '0 0 24px rgba(0,0,0,0.45)'
          centerCol.style.gridColumn = '2'
          if (detailsCol) detailsCol.style.gridColumn = '3'
          showMask(frame)
        } else {
          hideMask()
          if (!overlayState.active) return
          overlayState.active = false
          overlayState.width = null
          overlayState.details = null
          // 还原侧栏定位 + 各列轨道; grid 由商店折叠时自己写回
          sidebarCol.style.position = ''
          sidebarCol.style.left = ''
          sidebarCol.style.top = ''
          sidebarCol.style.bottom = ''
          sidebarCol.style.width = ''
          sidebarCol.style.zIndex = ''
          sidebarCol.style.boxShadow = ''
          centerCol.style.gridColumn = ''
          if (detailsCol) detailsCol.style.gridColumn = ''
        }
      } catch (e) { /* 忽略 */ }
    }

    // ── 收起侧栏: 优先走官方 layout 服务(toggleSidebar, 与侧栏切换钮同一入口) ──
    // 之前是"找 logoRow 最后一个按钮模拟点击", 依赖侧栏内部结构, 降级为兜底
    var layoutCtx = null

    function collapseSidebar() {
      try {
        if (layoutCtx) {
          var layout = layoutCtx.get('layout')
          if (layout && layout.toggleSidebar) {
            layout.toggleSidebar()
            return
          }
        }
      } catch (e) { /* 忽略 */ }
      try {
        var frame = findFrame()
        if (!frame) return
        var sidebarRoot = frame.firstElementChild && frame.firstElementChild.firstElementChild
        if (!sidebarRoot) return
        var logoRow = sidebarRoot.firstElementChild
        if (!logoRow) return
        var buttons = logoRow.querySelectorAll('button')
        var btn = buttons[buttons.length - 1] // logoRow 最后一个按钮 = 折叠/展开切换钮
        if (btn) btn.click()
      } catch (e) { /* 忽略 */ }
    }

    // agent 预设卡片: 找到设置里的 grid 卡片列表, 打上自属类(自适应宽度 + 减留白)
    function tagAgentPresets() {
      try {
        var wrappers = document.querySelectorAll('[data-slot="settings.section"]')
        for (var i = 0; i < wrappers.length; i++) {
          var uls = wrappers[i].querySelectorAll('ul')
          for (var j = 0; j < uls.length; j++) {
            var ul = uls[j]
            if (getComputedStyle(ul).display !== 'grid') continue
            ul.classList.add('dsh-cp-cards')
            var lis = ul.querySelectorAll('li')
            for (var k = 0; k < lis.length; k++) {
              var first = lis[k].firstElementChild
              if (first && first.tagName === 'BUTTON') first.classList.add('dsh-cp-cardmain')
            }
          }
        }
      } catch (e) { /* 忽略 */ }
    }

    // ── 重启: 二次确认遮罩 → 确认后全屏阻断 + 3s 自动重连 ──────

    // ── 刷新前端(点击): 2.5s 全屏动画遮罩 → 保留 URL 重载(会话保持) ──
    var REFRESH_OVERLAY_ID = 'dsh-refresh-overlay'
    function refreshFrontend() {
      try {
        if (typeof document === 'undefined') return
        if (document.getElementById(REFRESH_OVERLAY_ID)) return
        var o = document.createElement('div')
        o.id = REFRESH_OVERLAY_ID
        o.style.cssText =
          'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;' +
          'background:rgba(0,0,0,0.62);font-family:sans-serif;flex-direction:column;gap:12px;'
        var t = document.createElement('div')
        t.textContent = '正在刷新…'
        t.style.cssText = 'color:#e6e6ef;font-size:15px;'
        var s = document.createElement('div')
        s.style.cssText =
          'width:28px;height:28px;border:3px solid #4f7cff;border-top-color:transparent;' +
          'border-radius:50%;animation:dsh-activity-rot .7s linear infinite;'
        o.appendChild(s)
        o.appendChild(t)
        document.body.appendChild(o)
        // 2.5s 动画后整页重载, 保留当前 URL(会话保持)
        setTimeout(function () { window.location.reload() }, 2500)
      } catch (e) { window.location.reload() }
    }

    // ── 重启后端(长按): 二次确认 → POST /api/dsh-restart → 探测重连 → 成功跳转/超时进初始页 ──
    function confirmRestart() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-restart-overlay')) return

      var overlay = document.createElement('div')
      overlay.id = 'dsh-restart-overlay'
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,0.62);font-family:sans-serif;'
      var card = document.createElement('div')
      card.style.cssText =
        'background:#1a1a24;color:#e6e6ef;padding:24px 28px;border-radius:12px;text-align:center;max-width:320px;'
      card.innerHTML =
        '<div style="font-size:15px;margin-bottom:6px">确定要重启 dsh 吗？</div>' +
        '<div style="font-size:12px;color:#8a8a99;margin-bottom:16px">重启会短暂断开，约 10 秒内自动重连</div>'

      var btnRow = document.createElement('div')
      btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;'
      var cancel = document.createElement('button')
      cancel.textContent = '取消'
      cancel.style.cssText =
        'padding:9px 18px;border-radius:8px;border:1px solid #3a3a4a;background:transparent;color:#e6e6ef;font-size:14px;cursor:pointer;'
      cancel.onclick = function () { overlay.remove() }
      var confirm = document.createElement('button')
      confirm.textContent = '确认重启'
      confirm.style.cssText =
        'padding:9px 18px;border-radius:8px;border:none;background:#e06c6c;color:#fff;font-size:14px;cursor:pointer;'

      function probeReconnect() {
        // 2s 后开始 ping, 3s 间隔最多 4 次(总 ~14s 窗口): 后端重启约 6~10s 就绪
        var tries = 0
        function ping() {
          fetch(window.location.origin + '/', { method: 'GET', cache: 'no-store' })
            .then(function (r) {
              if (r.ok) { window.location.reload() }
              else retry()
            })
            .catch(retry)
        }
        function retry() {
          tries++
          if (tries >= 4) goOfflinePage()
          else setTimeout(ping, 3000)
        }
        setTimeout(ping, 2000)
      }

      function goOfflinePage() {
        try {
          if (typeof AndroidShell !== 'undefined' && AndroidShell.showOfflinePage) {
            AndroidShell.showOfflinePage()
          } else {
            window.location.reload()
          }
        } catch (e) { window.location.reload() }
      }

      confirm.onclick = function () {
        card.innerHTML =
          '<div style="font-size:15px">正在重启 dsh…</div>' +
          '<div style="font-size:12px;color:#8a8a99;margin-top:8px">已断开，约 10 秒内自动重连</div>'
        btnRow.remove()
        fetch('/api/dsh-restart', { method: 'POST' }).catch(function () { /* 服务即将重启 */ })
        probeReconnect()
      }
      btnRow.appendChild(cancel)
      btnRow.appendChild(confirm)
      card.appendChild(btnRow)
      overlay.appendChild(card)
      document.body.appendChild(overlay)
    }


    // ── 活动任务管理器(header utilities 槽): 入口 x/y — x=运行中, y=已完成未查看 ──
    // 数据: sessions.list 快照 { ids, byId }; byId[id] = { running, completed, pendingInteraction, title, updatedAt }
    // completed 是 dsh 官方语义(完成时未选中未打开, 打开后自动清除); 点条目 sessions.open(id) 跳转
    // y 的✕=标记已读(localStorage); 0/0 禁用; 面板打开瞬间冻结快照(避免实时重排跳动), 计数实时刷新
    var ACTIVITY_DISMISS_KEY = 'dsh.activity.dismissed'
    var applyCtx = null // apply() 时注入, 供组件访问 sessions 服务

    function activityDismissed() {
      try { return JSON.parse(localStorage.getItem(ACTIVITY_DISMISS_KEY) || '[]') } catch (e) { return [] }
    }
    function activityDismiss(id) {
      try {
        var a = activityDismissed()
        if (a.indexOf(id) < 0) {
          a.push(id)
          localStorage.setItem(ACTIVITY_DISMISS_KEY, JSON.stringify(a))
        }
      } catch (e) { /* 忽略 */ }
    }

    function ActivityButton() {
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var countState = React.useState({ x: 0, y: 0 }) // 按钮计数, 实时刷新
      var count = countState[0]
      var setCount = countState[1]
      var panelState = React.useState(null) // 面板快照, 打开瞬间冻结
      var panel = panelState[0]
      var setPanel = panelState[1]

      function compute() {
        try {
          var sessions = applyCtx ? applyCtx.get('sessions') : null
          if (!sessions || !sessions.list) return null
          var snap = sessions.list.getSnapshot()
          var byId = snap.byId || {}
          var ids = snap.ids || []
          var dismissed = activityDismissed()
          var x = []
          var y = []
          for (var i = 0; i < ids.length; i++) {
            var s = byId[ids[i]]
            if (!s || s.blank) continue
            if (s.running) {
              // 附加 todo 进度: projectionValues.todos = 最新 todo/write 快照
              // ⚠ 不直接改 s(s 是 entryCache 共享快照, 加属性会污染并残留过期值), 复制新对象
              var todo = null
              try {
                var pv = s.projectionValues || {}
                var todos = pv.todos
                if (todos && todos.length > 0) {
                  var done = 0
                  for (var j = 0; j < todos.length; j++) {
                    if (todos[j].status === 'completed') done++
                  }
                  todo = done + '/' + todos.length
                }
              } catch (e) { /* 忽略 */ }
              if (todo !== null) {
                var copy = {}
                for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) copy[k] = s[k]
                copy.__todo = todo
                x.push(copy)
              } else {
                x.push(s)
              }
              continue
            }
            if (s.completed && dismissed.indexOf(s.id) < 0) y.push(s)
          }
          x.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0) })
          y.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0) })
          return { x: x, y: y }
        } catch (e) { /* 忽略 */ }
        return null
      }

      React.useEffect(function () {
        var sessions = null
        try { sessions = applyCtx ? applyCtx.get('sessions') : null } catch (e) { /* 忽略 */ }
        if (!sessions || !sessions.list) return
        var list = sessions.list
        function refresh() {
          var d = compute()
          if (d) setCount({ x: d.x.length, y: d.y.length })
        }
        refresh()
        var unsub = typeof list.subscribe === 'function' ? list.subscribe(refresh) : null
        return function () { if (unsub) unsub() }
      }, [])

      var total = count.x + count.y
      var disabled = total === 0

      React.useEffect(function () {
        if (!open) return
        function onDoc(e) {
          var wrap = document.querySelector('.dsh-activity-wrap')
          if (wrap && !wrap.contains(e.target)) setOpen(false)
        }
        document.addEventListener('click', onDoc)
        return function () { document.removeEventListener('click', onDoc) }
      }, [open])

      function toggle() {
        if (disabled) return
        if (!open) {
          var d = compute()
          if (d) setPanel({ x: d.x, y: d.y })
        }
        setOpen(!open)
      }

      function openSession(id) {
        try {
          var sessions = applyCtx ? applyCtx.get('sessions') : null
          if (sessions && sessions.open) sessions.open(id)
        } catch (e) { /* 忽略 */ }
      }

      function dismissItem(id, ev) {
        ev.stopPropagation()
        activityDismiss(id)
        setPanel(function (prev) {
          if (!prev) return prev
          return { x: prev.x, y: prev.y.filter(function (s) { return s.id !== id }) }
        })
        // 计数取面板过滤后的 y 长度, 避免连续 dismiss 用旧闭包导致负数
        setCount(function (prev) {
          var ny = Math.max(0, prev.y - 1)
          return { x: prev.x, y: ny }
        })
      }

      return React.createElement('div', { className: 'dsh-activity-wrap' },
        React.createElement('button', {
          type: 'button',
          className: 'dsh-activity-btn' + (open ? ' open' : ''),
          onClick: toggle,
          disabled: disabled,
          'aria-expanded': open,
          title: '运行中 ' + count.x + ' / 已完成未读 ' + count.y,
        },
          React.createElement('span', { className: 'dsh-activity-x' }, String(count.x)),
          React.createElement('span', { className: 'dsh-activity-sep' }, '/'),
          React.createElement('span', { className: 'dsh-activity-y' }, String(count.y)),
        ),
        open && panel && total > 0 ? React.createElement('div', { className: 'dsh-activity-panel' },
          panel.x.length > 0 ? React.createElement('div', { className: 'dsh-activity-group' },
            React.createElement('div', { className: 'dsh-activity-group-title' }, '运行中 (' + panel.x.length + ')'),
            panel.x.map(function (s) {
              return React.createElement('div', {
                key: s.id, className: 'dsh-activity-item running',
                onClick: function () { openSession(s.id) },
              },
                React.createElement('span', { className: 'dsh-activity-spin' }),
                React.createElement('span', { className: 'dsh-activity-title' },
                  (s.title || '新会话') + (s.__todo ? ' (' + s.__todo + ')' : '')),
              )
            }),
          ) : null,
          panel.y.length > 0 ? React.createElement('div', { className: 'dsh-activity-group' },
            React.createElement('div', { className: 'dsh-activity-group-title' }, '已完成 (' + panel.y.length + ')'),
            panel.y.map(function (s) {
              return React.createElement('div', {
                key: s.id,
                className: 'dsh-activity-item done' + (s.pendingInteraction ? ' warn' : ''),
                onClick: function () { openSession(s.id) },
              },
                React.createElement('span', { className: 'dsh-activity-dot' }),
                React.createElement('span', { className: 'dsh-activity-title' }, s.title || '新会话'),
                React.createElement('button', {
                  type: 'button', className: 'dsh-activity-dismiss', 'aria-label': '标记已读',
                  onClick: function (ev) { dismissItem(s.id, ev) },
                }, '✕'),
              )
            }),
          ) : null,
        ) : null,
      )
    }

    // ── 侧栏脚部重启按钮 ─────────────────────────────────────

    // ── 侧栏脚部重启按钮: 点击=刷新前端(2.5s动画+会话保持), 长按700ms=重启后端(确认→探测重连) ──

    function RestartButton(props) {
      var wide = Boolean(props && props.wide)
      var timer = React.useRef(null)
      var longFired = React.useRef(false)
      var btnRef = React.useRef(null)
      var BTN_ID = 'dsh-restart-btn'

      React.useEffect(function () {
        // 优先 ref 拿 DOM, 兜底按 id 查(多实例时取最后一个, 实际仅一个)
        var el = btnRef.current || document.getElementById(BTN_ID)
        if (!el) return
        function onTouchStart() {
          longFired.current = false
          timer.current = setTimeout(function () {
            longFired.current = true
            confirmRestart()
          }, 700)
        }
        function onTouchEnd() {
          if (timer.current) { clearTimeout(timer.current); timer.current = null }
        }
        function onClick() {
          if (longFired.current) { longFired.current = false; return }
          refreshFrontend()
        }
        el.addEventListener('touchstart', onTouchStart, { passive: true })
        el.addEventListener('touchend', onTouchEnd)
        el.addEventListener('touchmove', onTouchEnd)
        el.addEventListener('click', onClick)
        return function () {
          if (timer.current) clearTimeout(timer.current)
          el.removeEventListener('touchstart', onTouchStart)
          el.removeEventListener('touchend', onTouchEnd)
          el.removeEventListener('touchmove', onTouchEnd)
          el.removeEventListener('click', onClick)
        }
      }, [])

      return React.createElement(
        'button',
        {
          type: 'button',
          id: BTN_ID,
          ref: btnRef,
          'aria-label': '刷新·长按重启',
          title: '点击刷新前端 · 长按重启 dsh',
          style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 36, padding: wide ? '0 10px' : 0, background: 'transparent',
            border: 'none', color: 'inherit', cursor: 'pointer',
          },
        },
        React.createElement('svg', {
          width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        },
          React.createElement('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
          React.createElement('polyline', { points: '21 3 21 9 15 9' }),
        ),
        wide ? React.createElement('span', null, '刷新·长按重启') : null,
      )
    }


    // ── 安全模式: 纯净模式勾选 / 原版 webui ──────────────────

    function openOriginal() {
      fetch('/api/dsh-open-original', { method: 'POST' }).catch(function () {})
    }

    // ── 设置-移动端 选项卡 ───────────────────────────────────

    function MobileSection() {
      var hostState = React.useState(getStored(KEY_HOST, ''))
      var host = hostState[0]
      var setHost = hostState[1]
      var errState = React.useState('')
      var err = errState[0]
      var setErr = errState[1]
      var pureState = React.useState(getStored(KEY_PURE, '0') === '1')
      var pure = pureState[0]
      var setPure = pureState[1]
      var enhState = React.useState(false)
      var enh = enhState[0]
      var setEnh = enhState[1]
      var soundState = React.useState(true)
      var sound = soundState[0]
      var setSound = soundState[1]
      // 读取 host 端"通知内容强化"开关状态 + 声音开关
      React.useEffect(function () {
        fetch('/api/dsh-progress-summary').then(function (r) { return r.json() })
          .then(function (d) { if (d && typeof d.on === 'boolean') setEnh(d.on) })
          .catch(function () { /* 忽略 */ })
        fetch('/api/dsh-notify-settings').then(function (r) { return r.json() })
          .then(function (d) { if (d && typeof d.sound === 'boolean') setSound(d.sound) })
          .catch(function () { /* 忽略 */ })
      }, [])

      function toggleSound(e) {
        var on = e.target.checked
        setSound(on)
        fetch('/api/dsh-notify-settings?sound=' + (on ? '1' : '0'), { method: 'POST' }).catch(function () { /* 忽略 */ })
      }

      function toggleEnh(e) {
        var on = e.target.checked
        setEnh(on)
        fetch('/api/dsh-progress-summary?on=' + (on ? '1' : '0'), { method: 'POST' }).catch(function () { /* 忽略 */ })
      }

      // 应用内通知: 开关 + 显示时长(0=永久)
      var notifyState = React.useState(getStored('dsh.notify.enabled', '1') === '1')
      var notifyOn = notifyState[0]
      var setNotifyOn = notifyState[1]
      var durState = React.useState(getStored('dsh.notify.duration', '10'))
      var dur = durState[0]
      var setDur = durState[1]
      // 系统通知权限: 无权限时通知相关项置灰(壳桥 hasNotifyPermission, '1'=已授予)
      var permState = React.useState('1')
      var perm = permState[0]
      var setPerm = permState[1]
      React.useEffect(function () {
        try {
          if (typeof AndroidShell !== 'undefined' && AndroidShell.hasNotifyPermission) {
            setPerm(String(AndroidShell.hasNotifyPermission()))
          }
        } catch (e) { /* 忽略 */ }
      }, [])
      var noPerm = perm === '0'

      function toggleNotify(e) {
        var on = e.target.checked
        setNotifyOn(on)
        setStored('dsh.notify.enabled', on ? '1' : '0')
      }

      function changeNotifyDur(e) {
        var v = String(e.target.value || '').replace(/[^0-9]/g, '').slice(0, 4)
        setDur(v)
        setStored('dsh.notify.duration', v === '' ? '0' : v)
      }

      // 全面屏优化: 开关 + 上下偏移(壳层原生 insets, 经 AndroidShell 读写)
      var edgeState = React.useState(null) // {enabled, top, bottom}; null=未读取
      var edge = edgeState[0]
      var setEdge = edgeState[1]
      React.useEffect(function () {
        try {
          if (typeof AndroidShell !== 'undefined' && AndroidShell.getEdgeToEdge) {
            var j = JSON.parse(AndroidShell.getEdgeToEdge())
            if (j && typeof j.enabled === 'boolean') {
              setEdge({ enabled: j.enabled, top: j.top || 0, bottom: j.bottom || 0 })
            }
          }
        } catch (e) { /* 忽略 */ }
      }, [])

      function setEdgeSetting(patch) {
        var base = edge || { enabled: true, top: 0, bottom: 0 }
        var next = {
          enabled: patch.enabled !== undefined ? patch.enabled : base.enabled,
          top: patch.top !== undefined ? patch.top : base.top,
          bottom: patch.bottom !== undefined ? patch.bottom : base.bottom,
        }
        setEdge(next)
        try {
          if (typeof AndroidShell !== 'undefined' && AndroidShell.setEdgeToEdge) {
            AndroidShell.setEdgeToEdge(JSON.stringify(next))
          }
        } catch (e) { /* 忽略 */ }
      }

      function connect() {
        var h = host.trim()
        if (h === '') h = DEFAULT_HOST
        if (!/^[a-zA-Z0-9.\-]+:\d{1,5}$/.test(h)) {
          setErr('格式应为 IP:端口，如 192.168.1.5:3080')
          return
        }
        setErr('')
        setStored(KEY_HOST, host.trim())
        window.location.href = 'http://' + h + '/'
      }

      function togglePure() {
        var next = !pure
        setPure(next)
        setStored(KEY_PURE, next ? '1' : '0')
        setTimeout(function () { window.location.reload() }, 100)
      }

      var rowStyle = { marginBottom: 16 }
      var fieldStyle = {
        width: '100%', boxSizing: 'border-box', padding: '8px 10px',
        background: 'var(--dsw-alias-bg-layer-1, #16161f)', color: 'inherit',
        border: '1px solid var(--dsw-alias-border-l1, #2a2a36)', borderRadius: 8, fontSize: 13,
      }

      return React.createElement('div', { style: { padding: '0 4px' } },
        // 1) 连接地址
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: { display: 'block', fontSize: 13, marginBottom: 6 } },
            '连接地址（IP:端口，空=默认 127.0.0.1:3080）'),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('input', {
              style: fieldStyle, value: host, placeholder: DEFAULT_HOST, inputMode: 'url',
              onChange: function (e) { setHost(e.target.value); if (err) setErr('') },
            }),
            React.createElement('button', {
              type: 'button', onClick: connect,
              style: { flex: 'none', padding: '0 16px', borderRadius: 8, fontSize: 13, background: 'var(--dsw-alias-accent-strong, #4f7cff)', color: '#fff', border: 'none', cursor: 'pointer' },
            }, '连接'),
          ),
          err ? React.createElement('p', { style: { color: '#e06c6c', fontSize: 12, margin: '6px 0 0' } }, err) : null,
          // 离线页入口(已配置但无法连接时查看/修复; 壳 showOfflinePage)
          React.createElement('button', {
            type: 'button', onClick: function () {
              try {
                if (typeof AndroidShell !== 'undefined' && AndroidShell.showOfflinePage) AndroidShell.showOfflinePage()
              } catch (e) { /* 忽略 */ }
            },
            style: { display: 'block', width: '100%', marginTop: 8, padding: '9px 18px', borderRadius: 8, fontSize: 13, background: 'transparent', border: '1px solid var(--dsw-alias-border-l1, #3a3a4a)', color: 'inherit', cursor: 'pointer' },
          }, '进入离线页'),
        ),
        // 2) 通知内容强化(按需, 额外 LLM 消耗)
        React.createElement('div', { style: { paddingTop: 4, borderTop: '1px solid var(--dsw-alias-border-l1, #2a2a36)' } },
          React.createElement('label', {
            style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, marginBottom: 8 },
          },
            React.createElement('input', { type: 'checkbox', checked: enh, onChange: toggleEnh }),
            React.createElement('span', null, '通知内容强化'),
          ),
          React.createElement('p', { style: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' } },
            '开启后会生成当前对话动作摘要于通知中，这会增加token使用量。'),
          // 通知声音/震动开关
          React.createElement('label', {
            style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, marginTop: 10 },
          },
            React.createElement('input', { type: 'checkbox', checked: sound, onChange: toggleSound, disabled: noPerm }),
            React.createElement('span', null, '通知声音/震动'),
          ),
          noPerm ? React.createElement('p', { style: { margin: '6px 0 0', fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' } },
            '未授予通知权限，系统通知不可用（应用内通知仍可用）。') : null,
        ),
        // 2.5) 应用内通知(页面右上角横幅): 开关 + 显示时长(0=永久), 数量固定最多 3 条
        React.createElement('div', { style: { paddingTop: 4, borderTop: '1px solid var(--dsw-alias-border-l1, #2a2a36)' } },
          React.createElement('label', {
            style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, marginBottom: 8 },
          },
            React.createElement('input', { type: 'checkbox', checked: notifyOn, onChange: toggleNotify }),
            React.createElement('span', null, '应用内通知'),
          ),
          React.createElement('p', { style: { margin: '0 0 10px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' } },
            '会话结果在页面右上角向下弹出，最多同时显示 3 条。'),
          notifyOn ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
            React.createElement('span', { style: { fontSize: 13, flex: 'none', width: 72 } }, '显示时长(秒)'),
            React.createElement('input', {
              type: 'number', min: 0, max: 9999, value: dur,
              onChange: changeNotifyDur,
              style: { width: 72, boxSizing: 'border-box', padding: '6px 8px', background: 'var(--dsw-alias-bg-layer-1, #16161f)', color: 'inherit', border: '1px solid var(--dsw-alias-border-l1, #2a2a36)', borderRadius: 8, fontSize: 13 },
            }),
            React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' } },
              dur === '0' || dur === '' ? '永久显示' : '秒后消失'),
          ) : null,
        ),
        // 3) 全面屏优化
        React.createElement('div', { style: { paddingTop: 4, borderTop: '1px solid var(--dsw-alias-border-l1, #2a2a36)' } },
          React.createElement('label', {
            style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, marginBottom: 8 },
          },
            React.createElement('input', { type: 'checkbox', checked: edge ? edge.enabled : true, onChange: function (e) { setEdgeSetting({ enabled: e.target.checked }) } }),
            React.createElement('span', null, '全面屏优化'),
          ),
          React.createElement('p', { style: { margin: '0 0 10px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' } },
            '内容绘制到状态栏/手势条后，按系统安全区自动内缩；偏移 0=默认，-10~10 微调。'),
          React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
              React.createElement('span', { style: { fontSize: 13, flex: 'none', width: 52 } }, '顶部偏移'),
              React.createElement('input', {
                type: 'range', min: -10, max: 10, step: 1,
                disabled: !(edge && edge.enabled),
                value: edge ? edge.top : 0,
                onChange: function (e) { setEdgeSetting({ top: parseInt(e.target.value, 10) || 0 }) },
                style: { flex: 1 },
              }),
              React.createElement('span', { style: { fontSize: 12, flex: 'none', width: 40, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary, #888)' } },
                (edge ? edge.top : 0) + ' dp'),
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('span', { style: { fontSize: 13, flex: 'none', width: 52 } }, '底部偏移'),
              React.createElement('input', {
                type: 'range', min: -10, max: 10, step: 1,
                disabled: !(edge && edge.enabled),
                value: edge ? edge.bottom : 0,
                onChange: function (e) { setEdgeSetting({ bottom: parseInt(e.target.value, 10) || 0 }) },
                style: { flex: 1 },
              }),
              React.createElement('span', { style: { fontSize: 12, flex: 'none', width: 40, textAlign: 'right', color: 'var(--dsw-alias-label-tertiary, #888)' } },
                (edge ? edge.bottom : 0) + ' dp'),
            ),
          ),
        ),
        // 4) 重启 dsh
        React.createElement('div', { style: { paddingTop: 4, borderTop: '1px solid var(--dsw-alias-border-l1, #2a2a36)' } },
          React.createElement('p', { style: { margin: '0 0 8px', fontSize: 13 } }, '重启 dsh 服务（重新加载插件，约几秒后自动重连）'),
          React.createElement('button', {
            type: 'button', onClick: confirmRestart,
            style: { padding: '9px 18px', borderRadius: 8, fontSize: 13, background: 'var(--dsw-alias-accent-strong, #4f7cff)', color: '#fff', border: 'none', cursor: 'pointer' },
          }, '重启 dsh'),
        ),
        // 5) 安全模式(逃生)
        React.createElement('div', { style: { paddingTop: 12, borderTop: '1px solid var(--dsw-alias-border-l1, #2a2a36)' } },
          React.createElement('p', { style: { margin: '0 0 10px', fontSize: 13 } }, '安全模式'),
          React.createElement('label', {
            style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, marginBottom: 8 },
          },
            React.createElement('input', { type: 'checkbox', checked: pure, onChange: togglePure }),
            React.createElement('span', null, '纯净模式'),
          ),
          React.createElement('p', { style: { margin: '0 0 10px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' } },
            '禁用移动端布局改动（侧栏抽屉/设置适配等），仅保留此设置以便切回。'),
          React.createElement('button', {
            type: 'button', onClick: openOriginal,
            style: { display: 'block', width: '100%', padding: '9px 18px', borderRadius: 8, fontSize: 13, background: 'transparent', border: '1px solid var(--dsw-alias-border-l1, #3a3a4a)', color: 'inherit', cursor: 'pointer' },
          }, '使用浏览器启动原版ui'),
        ),
        // 6) debug(开发预览)
        React.createElement('div', { style: { paddingTop: 12, borderTop: '1px solid var(--dsw-alias-border-l1, #2a2a36)' } },
          React.createElement('p', { style: { margin: '0 0 8px', fontSize: 13 } }, 'debug'),
          React.createElement('button', {
            type: 'button', onClick: function () {
              try {
                if (typeof AndroidShell !== 'undefined' && AndroidShell.showOfflinePage) AndroidShell.showOfflinePage('init')
              } catch (e) { /* 忽略 */ }
            },
            style: { display: 'block', width: '100%', padding: '9px 18px', borderRadius: 8, fontSize: 13, background: 'transparent', border: '1px solid var(--dsw-alias-border-l1, #3a3a4a)', color: 'inherit', cursor: 'pointer' },
          }, '进入初始页'),
        ),
      )
    }

    // ── 页面内横幅通知(右上角): host 推送结果横幅事件, 点击跳对应会话, 自动消失 ──
    // 常驻通知(运行中)不显示, 只显示结果类: complete/question/truncated/error/tool
    var BANNER_NS = 'dsh-ui-banner'

    function showPageBanner(data) {
      try {
        if (!data || !data.title) return
        // 应用内通知开关(设置-移动端), 关则不显示
        if (getStored('dsh.notify.enabled', '1') !== '1') return
        var host = document.getElementById(BANNER_NS)
        if (!host) {
          host = document.createElement('div')
          host.id = BANNER_NS
          host.style.cssText =
            'position:fixed;top:12px;right:12px;z-index:2147483647;display:flex;flex-direction:column;' +
            'gap:8px;max-width:min(320px,calc(100vw - 24px));pointer-events:none;'
          document.body.appendChild(host)
        } else if (host.parentElement !== document.body) {
          document.body.appendChild(host)
        }
        // 每次显示都重新挂到 body 末尾(同 z 值时 DOM 顺序靠后者在上, 保证全局最顶)
        document.body.appendChild(host)
        var colors = { complete: '#4caf50', truncated: '#ff9800', error: '#e06c6c', question: '#4f7cff', tool: '#4f7cff' }
        var card = document.createElement('div')
        card.style.cssText =
          'pointer-events:auto;display:flex;align-items:flex-start;gap:8px;cursor:pointer;' +
          'background:var(--dsw-alias-bg-layer-1, #1a1a24);border:1px solid var(--dsw-alias-border-l1, #2a2a36);' +
          'border-left:3px solid ' + (colors[data.kind] || '#888') + ';border-radius:8px;' +
          'padding:10px 12px;box-shadow:0 4px 16px rgba(0,0,0,0.4);'
        var textBox = document.createElement('div')
        textBox.style.cssText = 'min-width:0;flex:1;'
        var t = document.createElement('div')
        t.textContent = data.title
        t.style.cssText = 'font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary, #e6e6ef);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
        var b = document.createElement('div')
        b.textContent = data.body || ''
        b.style.cssText = 'font-size:12px;color:var(--dsw-alias-label-secondary, #a8a8b8);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
        textBox.appendChild(t)
        textBox.appendChild(b)
        var close = document.createElement('button')
        close.textContent = '×'
        close.setAttribute('aria-label', '关闭通知')
        close.style.cssText = 'flex:none;border:none;background:none;color:var(--dsw-alias-label-tertiary, #888);font-size:16px;line-height:1;cursor:pointer;padding:2px;'
        close.onclick = function (e) { e.stopPropagation(); card.remove() }
        card.appendChild(textBox)
        card.appendChild(close)
        card.onclick = function () { if (data.url) window.location.href = data.url }
        host.appendChild(card)
        // 堆叠上限 3 条
        while (host.children.length > 3) host.removeChild(host.firstChild)
        // 显示时长(设置可配, 0=永久显示, 默认 10s)
        var dur = parseInt(getStored('dsh.notify.duration', '10'), 10)
        if (isNaN(dur)) dur = 10
        if (dur > 0) setTimeout(function () { card.remove() }, dur * 1000)
      } catch (e) { /* 忽略 */ }
    }

    // ── 插件入口 ─────────────────────────────────────────────

    function apply(ctx) {
      applyCtx = ctx
      // 原版模式(?plain=1, 外部浏览器): 完全跳过一切移动端注入/注册
      try {
        if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('plain') === '1') return
      } catch (e) { /* 忽略 */ }

      layoutCtx = ctx // 收起侧栏走官方 layout 服务

      // ── 布局循环先行: 不依赖 slots/pure/任何前置, 保证 applyLayout 循环必定建立 ──
      // (之前 slots 注册在前, 任一环节抛异常 → 循环不建 → 重启后样式"回去"且永不恢复)
      var raf = 0
      var observer = null
      var bootTimer = null
      var safetyTimer = null

      function scheduleLayout() {
        if (raf) return
        raf = requestAnimationFrame(function () { raf = 0; applyLayout() })
      }

      function onResize() {
        applyLayout()
      }

      function ensureObserver() {
        if (observer !== null) return
        if (typeof document === 'undefined' || !document.body) return
        observer = new MutationObserver(scheduleLayout)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'data-sidebar-collapsed', 'data-details-collapsed'],
        })
        window.addEventListener('resize', onResize)
      }

      applyLayout()
      ensureObserver()
      // ⚠ 全局 CSS 独立注入(不依赖 slots 注册/纯净模式: 任何槽注册抛错都会跳过原注入点, 导致样式全部失效)
      try {
        if (!document.getElementById('dsh-settings-css')) {
          var sEl = document.createElement('style')
          sEl.id = 'dsh-settings-css'
          sEl.textContent = SETTINGS_CSS
          document.head.appendChild(sEl)
        }
      } catch (e) { /* 忽略 */ }
      if (observer === null) {
        // body 尚未就绪: 轮询直到建好观察器(极早期加载兜底)
        bootTimer = setInterval(function () {
          applyLayout()
          ensureObserver()
          if (observer !== null) clearInterval(bootTimer)
        }, 200)
      }
      // 安全循环无条件建立(不依赖 body/observer 建立时机)
      if (safetyTimer === null) {
        safetyTimer = setInterval(function () { applyLayout() }, 1200)
      }

      ctx.effect(function () {
        if (bootTimer) clearInterval(bootTimer)
        if (safetyTimer) clearInterval(safetyTimer)
        if (observer) observer.disconnect()
        window.removeEventListener('resize', onResize)
      })

      // ── 页面内横幅通知: 监听 host 推送(结果横幅), 右上角浮窗, 点击跳会话 ──
      try {
        if (ctx.on) ctx.on('dsh-notify/banner', showPageBanner)
      } catch (e) { /* 忽略 */ }

      // ── 以下为可选增强: slots 注册/设置适配 CSS, 失败不影响布局 ──
      try {
        var slots = ctx.get('slots')
        if (!slots) return
        // 设置-移动端 始终注册(纯净模式也要保留此入口以便切回)
        slots.inject('settings.section', function () {
          return slots.register(
            { name: 'settings.section', id: 'mobile', order: 25, label: '移动端' },
            MobileSection,
          )
        })
        // 活动任务管理器(header utilities): 运行中/已完成未读, 始终注册
        slots.inject('conversation.session.header.utilities', function () {
          return slots.register(
            { name: 'conversation.session.header.utilities', id: 'dsh-activity', order: 10 },
            ActivityButton,
          )
        })
        // 纯净模式: 禁用一切移动端布局改动(重启按钮/侧栏抽屉/设置适配), 仅保留设置入口
        if (getStored(KEY_PURE, '0') === '1') return
        slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-restart', order: 10 },
            RestartButton,
          )
        })
      } catch (e) { /* 布局已先行建立, 增强功能失败可忽略 */ }
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
