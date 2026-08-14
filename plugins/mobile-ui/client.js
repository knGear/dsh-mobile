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
    var inject = ['slots', 'layout']

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
        '<div style="font-size:12px;color:#8a8a99;margin-bottom:16px">重启会短暂断开，约几秒后自动重连</div>'

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
      confirm.onclick = function () {
        card.innerHTML =
          '<div style="font-size:15px">正在重启 dsh…</div>' +
          '<div style="font-size:12px;color:#8a8a99;margin-top:8px">已断开，约 10 秒后自动重连</div>'
        btnRow.remove()
        fetch('/api/dsh-restart', { method: 'POST' }).catch(function () { /* 服务即将重启 */ })
        // 后端重启需 6~10s 才就绪, 3s reload 必然扑空 → 10s 后再整页重连
        setTimeout(function () { window.location.reload() }, 10000)
      }
      btnRow.appendChild(cancel)
      btnRow.appendChild(confirm)
      card.appendChild(btnRow)
      overlay.appendChild(card)
      document.body.appendChild(overlay)
    }

    // ── 侧栏脚部重启按钮 ─────────────────────────────────────

    function RestartButton(props) {
      var wide = Boolean(props && props.wide)
      var state = React.useState(false)
      var busy = state[0]
      var setBusy = state[1]

      function onClick() {
        if (busy) return
        setBusy(true)
        confirmRestart()
      }

      return React.createElement(
        'button',
        {
          type: 'button',
          onClick: onClick,
          disabled: busy,
          'aria-label': '重启 dsh',
          title: '重启 dsh',
          style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 36, padding: wide ? '0 10px' : 0, background: 'transparent',
            border: 'none', color: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
          },
        },
        React.createElement('svg', {
          width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        },
          React.createElement('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
          React.createElement('polyline', { points: '21 3 21 9 15 9' }),
        ),
        wide ? React.createElement('span', null, '重启') : null,
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
          // 手动进入离线页(壳内 DSH 未启动页: 远程连接 / 复制安装脚本)
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
            React.createElement('input', { type: 'checkbox', checked: sound, onChange: toggleSound }),
            React.createElement('span', null, '通知声音/震动'),
          ),
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
      )
    }

    // ── 插件入口 ─────────────────────────────────────────────

    function apply(ctx) {
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
        // 纯净模式: 禁用一切移动端布局改动(重启按钮/侧栏抽屉/设置适配), 仅保留设置入口
        if (getStored(KEY_PURE, '0') === '1') return
        slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-restart', order: 10 },
            RestartButton,
          )
        })
        // 设置面板竖屏适配 CSS(注入一次)
        if (!document.getElementById('dsh-settings-css')) {
          var sEl = document.createElement('style')
          sEl.id = 'dsh-settings-css'
          sEl.textContent = SETTINGS_CSS
          document.head.appendChild(sEl)
        }
      } catch (e) { /* 布局已先行建立, 增强功能失败可忽略 */ }
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
