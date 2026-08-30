import { describe, expect, it } from 'vitest'
import { streamAnthropic } from '../src/wire/anthropic.ts'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'

describe('Anthropic stream translation', () => {
  it('translates Anthropic events with text, tool_use, usage, and finish', async () => {
    const rawEvents = [
      {
        type: 'message_start',
        message: { id: 'msg-1', usage: { input_tokens: 15 } },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
      {
        type: 'content_block_stop',
        index: 0,
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'tool-call-1', name: 'search', input: {} },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"q":' },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '"test"}' },
      },
      {
        type: 'content_block_stop',
        index: 1,
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 25 },
      },
      {
        type: 'message_stop',
      },
    ]

    const chunks: StreamChunk[] = []
    for await (const chunk of streamAnthropic(rawEvents, { id: 'claude-sonnet-4-6', protocol: 'anthropic' })) {
      chunks.push(chunk)
    }

    expect(chunks.at(-2)?.type).toBe('usage')
    expect(chunks.at(-1)?.type).toBe('finish')

    if (chunks.at(-2)?.type === 'usage') {
      expect((chunks.at(-2) as any).usage).toEqual({
        inputTokens: 15,
        outputTokens: 25,
      })
    }

    if (chunks.at(-1)?.type === 'finish') {
      expect((chunks.at(-1) as any).reason.kind).toBe('tool-calls')
    }

    const toolDeltas = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'tool-call-delta' }> => c.type === 'tool-call-delta')
      .map((c) => c.argumentsDelta)

    expect(toolDeltas).toEqual(['{"q":', '"test"}'])
  })

  it('translates thinking deltas to reasoning-delta', async () => {
    const rawEvents = [
      {
        type: 'message_start',
        message: { id: 'msg-1', usage: { input_tokens: 5 } },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me think...' },
      },
      {
        type: 'content_block_stop',
        index: 0,
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'Answer' },
      },
      {
        type: 'content_block_stop',
        index: 1,
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 10 },
      },
      {
        type: 'message_stop',
      },
    ]

    const chunks: StreamChunk[] = []
    for await (const chunk of streamAnthropic(rawEvents, { id: 'claude-3-7-sonnet', protocol: 'anthropic' })) {
      chunks.push(chunk)
    }

    const reasoningDeltas = chunks.filter((c) => c.type === 'reasoning-delta')
    expect(reasoningDeltas).toHaveLength(1)
    expect((reasoningDeltas[0] as any).text).toBe('Let me think...')
  })
})
