import { describe, expect, it } from 'vitest'
import { findVisitorEditorStylesheetImports } from '../support/editorStylesheetImports'

describe('editor stylesheet', () => {
  it('is only imported by the editor and preview providers, not by visitor code', () => {
    expect(findVisitorEditorStylesheetImports()).toEqual([])
  })
})
