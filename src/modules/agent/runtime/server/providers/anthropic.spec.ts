import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GenericMessage } from '../../shared/types'
import type { StreamOptions } from './types'

type Captured = {
  system: Array<Record<string, unknown>>
  tools: Array<Record<string, unknown>>
  messages: Array<{
    role: string
    content: string | Array<Record<string, any>>
  }>
}

const captured: { params: Captured | null } = { params: null }

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (params: Captured) => {
        captured.params = JSON.parse(JSON.stringify(params))
        return {
          async *[Symbol.asyncIterator]() {},
        }
      },
    }
  },
}))

const { createAnthropicProvider } = await import('./anthropic')

async function buildRequest(
  messages: GenericMessage[],
  overrides: Partial<StreamOptions> = {},
): Promise<Captured> {
  const provider = createAnthropicProvider()
  const stream = provider.createStream(
    { apiKey: 'test', model: 'claude-test' },
    {
      systemPrompt: [
        { text: 'static', cacheHint: 'ephemeral' },
        { text: 'per page', cacheHint: 'ephemeral' },
        { text: 'per turn' },
      ],
      tools: [
        { name: 'a', description: 'a', input_schema: { type: 'object' } },
        { name: 'b', description: 'b', input_schema: { type: 'object' } },
      ],
      messages,
      ...overrides,
    },
  )
  for await (const _ of stream) {
    // drain
  }
  return captured.params!
}

function breakpoints(req: Captured): string[] {
  const found: string[] = []
  const visit = (label: string, blocks: Array<Record<string, any>>) => {
    blocks.forEach((b, i) => {
      if (b.cache_control) found.push(`${label}[${i}]`)
    })
  }
  visit('system', req.system)
  visit('tools', req.tools)
  req.messages.forEach((m, i) => {
    if (Array.isArray(m.content)) visit(`messages[${i}]`, m.content)
  })
  return found
}

const toolRound = (n: number): GenericMessage[] => [
  {
    role: 'assistant',
    content: [
      { type: 'text', text: `thinking ${n}` },
      { type: 'tool_use', id: `t${n}`, name: 'a', input: { n } },
    ],
  },
  {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: `t${n}`, content: `r${n}` }],
  },
]

describe('AnthropicProvider history caching', () => {
  beforeEach(() => {
    captured.params = null
  })

  it('places a breakpoint on the last block of the last message', async () => {
    const req = await buildRequest([
      { role: 'user', content: 'hello' },
      ...toolRound(1),
    ])
    const last = req.messages.at(-1)!.content as Array<Record<string, any>>
    expect(last.at(-1)!.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('wraps a string last message into a text block to carry the breakpoint', async () => {
    const req = await buildRequest([{ role: 'user', content: 'hello' }])
    expect(req.messages[0]!.content).toEqual([
      { type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } },
    ])
  })

  it('never uses more than 4 breakpoints', async () => {
    const req = await buildRequest([
      { role: 'user', content: 'hello' },
      ...toolRound(1),
    ])
    expect(breakpoints(req).length).toBeLessThanOrEqual(4)
    expect(breakpoints(req)).toContain('messages[2][0]')
  })

  it('skips the history breakpoint when the 4 breakpoints are used up', async () => {
    const req = await buildRequest([{ role: 'user', content: 'hi' }], {
      systemPrompt: [
        { text: 'a', cacheHint: 'ephemeral' },
        { text: 'b', cacheHint: 'ephemeral' },
        { text: 'c', cacheHint: 'ephemeral' },
      ],
    })
    expect(breakpoints(req)).toHaveLength(4)
    expect(breakpoints(req)).not.toContain('messages[0][0]')
  })

  it('does not put a breakpoint on an empty text block', async () => {
    const req = await buildRequest([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 't', name: 'a', input: {} },
          { type: 'text', text: '' },
        ],
      },
    ])
    const last = req.messages.at(-1)!.content as Array<Record<string, any>>
    expect(last[1]!.cache_control).toBeUndefined()
    expect(last[0]!.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('keeps the request prefix of the next round identical up to the breakpoint', async () => {
    const history: GenericMessage[] = [{ role: 'user', content: 'hello' }]
    const round1 = await buildRequest(history)
    history.push(...toolRound(1))
    const round2 = await buildRequest(history)

    const stripCache = (msgs: Captured['messages']) =>
      JSON.parse(
        JSON.stringify(msgs, (k, v) => (k === 'cache_control' ? undefined : v)),
      ) as Captured['messages']

    const bpMsgIndex = round1.messages.length - 1
    expect(stripCache(round2.messages).slice(0, bpMsgIndex + 1)).toEqual(
      stripCache(round1.messages),
    )
    expect(round2.system).toEqual(round1.system)
    expect(round2.tools).toEqual(round1.tools)
  })
})
