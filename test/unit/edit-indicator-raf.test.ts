// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHarness } from '../bench/support/editIndicatorHarness'

// `#imports` is aliased to `vue` in the unit project, which has no `useState`.
vi.mock('#imports', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  const { createImportsMock } = await import('../bench/support/nuxtImports')
  return createImportsMock(actual)
})

let harness: ReturnType<typeof createHarness> | undefined

afterEach(() => {
  harness?.destroy()
  harness = undefined
})

// Short blocks collide (button pushed below the previous block), the tall one
// is taller than 100px (button anchored GAP below its top).
const HEIGHTS = [30, 200, 40, 300, 60]

async function setup(heights: number[]) {
  harness = createHarness(heights)
  // Let onMounted registrations and computed state settle.
  await Promise.resolve()
  harness.frame()
  harness.resetCounts()
  return harness
}

describe('EditIndicator layout loop', () => {
  it('reads every layout value once per frame and never after a write', async () => {
    const h = await setup(Array.from({ length: 20 }, () => 120))

    for (let i = 0; i < 10; i++) {
      h.setScroll(i * 7)
      h.frame()
    }

    expect(h.counts.forcedLayouts).toBe(0)
    // One target rect and one button height per indicator and frame.
    expect(h.counts.rectReads).toBeLessThanOrEqual(20 * 10)
    expect(h.counts.heightReads).toBeLessThanOrEqual(20 * 10)
  })

  it('does not force a layout for the hover overlay', async () => {
    const h = await setup(HEIGHTS)
    await h.hover(2)

    h.setScroll(5)
    h.frame()

    expect(h.counts.forcedLayouts).toBe(0)
    expect(h.overlayStyle(2)).toEqual({
      width: '300px',
      height: '40px',
      transform: 'translate(0px, ' + (30 + 20 + 200 + 20 - 5) + 'px)',
    })
  })

  it('runs a single animation frame loop for all indicators', async () => {
    const h = await setup(HEIGHTS)

    h.frame()

    expect(h.counts.rafCallbacks).toBe(1)
    expect(h.pendingFrames()).toBe(1)
  })

  it('does not write styles while nothing moves', async () => {
    const h = await setup(HEIGHTS)

    h.frame()
    h.frame()

    expect(h.counts.writes).toBe(0)
  })

  it('positions the buttons and tracks scroll', async () => {
    const h = await setup(HEIGHTS)
    h.frame()
    const atTop = h.transforms()

    h.setScroll(100)
    h.frame()
    const scrolled = h.transforms()

    expect(atTop).toMatchInlineSnapshot(`
      [
        "translateY(-35px)",
        "translateY(65px)",
        "translateY(245px)",
        "translateY(345px)",
        "translateY(645px)",
      ]
    `)
    expect(scrolled).toMatchInlineSnapshot(`
      [
        "translateY(-135px)",
        "translateY(15px)",
        "translateY(145px)",
        "translateY(245px)",
        "translateY(545px)",
      ]
    `)
  })

  it('keeps updating after the first indicator unmounts', async () => {
    const h = await setup(HEIGHTS)
    h.wrappers[0]!.unmount()
    await Promise.resolve()
    h.resetCounts()

    h.setScroll(50)
    h.frame()
    h.frame()

    expect(h.counts.rafCallbacks).toBe(2)
    expect(h.counts.rectReads).toBeGreaterThan(0)
    expect(h.counts.forcedLayouts).toBe(0)
  })

  it('stops requesting frames once every indicator is gone', async () => {
    const h = await setup(HEIGHTS)
    h.wrappers.forEach((w) => w.unmount())

    expect(h.pendingFrames()).toBe(0)
  })
})
