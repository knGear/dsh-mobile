// dshm-ui — dshm 壳专属移动 UI 注入
//
// 哲学: dsh 本体绝对纯净; 本插件经官方 slots API 注册, 壳内(UA 含 DSHM/)或网页 /m 路径激活。
// 职责边界: 本插件只做移动适配(移动设置面板/目录选择器/界面适配 CSS)。
//           无任何 restart/reload 能力(危险, 调用不准确会杀 dsh; 属 task 插件职责)。
window.__ModuleLoader__.load({
  id: 'dshm-ui',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var name = 'dshm-ui'
    var inject = ['slots']
    var IS_DSHM = /DSHM\//.test(navigator.userAgent)
    // 移动入口: 壳内(UA 带 DSHM/) 或 网页 /m 路径(浏览器加 /m 进移动版)
    // UA 只限制"引导页"按钮(APK 专属), /m 网页移动适配不受 UA 限制
    var IS_MOBILE_ROUTE = /^\/(m|m\/)/.test(location.pathname)
    var IS_MOBILE = IS_DSHM || IS_MOBILE_ROUTE

    function getStored(k, d) {
      try { return localStorage.getItem(k) || d } catch (e) { return d }
    }
    function setStored(k, v) {
      try { localStorage.setItem(k, v) } catch (e) {}
    }

    // 通用按钮样式
    function btnStyle(primary) {
      return {
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, height: 38, borderRadius: 8, cursor: 'pointer',
        border: primary ? '1px solid rgba(90,160,255,.5)' : '1px solid rgba(255,255,255,.14)',
        background: primary ? 'rgba(90,160,255,.12)' : 'transparent',
        color: 'inherit', fontSize: 14,
      }
    }

    function escHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    // 版本检查: 三条目 — dsh(官方) / dshm-ui(插件) / dsh-mobile(壳)
    // 当前版本: 走 /api/dshm-versions(dsh + 插件, 壳从 UA 传入)
    // 远程版本: dsh 走 npm registry; dshm-ui 走 dshm-ver; dsh-mobile 走 dsh-mobile-ver
    function VersionCheck() {
      var React = require('react')
      var st = React.useState({ dshCur: '?', dshmUiCur: '?', dshmShellCur: '?', dshRem: '?', dshmUiRem: '?', dshmShellRem: '?', env: 'unknown', npmCmd: 'npm i -g @deepseek-ai/dsh', ts: '' })
      var v = st[0]; var setV = st[1]
      React.useEffect(function () {
        var m = /DSHM\/([\d.]+)/.exec(navigator.userAgent)
        var shell = m ? m[1] : ''
        fetch('/api/dshm-versions?shell=' + encodeURIComponent(shell)).then(function (r) { return r.json() }).then(function (j) {
          setV(function (o) { return Object.assign({}, o, {
            dshCur: j.dsh || '?', dshmUiCur: j.dshmUi || '?', dshmShellCur: j.dshmShell || '?', env: j.env || 'unknown', npmCmd: j.npmCmd || 'npm i -g @deepseek-ai/dsh', ts: now(),
          }) })
        }).catch(function () {})
        fetch('https://registry.npmjs.org/@deepseek-ai/dsh/latest').then(function (r) { return r.json() }).then(function (j) {
          setV(function (o) { return Object.assign({}, o, { dshRem: j.version || '?', ts: now() }) })
        }).catch(function () { setV(function (o) { return Object.assign({}, o, { dshRem: '?', ts: now() }) }) })
        fetch('https://raw.githubusercontent.com/knGear/dsh-mobile/main/dshm-ver').then(function (r) {
          return r.text()
        }).then(function (t) {
          setV(function (o) { return Object.assign({}, o, { dshmUiRem: (t || '?').trim(), ts: now() }) })
        }).catch(function () { setV(function (o) { return Object.assign({}, o, { dshmUiRem: '?', ts: now() }) }) })
        fetch('https://raw.githubusercontent.com/knGear/dsh-mobile/main/dsh-mobile-ver').then(function (r) {
          return r.text()
        }).then(function (t) {
          setV(function (o) { return Object.assign({}, o, { dshmShellRem: (t || '?').trim(), ts: now() }) })
        }).catch(function () { setV(function (o) { return Object.assign({}, o, { dshmShellRem: '?', ts: now() }) }) })
      }, [])
      var same = function (cur, rem) { return cur !== '?' && rem !== '?' && cur === rem }
      // 就地反馈(引导页 flash 同款): 点击更新后按钮变"已下载 ✓", 1.2s 恢复
      var fl = React.useState(null)
      var flashKey = fl[0]; var setFlash = fl[1]
      // 复制命令到剪贴板(黄色按钮兜底: 环境未知时复制 npm 安装命令)
      var copyCmd = function (text, kind) {
        try {
          if (typeof AndroidShell !== 'undefined' && AndroidShell.copyText) AndroidShell.copyText(text)
          else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text)
        } catch (e) {}
        setFlash(kind)
        setTimeout(function () { setFlash(null) }, 1200)
      }
      var btn = function (label, cur, rem, kind) {
        var eq = same(cur, rem)
        var known = cur !== '?' && rem !== '?'
        var isFlash = flashKey === kind
        // dsh 按钮三态: 灰(同版/离线/拉取失败) / 蓝(有新版+环境可检测→点击即更新+终端) / 黄(有新版+环境未知→复制 npm 命令, 普通黄)
        var yellow = kind === 'dsh' && !eq && known && v.env === 'unknown'
        var blue = kind === 'dsh' && !eq && known && v.env !== 'unknown'
        var yellowStyle = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, cursor: 'pointer', border: '1px solid #c8a200', background: 'transparent', color: '#d4b106', fontSize: 14 }
        return React.createElement('div', { style: { flex: 1, textAlign: 'center', minWidth: 0 } },
          React.createElement('div', { style: { fontSize: 12, opacity: .5, marginBottom: 4, whiteSpace: 'nowrap' } }, label),
          React.createElement('button', {
            type: 'button',
            disabled: eq || !known,
            style: Object.assign({}, yellow ? yellowStyle : btnStyle(!eq && known), {
              width: '100%', fontWeight: eq ? 400 : 600,
              opacity: eq ? .4 : 1, padding: '4px 2px', fontSize: 13,
            }),
            onClick: function () {
              if (kind === 'dsh') {
                // 环境未知 → 黄: 复制 npm 安装命令
                if (v.env === 'unknown') { copyCmd(v.npmCmd, kind); return }
                // 环境可检测 → 蓝: 点击即更新, 下面绘制更新终端(SSE 流式)
                startDshUpdate()
                return
              }
              var apkUrl = 'https://raw.githubusercontent.com/knGear/dsh-mobile/main/releases/dsh-mobile-v' + rem + '.apk'
              if (IS_DSHM) {
                try { AndroidShell.updateApp(apkUrl) } catch (e) { window.open(apkUrl, '_blank') }
              } else {
                window.open(apkUrl, '_blank')
              }
              // 就地反馈: 变"已下载 ✓"后 1.2s 恢复远程版本号
              setFlash(kind)
              setTimeout(function () { setFlash(null) }, 1200)
            },
          }, isFlash ? (kind === 'dsh' ? '已复制 ✓' : '已下载 ✓') : rem),
          React.createElement('div', { style: { fontSize: 11, opacity: .4, marginTop: 4 } }, '当前 ' + cur),
        )
      }
      // 更新终端: SSE 流式显示 dsh 更新输出(点击蓝色 dsh 按钮后出现)
      var termSt = React.useState(null) // {lines:[], running, done, code}
      var term = termSt[0]; var setTerm = termSt[1]
      var esRef = React.useRef(null)
      var startDshUpdate = function () {
        if (esRef.current) { try { esRef.current.close() } catch (e) {} }
        setTerm({ lines: ['开始更新 dsh…'], running: true, done: false, code: null })
        try {
          var es = new EventSource('/api/dsh-update')
          esRef.current = es
          es.addEventListener('message', function (e) {
            try {
              var d = JSON.parse(e.data)
              if (d.line) setTerm(function (t) { return { lines: (t.lines || []).concat(d.line), running: t.running, done: t.done, code: t.code } })
              if (d.done) {
                es.close(); esRef.current = null
                setTerm(function (t) { return { lines: t.lines, running: false, done: true, code: d.code } })
              }
            } catch (er) {}
          })
          es.addEventListener('error', function () {
            es.close(); esRef.current = null
            setTerm(function (t) { return { lines: (t.lines || []).concat('连接中断'), running: false, done: true, code: -1 } })
          })
        } catch (e) {
          setTerm(function (t) { return { lines: (t.lines || []).concat('无法连接: ' + e.message), running: false, done: true, code: -1 } })
        }
      }
      return React.createElement('div', null,
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 10 } },
          btn('dsh', v.dshCur, v.dshRem, 'dsh'),
          btn('dshm-ui 插件', v.dshmUiCur, v.dshmUiRem, 'dshm'),
          btn('dsh-mobile 壳', v.dshmShellCur, v.dshmShellRem, 'dshm'),
        ),
        // 更新终端(dsh 更新进行时显示, 等宽字体滚动)
        term ? React.createElement('div', {
          style: { marginTop: 10, border: '1px solid var(--dsw-alias-border-l2,#2a2a36)', borderRadius: 8, background: '#0d0d10', padding: 8, maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
        },
          term.lines.map(function (l, i) { return React.createElement('div', { key: i, style: { color: '#9fe8a0' } }, l) }),
          term.running ? React.createElement('div', { style: { color: '#8a8a99' } }, '…') : null,
          term.done ? React.createElement('div', { style: { color: term.code === 0 ? '#4dd0e1' : '#ff6b6b', marginTop: 4, fontWeight: 600 } },
            term.code === 0 ? '✓ 更新完成，请重启 dsh web 生效' : '✗ 更新失败(码 ' + term.code + ')，可复制 npm 命令手动更新',
          ) : null,
        ) : null,
        React.createElement('div', { style: { fontSize: 11, opacity: .4, marginTop: 6, textAlign: 'right' } }, v.ts),
      )
    }
    var now = function () { var d = new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0') }
    var go = function (url) { location.href = url }

    // ── 界面适配开关: 取舍后只留 3 个可独立关闭的(localStorage 'dshm.css.<id>' = '1' 开 / '0' 关) ──
    // 设置弹窗适配 + 背景色同步 已去除开关, 恒开(属基础体验, 无需取舍)
    // header=标题上移(压缩头部垂直空间) tooltip=禁用悬停气泡 stats=统计条竖块化(buildStatsClone)
    var ADAPTS = [
      { id: 'header', label: '标题上移', def: '1' },
      { id: 'tooltip', label: '禁用悬停气泡', def: '1' },
      { id: 'stats', label: '统计条竖块', def: '1' },
    ]
    function adaptOn(id) { return getStored('dshm.css.' + id, '1') === '1' }
    function setAdapt(id, on) { setStored('dshm.css.' + id, on ? '1' : '0') }

    // 布局微调: slider 持久化(真组件, hooks 合法)
    function Slider(props) {      var React = require('react')
      var def = props.def !== undefined ? String(props.def) : '0'
      var min = props.min !== undefined ? props.min : -50
      var max = props.max !== undefined ? props.max : 50
      var st = React.useState(parseInt(getStored(props.k, def), 10) || 0)
      var v = st[0]; var setV = st[1]
      var apply = function (n) {
        document.documentElement.style.setProperty(props.css, n + 'px')
      }
      return React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 } },
          React.createElement('span', null, props.label),
          React.createElement('span', { style: { opacity: .6 } }, v + 'px'),
        ),
        React.createElement('input', {
          type: 'range', min: min, max: max, step: 1, value: v,
          onChange: function (e) {
            var n = parseInt(e.target.value, 10) || 0
            setV(n); setStored(props.k, String(n)); apply(n)
          },
          style: { width: '100%' },
        }),
      )
    }
    function UiCustomPanel() {
      var React = require('react')
      var ost = React.useState(false); var open = ost[0]; var setOpen = ost[1]
      React.useEffect(function () {
        [['dshm.padX','--dshm-pad-x','0'],['dshm.navW','--dshm-nav-w','0'],['dshm.statsPad','--dshm-stats-pad-x','0']].forEach(function (pr) {
          // 旧版 statsPad 存的是直接偏移(-25 基准前), 迁移换算: v_new = v_old + 25, 效果连续
          if (pr[0] === 'dshm.statsPad') {
            try {
              var old = localStorage.getItem('dshm.statsPad')
              if (old !== null) {
                var ov = parseInt(old, 10)
                if (!isNaN(ov) && ov !== 0) {
                  var nv = ov + 25
                  if (nv > 100) nv = 100
                  if (nv < -100) nv = -100
                  localStorage.setItem('dshm.statsPad', String(nv))
                }
              }
            } catch (e) {}
          }
          var n = parseInt(getStored(pr[0], pr[2]), 10) || 0
          document.documentElement.style.setProperty(pr[1], n + 'px')
        })
      }, [])
      return React.createElement('div', null,
        React.createElement('div', {
          onClick: function () { setOpen(!open) },
          style: { fontSize: 14, opacity: .7, cursor: 'pointer', marginBottom: open ? 10 : 0, userSelect: 'none', padding: '4px 0' },
        }, (open ? '▼ ' : '▶ ') + '布局微调'),
        open ? React.createElement('div', { style: { paddingLeft: 10 } },
          React.createElement(Slider, { label: '设置正文宽度', k: 'dshm.padX', css: '--dshm-pad-x' }),
          React.createElement(Slider, { label: '设置侧栏宽度', k: 'dshm.navW', css: '--dshm-nav-w' }),
          React.createElement(Slider, { label: '统计数据宽度', k: 'dshm.statsPad', css: '--dshm-stats-pad-x', min: -100, max: 100, def: 0 }),
        ) : null,
      )
    }

    // 移动版目录选择器: 注册到两个 directoryFlow slot
    // 风格统一 dsh: 用 dsw-alias CSS 变量, 圆角行 hover, 跟原版 picker 视觉一致
    // 功能: 浏览(仅目录)/新建文件夹/返回上一层(列表首行)/主页/sdcard快捷/root权限探测
    var SDCARD_DIR = '/storage/emulated/0'
    var HOME_DIR = '/data/data/com.termux/files/home'
    function DirFlow(props) {
      var React = require('react')
      var box = React.useRef(null)
      React.useEffect(function () {
        if (!props.open) return
        var C = {
          bg: 'var(--dsw-alias-bg-base,#151517)',
          label1: 'var(--dsw-alias-label-primary,#e6e6ef)',
          label2: 'var(--dsw-alias-label-secondary,#a0a0b0)',
          label3: 'var(--dsw-alias-label-tertiary,#6a6a78)',
          border: 'var(--dsw-alias-border-l3,#2a2a36)',
          hover: 'var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))',
          accent: 'var(--dsw-alias-button-info-fill,#4dd0e1)',
          error: 'var(--dsw-alias-state-error-primary,#ff6b6b)',
        }
        // 顶部按钮统一样式
        var btn = function (data, glyph, title) {
          return '<button ' + data + ' title="' + title + '" style="flex:none;border:1px solid ' + C.border + ';background:transparent;color:' + C.label2 + ';border-radius:8px;width:32px;height:32px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">' + glyph + '</button>'
        }
        var el = document.createElement('div')
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px'
        el.innerHTML =
          '<div style="width:min(480px,100%);max-height:88vh;display:flex;flex-direction:column;background:' + C.bg + ';border:1px solid ' + C.border + ';border-radius:12px;overflow:hidden;font-family:sans-serif">' +
            '<div style="display:flex;align-items:center;gap:6px;padding:12px 14px;border-bottom:1px solid ' + C.border + '">' +
              btn('data-home', '\u2302', 'Termux 主页') +
              btn('data-sdcard', 'SD', '内部存储 /sdcard') +
              '<span data-title style="flex:1;text-align:center;font-size:14px;font-weight:510;color:' + C.label1 + '">选择工作区目录</span>' +
              btn('data-up', '\u2039', '返回上一层') +
              '<button data-native title="切回原始界面" style="flex:none;border:1px solid ' + C.border + ';background:transparent;color:' + C.label3 + ';border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer">原始</button>' +
              '<button data-x title="关闭" style="flex:none;border:none;background:transparent;color:' + C.label3 + ';font-size:18px;cursor:pointer;width:28px;height:32px">\u2715</button>' +
            '</div>' +
            '<div data-path style="padding:8px 14px;font-size:12px;color:' + C.accent + ';word-break:break-all;border-bottom:1px solid ' + C.border + ';min-height:20px"></div>' +
            '<div data-list style="flex:1;overflow-y:auto;min-height:160px;padding:6px 8px"></div>' +
            '<div style="display:flex;gap:6px;align-items:center;padding:10px 14px;border-top:1px solid ' + C.border + '">' +
              '<input data-name type="text" placeholder="新文件夹名" style="flex:1;min-width:0;background:transparent;border:1px solid ' + C.border + ';border-radius:8px;color:' + C.label1 + ';padding:8px 10px;font-size:13px;outline:none">' +
              '<button data-mk style="flex:none;border:1px solid ' + C.border + ';background:transparent;color:' + C.label1 + ';border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer">\uff0b 新建</button>' +
            '</div>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;padding:0 14px 14px">' +
              '<button data-cancel style="border:1px solid ' + C.border + ';background:transparent;color:' + C.label2 + ';border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer">取消</button>' +
              '<button data-pick style="border:none;background:' + C.accent + ';color:#0a0a10;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">选择此目录</button>' +
            '</div>' +
          '</div>'
        document.body.appendChild(el)
        box.current = el
        var cur = null
        var curParent = null
        var hasRoot = false
        var titleEl = el.querySelector('[data-title]')
        var upBtn = el.querySelector('[data-up]')
        var pathEl = el.querySelector('[data-path]')
        var listEl = el.querySelector('[data-list]')
        var nameEl = el.querySelector('[data-name]')
        // 绑定行 hover(dsh 风格 interactive-bg-hover)
        var bindHover = function (btns) {
          for (var ri = 0; ri < btns.length; ri++) {
            btns[ri].addEventListener('mouseenter', function () { this.style.background = C.hover })
            btns[ri].addEventListener('mouseleave', function () { this.style.background = 'transparent' })
          }
        }
        // 行 HTML 生成(dsh 风格: 圆角 button + 文件夹图标 + 名称 + chevron)
        var rowHtml = function (icon, name, color) {
          return '<button style="display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:' + (color || C.label1) + ';font-size:13px;font-weight:500;line-height:20px;cursor:pointer;margin-bottom:1px">' +
            '<span style="flex:none;font-size:14px">' + icon + '</span>' +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(name) + '</span>' +
            '<span style="flex:none;color:' + C.label3 + ';font-size:12px">\u203a</span>' +
          '</button>'
        }
        var load = function (p) {
          listEl.innerHTML = '<div style="padding:16px;font-size:13px;color:' + C.label3 + ';text-align:center">加载中…</div>'
          fetch('/api/dshm-list-dir?path=' + encodeURIComponent(p || '/')).then(function (r) { return r.json() }).then(function (d) {
            if (!d || d.error || !d.entries) {
              // 无 root 权限且在 /: 显示 sdcard + com.termux + 提示
              if (p === '/' && d && d.error) {
                cur = '/'
                curParent = null
                hasRoot = false
                pathEl.textContent = '/'
                upBtn.style.opacity = '0.3'; upBtn.disabled = true
                listEl.innerHTML =
                  rowHtml('\ud83d\udcc1', '内部存储', C.accent) +
                  rowHtml('\ud83d\udcc1', 'com.termux', C.accent)
                var fbs = listEl.querySelectorAll('button')
                bindHover(fbs)
                fbs[0].addEventListener('click', function () { load(SDCARD_DIR) })
                fbs[1].addEventListener('click', function () { load('/data/data/com.termux') })
                var hintEl = document.createElement('div')
                hintEl.style.cssText = 'padding:12px 8px 4px;font-size:11px;line-height:1.6;color:' + C.label3 + ';text-align:center;border-top:1px solid ' + C.border + ';margin-top:8px'
                hintEl.textContent = '受限视图 · 仅显示可访问目录。Termux 获取 root 权限后，以 su 提权重启 dsh-web 即可浏览完整文件系统。'
                listEl.appendChild(hintEl)
                return
              }
              listEl.innerHTML = '<div style="padding:16px;font-size:13px;color:' + C.error + ';text-align:center">' + escHtml(d && d.error || '目录读取失败') + '</div>'
              return
            }
            cur = d.path
            curParent = d.parent
            hasRoot = d.hasRoot
            pathEl.textContent = d.path
            var canUp = curParent && curParent !== cur
            if (canUp) { upBtn.style.opacity = '1'; upBtn.disabled = false }
            else { upBtn.style.opacity = '0.3'; upBtn.disabled = true }
            // 列表首行: 返回上一层(parent 存在且不等于当前路径, 即未封顶)
            var h = ''
            if (canUp) {
              h += '<button data-up-row style="display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:' + C.label2 + ';font-size:13px;font-weight:500;line-height:20px;cursor:pointer;margin-bottom:1px">' +
                '<span style="flex:none;font-size:14px">\u2039</span>' +
                '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">返回上一层</span>' +
                '<span style="flex:none;color:' + C.label3 + ';font-size:12px">\u203a</span>' +
              '</button>'
            }
            // 目录行
            for (var i = 0; i < d.entries.length; i++) {
              var e = d.entries[i]
              h += '<button data-enter="' + i + '" style="display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:' + C.label1 + ';font-size:13px;font-weight:500;line-height:20px;cursor:pointer;margin-bottom:1px">' +
                '<span style="flex:none;font-size:14px">\ud83d\udcc1</span>' +
                '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(e.name) + '</span>' +
                '<span style="flex:none;color:' + C.label3 + ';font-size:12px">\u203a</span>' +
              '</button>'
            }
            listEl.innerHTML = h || '<div style="padding:16px;font-size:13px;color:' + C.label3 + ';text-align:center">(空目录)</div>'
            // 提示文案(虚拟根等场景, host 返回 hint 字段时显示在列表下方)
            if (d.hint) {
              var hintEl = document.createElement('div')
              hintEl.style.cssText = 'padding:12px 8px 4px;font-size:11px;line-height:1.6;color:' + C.label3 + ';text-align:center;border-top:1px solid ' + C.border + ';margin-top:8px'
              hintEl.textContent = d.hint
              listEl.appendChild(hintEl)
            }
            // hover
            var allRows = listEl.querySelectorAll('button')
            bindHover(allRows)
            // 返回上一层(列表首行)
            var upRow = listEl.querySelector('[data-up-row]')
            if (upRow) upRow.addEventListener('click', function () { if (curParent) load(curParent) })
            // 目录行点击
            var rows = listEl.querySelectorAll('button[data-enter]')
            for (var ri = 0; ri < rows.length; ri++) {
              ;(function (idx) {
                rows[ri].addEventListener('click', function () { load(d.entries[idx].path) })
              })(parseInt(rows[ri].getAttribute('data-enter'), 10))
            }
          }).catch(function (err) {
            listEl.innerHTML = '<div style="padding:16px;font-size:13px;color:' + C.error + ';text-align:center">' + escHtml(String((err && err.message) || err)) + '</div>'
          })
        }
        // 首次: 有 root 从真实 / 起步; 无 root 从虚拟 / 起步(内部存储 + Termux)
        fetch('/api/dshm-list-dir?path=' + encodeURIComponent('/')).then(function (r) { return r.json() }).then(function (d) {
          load('/')
        }).catch(function () { load(SDCARD_DIR) })
        // 事件
        el.addEventListener('click', function (ev) { if (ev.target === el) props.onCancel() })
        el.querySelector('[data-x]').addEventListener('click', props.onCancel)
        el.querySelector('[data-native]').addEventListener('click', function () {
          setStored('dshm.dirflow', '1')
          props.onCancel()
          location.reload()
        })
        el.querySelector('[data-cancel]').addEventListener('click', props.onCancel)
        el.querySelector('[data-home]').addEventListener('click', function () { load(HOME_DIR) })
        el.querySelector('[data-sdcard]').addEventListener('click', function () { load(SDCARD_DIR) })
        upBtn.addEventListener('click', function () { if (curParent) load(curParent) })
        el.querySelector('[data-mk]').addEventListener('click', function () {
          var name = nameEl.value.trim()
          if (!name || !cur) return
          fetch('/api/dshm-mkdir?path=' + encodeURIComponent(cur) + '&name=' + encodeURIComponent(name)).then(function (r) { return r.json() }).then(function (d) {
            if (d && d.error) { props.onError(d.error); return }
            nameEl.value = ''
            load(cur)
          }).catch(function (err) { props.onError(String((err && err.message) || err)) })
        })
        el.querySelector('[data-pick]').addEventListener('click', function () {
          if (props.busy || !cur) return
          props.onPicked(cur)
        })
        return function () { if (el.parentNode) el.parentNode.removeChild(el); box.current = null }
      }, [props.open])
      return null
    }

    function MobileSection() {
      var React = require('react')
      var pure = getStored('dshm.pure', '0') === '1'
      // 禁用 session log 开关状态(来自 host 实际插件状态: 插件 disabled → 勾选)
      var sl = React.useState(false)
      var slChecked = sl[0]; var setSl = sl[1]
      var hint = React.useState('')
      var hintText = hint[0]; var setHint = hint[1]
      // 端点错误提示: 区分 404(端点未加载, 需重启 dsh)/ 服务器错误 / 网络失败
      var showErr = function (msg) {
        setHint(msg)
        setTimeout(function () { setHint('') }, 5000)
      }
      var fetchSl = function (url) {
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error('端点 ' + url.split('?')[0] + ' 返回 ' + r.status + (r.status === 404 ? '（index.js 改动需重启 dsh 生效）' : ''))
          return r.json()
        })
      }
      React.useEffect(function () {
        fetchSl('/api/dshm-sessionlog').then(function (d) {
          if (d && d.ok !== undefined) setSl(!!d.disabled)
        }).catch(function (e) { showErr('读取状态失败: ' + e.message) })
      }, [])
      var toggleSl = function (on) {
        setHint('保存中…')
        // 生效提示按 UA 区分: 网页(非 DSHM)刷新网页生效; APK(DSHM)重启 dsh-mobile 生效
        fetchSl('/api/dshm-sessionlog?on=' + (on ? '1' : '0')).then(function (d) {
          if (d && d.ok !== undefined) {
            setSl(!!d.disabled)
            // 热切换已生效; 无感刷新: 短提示后自动 reload, 让会话头下载按钮等 UI 立即更新
            setHint((on ? '已禁用 session log' : '已启用 session log') + '，正在刷新…')
            setTimeout(function () { location.reload() }, 600)
          } else if (d && d.error) { showErr(String(d.error)) }
        }).catch(function (e) { showErr('操作失败: ' + e.message) })
      }
      var togglePure = function (on) {
        setStored('dshm.pure', on ? '1' : '0')
        location.reload()
      }
      var boxBorder = '1px solid var(--dsw-alias-border-l3,#2a2a36)'
      var labelStyle = { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, marginBottom: 10 }
      return React.createElement('div', null,
        // 线框: 一级开关(纯净模式)骑在左上角边框上 — fieldset/legend 原生语义,
        // legend 透明自适应弹窗底色, 边框在 legend 处自动断开; 框内条目为二级
        // 引导页/拉起浏览器在底部操作区(与版本检查同级), 顶部结构 Web/APK 一致
        React.createElement('fieldset', {
          style: { border: boxBorder, borderRadius: 12, padding: '18px 14px 12px', marginTop: 8, minWidth: 0, width: '100%', boxSizing: 'border-box' },
        },
          React.createElement('legend', {
            style: { padding: '0 6px', marginLeft: 6, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
          },
            React.createElement('input', {
              type: 'checkbox', checked: pure,
              onChange: function (e) { togglePure(e.target.checked) },
            }),
            React.createElement('span', null, '纯净模式'),
          ),
          // 框内(二级): 纯净模式开启 → disabled + 弱化
          React.createElement('div', { style: { opacity: pure ? .45 : 1, pointerEvents: pure ? 'none' : 'auto' } },
            // 第一个: 禁用 session log
            React.createElement('label', { style: labelStyle },
              React.createElement('input', {
                type: 'checkbox', checked: slChecked,
                onChange: function (e) { toggleSl(e.target.checked) },
              }),
              React.createElement('span', null, '禁用 session log'),
            ),
            hintText ? React.createElement('div', {
              style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary,#8a8a99)', margin: '-4px 0 8px' },
            }, hintText) : null,
            // 旧版工作区目录浏览器(勾选 = 让位给 dsh 自带原始版)
            React.createElement('label', { style: labelStyle },
              React.createElement('input', {
                type: 'checkbox', checked: getStored('dshm.dirflow', '0') === '1',
                onChange: function (e) { setStored('dshm.dirflow', e.target.checked ? '1' : '0'); location.reload() },
              }),
              React.createElement('span', null, '旧版工作区目录浏览器'),
            ),
            // 界面适配: 每个 UI 适配独立开关(关闭即停用对应注入; 切换后立即生效, 无需重启)
            React.createElement('div', { style: { fontSize: 12, opacity: .6, margin: '10px 0 4px' } }, '界面适配'),
            ADAPTS.map(function (a) {
              return React.createElement('label', { key: a.id, style: labelStyle },
                React.createElement('input', {
                  type: 'checkbox', checked: adaptOn(a.id),
                  onChange: function (e) { setAdapt(a.id, e.target.checked); location.reload() },
                }),
                React.createElement('span', null, a.label),
              )
            }),
            // ui自定义(布局微调)
            React.createElement(UiCustomPanel, null),
          ),
        ),
        // 底部操作区(APK only: 引导页 + 拉起浏览器; 浏览器无 dshm:// 协议与系统浏览器桥)
        // 与版本检查同级, 线框之外 → 顶部结构 Web/APK 一致, 降低两者视觉区别
        IS_DSHM ? React.createElement('div', {
          style: { marginTop: 18, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.1)' },
        },
          React.createElement('div', { style: { display: 'flex', gap: 10 } },
            React.createElement('button', {
              type: 'button', style: btnStyle(true), onClick: function () { go('dshm://guide') },
            }, 'App 引导页'),
            React.createElement('button', {
              type: 'button', style: btnStyle(true), onClick: function () {
                try { AndroidShell.openInBrowser(window.location.href) } catch (e) {}
              },
            }, '拉起浏览器'),
          ),
        ) : null,
        // 版本检查(线框外独立区块, 横线分隔)
        React.createElement('div', {
          style: { marginTop: 18, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.1)' },
        },
          React.createElement(VersionCheck, null),
        ),
      )
    }

    function apply(ctx) {
      if (!IS_MOBILE) return
      var slots = ctx.get('slots')
      if (!slots) return
      // 移动设置选项卡始终注册(含纯净模式) — 否则纯净模式开启后回不去(死锁)
      slots.inject('settings.section', function () {
        return slots.register(
          { name: 'settings.section', id: 'dshm-mobile', order: 25, label: '移动设置' },
          MobileSection,
        )
      })
      // 目录选择器: 注册到两个 directoryFlow hole(dshm.dirflow=='1' 时让位给自带原始版)
      if (getStored('dshm.dirflow', '0') !== '1') {
        slots.inject('conversation.hero.workspace.directoryFlow', function () {
          return slots.register({ name: 'conversation.hero.workspace.directoryFlow', id: 'dshm-dir-flow', priority: -10 }, DirFlow)
        })
        slots.inject('sidebar.workspaces.directoryFlow', function () {
          return slots.register({ name: 'sidebar.workspaces.directoryFlow', id: 'dshm-dir-flow', priority: -10 }, DirFlow)
        })
      }
      // 纯净模式: 跳过 CSS/布局注入(移动设置面板本身已在上方注册, 可切回)
      if (getStored('dshm.pure', '0') === '1') return
      // 界面适配 CSS: 按开关过滤生成(每个适配可独立关闭)
      // 使用 data-slot 语义锚点(不依赖 dsh bundle 构建哈希类名, 升级不易失效)
      var cssParts = []
      // 设置弹窗适配(恒开): 水平 padding 收窄 + 侧栏左贴/收窄 + 图标文字间距 + 不截断 + 正文空位
      cssParts.push(
        '[role="dialog"][aria-modal="true"]{padding-left:11px !important;padding-right:11px !important}',
        '[role="dialog"][aria-modal="true"] > nav{width:calc(96px + var(--dshm-nav-w,0px)) !important;min-width:0 !important;margin-left:-5px !important;padding:12px 1px 0 !important;gap:8px !important}',
        '[role="dialog"][aria-modal="true"] > nav button{gap:2px !important}',
        '[role="dialog"][aria-modal="true"] > nav button svg{margin-right:2px !important}',
        '[role="dialog"][aria-modal="true"] > nav button span{white-space:nowrap !important;overflow:visible !important}',
        '[data-slot="settings.section"] h2{white-space:nowrap !important;overflow:visible !important;text-overflow:clip !important}',
        '[role="dialog"][aria-modal="true"] > nav + *{flex:1 !important;min-width:0 !important;margin-left:calc(-20px + var(--dshm-pad-x,0px)) !important;margin-right:calc(-20px + var(--dshm-pad-x,0px)) !important}',
      )
      // 主页顶部标题行: 标题独占一行 / 其余按钮第二行 / tabs 第三行
      if (adaptOn('header')) cssParts.push(
        // 标题上移: 压缩头部顶部留白, 标题行贴近顶部, 把垂直空间让给对话区
        '[data-slot="conversation.session.header"] header{padding-top:2px !important}',
        '[data-slot="conversation.session.header"] header nav{row-gap:0 !important;align-items:center !important}',
      )
      // 禁用悬停气泡(触屏不需要按钮功能说明)
      if (adaptOn('tooltip')) cssParts.push('[role="tooltip"]{display:none !important}')
      var css = cssParts.join('\n')
      // 注入 style 并持续守护: dsh React 动态挂载设置弹窗时可能后注入自带 CSS,
      // 同 !important 下后注入者胜出 → 插件样式被覆盖(Agent预设被截断/换行)。
      // MutationObserver 监听 head 子树变化, style 被移除或非末尾时重新追加(末尾 = 最高优先)
      var ensureStyle = function () {
        var s = document.getElementById('dshm-ui-style')
        if (!s) {
          s = document.createElement('style'); s.id = 'dshm-ui-style'; s.textContent = css
          document.head.appendChild(s)
        } else if (s.textContent !== css) {
          s.textContent = css
        }
        // 始终移到 head 末尾(后注入的 dsh CSS 排在前面 → 插件胜出)
        if (document.head.lastChild !== s) document.head.appendChild(s)
      }
      // 动态同步容器背景色: 读页面实际背景色 → 壳设 container 底色一致, 消除系统栏 padding 区色差隔断
      var lastBg = null
      function syncBg() {
        try {
          // 背景色同步恒开(仅壳内有 AndroidShell 时生效; 浏览器无桥自然跳过)
          if (typeof AndroidShell === 'undefined' || !AndroidShell.setBackgroundColor) return
          var el = document.querySelector('[data-slot="conversation.session.header"]') || document.body
          if (!el) el = document.body
          if (!el) return
          var c = getComputedStyle(el).backgroundColor
          if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') {
            el = document.body; if (!el) return
            c = getComputedStyle(el).backgroundColor
          }
          if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return
          var m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
          if (!m) return
          var hex = '#' + [m[1], m[2], m[3]].map(function (n) {
            var s = parseInt(n, 10).toString(16); return s.length === 1 ? '0' + s : s
          }).join('')
          if (hex !== lastBg) { lastBg = hex; AndroidShell.setBackgroundColor(hex) }
        } catch (e) { /* 忽略 */ }
      }
      ensureStyle()
      syncBg()
      var mo = new MutationObserver(function () { ensureStyle(); syncBg() })
      mo.observe(document.head, { childList: true, subtree: false })
      // 底部统计条(StatsLine)竖块化 — 克隆副本方案
      // ⚠ 不能直接改 React 管理的 root(其 useLayoutEffect 测量 + 重渲染会与手动 DOM 冲突, 曾致消失)。
      //   做法: 原 root 隐藏(React 继续管, 不可见), 在旁边插一个克隆副本(React 不碰兄弟节点),
      //         bodyMo 检测原 root 文本变化 → 重建副本; React 卸载原 root → 清理孤儿副本。
      // 定位特征: span[aria-hidden=true] 且文本为 |(sep), 其父元素文本含"轮""步"
      function buildStatsClone(root, clone, key) {
        try {
          var groups = []
          for (var gi = 0; gi < root.children.length; gi++) {
            var ch = root.children[gi]
            if (ch.getAttribute && ch.getAttribute('aria-hidden')) continue
            var g = (ch.textContent || '').replace(/\s+/g, '').replace(/\|/g, '·')
            if (g) groups.push(g)
          }
          if (groups.length === 0) { clone.style.display = 'none'; return }
          clone.style.display = ''
          // 块1: X轮 / X步
          var blocks = []
          var tM = /(\d+)轮/.exec(groups[0])
          var sM = /(\d+)步/.exec(groups[0])
          blocks.push([(tM ? tM[1] : '') + '轮', sM ? sM[1] + '步' : ''])
          for (var bi = 1; bi < groups.length && blocks.length < 5; bi++) {
            var parts = groups[bi].split('·')
            // 缓存命中: "缓存命中72%" → 第一行"缓存命中", 第二行数值"72%"
            var cm = /^(缓存命中|cache[Hh]it)(.+)/.exec(parts[0])
            if (cm && !parts[1]) {
              blocks.push([cm[1], cm[2]])
              continue
            }
            // 首token平均: "首token平均10.7s·57tok/s" → 第一行"首token平均", 第二行"10.7s 57tok/s"
            var tm = /^(首token平均|TTFT平均|首字TTFT|TTFT)(.+)/.exec(parts[0])
            if (tm) {
              var second = tm[2] + (parts[1] ? ' ' + parts[1] : '')
              blocks.push([tm[1], second])
              continue
            }
            blocks.push([parts[0] || '', parts[1] || ''])
          }
          clone.innerHTML = ''
          // 左右安全区: 正值→padding 加宽(收窄); 负值→负 margin 向外扩展(变宽)
          // padding 不能为负, 负值用 margin-left/right + width 补偿实现超出容器
          clone.style.cssText =
            'display:flex;justify-content:space-between;align-items:stretch;' +
            'text-align:center;white-space:normal;overflow:visible;' +
            'font-size:12px;line-height:1.5;' +
            // 实际偏移 = -25(固化基准) + 滑杆值; 滑杆 0 = -25 漂亮效果, 设备不同可上下微调
            'padding:4px max(16px, calc(16px + (-25px + var(--dshm-stats-pad-x,0px)))) 0;' +
            'margin-left:min(0px, calc(-25px + var(--dshm-stats-pad-x,0px)));' +
            'margin-right:min(0px, calc(-25px + var(--dshm-stats-pad-x,0px)));' +
            'width:calc(100% - 2 * min(0px, calc(-25px + var(--dshm-stats-pad-x,0px))));' +
            'box-sizing:border-box;' +
            'color:var(--dsw-alias-label-tertiary,#8a8a99);'
          for (var bi2 = 0; bi2 < blocks.length; bi2++) {
            var bl = document.createElement('div')
            // flex:1 1 auto → 宽度以内容为基础(flex-basis:auto), 长内容块自动更宽, 短块压窄
            bl.style.cssText =
              'flex:1 1 auto;min-width:0;padding:1px 3px;' +
              (bi2 > 0 ? 'border-left:1px solid var(--dsw-alias-separator-primary,#3a3a46);' : '')
            var l1 = document.createElement('div')
            l1.textContent = blocks[bi2][0] || ''
            l1.style.cssText =
              'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
              'color:var(--dsw-alias-label-primary,#e6e6ef);'
            var l2 = document.createElement('div')
            l2.textContent = blocks[bi2][1] || ''
            l2.style.cssText =
              'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;'
            bl.appendChild(l1)
            bl.appendChild(l2)
            clone.appendChild(bl)
          }
          clone.setAttribute('data-dshm-key', key || '')
        } catch (e) { /* 忽略 */ }
      }
      function fixStatsLine() {
        try {
          if (!adaptOn('stats')) return
          var seps = document.querySelectorAll('span[aria-hidden="true"]')
          for (var si = 0; si < seps.length; si++) {
            var sep = seps[si]
            if ((sep.textContent || '').trim() !== '|') continue
            var root = sep.parentElement
            if (!root || !root.parentNode) continue
            var txt = root.textContent || ''
            if (txt.indexOf('轮') < 0 || txt.indexOf('步') < 0) continue
            var key = txt.replace(/\s+/g, '').slice(0, 60)
            if (root.getAttribute('data-dshm-stats-hidden')) {
              // 已处理: 文本变了才重建副本(经 _dshmClone 引用, 不依赖相邻位置)
              var clone = root._dshmClone
              if (clone && clone.parentNode && clone.getAttribute('data-dshm-key') !== key) {
                buildStatsClone(root, clone, key)
              }
              continue
            }
            // 首次: 隐藏原 root + 创建克隆副本, 双向引用
            root.setAttribute('data-dshm-stats-hidden', '1')
            root.style.display = 'none'
            var clone = document.createElement('div')
            clone.setAttribute('data-dshm-stats', '1')
            clone.setAttribute('data-dshm-key', key)
            root._dshmClone = clone
            clone._dshmRoot = root
            // 插入到 composer.dock 容器(全宽正文列), 顶满左右; 若找不到 dock 则退回原位置
            var dock = null
            try { dock = root.closest('[data-slot="conversation.composer.dock"]') } catch (e) {}
            if (dock) {
              var wrap = root
              while (wrap.parentNode && wrap.parentNode !== dock) wrap = wrap.parentNode
              dock.insertBefore(clone, wrap.nextSibling)
            } else {
              root.parentNode.insertBefore(clone, root.nextSibling)
            }
            buildStatsClone(root, clone, key)
          }
          // 清理孤儿副本: 原 root 不在 DOM 或标记丢失 → 删 clone(经 _dshmRoot 引用判断)
          var orphs = document.querySelectorAll('[data-dshm-stats="1"]')
          for (var oi = 0; oi < orphs.length; oi++) {
            var c = orphs[oi]
            if (!c.parentNode) continue
            var r0 = c._dshmRoot
            if (!r0 || !r0.parentNode || r0.getAttribute('data-dshm-stats-hidden') !== '1') {
              c.parentNode.removeChild(c)
            }
          }
        } catch (e) { /* 忽略 */ }
      }
      // body 子树变化也触发 syncBg + fixStatsLine(React 重渲染可能改背景色/重建统计条)
      var bodyMo = new MutationObserver(function () { syncBg(); fixStatsLine() })
      if (document.body) bodyMo.observe(document.body, { childList: true, subtree: true })
      fixStatsLine()
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
