import { bench, describe, vi, afterAll } from 'vitest'
import { clone, createStateFixture } from './stateFixture'

vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  provide: vi.fn(),
}))
vi.mock('nuxt/app', () => ({
  useState: () => ({ value: undefined }),
  refreshNuxtData: vi.fn(),
}))
vi.mock('#blokkli/editor/composables', () => ({
  onBlokkliEvent: vi.fn(),
  addElementClasses: vi.fn(),
}))
vi.mock('#blokkli/editor/events', () => ({ emitMessage: vi.fn() }))

vi.stubGlobal('document', { body: {} })

// 6 fields x 50 blocks = 300 blocks with 20 options each, as the provider
// holds them in its reactive maps.
const { state, initial } = await createStateFixture({
  fields: 6,
  blocks: 50,
  optionsPerBlock: 20,
})

const unchanged = clone(initial)
const changedA = clone(initial)
const changedB = clone(initial)
// One field and one block's option differ between A and B.
changedB.mutatedState!.fields![2]!.list[10]!.props = { title: 'Changed' }
changedB.mutatedState!.mutatedOptions!['block-3-4']!.option7 = 'changed'

let toggle = false

// Deterministic: what one setContext costs in serialisation work.
function countStringify(next: typeof initial) {
  const spy = vi.spyOn(JSON, 'stringify')
  state.setOverrideState(next)
  const calls = spy.mock.calls.length
  const chars = spy.mock.results.reduce(
    (sum, r) => sum + (typeof r.value === 'string' ? r.value.length : 0),
    0,
  )
  spy.mockRestore()
  return { calls, chars }
}

state.setOverrideState(changedA)
const unchangedCounts = countStringify(changedA)
const changedCounts = countStringify(changedB)
countStringify(changedA)

afterAll(() => {
  console.log(
    'JSON.stringify per setContext, unchanged state:',
    JSON.stringify(unchangedCounts),
    '| one field + one option changed:',
    JSON.stringify(changedCounts),
  )
})

describe('setContext on 300 blocks x 20 options', () => {
  bench('unchanged state', () => {
    state.setOverrideState(unchanged)
  })

  bench('one field changed', () => {
    toggle = !toggle
    state.setOverrideState(toggle ? changedB : changedA)
  })
})
