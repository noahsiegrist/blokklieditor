// @vitest-environment jsdom
import { bench, describe, vi } from 'vitest'
import { computed, effectScope, nextTick, ref, watchEffect } from 'vue'
import { renderMarkdown } from '../../src/modules/agent/runtime/app/helpers/markdown'

const counter = vi.hoisted(() => ({ calls: 0 }))

vi.mock(
  '../../src/modules/agent/runtime/app/helpers/markdown',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../src/modules/agent/runtime/app/helpers/markdown')
      >()
    return {
      ...actual,
      renderMarkdown: (content: string) => {
        counter.calls++
        return actual.renderMarkdown(content)
      },
    }
  },
)

// Markdown/index.vue delegates to useMarkdownHtml(). Before the fix that file
// does not exist and the component renders in a computed(): one
// renderMarkdown() per content change.
const composables = import.meta.glob(
  '../../src/modules/agent/runtime/app/components/Markdown/useMarkdownHtml.ts',
)
const loadComposable = Object.values(composables)[0] as
  | (() => Promise<{
      useMarkdownHtml: (content: () => string) => { value: string }
    }>)
  | undefined

const PARAGRAPH =
  'Here is **a paragraph** with `inline code`, a [link](https://example.com) and some plain text to make the parser work.\n\n- item one\n- item two\n\n'
const ANSWER = PARAGRAPH.repeat(Math.ceil(4000 / PARAGRAPH.length)).slice(
  0,
  4000,
)
const DELTA_SIZE = 20
const DELTA_INTERVAL_MS = 30
const DELTAS: string[] = []
for (let i = 0; i < ANSWER.length; i += DELTA_SIZE) {
  DELTAS.push(ANSWER.slice(i, i + DELTA_SIZE))
}

type Render = (content: () => string) => { value: string }

const renderPerDelta: Render = (content) =>
  computed(() => (content() ? renderMarkdown(content()) : ''))

/** Streams the answer in paced deltas on fake timers and returns the final html. */
async function stream(render: Render): Promise<string> {
  vi.useFakeTimers()
  try {
    const content = ref('')
    const scope = effectScope()
    let html!: { value: string }
    scope.run(() => {
      html = render(() => content.value)
      watchEffect(() => html.value)
    })
    for (const delta of DELTAS) {
      content.value += delta
      await nextTick()
      await vi.advanceTimersByTimeAsync(DELTA_INTERVAL_MS)
    }
    await vi.advanceTimersByTimeAsync(1000)
    const result = html.value
    scope.stop()
    return result
  } finally {
    vi.useRealTimers()
  }
}

async function report(name: string, render: Render) {
  counter.calls = 0
  const html = await stream(render)
  const expected = renderMarkdown(ANSWER)
  console.log(
    `[count] ${name}: ${DELTAS.length} deltas, ${counter.calls - 1} renderMarkdown calls, final html ${html === expected ? 'complete' : 'STALE'}`,
  )
}

await report('render per delta', renderPerDelta)
if (loadComposable) {
  const { useMarkdownHtml } = await loadComposable()
  await report('useMarkdownHtml', useMarkdownHtml)
}

// One streamed answer takes seconds on the old code: keep the sample count low.
const BENCH_OPTIONS = { iterations: 5, warmupIterations: 1, time: 0 }

describe('agent markdown streaming, 4000 chars in 20-char deltas', () => {
  bench(
    'render per delta',
    async () => {
      await stream(renderPerDelta)
    },
    BENCH_OPTIONS,
  )

  bench(
    'useMarkdownHtml',
    async () => {
      if (!loadComposable) return
      const { useMarkdownHtml } = await loadComposable()
      await stream(useMarkdownHtml)
    },
    BENCH_OPTIONS,
  )
})
