import { vi } from 'vitest'
import { computed } from 'vue'
import type { MappedState } from '#blokkli/editor/types/state'
import stateProvider from '#blokkli/editor/providers/state'

type Fixture = {
  state: Awaited<ReturnType<typeof stateProvider>>
  initial: MappedState
}

type StateFixtureOptions = {
  /** Blocks per field. */
  blocks?: number
  fields?: number
  optionsPerBlock?: number
}

/** The state of a page: `fields` fields with `blocks` blocks, each with options. */
export function buildMappedState(options: StateFixtureOptions = {}) {
  const { blocks = 300, fields = 1, optionsPerBlock = 20 } = options
  const mutatedOptions: Record<string, Record<string, string>> = {}
  const mutatedFields = Array.from({ length: fields }, (_, f) => {
    const list = Array.from({ length: blocks }, (_, i) => ({
      uuid: `block-${f}-${i}`,
      bundle: i % 2 ? 'text' : 'image',
      props: { title: 'Block ' + i, text: 'Lorem ipsum '.repeat(10) },
    }))
    list.forEach((item) => {
      mutatedOptions[item.uuid] = Object.fromEntries(
        Array.from({ length: optionsPerBlock }, (_, k) => [
          'option' + k,
          'value ' + k,
        ]),
      )
    })
    return {
      name: 'field_' + f,
      entityType: 'node',
      entityUuid: 'host',
      entityBundle: 'page',
      list,
    }
  })

  return {
    mutations: [],
    currentIndex: 0,
    ownerId: '1',
    ownerName: 'Owner',
    currentUserIsOwner: true,
    lastChanged: null,
    entity: { label: 'Page', status: true, bundleLabel: 'Page' },
    translationState: {
      isTranslatable: false,
      isStatusTranslatable: null,
      sourceLanguage: 'en',
      availableLanguages: [],
      translations: [],
    },
    publishOptions: {},
    mutatedState: {
      mutatedOptions,
      mutatedHostOptions: '{"host":"option"}',
      fields: mutatedFields,
      violations: [],
    },
  } as unknown as MappedState
}

/** A deep copy: what the adapter returns for every mutation response. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function createStateFixture(
  options?: StateFixtureOptions,
): Promise<Fixture> {
  const initial = buildMappedState(options)
  const adapter = {
    loadState: vi.fn(async () => ({})),
    mapState: vi.fn(() => clone(initial)),
  }
  const state = await stateProvider(
    { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as never,
    adapter as never,
    computed(() => ({ language: 'en' })) as never,
    ((_: string, fallback: string) => fallback) as never,
    'test',
    ['edit'],
  )
  return { state, initial }
}
