/**
 * A page-level performance baseline of the playground: what a visitor and an
 * editor pay for a page, as numbers that a single fix can be set against
 * ("saves 4 ms of a 120 ms render"). See the "Performance baseline" section in
 * CONTRIBUTING.md.
 *
 * Usage:
 *   bun run perf:baseline --label before
 *   bun run perf:baseline --label after --no-build
 *   bun run perf:baseline --compare tmp/perf-baseline/before.json tmp/perf-baseline/after.json
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadavg } from 'node:os'
import {
  calibrateCpu,
  launchBrowser,
  measureLoads,
  measureServer,
  type Sample,
} from './measure'
import {
  CALIBRATION_KEY,
  type Baseline,
  type Unit,
  renderComparison,
  renderTables,
  stat,
} from './report'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PLAYGROUND = join(ROOT, 'playground')
const SERVER_ENTRY = join(PLAYGROUND, '.output/server/index.mjs')

type Metric = { id: string; label: string; unit: Unit }

const VISITOR_METRICS: Metric[] = [
  { id: 'ttfbMs', label: 'Server render (TTFB, localhost)', unit: 'ms' },
  { id: 'htmlBytes', label: 'HTML', unit: 'B' },
  { id: 'htmlGzip', label: 'HTML gzip', unit: 'B' },
  { id: 'payloadBytes', label: 'SSR payload (nuxt-data)', unit: 'B' },
  { id: 'payloadGzip', label: 'SSR payload gzip', unit: 'B' },
  { id: 'inlineCssBytes', label: 'Inline CSS in the HTML', unit: 'B' },
  { id: 'jsBytes', label: 'JS loaded', unit: 'B' },
  { id: 'jsGzip', label: 'JS loaded gzip', unit: 'B' },
  { id: 'jsFiles', label: 'JS files', unit: 'count' },
  { id: 'cssBytes', label: 'CSS loaded (files)', unit: 'B' },
  { id: 'cssGzip', label: 'CSS loaded gzip (files)', unit: 'B' },
  { id: 'cssFiles', label: 'CSS files', unit: 'count' },
  { id: 'fcpMs', label: 'First contentful paint', unit: 'ms' },
  { id: 'pluginsMs', label: 'Nuxt app created to before mount', unit: 'ms' },
  {
    id: 'hydrationMs',
    label: 'Hydration (mount incl. mounted hooks)',
    unit: 'ms',
  },
  { id: 'mountedMs', label: 'App mounted (since navigation)', unit: 'ms' },
  { id: 'longTaskMs', label: 'Long tasks, total', unit: 'ms' },
  {
    id: 'blockingMs',
    label: 'Blocking time (long tasks over 50 ms)',
    unit: 'ms',
  },
  { id: 'longTasks', label: 'Long tasks', unit: 'count' },
  { id: 'scriptMs', label: 'Script duration (CDP)', unit: 'ms' },
  { id: 'layoutMs', label: 'Style and layout (CDP)', unit: 'ms' },
  { id: 'domNodes', label: 'DOM nodes', unit: 'count' },
  { id: 'heapBytes', label: 'JS heap after load (after GC)', unit: 'B' },
]

const EDITOR_METRICS: Metric[] = [
  {
    id: 'interactiveMs',
    label: 'Navigation to editor interactive',
    unit: 'ms',
  },
  { id: 'jsBytes', label: 'JS loaded', unit: 'B' },
  { id: 'jsGzip', label: 'JS loaded gzip', unit: 'B' },
  { id: 'jsFiles', label: 'JS files', unit: 'count' },
  { id: 'cssBytes', label: 'CSS loaded (files)', unit: 'B' },
  { id: 'cssGzip', label: 'CSS loaded gzip (files)', unit: 'B' },
  { id: 'longTaskMs', label: 'Long tasks, total', unit: 'ms' },
  {
    id: 'blockingMs',
    label: 'Blocking time (long tasks over 50 ms)',
    unit: 'ms',
  },
  { id: 'longTasks', label: 'Long tasks', unit: 'count' },
  { id: 'scriptMs', label: 'Script duration (CDP)', unit: 'ms' },
  { id: 'layoutMs', label: 'Style and layout (CDP)', unit: 'ms' },
  { id: 'domNodes', label: 'DOM nodes', unit: 'count' },
  { id: 'heapBytes', label: 'JS heap after open (after GC)', unit: 'B' },
]

const MACHINE_METRICS: Metric[] = [
  { id: 'calibrationMs', label: 'CPU calibration (fixed JS loop)', unit: 'ms' },
]

/** Page 4 has no blocks, page 1 has 73, page 5 about 210 (mock/perfPage.ts). */
const VISITOR_PAGES = [
  { name: 'empty', path: '/page/4' },
  { name: 'home-73', path: '/' },
  { name: 'perf-210', path: '/page/5' },
]
const EDITOR_PAGE = { name: 'perf-210', path: '/page/5?blokkliEditing=5' }

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string', default: 'local' },
    compare: { type: 'boolean', default: false },
    'no-build': { type: 'boolean', default: false },
    'ttfb-runs': { type: 'string', default: '30' },
    'load-runs': { type: 'string', default: '7' },
    'cpu-throttle': { type: 'string', default: '4' },
    only: { type: 'string' },
    out: { type: 'string', default: join(ROOT, 'tmp/perf-baseline') },
  },
})

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function run(command: string, args: string[], logFile: string): void {
  console.error(`> ${command} ${args.join(' ')}`)
  try {
    const output = execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 1 << 28,
    })
    writeFileSync(logFile, output)
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string }
    writeFileSync(logFile, `${e.stdout ?? ''}\n${e.stderr ?? ''}`)
    throw new Error(`${command} ${args.join(' ')} failed, see ${logFile}`)
  }
}

function build(outDir: string): void {
  // Both are generated and git-ignored; the build fails without them.
  run('bun', ['run', 'changelog'], join(outDir, 'build.log'))
  run('bun', ['run', 'styles:build'], join(outDir, 'build.log'))
  run('bun', ['run', 'dev:build-ssr'], join(outDir, 'build.log'))
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

async function startServer(port: number): Promise<ChildProcess> {
  const child = spawn('node', [SERVER_ENTRY], {
    cwd: PLAYGROUND,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: 'ignore',
  })
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) {
        return child
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  child.kill()
  throw new Error('The playground server did not start.')
}

function collect(
  metrics: Baseline['metrics'],
  section: string,
  page: string,
  samples: Sample[],
  descriptors: Metric[],
): void {
  for (const m of descriptors) {
    const series = samples
      .map((s) => s[m.id])
      .filter((v): v is number => typeof v === 'number')
    if (series.length) {
      metrics[`${section}/${page}/${m.id}`] = stat(series, m.unit)
    }
  }
}

async function measure(label: string): Promise<Baseline> {
  const ttfbRuns = Number(values['ttfb-runs'])
  const loadRuns = Number(values['load-runs'])
  const cpuThrottle = Number(values['cpu-throttle'])
  const only = values.only
  const metrics: Baseline['metrics'] = {}
  const calibration = calibrateCpu()
  const loadAverage = loadavg()

  const port = await freePort()
  const server = await startServer(port)
  const browser = await launchBrowser()
  const base = `http://127.0.0.1:${port}`
  const chromium = browser.version()
  try {
    if (only !== 'editor') {
      for (const page of VISITOR_PAGES) {
        console.error(`visitor ${page.name} (${page.path})`)
        const rendered = await measureServer(base + page.path, ttfbRuns)
        const loads = await measureLoads(
          browser,
          base + page.path,
          loadRuns,
          cpuThrottle,
          'visitor',
        )
        // The byte counts of the server are one sample per metric, the render
        // time has one per request.
        const samples: Sample[] = [
          ...loads,
          ...rendered.ttfb.map((ttfbMs) => ({ ttfbMs })),
          rendered.bytes,
        ]
        collect(metrics, 'visitor', page.name, samples, VISITOR_METRICS)
      }
    }
    if (only !== 'visitor') {
      console.error(`editor ${EDITOR_PAGE.name} (${EDITOR_PAGE.path})`)
      const loads = await measureLoads(
        browser,
        base + EDITOR_PAGE.path,
        loadRuns,
        cpuThrottle,
        'editor',
      )
      collect(metrics, 'editor', EDITOR_PAGE.name, loads, EDITOR_METRICS)
    }
  } finally {
    await browser.close()
    server.kill()
  }

  calibration.push(...calibrateCpu())
  metrics[CALIBRATION_KEY] = stat(calibration, 'ms')

  return {
    meta: {
      label,
      date: new Date().toISOString(),
      commit:
        git('rev-parse', '--short', 'HEAD') +
        (git('status', '--porcelain') ? '+dirty' : ''),
      branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
      node: process.version,
      chromium,
      cpuThrottle,
      ttfbRuns,
      loadRuns,
      loadAverage,
    },
    metrics,
  }
}

function readBaseline(path: string): Baseline {
  return JSON.parse(readFileSync(path, 'utf8')) as Baseline
}

async function main(): Promise<void> {
  if (values.compare) {
    const [a, b] = positionals
    if (!a || !b) {
      throw new Error('Usage: --compare <before.json> <after.json>')
    }
    console.log(renderComparison(readBaseline(a), readBaseline(b)))
    return
  }

  const outDir = values.out!
  mkdirSync(outDir, { recursive: true })
  if (!values['no-build']) {
    build(outDir)
  } else if (!existsSync(SERVER_ENTRY)) {
    throw new Error('No build found: run without --no-build first.')
  }

  const baseline = await measure(values.label!)
  const file = join(outDir, `${values.label}.json`)
  writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n')
  console.log(
    renderTables(baseline, [
      { name: 'visitor', title: 'Visitor', metrics: VISITOR_METRICS },
      { name: 'editor', title: 'Editor', metrics: EDITOR_METRICS },
      { name: 'machine', title: 'Machine', metrics: MACHINE_METRICS },
    ]),
  )
  console.error(`\nWrote ${file}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
