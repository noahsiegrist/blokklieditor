import type { RectangleBufferCollector } from '#blokkli/editor/helpers/webgl'

type MockBuffer = { id: number }

/** Minimal WebGLRenderingContext that tracks buffer lifetimes. */
export function createMockGl() {
  let nextId = 0
  const live = new Set<MockBuffer>()
  const stats = { created: 0, deleted: 0, uploadedBytes: 0 }
  let bound: MockBuffer | null = null
  const gl = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    createBuffer() {
      const buffer = { id: nextId++ }
      live.add(buffer)
      stats.created++
      return buffer
    },
    deleteBuffer(buffer: MockBuffer) {
      if (live.delete(buffer)) {
        stats.deleted++
      }
      if (bound === buffer) {
        bound = null
      }
    },
    bindBuffer(_target: number, buffer: MockBuffer | null) {
      bound = buffer
    },
    bufferData(_target: number, data: ArrayBufferView) {
      stats.uploadedBytes += data.byteLength
    },
    isBuffer: (buffer: MockBuffer) => live.has(buffer),
  }
  return { gl: gl as unknown as WebGLRenderingContext, live, stats }
}

export function fillCollector(
  collector: RectangleBufferCollector<any>,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    collector.addRectangle(
      { id: 'rect-' + i, x: i * 10, y: i * 5, width: 100, height: 40 },
      1,
      false,
    )
  }
}
