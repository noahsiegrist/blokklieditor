import { bench, describe, vi } from 'vitest'
import type { GenericMessage } from '../../src/modules/agent/runtime/shared/types'

/**
 * Scripted 5-round tool loop through the real AnthropicProvider request
 * builder. Tokens are approximated as chars / 4. Billing model per Anthropic
 * prompt caching: uncached input = 1x, cache write = 1.25x, cache read = 0.1x.
 * A cache read happens for the longest prefix ending at a breakpoint that a
 * previous round wrote.
 */

type Block = Record<string, any>
type Req = {
  system: Block[]
  tools: Block[]
  messages: Array<{ role: string; content: string | Block[] }>
}

let lastRequest: Req | null = null

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (params: Req) => {
        lastRequest = JSON.parse(JSON.stringify(params))
        return { async *[Symbol.asyncIterator]() {} }
      },
    }
  },
}))

const { createAnthropicProvider } =
  await import('../../src/modules/agent/runtime/server/providers/anthropic')

const filler = (n: number, seed: string) =>
  `${seed} `.repeat(Math.ceil(n / (seed.length + 1))).slice(0, n)

const systemPrompt = [
  { text: filler(12000, 'static'), cacheHint: 'ephemeral' as const },
  { text: filler(3000, 'page'), cacheHint: 'ephemeral' as const },
  { text: filler(500, 'turn') },
]
const tools = Array.from({ length: 30 }, (_, i) => ({
  name: `tool_${i}`,
  description: filler(300, 'desc'),
  input_schema: { type: 'object', properties: { a: { type: 'string' } } },
}))

const ROUNDS = 5

function history(round: number): GenericMessage[] {
  const msgs: GenericMessage[] = [
    { role: 'user', content: filler(600, 'user request') },
  ]
  for (let r = 1; r < round; r++) {
    msgs.push(
      {
        role: 'assistant',
        content: [
          { type: 'text', text: filler(400, `plan${r}`) },
          {
            type: 'tool_use',
            id: `t${r}`,
            name: 'tool_1',
            input: { a: filler(200, 'in') },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: `t${r}`,
            content: filler(6000, `result${r}`),
          },
        ],
      },
    )
  }
  return msgs
}

async function build(messages: GenericMessage[]): Promise<Req> {
  const stream = createAnthropicProvider().createStream(
    { apiKey: 'x', model: 'm' },
    { systemPrompt, tools, messages },
  )
  for await (const _ of stream) {
    // drain
  }
  return lastRequest!
}

const strip = (v: unknown) =>
  JSON.stringify(v, (k, val) => (k === 'cache_control' ? undefined : val))

/** Anthropic looks back at most this many blocks from a breakpoint for a hit. */
const LOOKBACK_BLOCKS = 20

type Flat = { text: string; breakpoint: boolean }

/** Request in cache order (tools, system, messages) as flat blocks. */
function flatten(req: Req): Flat[] {
  const flat: Flat[] = [
    {
      text: strip(req.tools),
      breakpoint: req.tools.some((t) => t.cache_control),
    },
  ]
  for (const b of req.system) {
    flat.push({ text: strip(b), breakpoint: !!b.cache_control })
  }
  for (const m of req.messages) {
    const blocks = typeof m.content === 'string' ? [m.content] : m.content
    for (const b of blocks) {
      flat.push({ text: strip(b), breakpoint: !!(b as Block).cache_control })
    }
  }
  return flat
}

async function simulate() {
  const rounds: Array<{
    total: number
    cachedRead: number
    cost: number
    breakpoints: number
  }> = []
  const written = new Set<string>()

  for (let round = 1; round <= ROUNDS; round++) {
    const flat = flatten(await build(history(round)))
    const prefixes: string[] = []
    const tokens: number[] = []
    let acc = ''
    for (const f of flat) {
      acc += f.text
      prefixes.push(acc)
      tokens.push(acc.length / 4)
    }
    const total = tokens.at(-1)!

    const bpIndexes = flat.flatMap((f, i) => (f.breakpoint ? [i] : []))
    let cachedRead = 0
    for (const bp of bpIndexes) {
      for (let i = bp; i >= Math.max(0, bp - LOOKBACK_BLOCKS); i--) {
        if (written.has(prefixes[i]!)) {
          cachedRead = Math.max(cachedRead, tokens[i]!)
          break
        }
      }
    }
    const writeTarget = bpIndexes.length ? tokens[Math.max(...bpIndexes)]! : 0
    const cacheWrite = Math.max(0, writeTarget - cachedRead)
    const uncached = total - cachedRead - cacheWrite
    rounds.push({
      total,
      cachedRead,
      cost: uncached + cacheWrite * 1.25 + cachedRead * 0.1,
      breakpoints: bpIndexes.length,
    })
    for (const bp of bpIndexes) written.add(prefixes[bp]!)
  }
  return rounds
}

const rounds = await simulate()
const totalCost = rounds.reduce((a, r) => a + r.cost, 0)
const noCacheCost = rounds.reduce((a, r) => a + r.total, 0)
const uncachedPerRound = rounds.map((r) => Math.round(r.total - r.cachedRead))
console.log(
  '\n[anthropic-history-cache] scripted 5-round tool loop (tokens ~ chars/4)',
)
console.table(
  rounds.map((r, i) => ({
    round: i + 1,
    inputTokens: Math.round(r.total),
    cacheReadTokens: Math.round(r.cachedRead),
    notReadFromCache: uncachedPerRound[i],
    costInUncachedTokenEquivalents: Math.round(r.cost),
    breakpoints: r.breakpoints,
  })),
)
console.log(
  `total input cost (uncached-token equivalents): ${Math.round(totalCost)} vs ${Math.round(noCacheCost)} with no caching at all`,
)

describe('anthropic history cache', () => {
  bench('build request for round 5', async () => {
    await build(history(5))
  })
})
