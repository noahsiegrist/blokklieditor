import { bench, describe } from 'vitest'
import { createApp } from 'vue'
import { useBlokkliHelper } from '../../src/runtime/composables/useBlokkliHelper'
import type { FieldListItemTyped } from '#blokkli-build/generated-types'

const ITEM_COUNT = 500
const CONSUMERS = 20
const CHILDREN_PER_GRID = 5

type Item = { uuid: string; bundle: string; isVisible: boolean } & Record<
  string,
  any
>

/**
 * A nested tree of grids (each with CHILDREN_PER_GRID children) and leaf
 * blocks, breadth first, until ITEM_COUNT blocks exist.
 */
function buildTree(): { roots: Item[]; all: Item[] } {
  const all: Item[] = []
  const leafBundles = ['text', 'title', 'image', 'button', 'card']
  const make = (index: number, isGrid: boolean): Item => {
    const item: Item = {
      uuid: 'uuid-' + index,
      bundle: isGrid ? 'grid' : leafBundles[index % leafBundles.length]!,
      isVisible: true,
      options: {
        color: 'a',
        align: 'left',
        ...(isGrid ? { columns: 'two' } : {}),
      },
      props: isGrid ? { blocks: [] } : { title: 'Block ' + index },
    }
    all.push(item)
    return item
  }

  const roots: Item[] = []
  const queue: Item[] = []
  for (let i = 0; i < 5; i++) {
    const root = make(all.length, true)
    roots.push(root)
    queue.push(root)
  }
  while (all.length < ITEM_COUNT) {
    const parent = queue.shift()!
    for (let i = 0; i < CHILDREN_PER_GRID && all.length < ITEM_COUNT; i++) {
      const isGrid = all.length % 3 === 0
      const child = make(all.length, isGrid)
      parent.props.blocks.push(child)
      if (isGrid) {
        queue.push(child)
      }
    }
  }
  return { roots, all }
}

const { roots, all } = buildTree()
const list = roots as unknown as FieldListItemTyped[]
const helper = createApp({ render: () => null }).runWithContext(() =>
  useBlokkliHelper(),
)

const bundleSets = [['title'], ['text'], ['image'], ['button'], ['card']]

/**
 * 20 consumers: 15 filter by bundles, 5 use a callback that rejects most
 * blocks. None of them has mutated options, as on a visitor page.
 */
function runConsumers(): FieldListItemTyped[][] {
  const results: FieldListItemTyped[][] = []
  for (let i = 0; i < CONSUMERS; i++) {
    const query =
      i < 15
        ? helper.queryBlocks(bundleSets[i % bundleSets.length]! as any, list)
        : helper.queryBlocks(
            (item) => ({
              include: item.bundle === 'title',
              continueChildren: true,
            }),
            list,
          )
    results.push(query.value as FieldListItemTyped[])
  }
  return results
}

// Deterministic counts: how many blocks (and option objects) the callback
// sees as new objects instead of the originals.
function countAllocations() {
  const originals = new Set<object>(all)
  const originalOptions = new Set<object>(all.map((i) => i.options))
  let visited = 0
  let copiedItems = 0
  let copiedOptions = 0
  for (let i = 0; i < CONSUMERS; i++) {
    const query = helper.queryBlocks((item) => {
      visited++
      if (!originals.has(item)) copiedItems++
      if (!originalOptions.has(item.options as object)) copiedOptions++
      return { include: false, continueChildren: true }
    }, list)
    void query.value
  }
  return { visited, copiedItems, copiedOptions }
}

const counts = countAllocations()
console.log(
  `[walk-blocks] ${all.length} blocks, ${CONSUMERS} consumers, no mutations`,
)
console.log(`[walk-blocks] blocks visited: ${counts.visited}`)
console.log(`[walk-blocks] item copies: ${counts.copiedItems}`)
console.log(`[walk-blocks] options copies: ${counts.copiedOptions}`)
console.log(
  `[walk-blocks] objects allocated: ${counts.copiedItems + counts.copiedOptions}`,
)

describe('queryBlocks, 500 nested blocks, 20 consumers, no mutations', () => {
  bench('all consumers', () => {
    runConsumers()
  })
})
