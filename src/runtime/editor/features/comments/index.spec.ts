// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Suspense,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
} from 'vue'
import type { CommentItem } from './types'

const UUID = 'a4f1b3c2-0000-4000-8000-000000000001'

const { harness } = vi.hoisted(() => ({
  harness: {
    loadComments: null as null | (() => Promise<unknown[]>),
    emit: null as null | ((...args: unknown[]) => void),
    query: {} as Record<string, string>,
    mainLayoutElement: null as null | HTMLElement,
  },
}))

vi.mock('#imports', async () => {
  const vue = await import('vue')
  return {
    ...vue,
    defineBlokkliFeature: () => ({
      adapter: { loadComments: () => harness.loadComments!() },
    }),
    useRoute: () => ({ query: harness.query }),
    useBlokkli: () => ({
      $t: (_key: string, fallback: string) => fallback,
      selection: { uuids: vue.ref([]) },
      ui: { mainLayoutElement: vue.ref(harness.mainLayoutElement) },
      storage: {
        useWithContextPrefix: (_key: string, d: boolean) => vue.ref(d),
      },
      eventBus: { emit: (...args: unknown[]) => harness.emit!(...args) },
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

// The real hook, without the barrel that pulls in the whole editor.
vi.mock('#blokkli/editor/composables', async () => ({
  usePolling: (await import('../../composables/usePolling')).usePolling,
}))

vi.mock('./Sidebar/index.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: ['comments'],
      setup: (props) => () =>
        h('span', { 'data-comment-count': props.comments.length }),
    }),
  }
})

// `__esModule` so that `defineAsyncComponent` unwraps the default export.
vi.mock('./Overlay/index.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))
vi.mock('./AddForm/index.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))

import Comments from './index.vue'

function comment(uuid: string): CommentItem {
  return { uuid, resolved: false, parentUuid: null } as unknown as CommentItem
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

let app: App | null = null
let root: HTMLElement

function mountFeature() {
  const state = { resolved: false }
  const Host = defineComponent({
    setup: () => () =>
      h(Suspense, { onResolve: () => (state.resolved = true) }, () =>
        h(Comments),
      ),
  })
  app = createApp(Host)
  app.mount(root)
  return state
}

const commentCount = () =>
  root.querySelector('[data-comment-count]')?.getAttribute('data-comment-count')

describe('comments feature', () => {
  beforeEach(() => {
    root = document.createElement('div')
    harness.mainLayoutElement = document.createElement('div')
    document.body.append(root, harness.mainLayoutElement)
    harness.query = {}
    harness.emit = vi.fn()
  })

  afterEach(() => {
    app?.unmount()
    app = null
    root.remove()
    harness.mainLayoutElement?.remove()
    vi.useRealTimers()
  })

  it('does not hold back the editor while the comments are loading', async () => {
    const pending = deferred<CommentItem[]>()
    harness.loadComments = () => pending.promise

    const state = mountFeature()
    await nextTick()
    await nextTick()

    expect(state.resolved).toBe(true)
    pending.resolve([])
  })

  it('loads the comments once the feature is mounted', async () => {
    const loadComments = vi.fn(async () => [comment(UUID), comment('b')])
    harness.loadComments = loadComments

    mountFeature()
    await vi.waitFor(() => expect(commentCount()).toBe('2'))

    expect(loadComments).toHaveBeenCalledTimes(1)
  })

  it('opens the sidebar for a deep link once the comments have arrived', async () => {
    harness.query = { blokkliComment: UUID }
    const pending = deferred<CommentItem[]>()
    harness.loadComments = () => pending.promise

    mountFeature()
    await nextTick()
    expect(harness.emit).not.toHaveBeenCalled()

    pending.resolve([comment(UUID)])

    await vi.waitFor(() =>
      expect(harness.emit).toHaveBeenCalledWith('sidebar:open', 'comments'),
    )
  })

  it('keeps polling every 60 seconds', async () => {
    vi.useFakeTimers()
    const loadComments = vi.fn(async () => [])
    harness.loadComments = loadComments

    mountFeature()
    await vi.advanceTimersByTimeAsync(0)
    expect(loadComments).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(loadComments).toHaveBeenCalledTimes(2)
  })
})
