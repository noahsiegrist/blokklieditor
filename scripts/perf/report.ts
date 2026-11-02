export type Unit = 'ms' | 'B' | 'count'

export type Stat = {
  unit: Unit
  median: number
  min: number
  max: number
  /** (max - min) / median: how much the samples disagree. */
  noise: number
  samples: number[]
}

export type Meta = {
  label: string
  date: string
  commit: string
  branch: string
  node: string
  chromium: string
  cpuThrottle: number
  ttfbRuns: number
  loadRuns: number
  loadAverage: number[]
}

/** All metrics, keyed `<section>/<page>/<metric>`. */
export type Baseline = {
  meta: Meta
  metrics: Record<string, Stat>
}

export function stat(samples: number[], unit: Unit): Stat {
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  const min = sorted[0]!
  const max = sorted[sorted.length - 1]!
  return {
    unit,
    median,
    min,
    max,
    noise: median === 0 ? 0 : (max - min) / median,
    samples,
  }
}

export function formatValue(value: number, unit: Unit, signed = false): string {
  const sign = signed && value > 0 ? '+' : ''
  if (unit === 'ms') {
    return `${sign}${value.toFixed(1)} ms`
  }
  if (unit === 'B') {
    return Math.abs(value) >= 1024
      ? `${sign}${(value / 1024).toFixed(2)} KB`
      : `${sign}${Math.round(value)} B`
  }
  return `${sign}${Number.isInteger(value) ? value : value.toFixed(1)}`
}

export function noiseLabel(noise: number): string {
  if (noise < 0.005) {
    return 'stable'
  }
  if (noise < 0.1) {
    return 'low'
  }
  if (noise < 0.3) {
    return 'medium'
  }
  return 'high'
}

function cell(s: Stat): string {
  const range =
    s.min === s.max
      ? ''
      : ` (${formatValue(s.min, s.unit)} to ${formatValue(s.max, s.unit)})`
  return formatValue(s.median, s.unit) + range
}

function table(header: string[], rows: string[][]): string {
  const line = (cols: string[]) => `| ${cols.join(' | ')} |`
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join(
    '\n',
  )
}

export type MetricDescriptor = {
  /** The last segment of the metric key. */
  id: string
  label: string
}

/**
 * One table per section ("visitor", "editor"): a row per metric, a column per
 * page. A cell is the median, with the range of the samples if they differ.
 */
export function renderTables(
  baseline: Baseline,
  sections: { name: string; title: string; metrics: MetricDescriptor[] }[],
): string {
  const out: string[] = [
    `Baseline "${baseline.meta.label}" on ${baseline.meta.branch}@${baseline.meta.commit}, ${baseline.meta.date}`,
    `Chromium ${baseline.meta.chromium}, CPU throttle ${baseline.meta.cpuThrottle}x, ${baseline.meta.ttfbRuns} requests and ${baseline.meta.loadRuns} page loads per page, load average ${baseline.meta.loadAverage.map((l) => l.toFixed(1)).join(' ')} at the start. Cells: median (min to max).`,
  ]
  for (const section of sections) {
    const pages = [
      ...new Set(
        Object.keys(baseline.metrics)
          .filter((k) => k.startsWith(section.name + '/'))
          .map((k) => k.split('/')[1]!),
      ),
    ]
    if (!pages.length) {
      continue
    }
    const rows = section.metrics.map((m) => {
      const stats = pages.map(
        (p) => baseline.metrics[`${section.name}/${p}/${m.id}`],
      )
      const worst = Math.max(...stats.map((s) => s?.noise ?? 0))
      return [
        m.label,
        ...stats.map((s) => (s ? cell(s) : '-')),
        noiseLabel(worst),
      ]
    })
    out.push(`### ${section.title}`, table(['Metric', ...pages, 'Noise'], rows))
  }
  return out.join('\n\n')
}

export type CompareRow = {
  key: string
  unit: Unit
  before: number
  after: number
  delta: number
  percent: number
  /** The sample ranges overlap: the delta may be noise. */
  withinNoise: boolean
}

export function compareBaselines(a: Baseline, b: Baseline): CompareRow[] {
  const rows: CompareRow[] = []
  for (const [key, before] of Object.entries(a.metrics)) {
    const after = b.metrics[key]
    if (!after) {
      continue
    }
    const delta = after.median - before.median
    rows.push({
      key,
      unit: before.unit,
      before: before.median,
      after: after.median,
      delta,
      percent: before.median === 0 ? 0 : (delta / before.median) * 100,
      withinNoise:
        before.min <= after.max && after.min <= before.max && delta !== 0,
    })
  }
  return rows
}

/** The fixed CPU workload of scripts/perf/measure.ts, run before and after. */
export const CALIBRATION_KEY = 'machine/cpu/calibrationMs'

/**
 * Timings drift with the load of the machine, by far more than the samples of
 * one run disagree. A fixed workload shows when two runs saw different speeds.
 */
export function calibrationWarning(
  a: Baseline,
  b: Baseline,
): string | undefined {
  const before = a.metrics[CALIBRATION_KEY]
  const after = b.metrics[CALIBRATION_KEY]
  if (!before || !after || before.min === 0) {
    return
  }
  // The fastest run: other processes only ever make a run slower.
  const percent = ((after.min - before.min) / before.min) * 100
  if (Math.abs(percent) <= 10) {
    return
  }
  return `Warning: the machine ran ${Math.abs(percent).toFixed(1)}% ${percent > 0 ? 'slower' : 'faster'} in the second run (CPU calibration). Timings are not comparable: run both again back to back, on a quiet machine.`
}

export function renderComparison(a: Baseline, b: Baseline): string {
  const rows = compareBaselines(a, b).map((r) => [
    r.key,
    formatValue(r.before, r.unit),
    formatValue(r.after, r.unit),
    formatValue(r.delta, r.unit, true),
    `${r.percent > 0 ? '+' : ''}${r.percent.toFixed(1)}%`,
    r.withinNoise ? 'within noise' : '',
  ])
  return [
    `Compare "${a.meta.label}" (${a.meta.commit}) to "${b.meta.label}" (${b.meta.commit}). Lower is better for every metric.`,
    calibrationWarning(a, b) ?? '',
    table(['Metric', 'Before', 'After', 'Delta', 'Delta %', 'Note'], rows),
  ]
    .filter(Boolean)
    .join('\n\n')
}
