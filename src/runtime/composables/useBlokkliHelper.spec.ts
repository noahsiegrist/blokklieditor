import { describe, expect, test } from 'vitest'
import { createApp, effectScope, nextTick, reactive } from 'vue'
import { useBlokkliHelper } from './useBlokkliHelper'
import {
  INJECT_EDIT_CONTEXT,
  INJECT_MUTATED_FIELDS_MAP,
} from '#blokkli/helpers/injections'

type Item = {
  uuid: string
  bundle: string
  isVisible: boolean
  options: Record<string, string>
}

const items = (): Item[] =>
  ['a', 'b', 'c'].map((uuid) => ({
    uuid,
    bundle: 'text',
    isVisible: true,
    options: { style: 'plain' },
  }))

function setup(mutatedOptions: Record<string, Record<string, string>>) {
  const app = createApp({})
  app.provide(INJECT_EDIT_CONTEXT, { mutatedOptions } as any)
  // While editing, blocks are rendered regardless of their visibility.
  app.provide(INJECT_MUTATED_FIELDS_MAP, {})
  const scope = effectScope()
  const list = items()
  const styled = scope.run(() =>
    app.runWithContext(() =>
      useBlokkliHelper().queryBlocks(
        (item) => ({ include: item.options?.style === 'fancy' }),
        list as any,
      ),
    ),
  )!
  return { styled, scope }
}

const uuids = (blocks: { uuid: string }[]) => blocks.map((b) => b.uuid)

describe('useBlokkliHelper queryBlocks', () => {
  test('re-evaluates when an option of an existing block changes', () => {
    const mutatedOptions = reactive<Record<string, Record<string, string>>>({
      a: { style: 'plain' },
    })
    const { styled, scope } = setup(mutatedOptions)
    expect(uuids(styled.value)).toEqual([])

    mutatedOptions.a!.style = 'fancy'

    expect(uuids(styled.value)).toEqual(['a'])
    scope.stop()
  })

  test('re-evaluates when options are added for a block', () => {
    const mutatedOptions = reactive<Record<string, Record<string, string>>>({})
    const { styled, scope } = setup(mutatedOptions)
    expect(uuids(styled.value)).toEqual([])

    mutatedOptions.b = { style: 'fancy' }

    expect(uuids(styled.value)).toEqual(['b'])
    scope.stop()
  })

  test('applies options that were set before the consumer was created', () => {
    const mutatedOptions = reactive<Record<string, Record<string, string>>>({
      c: { style: 'fancy' },
    })
    const { styled, scope } = setup(mutatedOptions)

    expect(uuids(styled.value)).toEqual(['c'])
    scope.stop()
  })

  test('keeps working after the next tick', async () => {
    const mutatedOptions = reactive<Record<string, Record<string, string>>>({})
    const { styled, scope } = setup(mutatedOptions)

    mutatedOptions.a = { style: 'fancy' }
    await nextTick()
    mutatedOptions.a.style = 'plain'
    mutatedOptions.b = { style: 'fancy' }
    await nextTick()

    expect(uuids(styled.value)).toEqual(['b'])
    scope.stop()
  })
})
