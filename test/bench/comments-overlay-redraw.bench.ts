// @vitest-environment jsdom
import { bench, describe, vi } from 'vitest'
import Overlay from '../../src/runtime/editor/features/comments/Overlay/index.vue'
import {
  itemRenders,
  makeThreads,
  mountOverlay,
} from '../support/commentsOverlay'

// The `#imports` alias resolves to `vue`: the SFC gets Vue plus `useBlokkli`.
vi.mock('vue', async () => ({
  ...(await vi.importActual<typeof import('vue')>('vue')),
  useBlokkli: () => globalThis.__blokkliStub,
}))
vi.mock(
  '../../src/runtime/editor/features/comments/Overlay/Item/index.vue',
  async () => ({
    default: (await import('../support/commentsOverlay')).ItemStub,
  }),
)

const THREADS = 20
const DRAWS = 120

// Deterministic counts: overlay updates for DRAWS identical draws.
const counter = await mountOverlay(Overlay, makeThreads(THREADS))
await counter.draw()
const updatesAfterFirstDraw = counter.stats.updates
for (let i = 0; i < DRAWS; i++) {
  await counter.draw()
}
console.log(
  `[counts] ${THREADS} threads, ${DRAWS} identical draws after the first: ` +
    `overlay updates ${counter.stats.updates - updatesAfterFirstDraw} ` +
    `(${counter.stats.updates} including the first draw), item renders ${itemRenders.count}`,
)
counter.unmount()

describe(`comments overlay, ${THREADS} threads`, async () => {
  const overlay = await mountOverlay(Overlay, makeThreads(THREADS))
  await overlay.draw()

  bench(
    `${DRAWS} identical canvas:draw frames`,
    async () => {
      for (let i = 0; i < DRAWS; i++) {
        await overlay.draw()
      }
    },
    { time: 1000 },
  )
})
