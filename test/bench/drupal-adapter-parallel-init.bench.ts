import { bench, describe, vi } from 'vitest'
import {
  createAdapterInitHarness,
  GRAPHQL_DELAY_MS,
  type GraphqlCall,
} from '../support/drupalAdapterInit'

vi.mock('vue', async (importOriginal) => {
  const { graphqlMocks } = await import('../support/drupalAdapterInit')
  return { ...(await importOriginal<typeof import('vue')>()), ...graphqlMocks }
})
// Generated at build time and importing the feature components.
vi.mock('#blokkli-build/features', () => ({ availableFeaturesAtBuild: [] }))
vi.mock('#nuxt-graphql-middleware/sources', () => ({ operationSources: {} }))
vi.mock('#graphql-operations', () => ({
  ParagraphsBlokkliRemoteVideoProvider: {},
}))

function waterfall(calls: GraphqlCall[], origin: number): string {
  return calls
    .map((c) => {
      const from = c.startedAt - origin
      const to = (c.finishedAt ?? c.startedAt) - origin
      return `${c.name.padEnd(14)} ${' '.repeat(from / 10)}${'#'.repeat((to - from) / 10)} ${from}-${to} ms`
    })
    .join('\n')
}

// Deterministic: with fake timers the init time is exactly the sum of the
// round trips that run one after the other.
async function virtualInit() {
  vi.useFakeTimers()
  try {
    const harness = await createAdapterInitHarness()
    const origin = Date.now()
    const init = harness.init()
    await vi.advanceTimersByTimeAsync(GRAPHQL_DELAY_MS * 10)
    await init
    return {
      requests: harness.calls.length,
      initMs: Math.max(...harness.calls.map((c) => c.finishedAt ?? 0)) - origin,
      waterfall: waterfall(harness.calls, origin),
    }
  } finally {
    vi.useRealTimers()
  }
}

describe(`Drupal adapter init, ${GRAPHQL_DELAY_MS} ms per GraphQL query`, async () => {
  const virtual = await virtualInit()
  console.log(
    [
      `GraphQL requests: ${virtual.requests}`,
      `Init time (fake timers): ${virtual.initMs} ms`,
      virtual.waterfall,
    ].join('\n'),
  )

  // Real timers: wall time of one adapter init, noisy.
  bench(
    'adapter init',
    async () => {
      const harness = await createAdapterInitHarness()
      await harness.init()
    },
    { iterations: 10, warmupIterations: 1, time: 0, warmupTime: 0 },
  )
})
