// @vitest-environment jsdom
import { bench, describe, vi } from 'vitest'
import { mountPreviewProvider, setHidden } from '../support/previewProvider'

const MINUTE = 60 * 1000
const MINUTES = 10

async function countCalls(hidden: boolean, activityEveryMs?: number) {
  vi.useFakeTimers()
  setHidden(hidden)
  const getLastChanged = vi.fn(async () => '2026-01-01T00:00:00Z')
  const { unmount } = await mountPreviewProvider({ getLastChanged })
  if (activityEveryMs) {
    for (let t = 0; t < MINUTES * MINUTE; t += activityEveryMs) {
      await vi.advanceTimersByTimeAsync(activityEveryMs)
      document.dispatchEvent(new Event('pointerdown'))
    }
  } else {
    await vi.advanceTimersByTimeAsync(MINUTES * MINUTE)
  }
  unmount()
  vi.useRealTimers()
  setHidden(false)
  return getLastChanged.mock.calls.length
}

const scenarios = [
  { name: 'visible, idle', hidden: false },
  { name: 'hidden', hidden: true },
  { name: 'visible, activity every 10 s', hidden: false, every: 10_000 },
]

const results: Record<string, number> = {}

describe(`getLastChanged calls over ${MINUTES} minutes`, () => {
  for (const { name, hidden, every } of scenarios) {
    bench(
      name,
      async () => {
        results[name] = await countCalls(hidden, every)
      },
      {
        iterations: 3,
        warmupIterations: 1,
        teardown: () => {
          const calls = results[name]!
          console.log(
            `[count] ${name}: ${calls} calls in ${MINUTES} min, ${Math.round((calls * 60) / MINUTES)} per hour`,
          )
        },
      },
    )
  }
})
