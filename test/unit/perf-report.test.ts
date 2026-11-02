import { describe, expect, test } from 'vitest'
import {
  type Baseline,
  CALIBRATION_KEY,
  calibrationWarning,
  compareBaselines,
  formatValue,
  stat,
} from '../../scripts/perf/report'

describe('stat', () => {
  test('median of an odd and an even number of samples', () => {
    expect(stat([3, 1, 2], 'ms').median).toBe(2)
    expect(stat([4, 1, 3, 2], 'ms').median).toBe(2.5)
  })

  test('keeps min, max and the samples in order', () => {
    const s = stat([5, 1, 3], 'B')
    expect(s).toMatchObject({ min: 1, max: 5, unit: 'B', samples: [5, 1, 3] })
  })

  test('noise is the relative range, and 0 for identical samples', () => {
    expect(stat([100, 100, 100], 'B').noise).toBe(0)
    expect(stat([90, 100, 110], 'ms').noise).toBeCloseTo(0.2)
  })
})

describe('formatValue', () => {
  test('ms', () => {
    expect(formatValue(12.345, 'ms')).toBe('12.3 ms')
  })

  test('bytes switch to KB above 1 KB', () => {
    expect(formatValue(512, 'B')).toBe('512 B')
    expect(formatValue(2048, 'B')).toBe('2.00 KB')
  })

  test('signed values carry a plus', () => {
    expect(formatValue(1536, 'B', true)).toBe('+1.50 KB')
    expect(formatValue(-4, 'ms', true)).toBe('-4.0 ms')
  })
})

function baseline(label: string, values: number[]): Baseline {
  return {
    meta: { label } as Baseline['meta'],
    metrics: { 'visitor/home/jsGzip': stat(values, 'B') },
  }
}

describe('compareBaselines', () => {
  test('reports the absolute and relative delta of the medians', () => {
    const [row] = compareBaselines(
      baseline('before', [1000]),
      baseline('after', [900]),
    )
    expect(row).toMatchObject({
      key: 'visitor/home/jsGzip',
      before: 1000,
      after: 900,
      delta: -100,
      percent: -10,
      withinNoise: false,
    })
  })

  test('flags a delta whose sample ranges overlap as noise', () => {
    const [row] = compareBaselines(
      baseline('before', [100, 110, 120]),
      baseline('after', [115, 118, 125]),
    )
    expect(row?.withinNoise).toBe(true)
  })

  test('skips metrics that only one side has', () => {
    const a = baseline('a', [1])
    const b: Baseline = { ...baseline('b', [1]), metrics: {} }
    expect(compareBaselines(a, b)).toEqual([])
  })
})

describe('calibrationWarning', () => {
  const withSpeed = (ms: number): Baseline => ({
    meta: {} as Baseline['meta'],
    metrics: { [CALIBRATION_KEY]: stat([ms], 'ms') },
  })

  test('is silent when the machine ran at the same speed', () => {
    expect(calibrationWarning(withSpeed(100), withSpeed(104))).toBeUndefined()
  })

  test('warns when the machine speed differs by more than 10%', () => {
    expect(calibrationWarning(withSpeed(100), withSpeed(130))).toMatch(/30\.0%/)
  })

  test('compares the fastest runs, not the median', () => {
    const noisy: Baseline = {
      meta: {} as Baseline['meta'],
      metrics: { [CALIBRATION_KEY]: stat([100, 500, 500, 520, 510], 'ms') },
    }
    expect(calibrationWarning(withSpeed(100), noisy)).toBeUndefined()
  })

  test('is silent when a baseline has no calibration', () => {
    expect(
      calibrationWarning(withSpeed(100), baseline('b', [1])),
    ).toBeUndefined()
  })
})
