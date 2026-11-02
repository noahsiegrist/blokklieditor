import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useMarkdownHtml } from './useMarkdownHtml'

const renderMarkdown = vi.hoisted(() =>
  vi.fn((content: string) => `<p>${content}</p>`),
)

vi.mock('../../helpers/markdown', () => ({ renderMarkdown }))

function setup(initial: string) {
  const content = ref(initial)
  const scope = effectScope()
  const html = scope.run(() => useMarkdownHtml(() => content.value))!
  return { content, html, scope }
}

describe('useMarkdownHtml', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    renderMarkdown.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the initial content at once', () => {
    const { html } = setup('Hello')
    expect(html.value).toBe('<p>Hello</p>')
  })

  it('renders nothing for empty content', () => {
    const { html } = setup('')
    expect(html.value).toBe('')
    expect(renderMarkdown).not.toHaveBeenCalled()
  })

  it('renders a burst of deltas once per interval, not once per delta', async () => {
    const { content } = setup('')
    for (let i = 0; i < 200; i++) {
      content.value += 'x'
      await nextTick()
    }
    // One leading render. The rest of the burst waits for the interval.
    expect(renderMarkdown).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(renderMarkdown).toHaveBeenCalledTimes(2)
  })

  it('always renders the last delta', async () => {
    const { content, html } = setup('')
    for (const delta of ['a', 'b', 'c', 'd']) {
      content.value += delta
      await nextTick()
    }
    await vi.advanceTimersByTimeAsync(1000)
    expect(html.value).toBe('<p>abcd</p>')
  })

  it('renders a change after a quiet period at once', async () => {
    const { content, html } = setup('first')
    await vi.advanceTimersByTimeAsync(1000)
    content.value = 'second'
    await nextTick()
    expect(html.value).toBe('<p>second</p>')
  })

  it('stops rendering when the scope is disposed', async () => {
    const { content, scope } = setup('')
    content.value = 'a'
    await nextTick()
    content.value = 'ab'
    await nextTick()
    scope.stop()
    renderMarkdown.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(renderMarkdown).not.toHaveBeenCalled()
  })
})
