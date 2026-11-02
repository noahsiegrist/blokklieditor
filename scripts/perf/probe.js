// Runs in the page before any of its scripts (scripts/perf/measure.ts).
//
// Records when Nuxt creates its app, mounts it and resolves its suspense, the
// long tasks, and when the editor is interactive. The Nuxt app is found by
// wrapping Object.defineProperty: Nuxt defines `$nuxt` on the Vue app with it,
// and nothing else exposes the app early enough to hook `app:beforeMount`.
;(function () {
  const probe = { longTasks: [] }
  window.__PERF__ = probe

  const define = Object.defineProperty
  Object.defineProperty = function (target, key, desc) {
    const result = define.call(Object, target, key, desc)
    if (key === '$nuxt' && probe.created === undefined) {
      probe.created = performance.now()
      const nuxt =
        desc.value !== undefined ? desc.value : desc.get && desc.get()
      const hook = function (name, field) {
        nuxt.hook(name, function () {
          probe[field] = performance.now()
        })
      }
      if (nuxt && nuxt.hook) {
        hook('app:beforeMount', 'beforeMount')
        hook('app:mounted', 'mounted')
        hook('app:suspense:resolve', 'suspenseResolved')
      }
    }
    return result
  }

  new PerformanceObserver(function (list) {
    for (const entry of list.getEntries()) {
      probe.longTasks.push(entry.duration)
    }
  }).observe({ type: 'longtask', buffered: true })

  // The editor is interactive once it exposes its app and the init overlay is
  // gone: the signal the E2E specs wait for
  // (test/e2e-drupal/support/session.ts, waitForEditorReady).
  function check() {
    const editor = window.__BLOKKLI__
    if (
      editor &&
      editor.app &&
      !document.querySelector('[data-test="init-overlay"]')
    ) {
      probe.ready = performance.now()
      return
    }
    requestAnimationFrame(check)
  }
  requestAnimationFrame(check)
})()
