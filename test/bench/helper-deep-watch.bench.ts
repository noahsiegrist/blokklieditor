import { bench, describe } from 'vitest'
import { createApp, effectScope, nextTick, reactive } from 'vue'
import { useBlokkliHelper } from '../../src/runtime/composables/useBlokkliHelper'
import {
  INJECT_EDIT_CONTEXT,
  INJECT_MUTATED_FIELDS_MAP,
} from '#blokkli/helpers/injections'

const CONSUMERS = 40
const BLOCKS = 50
const EDITS = 100

type Options = Record<string, Record<string, string>>

function createScenario(countReads: boolean) {
  const items = Array.from({ length: BLOCKS }, (_, i) => ({
    uuid: 'block-' + i,
    bundle: 'text',
    isVisible: true,
    options: { style: 'plain', spacing: 'small', align: 'left' },
  }))

  // Counts every property read on the underlying map, which is what a deep
  // watcher spends its time on.
  let rawReads = 0
  const raw: Options = {}
  const counted = (target: Record<string, string>) =>
    !countReads
      ? target
      : new Proxy(target, {
          get(t, key, receiver) {
            rawReads++
            return Reflect.get(t, key, receiver)
          },
        })
  for (const item of items) {
    raw[item.uuid] = counted({ style: 'plain', spacing: 'small' })
  }
  const mutatedOptions = reactive(raw)

  let callbackCalls = 0
  const app = createApp({})
  app.provide(INJECT_EDIT_CONTEXT, { mutatedOptions } as any)
  app.provide(INJECT_MUTATED_FIELDS_MAP, {})
  const scope = effectScope()
  const consumers = scope.run(() =>
    app.runWithContext(() =>
      Array.from({ length: CONSUMERS }, () =>
        useBlokkliHelper().queryBlocks((item) => {
          callbackCalls++
          return { include: item.options?.style === 'fancy' }
        }, items as any),
      ),
    ),
  )!

  async function edit(times: number) {
    for (let i = 0; i < times; i++) {
      mutatedOptions['block-0']!.style = i % 2 ? 'plain' : 'fancy'
      await nextTick()
      for (const consumer of consumers) {
        void consumer.value
      }
    }
  }

  return {
    edit,
    counts: () => ({ rawReads, callbackCalls }),
    reset: () => {
      rawReads = 0
      callbackCalls = 0
    },
    stop: () => scope.stop(),
  }
}

describe(`${CONSUMERS} queryBlocks consumers, ${BLOCKS} blocks, ${EDITS} edits`, async () => {
  const probe = createScenario(true)
  await probe.edit(1)
  probe.reset()
  await probe.edit(EDITS)
  console.log(
    `[deterministic] per ${EDITS} edits:`,
    JSON.stringify(probe.counts()),
  )
  probe.stop()

  const scenario = createScenario(false)
  bench(`${EDITS} option edits`, () => scenario.edit(EDITS), {
    iterations: 3,
    warmupIterations: 1,
    time: 0,
    warmupTime: 0,
  })
})
