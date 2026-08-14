// mobile-AndroidNotify 客户端 bundle(手写, 与 dsh client bundle 格式一致)
// 作用: 页面加载时读 URL ?session=<id>, 等会话列表就绪后 sessions.open(id) 跳转
// (配合 host 半区通知带上的 ?session= url)
window.__ModuleLoader__.load({
  id: 'mobile-AndroidNotify',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var name = 'mobile-AndroidNotify'
    var inject = ['sessions']

    function apply(ctx) {
      var sessions = ctx.get('sessions')
      if (!sessions || !sessions.list) return
      var search = typeof location !== 'undefined' ? location.search : ''
      var target = new URLSearchParams(search).get('session')
      if (!target) return

      var list = sessions.list
      if (typeof list.subscribe !== 'function' || typeof list.getSnapshot !== 'function') return

      var done = false
      var unsub = null
      var timer = null

      function finish() {
        if (done) return
        done = true
        if (timer !== null) clearTimeout(timer)
        if (unsub !== null) unsub()
      }

      function check() {
        if (done) return
        try {
          var snap = list.getSnapshot()
          if (snap && Array.isArray(snap.ids) && snap.ids.indexOf(target) >= 0) {
            finish()
            sessions.open(target)
          }
        } catch (e) { /* 忽略 */ }
      }

      unsub = list.subscribe(check)
      timer = setTimeout(finish, 20000)
      check()
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
