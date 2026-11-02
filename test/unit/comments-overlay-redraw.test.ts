// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import Overlay from '../../src/runtime/editor/features/comments/Overlay/index.vue'
import {
  makeThreads,
  moveBlock,
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

let overlay: Awaited<ReturnType<typeof mountOverlay>> | undefined

afterEach(() => {
  overlay?.unmount()
  overlay = undefined
})

describe('comments overlay', () => {
  test('does not re-render when a draw leaves every indicator where it was', async () => {
    overlay = await mountOverlay(Overlay, makeThreads(20))
    await overlay.draw()
    const updatesAfterFirstDraw = overlay.stats.updates

    for (let i = 0; i < 120; i++) {
      await overlay.draw()
    }

    expect(updatesAfterFirstDraw).toBe(1)
    expect(overlay.stats.updates).toBe(1)
  })

  test('re-renders when a commented block moves', async () => {
    overlay = await mountOverlay(Overlay, makeThreads(3))
    await overlay.draw()

    moveBlock('block-1', 500)
    await overlay.draw()

    expect(overlay.stats.updates).toBe(2)
  })

  test('re-renders when a reply arrives', async () => {
    const comments = makeThreads(3)
    overlay = await mountOverlay(Overlay, comments)
    await overlay.draw()

    overlay.state.comments = [
      ...comments,
      {
        uuid: 'reply-1',
        parentUuid: 'comment-0',
        resolved: false,
        body: 'Reply',
        created: '2026-05-04T08:00:00Z',
        user: null,
      },
    ]
    await overlay.draw()

    expect(overlay.stats.updates).toBe(2)
  })

  test('re-renders when a thread is resolved', async () => {
    const comments = makeThreads(3)
    overlay = await mountOverlay(Overlay, comments)
    await overlay.draw()

    overlay.state.comments = comments.map((c, i) =>
      i === 0 ? { ...c, resolved: true } : c,
    )
    await overlay.draw()

    expect(overlay.stats.updates).toBe(2)
  })
})
