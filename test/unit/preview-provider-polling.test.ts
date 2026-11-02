// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountPreviewProvider, setHidden } from '../support/previewProvider'

const SECOND = 1000

describe('PreviewProvider polling', () => {
  let getLastChanged: ReturnType<typeof vi.fn>
  let unmount: () => void

  async function mount() {
    getLastChanged = vi.fn(async () => '2026-01-01T00:00:00Z')
    ;({ unmount } = await mountPreviewProvider({ getLastChanged }))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    setHidden(false)
  })

  afterEach(() => {
    unmount()
    vi.useRealTimers()
  })

  it('backs off from 1 s to 2 s to 5 s while nothing changes', async () => {
    await mount()
    await vi.advanceTimersByTimeAsync(SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2 * SECOND - 1)
    expect(getLastChanged).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getLastChanged).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5 * SECOND - 1)
    expect(getLastChanged).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getLastChanged).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(4)
  })

  it('polls again after 1 s once the state has changed', async () => {
    await mount()
    await vi.advanceTimersByTimeAsync(SECOND)
    await vi.advanceTimersByTimeAsync(2 * SECOND)
    await vi.advanceTimersByTimeAsync(5 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(3)

    getLastChanged.mockResolvedValue('2026-01-01T00:00:05Z')
    await vi.advanceTimersByTimeAsync(5 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(5)
  })

  it('polls again after 1 s on local activity', async () => {
    await mount()
    await vi.advanceTimersByTimeAsync(SECOND)
    await vi.advanceTimersByTimeAsync(2 * SECOND)
    await vi.advanceTimersByTimeAsync(5 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(3)

    document.dispatchEvent(new Event('pointerdown'))
    await vi.advanceTimersByTimeAsync(SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(2 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(5)
  })

  it('does not poll while the tab is hidden', async () => {
    await mount()
    setHidden(true)
    await vi.advanceTimersByTimeAsync(10 * 60 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(0)
  })

  it('polls once when the tab becomes visible again', async () => {
    await mount()
    setHidden(true)
    await vi.advanceTimersByTimeAsync(60 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(0)

    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(getLastChanged).toHaveBeenCalledTimes(1)
  })

  it('stops polling on unmount', async () => {
    await mount()
    unmount()
    await vi.advanceTimersByTimeAsync(60 * SECOND)
    expect(getLastChanged).toHaveBeenCalledTimes(0)
  })
})
