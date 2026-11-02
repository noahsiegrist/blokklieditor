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

  test('a subclass with extra attributes still frees all its buffers', () => {
    class ColoredCollector extends RectangleBufferCollector<any> {
      override bufferArrays(gl: WebGLRenderingContext) {
        return {
          ...super.bufferArrays(gl),
          a_color: { numComponents: 3, data: [0, 0, 0], type: gl.FLOAT },
        }
      }
    }
    const { gl, live } = createMockGl()
    const collector = new ColoredCollector()

    fillCollector(collector, 10)
    collector.bufferInfo = collector.createBufferInfo(gl, twgl)
    expect(collector.bufferInfo.attribs?.a_color).toBeDefined()
    const liveAfterFirst = live.size

    collector.reset()
    fillCollector(collector, 10)
    collector.bufferInfo = collector.createBufferInfo(gl, twgl)
    expect(live.size).toBe(liveAfterFirst)

    collector.reset()
    expect(live.size).toBe(0)
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
