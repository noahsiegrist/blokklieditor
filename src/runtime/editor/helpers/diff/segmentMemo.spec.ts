// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import diff from 'html-diff-ts'
import { splitIntoSegments, renderSegmentDiff, type Segment } from './index'

vi.mock('html-diff-ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('html-diff-ts')>()
  return { default: vi.fn(actual.default) }
})

const diffMock = vi.mocked(diff)

function buildSegments(count: number): Segment[] {
  const sentence = (n: number, word: string) =>
    `Sentence ${n} keeps its ${word} wording while the surrounding text stays the same. `
  const para = (i: number, word: string) =>
    `<p>${Array.from({ length: 5 }, (_, n) => sentence(n, n === 2 ? word : 'old')).join('')}${i}</p>`
  const before = Array.from({ length: count }, (_, i) => para(i, 'old')).join(
    '',
  )
  const after = Array.from({ length: count }, (_, i) => para(i, 'new')).join('')
  const segments = splitIntoSegments(before, after, 'markup')
  if (!segments) throw new Error('fixture did not segment')
  return segments
}

describe('renderSegmentDiff word-diff memoisation', () => {
  beforeEach(() => {
    diffMock.mockClear()
  })

  it('does not re-diff unchanged segments when acceptance toggles', () => {
    const segments = buildSegments(30)
    renderSegmentDiff(segments)
    diffMock.mockClear()

    renderSegmentDiff(segments, { acceptedById: { '3': false } })
    renderSegmentDiff(segments, { acceptedById: { '3': true } })

    expect(diffMock).toHaveBeenCalledTimes(0)
  })

  it('diffs each segment once however often the preview renders', () => {
    const segments = buildSegments(30)
    for (let i = 0; i < 5; i++) {
      renderSegmentDiff(segments, { acceptedById: { '1': i % 2 === 0 } })
    }
    expect(diffMock).toHaveBeenCalledTimes(30)
  })

  it('renders identical markup before and after warm-up', () => {
    const segments = buildSegments(5)
    const first = renderSegmentDiff(segments, { acceptedById: { '2': false } })
    const second = renderSegmentDiff(segments, {
      acceptedById: { '2': false },
    })
    expect(second).toBe(first)
  })
})
