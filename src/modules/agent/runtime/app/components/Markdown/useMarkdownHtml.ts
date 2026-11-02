import { onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import { renderMarkdown } from '../../helpers/markdown'

/**
 * Minimum time between two renders. A streamed message changes with every
 * text delta, and each render parses and sanitises the whole message again.
 */
const RENDER_INTERVAL_MS = 100

/**
 * Render markdown to sanitised HTML, at most once per interval.
 *
 * The first change renders at once. Changes during the interval are coalesced
 * into one trailing render of the latest content, so the final delta is never
 * dropped.
 */
export function useMarkdownHtml(content: () => string): Readonly<Ref<string>> {
  const render = () => {
    const markdown = content()
    return markdown ? renderMarkdown(markdown) : ''
  }

  const html = shallowRef(render())
  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false

  function renderAndCoolDown() {
    html.value = render()
    dirty = false
    timer = setTimeout(() => {
      timer = undefined
      if (dirty) {
        renderAndCoolDown()
      }
    }, RENDER_INTERVAL_MS)
  }

  watch(content, () => {
    if (timer) {
      dirty = true
    } else {
      renderAndCoolDown()
    }
  })

  onScopeDispose(() => clearTimeout(timer))

  return html
}
