import { bench, describe, vi } from 'vitest'
import { chartData, renderChartToString } from '../unit/support/chartRenderer'

vi.mock('#imports', async () =>
  (await import('../unit/support/chartRendererMocks')).importsMock(),
)
vi.mock('#blokkli-build/charts-components', async () =>
  (await import('../unit/support/chartRendererMocks')).chartComponentsMock(),
)

const NOTES = ['Source: Statistics Zurich', 'Provisional values']

const withNotes = await renderChartToString(chartData(NOTES))
const withoutNotes = await renderChartToString(chartData([]))

console.log(
  JSON.stringify({
    footnoteTextsInServerHtml: NOTES.filter((n) => withNotes.includes(n))
      .length,
    footnoteTextsExpected: NOTES.length,
    superscriptsInServerHtml: (withNotes.match(/[¹²]/g) ?? []).length,
    htmlBytes: Buffer.byteLength(withNotes),
    htmlBytesWithoutFootnotes: Buffer.byteLength(withoutNotes),
    bytesAddedByFootnotes:
      Buffer.byteLength(withNotes) - Buffer.byteLength(withoutNotes),
    reservesChartHeight: withNotes.includes('--bk-chart-height'),
  }),
)

describe('ChartRenderer server render, 2 footnotes', () => {
  bench('renderToString', async () => {
    await renderChartToString(chartData(NOTES))
  })
})
