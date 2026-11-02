import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import EditIndicator from '../../../src/runtime/editor/components/EditIndicator.vue'
import { resetStates } from './nuxtImports'

export type LayoutCounts = {
  /** getBoundingClientRect calls. */
  rectReads: number
  /** offsetHeight reads. */
  heightReads: number
  /** Style writes (transform, width, height). */
  writes: number
  /**
   * Layout reads that hit a layout invalidated by a style write earlier in the
   * same frame. Each one is a synchronous forced layout in a browser.
   */
  forcedLayouts: number
  /** requestAnimationFrame callbacks that ran. */
  rafCallbacks: number
}

const EMPTY: LayoutCounts = {
  rectReads: 0,
  heightReads: 0,
  writes: 0,
  forcedLayouts: 0,
  rafCallbacks: 0,
}

const BUTTON_HEIGHT = 50

/**
 * Mounts `heights.length` EditIndicators, each pointing at a stacked block of
 * the given height, with a fake layout engine that counts layout reads and
 * style writes and a manually driven requestAnimationFrame.
 */
export function createHarness(heights: number[], { gap = 20 } = {}) {
  resetStates()

  const counts: LayoutCounts = { ...EMPTY }
  let dirty = false
  let scrollY = 0
  let queue = new Map<number, FrameRequestCallback>()
  let nextId = 1

  const layout = new WeakMap<Element, { top: number; height: number }>()

  const onRead = () => {
    if (dirty) {
      counts.forcedLayouts++
      dirty = false
    }
  }
  const onWrite = () => {
    counts.writes++
    dirty = true
  }

  const originals: Array<() => void> = []

  const rectProto = Element.prototype
  const originalRect = rectProto.getBoundingClientRect
  rectProto.getBoundingClientRect = function (this: Element) {
    counts.rectReads++
    onRead()
    const l = layout.get(this) ?? { top: 0, height: 0 }
    const top = l.top - scrollY
    return {
      x: 0,
      y: top,
      left: 0,
      right: 300,
      width: 300,
      top,
      height: l.height,
      bottom: top + l.height,
      toJSON() {},
    } as DOMRect
  }
  originals.push(() => (rectProto.getBoundingClientRect = originalRect))

  const originalHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  )
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      counts.heightReads++
      onRead()
      return BUTTON_HEIGHT
    },
  })
  originals.push(() => {
    if (originalHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        originalHeight,
      )
    }
  })

  for (const prop of ['transform', 'width', 'height']) {
    const proto = Object.getPrototypeOf(document.createElement('div').style)
    const desc = Object.getOwnPropertyDescriptor(proto, prop)
    if (!desc?.set) {
      throw new Error('CSSStyleDeclaration.' + prop + ' is not an accessor')
    }
    Object.defineProperty(proto, prop, {
      configurable: true,
      get: desc.get,
      set(value) {
        onWrite()
        desc.set!.call(this, value)
      },
    })
    originals.push(() => Object.defineProperty(proto, prop, desc))
  }

  const originalRaf = window.requestAnimationFrame
  const originalCaf = window.cancelAnimationFrame
  window.requestAnimationFrame = (cb) => {
    const id = nextId++
    queue.set(id, cb)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    queue.delete(id)
  }
  originals.push(() => {
    window.requestAnimationFrame = originalRaf
    window.cancelAnimationFrame = originalCaf
  })

  const targets: HTMLElement[] = []
  let top = 0
  heights.forEach((height, i) => {
    const el = document.createElement('div')
    el.setAttribute('data-provider-uuid', 'uuid-' + i)
    document.body.appendChild(el)
    layout.set(el, { top, height })
    top += height + gap
    targets.push(el)
  })

  // The indicators teleport to <body>, so they are not part of the wrapper.
  const buttonEls: HTMLElement[] = []
  const overlayEls: HTMLElement[] = []
  const wrappers: VueWrapper[] = heights.map((_, i) => {
    const wrapper = mount(EditIndicator, {
      props: {
        uuid: 'uuid-' + i,
        language: 'en',
        entityType: 'node',
        permissions: ['edit'],
      },
    })
    const buttons = document.querySelectorAll<HTMLElement>('.bk-edit-indicator')
    const button = buttons[buttons.length - 1]!
    buttonEls.push(button)
    overlayEls.push(button.nextElementSibling as HTMLElement)
    return wrapper
  })

  return {
    counts,
    wrappers,
    targets,
    resetCounts() {
      Object.assign(counts, EMPTY)
      dirty = false
    },
    setScroll(y: number) {
      scrollY = y
    },
    /** Runs one animation frame: every queued callback, once. */
    frame() {
      dirty = false
      const current = queue
      queue = new Map()
      for (const cb of current.values()) {
        counts.rafCallbacks++
        cb(0)
      }
    },
    pendingFrames: () => queue.size,
    /** Button transforms in document order of their target elements. */
    transforms: () => buttonEls.map((el) => el.style.transform),
    async hover(index: number) {
      buttonEls[index]!.dispatchEvent(new Event('mouseenter'))
      await nextTick()
    },
    overlayStyle(index: number) {
      const { width, height, transform } = overlayEls[index]!.style
      return { width, height, transform }
    },
    destroy() {
      wrappers.forEach((w) => w.unmount())
      targets.forEach((t) => t.remove())
      originals.forEach((restore) => restore())
      resetStates()
    },
  }
}
