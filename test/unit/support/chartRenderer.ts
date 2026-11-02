import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { BlokkliChartData } from '../../../src/modules/charts/runtime/types'

/** Nuxt's `ClientOnly` renders only its `fallback` slot on the server. */
const ClientOnly = {
  setup:
    (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
    () =>
      slots.fallback?.(),
}

export function chartData(footnotes: string[]): BlokkliChartData {
  return {
    type: 'bar',
    title: 'Apartments{1}',
    categories: ['2022', '2023'],
    series: [{ name: 'Zurich', color: 'a', data: [3, 5] }],
    categoryColors: [],
    footnotes,
  }
}

export async function renderChartToString(
  data: BlokkliChartData,
): Promise<string> {
  const { default: ChartRenderer } =
    await import('../../../src/modules/charts/runtime/components/ChartRenderer/index.vue')
  const app = createSSRApp(ChartRenderer, { data })
  app.component('ClientOnly', ClientOnly)
  return renderToString(app)
}
