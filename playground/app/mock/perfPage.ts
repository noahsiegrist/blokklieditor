import type { EntityStorageManager } from './entityStorage'
import { ContentPage } from './state/Entity/Content'

/** The path of the page, see pages/[...slug].vue. */
export const PERF_PAGE_UUID = '5'

const SECTIONS = 11

/**
 * A page of ~210 blocks with a fixed structure (no randomness), nested fields
 * included, for scripts/perf/baseline.ts. Per section: a title, a text, a grid
 * (title header, 3 cards), a two-column layout (title header, a text and a
 * button list with 2 buttons on the left, an image on the right), an image and
 * a button list with 3 buttons.
 */
export function addPerfPage(manager: EntityStorageManager): void {
  const page = new ContentPage(PERF_PAGE_UUID)
  page.title().setText('A $performance$ baseline page.')
  page.lead().setText('About 200 mixed blocks, nested fields included.')

  const uuid = (name: string, index: number, n = 0) =>
    `perf-${name}-${index}-${n}`

  const add = (bundle: string, id: string, values = {}) => {
    manager.createBlock(bundle, id, values)
    return id
  }

  const buttons = (index: number, prefix: string, count: number) => {
    const list = add('button_list', uuid(prefix, index))
    const ids = Array.from({ length: count }, (_, n) =>
      add('button', uuid(prefix + '-button', index, n), {
        title: `Button ${index}.${n}`,
        url: 'https://www.example.com/' + index,
      }),
    )
    manager.load('paragraph', list)!.get('blocks').setList(ids)
    return list
  }

  const top: string[] = []
  for (let i = 0; i < SECTIONS; i++) {
    top.push(
      add('title', uuid('title', i), {
        title: 'Section ' + i,
        tagline: 'Tagline ' + i,
        lead: 'The lead of section number ' + i,
      }),
      add('text', uuid('text', i), {
        text: `<p>Paragraph of section ${i}. <strong>Bold</strong> and <em>italic</em> text, a <a href="https://www.example.com">link</a>.</p>`,
      }),
    )

    const grid = add('grid', uuid('grid', i))
    const cards = Array.from({ length: 3 }, (_, n) =>
      add('card', uuid('card', i, n), {
        title: `Card ${i}.${n}`,
        text: `The text of card ${i}.${n}`,
      }),
    )
    manager
      .load('paragraph', grid)!
      .get('header')
      .setList([add('title', uuid('grid-title', i), { title: 'Grid ' + i })])
    manager.load('paragraph', grid)!.get('blocks').setList(cards)
    top.push(grid)

    const columns = add('two_columns', uuid('columns', i))
    const columnsBlock = manager.load('paragraph', columns)!
    columnsBlock
      .get('header')
      .setList([
        add('title', uuid('columns-title', i), { title: 'Columns ' + i }),
      ])
    columnsBlock.get('left').setList([
      add('text', uuid('columns-text', i), {
        text: `<p>Left column of section ${i}.</p>`,
      }),
      buttons(i, 'columns-buttons', 2),
    ])
    columnsBlock
      .get('right')
      .setList([
        add('image', uuid('columns-image', i), { imageReference: ['7'] }),
      ])
    top.push(columns)

    top.push(
      add('image', uuid('image', i), { imageReference: ['7'] }),
      buttons(i, 'buttons', 3),
    )
  }

  page.get('content').setList(top)
  manager.getStorage('content').add(page)
}
