// @vitest-environment jsdom
import { bench, describe, vi, afterAll } from 'vitest'
import diff from 'html-diff-ts'
import {
  splitIntoSegments,
  renderSegmentDiff,
} from '../../src/runtime/editor/helpers/diff'

vi.mock('html-diff-ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('html-diff-ts')>()
  return { default: vi.fn(actual.default) }
})

const BLOCKS = 30

const sentence = (n: number, word: string) =>
  `Sentence ${n} keeps its ${word} wording while the surrounding text stays the same. `
const para = (i: number, word: string) =>
  `<p>${Array.from({ length: 5 }, (_, n) => sentence(n, n === 2 ? word : 'old')).join('')}${i}</p>`

const before = Array.from({ length: BLOCKS }, (_, i) => para(i, 'old')).join('')
const after = Array.from({ length: BLOCKS }, (_, i) => para(i, 'new')).join('')
const segments = splitIntoSegments(before, after, 'markup')!

// Warm-up render, as the preview does on mount.
renderSegmentDiff(segments)

const diffMock = vi.mocked(diff)
let toggle = false
let renders = 0
diffMock.mockClear()

describe(`approval preview toggle, ${BLOCKS} matched blocks`, () => {
  bench('renderSegmentDiff with one id toggled', () => {
    toggle = !toggle
    renders++
    renderSegmentDiff(segments, { acceptedById: { '7': toggle } })
  })
})

afterAll(() => {
  console.log(
    `[diff-segment-memo] renders=${renders} diff() calls=${diffMock.mock.calls.length} per render=${(diffMock.mock.calls.length / Math.max(renders, 1)).toFixed(1)}`,
  )
})
