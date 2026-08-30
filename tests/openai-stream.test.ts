import { describe, expect, it } from 'vitest'
import { streamOpenAi } from '../src/wire/openai.ts'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'

describe('OpenAI stream translation', () => {
  it('emits usage before finish and preserves raw tool argument fragments', async () => {
    const rawEvents = [
      { choices: [{ delta: { content: 'answer' }, finish_reason: null }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call-1', function: { name: 'read', arguments: '{"p' } },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: 'ath":"a"}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      { choices: [], usage: { prompt_tokens: 4, completion_tokens: 6 } },
    ]

    const chunks: StreamChunk[] = []
    for await (const chunk of streamOpenAi(rawEvents, { id: 'gpt-5.6-luna', protocol: 'openai' })) {
      chunks.push(chunk)
    }

    expect(chunks.at(-2)?.type).toBe('usage')
    expect(chunks.at(-1)?.type).toBe('finish')

    if (chunks.at(-1)?.type === 'finish') {
      expect((chunks.at(-1) as any).reason.kind).toBe('tool-calls')
    }

    const toolDeltas = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'tool-call-delta' }> => c.type === 'tool-call-delta')
      .map((c) => c.argumentsDelta)

    expect(toolDeltas).toEqual(['{"p', 'ath":"a"}'])

    const blockEnds = chunks.filter((c) => c.type === 'block-end')
    expect(blockEnds).toHaveLength(2) // text block and tool-call block
  })

  it('translates reasoning deltas correctly', async () => {
    const rawEvents = [
      { choices: [{ delta: { reasoning_content: 'thinking...' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 20 } },
    ]

    const chunks: StreamChunk[] = []
    for await (const chunk of streamOpenAi(rawEvents, { id: 'gpt-5.6-luna', protocol: 'openai' })) {
      chunks.push(chunk)
    }

    const reasoningDeltas = chunks.filter((c) => c.type === 'reasoning-delta')
    expect(reasoningDeltas).toHaveLength(1)
    expect((reasoningDeltas[0] as any).text).toBe('thinking...')

    const textDeltas = chunks.filter((c) => c.type === 'text-delta')
    expect(textDeltas).toHaveLength(1)
    expect((textDeltas[0] as any).text).toBe('done')
  })

  it('throws EMPTY_RESPONSE on stream with no content', async () => {
    const rawEvents = [
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 2, completion_tokens: 0 } },
    ]

    await expect((async () => {
      for await (const _chunk of streamOpenAi(rawEvents, { id: 'gpt-5.6-luna', protocol: 'openai' })) {
        // consume
      }
    })()).rejects.toThrow()
  })
})
