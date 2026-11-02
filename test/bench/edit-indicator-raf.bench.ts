// @vitest-environment jsdom
import { bench, describe, vi } from 'vitest'
import { createHarness, type LayoutCounts } from './support/editIndicatorHarness'

vi.mock('#imports', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  const { createImportsMock } = await import('./support/nuxtImports')
  return createImportsMock(actual)
})

const FRAMES = 60

type Scenario = { name: string; n: number; hover: boolean; scroll: boolean }

const SCENARIOS: Scenario[] = [
  { name: 'n=1 scrolling', n: 1, hover: false, scroll: true },
  { name: 'n=20 scrolling', n: 20, hover: false, scroll: true },
  { name: 'n=20 scrolling, one hovered', n: 20, hover: true, scroll: true },
  { name: 'n=20 idle', n: 20, hover: false, scroll: false },
]

async function run({ n, hover, scroll }: Scenario) {
  const h = createHarness(Array.from({ length: n }, (_, i) => 40 + (i % 3) * 80))
  await Promise.resolve()
  h.frame()
  if (hover) {
    await h.hover(Math.floor(n / 2))
    h.frame()
  }
  h.resetCounts()
  for (let f = 0; f < FRAMES; f++) {
    if (scroll) {
      h.setScroll(f * 9)
    }
    h.frame()
  }
  const counts: LayoutCounts = { ...h.counts }
  h.destroy()
  return counts
}

// Deterministic counts: wall time under jsdom's fake layout says little, the
// number of layout reads and forced layouts is what costs in a browser.
describe('EditIndicator layout counts over ' + FRAMES + ' frames', async () => {
  for (const scenario of SCENARIOS) {
    const counts = await run(scenario)
    console.log(
      '[edit-indicator] ' + scenario.name + ': ' + JSON.stringify(counts),
    )
  }

  for (const scenario of SCENARIOS) {
    bench(scenario.name + ' (' + FRAMES + ' frames)', async () => {
      await run(scenario)
    })
  }
})
