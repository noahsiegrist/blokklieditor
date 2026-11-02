import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import {
  chromium,
  type Browser,
  type CDPSession,
  type Page,
} from 'playwright-core'

// Plain JS, read as text: tsx would add helpers to a serialized function.
const PROBE_PATH = fileURLToPath(new URL('./probe.js', import.meta.url))

/** What one request or one page load measured: metric id to value. */
export type Sample = Record<string, number>

const gzipSize = (body: Buffer | string): number =>
  gzipSync(body, { level: 9 }).length

/**
 * Milliseconds a fixed JS loop takes, per run. Run before and after the
 * measurements: the machine's speed drifts with its load, and this is what
 * shows it (see calibrationWarning in report.ts).
 */
export function calibrateCpu(runs = 5): number[] {
  const samples: number[] = []
  for (let run = 0; run < runs; run++) {
    const start = performance.now()
    let x = 0
    for (let i = 0; i < 50_000_000; i++) {
      x = (Math.imul(x, 31) + i) | 0
    }
    const elapsed = performance.now() - start
    // x is used, so that the loop is not optimized away.
    samples.push(x === 0.5 ? 0 : elapsed)
  }
  return samples
}

// Server

type Response = { ttfb: number; body: Buffer }

function get(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const req = request(
      url,
      // A new connection per request, and no compression: the render time and
      // the raw bytes are what we want.
      { agent: false, headers: { 'accept-encoding': 'identity' } },
      (res) => {
        const ttfb = performance.now() - start
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ ttfb, body: Buffer.concat(chunks) }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

function scriptsOf(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[0],
  )
}

function inlineStyleBytes(html: string): number {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].reduce(
    (sum, m) => sum + Buffer.byteLength(m[0]),
    0,
  )
}

/** The Nuxt payload: the data script, or an inline `window.__NUXT__`. */
function payloadOf(html: string): string {
  return scriptsOf(html)
    .filter((s) => s.includes('__NUXT_DATA__') || s.includes('window.__NUXT__'))
    .join('')
}

export type ServerSamples = {
  ttfb: number[]
  bytes: Sample
}

/**
 * The render time is the time to first byte on localhost: Nitro renders the
 * whole page before it sends the first byte.
 */
export async function measureServer(
  url: string,
  runs: number,
): Promise<ServerSamples> {
  // The first requests compile the route and warm the JIT.
  for (let i = 0; i < 5; i++) {
    await get(url)
  }
  const ttfb: number[] = []
  let last: Response | undefined
  for (let i = 0; i < runs; i++) {
    last = await get(url)
    ttfb.push(last.ttfb)
  }
  const html = last!.body.toString('utf8')
  const payload = payloadOf(html)
  return {
    ttfb,
    bytes: {
      htmlBytes: last!.body.length,
      htmlGzip: gzipSize(last!.body),
      payloadBytes: Buffer.byteLength(payload),
      payloadGzip: gzipSize(payload),
      inlineCssBytes: inlineStyleBytes(html),
    },
  }
}

// Browser

function findChromium(): string | undefined {
  const root = join(
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
      join(homedir(), '.cache/ms-playwright'),
  )
  if (!existsSync(root)) {
    return
  }
  const candidates = readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()
  for (const dir of candidates) {
    for (const bin of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const path = join(root, dir, bin)
      if (existsSync(path)) {
        return path
      }
    }
  }
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.CHROMIUM_PATH
  try {
    return await chromium.launch({ executablePath })
  } catch (error) {
    // The Playwright version wants a Chromium revision that isn't installed.
    const fallback = findChromium()
    if (!fallback) {
      throw error
    }
    return await chromium.launch({ executablePath: fallback })
  }
}

type Resource = { url: string; raw: number; gzip: number }

type PageMetrics = Record<string, number>

async function heapAndCounters(cdp: CDPSession): Promise<PageMetrics> {
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const byName = Object.fromEntries(metrics.map((m) => [m.name, m.value]))
  return {
    heapBytes: byName.JSHeapUsedSize ?? 0,
    domNodes: byName.Nodes ?? 0,
    scriptMs: (byName.ScriptDuration ?? 0) * 1000,
    layoutMs:
      ((byName.LayoutDuration ?? 0) + (byName.RecalcStyleDuration ?? 0)) * 1000,
  }
}

function resourceMetrics(resources: Resource[]): PageMetrics {
  const js = resources.filter((r) => /\.m?js(\?|$)/.test(r.url))
  const css = resources.filter((r) => /\.css(\?|$)/.test(r.url))
  const sum = (list: Resource[], key: 'raw' | 'gzip') =>
    list.reduce((total, r) => total + r[key], 0)
  return {
    jsBytes: sum(js, 'raw'),
    jsGzip: sum(js, 'gzip'),
    jsFiles: js.length,
    cssBytes: sum(css, 'raw'),
    cssGzip: sum(css, 'gzip'),
    cssFiles: css.length,
  }
}

function longTaskMetrics(durations: number[]): PageMetrics {
  return {
    longTaskMs: durations.reduce((a, b) => a + b, 0),
    blockingMs: durations.reduce((a, b) => a + Math.max(0, b - 50), 0),
    longTasks: durations.length,
  }
}

/**
 * One load of a page in a fresh browser context (an empty cache), with the CPU
 * throttled. `ready` is what the load waits for besides the network.
 */
async function loadOnce(
  browser: Browser,
  url: string,
  cpuThrottle: number,
  ready: 'visitor' | 'editor',
): Promise<Sample> {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    // Without this the editor opens its onboarding popups, which the E2E
    // specs close the same way.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(url).origin,
          localStorage: [
            { name: 'blokkli:popup:agent:closed', value: 'true' },
            { name: 'blokkli:popup:tour:closed', value: 'true' },
          ],
        },
      ],
    },
  })
  try {
    const page: Page = await context.newPage()
    await page.addInitScript({ path: PROBE_PATH })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })

    const bodies: Promise<Resource | undefined>[] = []
    page.on('response', (response) => {
      const resourceUrl = response.url()
      if (!/\.(m?js|css)(\?|$)/.test(resourceUrl)) {
        return
      }
      bodies.push(
        response.body().then(
          (body) => ({
            url: resourceUrl,
            raw: body.length,
            gzip: gzipSize(body),
          }),
          () => undefined,
        ),
      )
    })

    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(
      (kind) => {
        const probe = (
          window as unknown as {
            __PERF__: { mounted?: number; ready?: number }
          }
        ).__PERF__
        return kind === 'editor'
          ? probe.ready !== undefined
          : probe.mounted !== undefined
      },
      ready,
      { timeout: 120_000, polling: 50 },
    )
    await page.waitForLoadState('networkidle')
    // Let the tasks that follow the mount run, so that they are counted.
    await page.waitForTimeout(500)

    const probe = await page.evaluate(() => {
      const p = (window as unknown as { __PERF__: Record<string, any> })
        .__PERF__
      const fcp = performance
        .getEntriesByType('paint')
        .find((e) => e.name === 'first-contentful-paint')
      return { ...p, fcp: fcp?.startTime }
    })
    const resources = (await Promise.all(bodies)).filter(
      (r): r is Resource => !!r,
    )
    const counters = await heapAndCounters(cdp)

    const sample: Sample = {
      ...resourceMetrics(resources),
      ...longTaskMetrics(probe.longTasks),
      ...counters,
    }
    if (ready === 'visitor') {
      Object.assign(sample, {
        fcpMs: probe.fcp ?? 0,
        pluginsMs: probe.beforeMount - probe.created,
        hydrationMs: probe.mounted - probe.beforeMount,
        mountedMs: probe.mounted,
      })
    } else {
      sample.interactiveMs = probe.ready
    }
    return sample
  } finally {
    await context.close()
  }
}

export async function measureLoads(
  browser: Browser,
  url: string,
  runs: number,
  cpuThrottle: number,
  ready: 'visitor' | 'editor',
): Promise<Sample[]> {
  // An unmeasured load first: the server and the disk cache are warm.
  await loadOnce(browser, url, cpuThrottle, ready)
  const samples: Sample[] = []
  for (let i = 0; i < runs; i++) {
    samples.push(await loadOnce(browser, url, cpuThrottle, ready))
  }
  return samples
}
