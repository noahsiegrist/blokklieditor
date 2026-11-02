import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const { calls } = vi.hoisted(() => ({
  calls: { chunk: 0, loadComponent: 0 },
}))

vi.mock('#blokkli-build/imports', async () => {
  const { defineComponent, h } = await import('vue')
  const Table = defineComponent({ render: () => h('table') })
  const Text = defineComponent({ render: () => h('p') })
  const Hero = defineComponent({ render: () => h('section') })
  const Teaser = defineComponent({ render: () => h('article') })

  return {
    chunkMapping: {
      'block:table': 'rare',
      'block:table__f:inline': 'rare',
      'block:hero': 'rare',
      'block:text': 'global',
      'block:teaser': 'global',
    },
    chunks: {
      // A lazy chunk, as the module generates for `chunkName: 'rare'`.
      rare: () => {
        calls.chunk++
        return Promise.resolve({
          'block:table': Table,
          'block:table__f:inline': Table,
          'block:hero': {
            loadComponent: () => {
              calls.loadComponent++
              return Promise.resolve(Hero)
            },
          },
        })
      },
      // The global chunk is an object that is bundled with the entry.
      global: {
        'block:text': Text,
        'block:teaser': {
          loadComponent: () => {
            calls.loadComponent++
            return Promise.resolve(Teaser)
          },
        },
      },
    },
  }
})

const { getComponent } = await import('../../src/runtime/helpers/imports')

const context = { fieldListType: 'default' as const }

beforeEach(() => {
  calls.chunk = 0
  calls.loadComponent = 0
})

describe('getComponent wrapper reuse', () => {
  test('a lazy chunk bundle gets one wrapper for all of its instances', () => {
    const wrappers = Array.from({ length: 30 }, () =>
      getComponent('block', 'table', context),
    )

    expect(new Set(wrappers).size).toBe(1)
  })

  test('a loadComponent entry gets one wrapper for all of its instances', () => {
    const wrappers = Array.from({ length: 30 }, () =>
      getComponent('block', 'teaser', context),
    )

    expect(new Set(wrappers).size).toBe(1)
  })

  test('different keys keep different wrappers', () => {
    const table = getComponent('block', 'table', context)
    const hero = getComponent('block', 'hero', context)
    const tableInline = getComponent('block', 'table', {
      fieldListType: 'inline',
    })

    expect(new Set([table, hero, tableInline]).size).toBe(3)
  })

  test('an eagerly bundled component is returned as is', () => {
    const text = getComponent('block', 'text', context)

    expect(text).toBe(getComponent('block', 'text', context))
    expect(text.render).toBeTypeOf('function')
  })

  test('an unknown bundle has no component', () => {
    expect(getComponent('block', 'nope', context)).toBeUndefined()
  })

  test('the chunk is requested once for 30 instances', async () => {
    const App = defineComponent({
      setup: () => () =>
        h(
          'div',
          Array.from({ length: 30 }, () =>
            h(getComponent('block', 'hero', context)),
          ),
        ),
    })

    const html = await renderToString(createSSRApp(App))

    expect(html.match(/<section>/g)).toHaveLength(30)
    expect(calls.chunk).toBe(1)
    expect(calls.loadComponent).toBe(1)
  })
})
