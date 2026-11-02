import { bench, describe, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const BLOCKS = 30

const { calls } = vi.hoisted(() => ({
  calls: { chunk: 0, loadComponent: 0 },
}))

// The playground only has a lazy chunk ('rare') for four bundles, so the
// generated chunk map is replaced by one with a lazy chunk and a bundle in it.
vi.mock('#blokkli-build/imports', async () => {
  const { defineComponent, h } = await import('vue')
  const Hero = defineComponent({
    props: { index: { type: Number, default: 0 } },
    setup: (props) => () =>
      h('section', { class: 'hero' }, `Hero ${props.index}`),
  })

  return {
    chunkMapping: { 'block:hero': 'lazy' },
    chunks: {
      lazy: () => {
        calls.chunk++
        return Promise.resolve({
          'block:hero': {
            loadComponent: () => {
              calls.loadComponent++
              return Promise.resolve(Hero)
            },
          },
        })
      },
    },
  }
})

const { getComponent } = await import('../../src/runtime/helpers/imports')

// Mirrors BlokkliItem: every block instance resolves its component in setup.
const Item = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props, { attrs }) {
    const component = getComponent('block', 'hero', {
      fieldListType: 'default',
    })
    wrappers.add(component)
    return () => h(component, { index: props.index, ...attrs })
  },
})

const Field = defineComponent({
  setup: () => () =>
    h(
      'div',
      Array.from({ length: BLOCKS }, (_, index) => h(Item, { index })),
    ),
})

const wrappers = new Set<unknown>()

function render() {
  return renderToString(createSSRApp(Field))
}

// Cold start (first render of a module instance): the cost a browser pays on
// hydration, and a server pays once after boot.
vi.resetModules()
calls.chunk = 0
calls.loadComponent = 0
wrappers.clear()
const html = await render()
console.log(
  [
    `blocks rendered: ${html.match(/<section/g)?.length}`,
    `async wrappers created: ${wrappers.size}`,
    `chunk loader calls: ${calls.chunk}`,
    `loadComponent calls: ${calls.loadComponent}`,
  ].join('\n'),
)

describe(`renderToString, field of ${BLOCKS} lazy-chunk blocks`, () => {
  bench('render', async () => {
    await render()
  })
})
