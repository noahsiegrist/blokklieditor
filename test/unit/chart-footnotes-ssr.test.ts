import { describe, expect, test, vi } from 'vitest'
import { chartData, renderChartToString } from './support/chartRenderer'

vi.mock('#imports', async () =>
  (await import('./support/chartRendererMocks')).importsMock(),
)
vi.mock('#blokkli-build/charts-components', async () =>
  (await import('./support/chartRendererMocks')).chartComponentsMock(),
)

const NOTES = ['Source: Statistics Zurich', 'Provisional values']

describe('ChartRenderer server render', () => {
  test('contains the footnote texts', async () => {
    const html = await renderChartToString(chartData(NOTES))
    for (const note of NOTES) {
      expect(html).toContain(note)
    }
  })

  test('numbers the footnotes with superscripts', async () => {
    const html = await renderChartToString(chartData(NOTES))
    expect(html).toContain('¹')
    expect(html).toContain('²')
  })

  test('reserves the chart height until the chart is mounted', async () => {
    const html = await renderChartToString(chartData(NOTES))
    expect(html).toMatch(/height:\s*var\(--bk-chart-height, 550px\)/)
  })

  test('renders no footnote list without footnotes', async () => {
    const html = await renderChartToString(chartData([]))
    expect(html).not.toContain('bk-chart-footnotes')
  })
})
