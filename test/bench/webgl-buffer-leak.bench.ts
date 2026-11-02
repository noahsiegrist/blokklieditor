import { bench, describe } from 'vitest'
import { RectangleBufferCollector } from '#blokkli/editor/helpers/webgl'
import { twgl } from '#blokkli/editor/libraries/twgl'
import { createMockGl, fillCollector } from '../unit/support/webglMock'

const RECTS = 200
const REBUILDS = 100

function rebuildMany() {
  const mock = createMockGl()
  const collector = new RectangleBufferCollector<any>()
  for (let i = 0; i < REBUILDS; i++) {
    collector.reset()
    fillCollector(collector, RECTS)
    collector.bufferInfo = collector.createBufferInfo(mock.gl, twgl)
  }
  return mock
}

const { live, stats } = rebuildMany()
console.log(
  `[webgl-buffer-leak] ${REBUILDS} rebuilds of ${RECTS} rects: ` +
    `created=${stats.created} deleted=${stats.deleted} live=${live.size} ` +
    `uploadedBytes=${stats.uploadedBytes}`,
)

describe('RectangleBufferCollector rebuild', () => {
  bench(`${REBUILDS} rebuilds of ${RECTS} rects`, () => {
    rebuildMany()
  })
})
