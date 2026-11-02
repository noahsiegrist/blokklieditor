import { describe, expect, test } from 'vitest'
import { RectangleBufferCollector } from '#blokkli/editor/helpers/webgl'
import { twgl } from '#blokkli/editor/libraries/twgl'
import { createMockGl, fillCollector } from './support/webglMock'

describe('RectangleBufferCollector GL buffers', () => {
  test('rebuilding the buffer info frees the previous buffers', () => {
    const { gl, live } = createMockGl()
    const collector = new RectangleBufferCollector<any>()

    fillCollector(collector, 10)
    collector.bufferInfo = collector.createBufferInfo(gl, twgl)
    const liveAfterFirst = live.size
    expect(liveAfterFirst).toBeGreaterThan(0)

    for (let i = 0; i < 20; i++) {
      collector.reset()
      fillCollector(collector, 10)
      collector.bufferInfo = collector.createBufferInfo(gl, twgl)
    }

    expect(live.size).toBe(liveAfterFirst)
  })

  test('reset frees the buffers of an info that is dropped', () => {
    const { gl, live } = createMockGl()
    const collector = new RectangleBufferCollector<any>()

    fillCollector(collector, 10)
    collector.bufferInfo = collector.createBufferInfo(gl, twgl)
    collector.reset()

    expect(live.size).toBe(0)
  })
})
