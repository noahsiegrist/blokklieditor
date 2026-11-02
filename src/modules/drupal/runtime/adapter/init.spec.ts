import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createAdapterInitHarness,
  GRAPHQL_DELAY_MS,
} from '../../../../../test/support/drupalAdapterInit'

vi.mock('vue', async (importOriginal) => {
  const { graphqlMocks } =
    await import('../../../../../test/support/drupalAdapterInit')
  return { ...(await importOriginal<typeof import('vue')>()), ...graphqlMocks }
})
// Generated at build time and importing the feature components.
vi.mock('#blokkli-build/features', () => ({ availableFeaturesAtBuild: [] }))
vi.mock('#nuxt-graphql-middleware/sources', () => ({ operationSources: {} }))
vi.mock('#graphql-operations', () => ({
  ParagraphsBlokkliRemoteVideoProvider: {},
}))

describe('Drupal adapter init', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('starts pbConfig and pbEntityConfig at the same time', async () => {
    const harness = await createAdapterInitHarness()
    const init = harness.init()
    await vi.advanceTimersByTimeAsync(0)

    expect(harness.calls.map((c) => c.name)).toEqual([
      'pbConfig',
      'pbEntityConfig',
    ])

    await vi.advanceTimersByTimeAsync(GRAPHQL_DELAY_MS)
    await init
    expect(harness.elapsed()).toBe(GRAPHQL_DELAY_MS)
  })

  test('maps both responses', async () => {
    const harness = await createAdapterInitHarness()
    const init = harness.init()
    await vi.advanceTimersByTimeAsync(GRAPHQL_DELAY_MS * 2)
    const adapter = await init

    expect(adapter.buildAnchorLink?.('abc')).toBe('/node/1#abc')
    await expect(adapter.getAllBundles?.()).resolves.toHaveLength(1)
  })
})
