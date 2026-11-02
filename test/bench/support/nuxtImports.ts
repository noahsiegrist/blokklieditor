import type * as Vue from 'vue'

type VueModule = typeof Vue

/**
 * Stand-in for the `#imports` module: the unit project aliases it to `vue`,
 * which has no `useState`. Receives the real `vue` because importing it from
 * here would resolve to the mock itself (`#imports` is `vue`) and deadlock.
 */
export function createImportsMock(actual: VueModule) {
  const states = ((globalThis as any).__bkTestStates ??= new Map<
    string,
    Vue.Ref<unknown>
  >()) as Map<string, Vue.Ref<unknown>>

  return {
    ...actual,
    useState<T>(key: string, init: () => T): Vue.Ref<T> {
      if (!states.has(key)) {
        states.set(key, actual.ref(init()))
      }
      return states.get(key) as Vue.Ref<T>
    },
  }
}

export function resetStates() {
  ;(globalThis as any).__bkTestStates?.clear()
}
