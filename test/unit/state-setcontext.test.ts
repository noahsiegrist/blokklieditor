import { describe, it, expect, vi, afterEach } from 'vitest'
import { isReactive, watch } from 'vue'
import { clone, createStateFixture } from '../bench/stateFixture'

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

// The state provider touches `document.body`.
vi.stubGlobal('document', { body: {} })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setContext', () => {
  it('does not stringify the reactive page state', async () => {
    const { state, initial } = await createStateFixture({
      blocks: 20,
      optionsPerBlock: 5,
    })
    const stringify = vi.spyOn(JSON, 'stringify')

    state.applyMutationState({})
    state.setOverrideState(clone(initial))

    const reactiveArgs = stringify.mock.calls.filter(([value]) =>
      isReactive(value),
    )
    expect(stringify).toHaveBeenCalled()
    expect(reactiveArgs).toHaveLength(0)
  })

  it('never exposes an emptied block lookup while reloading', async () => {
    const { state, initial } = await createStateFixture({ blocks: 5 })
    const seen: (string | null)[] = []
    watch(
      () => state.getFieldKeyForUuid('block-0-1'),
      (key) => seen.push(key),
      { flush: 'sync' },
    )

    state.setOverrideState(clone(initial))

    expect(seen).toEqual([])
  })

  it('keeps unchanged fields and options, replaces changed ones', async () => {
    const { state, initial } = await createStateFixture({ blocks: 5 })
    const field = state.getMutatedField('host', 'field_0')
    const options = state.mutatedOptions['block-0-1']

    state.setOverrideState(clone(initial))
    expect(state.getMutatedField('host', 'field_0')).toBe(field)
    expect(state.mutatedOptions['block-0-1']).toBe(options)

    const changed = clone(initial)
    changed.mutatedState!.fields![0]!.list[2]!.props = { title: 'Changed' }
    changed.mutatedState!.mutatedOptions!['block-0-1']!.option0 = 'changed'
    state.setOverrideState(changed)

    expect(state.getMutatedField('host', 'field_0')).not.toBe(field)
    expect(state.getMutatedField('host', 'field_0')?.list[2]?.props).toEqual({
      title: 'Changed',
    })
    expect(state.mutatedOptions['block-0-1']).not.toBe(options)
    expect(state.mutatedOptions['block-0-1']?.option0).toBe('changed')

    // Back to the original: it is a change again, not a stale cache hit.
    state.setOverrideState(clone(initial))
    expect(state.mutatedOptions['block-0-1']?.option0).toBe('value 0')
    expect(state.getMutatedField('host', 'field_0')?.list[2]?.props).toEqual(
      initial.mutatedState!.fields![0]!.list[2]!.props,
    )
  })

  it('drops a removed field and brings it back', async () => {
    const { state, initial } = await createStateFixture({ blocks: 3 })
    const empty = clone(initial)
    empty.mutatedState!.fields = []
    state.setOverrideState(empty)
    expect(state.getMutatedField('host', 'field_0')).toBeUndefined()

    state.setOverrideState(clone(initial))
    expect(state.getMutatedField('host', 'field_0')?.list).toHaveLength(3)
  })
})
