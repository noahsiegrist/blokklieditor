import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')

/** The only places allowed to pull the editor stylesheet into the bundle: the
 * providers that are loaded when a page is edited or previewed. */
const ALLOWED = [
  'src/runtime/editor/components/EditProvider.vue',
  'src/runtime/editor/components/PreviewProvider.vue',
]

const IMPORT_PATTERN = /['"]#blokkli-build\/styles\.css['"]/

const SOURCE_FILE = /\.(vue|ts|js|mjs)$/

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue
    }
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(path)
    } else if (SOURCE_FILE.test(entry.name)) {
      yield path
    }
  }
}

/** Files, relative to the repository root, that import the editor stylesheet
 * although visitors load them, which puts the editor CSS into every page. */
export function findVisitorEditorStylesheetImports(): string[] {
  const found: string[] = []
  for (const dir of ['src', 'playground/app']) {
    for (const file of walk(join(ROOT, dir))) {
      const path = relative(ROOT, file)
      if (
        !path.endsWith('.spec.ts') &&
        !ALLOWED.includes(path) &&
        IMPORT_PATTERN.test(readFileSync(file, 'utf-8'))
      ) {
        found.push(path)
      }
    }
  }
  return found
}
