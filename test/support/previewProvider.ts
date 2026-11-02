import { vi } from 'vitest'
import { createApp, defineComponent, h, ref, Suspense } from 'vue'

// Mounts the real PreviewProvider as a standalone preview (no parent iframe)
// with the editor's runtime stubbed out, so tests see only its polling.

const state = vi.hoisted(() => ({
  adapter: {} as Record<string, unknown>,
}))

vi.mock('#imports', async () => ({
  ...(await vi.importActual<typeof import('vue')>('vue')),
  useRouter: () => ({}),
  useAsyncData: () => ({
    data: ref(null),
    refresh: async () => {},
    error: ref(null),
  }),
}))
vi.mock('#blokkli-build/edit-adapter', () => ({
  default: async () => state.adapter,
}))
vi.mock('#blokkli-build/styles.css', () => ({}))
vi.mock('#blokkli/editor/providers/broadcast', () => ({
  default: () => ({ emit: () => {} }),
}))
vi.mock('#blokkli/editor/providers/definition', () => ({ default: () => ({}) }))
vi.mock('#blokkli/editor/composables', () => ({ addElementClasses: () => {} }))

export type PreviewAdapter = {
  getLastChanged?: () => Promise<string>
}

export async function mountPreviewProvider(adapter: PreviewAdapter) {
  state.adapter = {
    loadState: async () => ({}),
    mapState: (v: unknown) => v,
    ...adapter,
  }
  const { default: PreviewProvider } =
    await import('#blokkli/editor/components/PreviewProvider.vue')
  const root = document.createElement('div')
  const app = createApp(
    defineComponent({
      render: () =>
        h(Suspense, null, {
          default: () =>
            h(PreviewProvider, {
              entityType: 'node',
              entityUuid: 'uuid',
              entityBundle: 'page',
              language: 'en',
              providerType: 'default',
            } as never),
        }),
    }),
  )
  app.mount(root)
  await vi.advanceTimersByTimeAsync(0)
  return { unmount: () => app.unmount() }
}

export function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}
