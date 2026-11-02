// @vitest-environment jsdom
/**
 * Editor open: what the init overlay waits for, with 100 ms per request.
 *
 *   bunx vitest bench --run --project unit test/bench/editor-init-waterfall.bench.ts
 *
 * Real production code: the texts provider and the comments feature (mounted
 * in a Suspense, as the features renderer does). The two lines of
 * EditProvider.vue that order the translation chunk and `adapter.loadState()`
 * cannot be mounted here, so `initEditState` repeats them for whichever
 * version of the texts provider is checked out.
 *
 * The request counts and the poll count are deterministic. The milliseconds
 * are timer-bound (about the sum or the max of the delays) and vary by a few
 * ms with machine load.
 */
import { bench, describe, vi } from 'vitest'
import { Suspense, createApp, defineComponent, h, nextTick } from 'vue'

const DELAY = 100

const { harness } = vi.hoisted(() => ({
  harness: {
    requests: [] as string[],
    mainLayoutElement: null as null | HTMLElement,
  },
}))

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function request<T>(name: string, value: T): Promise<T> {
  harness.requests.push(name)
  await wait(DELAY)
  return value
}

vi.mock('#blokkli-build/translations', () => ({
  translationLoaders: {
    en: () => request('translations', { save: 'Save' }),
  },
}))

vi.mock('#blokkli-build/editor-config', () => ({
  defaultLanguage: 'en',
  forceDefaultLanguage: false,
}))

vi.mock('#imports', async () => {
  const vue = await import('vue')
  return {
    ...vue,
    defineBlokkliFeature: () => ({
      adapter: { loadComments: () => request('comments', []) },
    }),
    useRoute: () => ({ query: {} }),
    useBlokkli: () => ({
      $t: (_key: string, fallback: string) => fallback,
      selection: { uuids: vue.ref([]) },
      ui: { mainLayoutElement: vue.ref(harness.mainLayoutElement) },
      storage: { useWithContextPrefix: (_k: string, d: boolean) => vue.ref(d) },
      eventBus: { emit: () => {} },
      permissions: { hasPermission: () => false },
    }),
  }
})

vi.mock('#blokkli/editor/plugins', async () => {
  const { defineComponent, h } = await import('vue')
  const passThrough = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  })
  return { PluginSidebar: passThrough, PluginItemAction: passThrough }
})

vi.mock('#blokkli/editor/components', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    BlokkliTransition: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', slots.default?.()),
    }),
  }
})

vi.mock('#blokkli/editor/composables', async () => ({
  usePolling: (await import('../../src/runtime/editor/composables/usePolling'))
    .usePolling,
}))

vi.mock('../../src/runtime/editor/features/comments/Sidebar/index.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))
vi.mock('../../src/runtime/editor/features/comments/Overlay/index.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))
vi.mock('../../src/runtime/editor/features/comments/AddForm/index.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))

import * as texts from '../../src/runtime/editor/providers/texts'
import Comments from '../../src/runtime/editor/features/comments/index.vue'

const loadState = () => request('loadState', {})

/** The translation chunk and the edit state, as EditProvider.vue orders them. */
async function initEditState() {
  const { startTextProvider } = texts as Partial<{
    startTextProvider: (language: string) => { ready: Promise<void> }
  }>
  if (startTextProvider) {
    await Promise.all([loadState(), startTextProvider('en').ready])
    return
  }
  await texts.default('en')
  await loadState()
}

/** Mount the comments feature and wait until its setup no longer suspends. */
async function featureResolved() {
  const root = document.createElement('div')
  harness.mainLayoutElement = document.createElement('div')
  let resolved!: () => void
  const done = new Promise<void>((r) => (resolved = r))
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(Suspense, { onResolve: resolved }, () => h(Comments)),
    }),
  )
  app.mount(root)
  await nextTick()
  await done
  return () => app.unmount()
}

async function measure(name: string, run: () => Promise<unknown>) {
  harness.requests = []
  const start = performance.now()
  await run()
  const ms = performance.now() - start
  return { name, ms, requests: [...harness.requests] }
}

async function report() {
  // The first mount compiles and imports the component tree.
  const warmUp = await featureResolved()
  await wait(DELAY + 20)
  warmUp()

  const state = await measure('translations + loadState', initEditState)
  let unmount = () => {}
  const comments = await measure('comments feature setup', async () => {
    unmount = await featureResolved()
  })
  // Let the first poll of the feature finish before the next measurement.
  await wait(DELAY + 20)
  unmount()

  const rows = [state, comments]
  const total = rows.reduce((sum, r) => sum + r.ms, 0)
  console.log(
    [
      '',
      'editor init waterfall, ' + DELAY + ' ms per request',
      ...rows.map(
        (r) =>
          `  ${r.name.padEnd(28)} ${r.ms.toFixed(0).padStart(4)} ms  [${r.requests.join(', ')}]`,
      ),
      `  critical path (sum)          ${total.toFixed(0).padStart(4)} ms`,
      '',
    ].join('\n'),
  )
}

describe('editor init waterfall', () => {
  bench(
    'translations + loadState + comments feature setup',
    async () => {
      await initEditState()
      const unmount = await featureResolved()
      unmount()
    },
    { iterations: 5, warmupIterations: 1, time: 0 },
  )
})

await report()
