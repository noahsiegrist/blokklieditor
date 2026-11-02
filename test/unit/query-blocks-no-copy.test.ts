import { describe, expect, test } from 'vitest'
import { createApp, nextTick, ref, type Ref } from 'vue'
import { useBlokkliHelper } from '../../src/runtime/composables/useBlokkliHelper'
import { INJECT_EDIT_CONTEXT } from '../../src/runtime/helpers/injections'
import type { FieldListItemTyped } from '#blokkli-build/generated-types'

function block(
  uuid: string,
  bundle: string,
  options?: Record<string, any>,
  props: Record<string, any> = {},
): FieldListItemTyped {
  return {
    uuid,
    bundle,
    isVisible: true,
    options,
    props,
  } as unknown as FieldListItemTyped
}

function setup(mutated?: Ref<Record<string, any>>) {
  const app = createApp({ render: () => null })
  if (mutated) {
    app.provide(INJECT_EDIT_CONTEXT, { mutatedOptions: mutated })
  }
  return app.runWithContext(() => useBlokkliHelper())
}

function collect(
  helper: ReturnType<typeof useBlokkliHelper>,
  list: FieldListItemTyped[],
) {
  const seen: FieldListItemTyped[] = []
  const result = helper.queryBlocks((item) => {
    seen.push(item)
    return { include: true, continueChildren: true }
  }, list)
  return { seen, result: result.value }
}

describe('queryBlocks', () => {
  test('hands out the original blocks when no options are mutated', () => {
    const child = block('c', 'title', { a: '1' })
    const parent = block('p', 'grid', { b: '2' }, { blocks: [child] })
    const list = [parent, block('t', 'text', { c: '3' })]

    const { seen, result } = collect(setup(), list)

    expect(seen).toHaveLength(3)
    expect(seen[0]).toBe(parent)
    expect(seen[1]).toBe(child)
    expect(seen[2]).toBe(list[1])
    expect(result[0]).toBe(parent)
  })

  test('merges mutated options into a copy and leaves the original alone', async () => {
    const mutated = ref<Record<string, any>>({})
    const helper = setup(mutated)
    const original = block('t', 'text', { a: '1', b: '1' })
    const untouched = block('u', 'text', { a: '1' })
    mutated.value = { t: { b: '2' } }
    await nextTick()

    const { seen } = collect(helper, [original, untouched])

    expect(seen[0]).not.toBe(original)
    expect(seen[0]!.options).toEqual({ a: '1', b: '2' })
    expect(original.options).toEqual({ a: '1', b: '1' })
    expect(seen[1]).toBe(untouched)
  })

  test('resolves from_library blocks to the library block with merged options', () => {
    const library = block('lib', 'text', { x: 'block' })
    const wrapper = block(
      'w',
      'from_library',
      { x: 'wrapper', y: 'wrapper' },
      {
        libraryItem: { block: library },
      },
    )

    const { seen } = collect(setup(), [wrapper])

    expect(seen).toHaveLength(1)
    expect(seen[0]!.uuid).toBe('lib')
    expect(seen[0]!.options).toEqual({ x: 'block', y: 'wrapper' })
  })
})
