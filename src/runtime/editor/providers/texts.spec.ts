import { describe, expect, it, vi } from 'vitest'
import * as texts from './texts'

const { loaders } = vi.hoisted(() => ({
  loaders: { en: null as null | (() => Promise<Record<string, string>>) },
}))

vi.mock('#blokkli-build/translations', () => ({
  translationLoaders: {
    get en() {
      return loaders.en
    },
  },
}))

vi.mock('#blokkli-build/editor-config', () => ({
  defaultLanguage: 'en',
  forceDefaultLanguage: false,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('texts provider', () => {
  it('resolves to a translating function once the chunk is loaded', async () => {
    loaders.en = async () => ({ save: 'Speichern' })

    const $t = await texts.default('en')

    expect($t('save', 'Save')).toBe('Speichern')
    expect($t('missing', 'Fallback')).toBe('Fallback')
    expect($t('more', 'More', { more: true })).toBe('More…')
  })

  it('hands out the function before the chunk is loaded', async () => {
    const chunk = deferred<Record<string, string>>()
    loaders.en = () => chunk.promise

    const { $t, ready } = texts.startTextProvider('en')

    expect($t('save', 'Save')).toBe('Save')
    expect($t('unknownKey')).toBe('unknownKey')

    chunk.resolve({ save: 'Speichern' })
    await ready

    expect($t('save', 'Save')).toBe('Speichern')
  })
})
