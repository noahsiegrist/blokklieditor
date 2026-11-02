import { vi } from 'vitest'

/**
 * Stand-ins for what Nuxt provides to `ChartRenderer`, for `vi.mock` factories:
 * the `#imports` composables and the generated type map. This file must not
 * import `vue`, the factories run while `vue` is being mocked.
 */
export async function importsMock() {
  // The unit project aliases `#imports` to `vue`, so mocking it replaces `vue`
  // for every importer: spread the real module instead of importing it.
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...vue,
    useBlokkliRuntimeConfig: () => ({
      resolveColorHex: () => '#336699',
      colorPalette: vue.computed(() => ['a']),
    }),
  }
}

export function chartComponentsMock() {
  return {
    chartTypeComponents: {
      bar: { render: () => null },
    },
  }
}
