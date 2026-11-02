import {
  type Component,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
} from 'vue'
import { vi } from 'vitest'
import { eventBus } from '#blokkli/editor/events'
import type { CanvasDrawEvent } from '#blokkli/editor/events'
import type { CommentItem } from '../../src/runtime/editor/features/comments/types'

type Rect = { x: number; y: number; width: number; height: number }

const rects = new Map<string, Rect>()

/**
 * Stands in for the `useBlokkli()` the overlay injects: just the providers it
 * reads.
 */
export const blokkliStub = {
  eventBus: { emit: vi.fn() },
  ui: {
    viewport: ref({ width: 1920 }),
    artboardSize: ref({ width: 800, height: 600 }),
    visibleViewportPadded: ref({ x: 0, y: 0, width: 1900, height: 1000 }),
    getViewportRelativeRect: (rect: Rect) => rect,
  },
  dom: { getBlockRect: (uuid: string) => rects.get(uuid) },
}

declare global {
  var __blokkliStub: typeof blokkliStub
}
// Read by the `vue` mock in the spec and the bench: the mock factory cannot
// import this file, which itself imports `vue`.
globalThis.__blokkliStub = blokkliStub

/**
 * The item itself is not under test; it only counts how often it is rendered.
 */
export const itemRenders = { count: 0 }

export const ItemStub = defineComponent({
  props: ['id', 'roots', 'replies', 'uuids', 'style'],
  setup: () => () => {
    itemRenders.count++
    return h('div')
  },
})

export function makeThreads(count: number) {
  const comments: CommentItem[] = []
  for (let i = 0; i < count; i++) {
    const blockUuid = `block-${i}`
    rects.set(blockUuid, { x: 10, y: i * 100, width: 400, height: 80 })
    comments.push({
      uuid: `comment-${i}`,
      blockUuids: [blockUuid],
      resolved: false,
      body: `Comment ${i}`,
      created: '2026-05-03T14:32:18Z',
      user: null,
    })
  }
  return comments
}

export function moveBlock(uuid: string, y: number) {
  rects.set(uuid, { ...rects.get(uuid)!, y })
}

export function drawEvent(): CanvasDrawEvent {
  return {
    mouseX: 0,
    mouseY: 0,
    mouseArtboard: { x: 0, y: 0 },
    artboardOffset: { x: 0, y: 0 },
    artboardScale: 1,
    artboardSize: { width: 800, height: 600 },
    time: 0,
    selectedUuids: [],
    dpi: 1,
  }
}

/**
 * Mounts the overlay and counts how often it updates after its first render.
 */
export async function mountOverlay(
  Overlay: Component,
  comments: CommentItem[],
) {
  document.body.innerHTML = '<div id="bk-canvas-overlay"></div>'
  itemRenders.count = 0
  const state = reactive({ comments })
  const stats = { updates: 0 }

  const app = createApp({
    render: () =>
      h(Overlay, {
        comments: state.comments,
        showResolved: false,
        recentlyResolved: [],
      }),
  })
  app.mixin({
    beforeUpdate() {
      if (this.$.type === Overlay) {
        stats.updates++
      }
    },
  })
  app.mount(document.createElement('div'))
  await nextTick()

  return {
    state,
    stats,
    /**
     * One animation frame: the canvas draws, then Vue flushes.
     */
    async draw() {
      eventBus.emit('canvas:draw', drawEvent())
      await nextTick()
    },
    unmount: () => app.unmount(),
  }
}
