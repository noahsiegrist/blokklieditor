import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { bench, describe } from 'vitest'
import { findVisitorEditorStylesheetImports } from '../support/editorStylesheetImports'

const PLAYGROUND = join(import.meta.dirname, '../../playground')
const SERVER_ENTRY = join(PLAYGROUND, '.output/server/index.mjs')

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

const kb = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB'

/** Byte counts of what a visitor downloads for a page of the SSR build of the
 * playground (`bun run dev:build-ssr`). Deterministic, no timings. */
async function measureBuild(): Promise<void> {
  if (!existsSync(SERVER_ENTRY)) {
    console.log('No playground SSR build: bytes of the pages not measured.')
    return
  }
  const port = await freePort()
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
  try {
    const base = `http://127.0.0.1:${port}`
    let html = ''
    for (let i = 0; i < 100 && !html; i++) {
      try {
        const res = await fetch(base + '/')
        html = res.ok ? await res.text() : ''
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
    const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
      (m) => m[1] ?? '',
    )
    const inlineBytes = inline.reduce((sum, s) => sum + Buffer.byteLength(s), 0)
    const hrefs = [
      ...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g),
    ].map((m) => m[1] ?? '')
    let linkedBytes = 0
    let linkedGzip = 0
    for (const href of hrefs) {
      const css = Buffer.from(await (await fetch(base + href)).arrayBuffer())
      linkedBytes += css.length
      linkedGzip += gzipSync(css).length
    }
    const htmlBytes = Buffer.byteLength(html)
    console.log(
      [
        `HTML of /:               ${kb(htmlBytes)} (gzip ${kb(gzipSync(html).length)})`,
        `inline CSS in the HTML:   ${kb(inlineBytes)} in ${inline.length} style tags`,
        `linked CSS files:         ${kb(linkedBytes)} (gzip ${kb(linkedGzip)}) in ${hrefs.length} files`,
        `CSS rules of the editor in the HTML: ${(html.match(/\.bk-/g) ?? []).length} selectors with .bk-`,
      ].join('\n'),
    )
  } finally {
    child.kill()
  }
}

await measureBuild()

const imports = findVisitorEditorStylesheetImports()
console.log(
  `Visitor files importing the editor stylesheet: ${imports.length}` +
    (imports.length ? ` (${imports.join(', ')})` : ''),
)

describe('visitor editor stylesheet imports', () => {
  bench('scan the sources for the editor stylesheet import', () => {
    findVisitorEditorStylesheetImports()
  })
})
