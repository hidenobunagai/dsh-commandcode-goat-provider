import type { ContentBlock, FinishReason, StreamChunk, TokenUsage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { StreamModel } from '../types.ts'
import type { SseEvent } from './sse.ts'

interface BlockState {
  index: number
  type: 'text' | 'reasoning' | 'tool-call'
  text?: string
  toolId?: string
  toolName?: string
  toolArgs?: string
}

export async function* streamAnthropic(
  events: AsyncIterable<SseEvent | unknown> | unknown[],
  _model: StreamModel,
): AsyncGenerator<StreamChunk, void, undefined> {
  let totalBlocks = 0
  let inputTokens = 0
  let outputTokens = 0
  let finishReason: FinishReason | null = null

  const activeBlocks = new Map<number, BlockState>()

  for await (const rawEvent of events) {
    if (!rawEvent || typeof rawEvent !== 'object') continue
    const event = rawEvent as Record<string, unknown>
    const eventType = event.type as string | undefined

    if (eventType === 'message_start') {
      const message = event.message as Record<string, unknown> | undefined
      const usage = message?.usage as Record<string, unknown> | undefined
      if (usage) {
        inputTokens = (usage.input_tokens as number) || 0
        outputTokens = (usage.output_tokens as number) || 0
      }
    } else if (eventType === 'content_block_start') {
      const index = (event.index as number) ?? activeBlocks.size
      const block = event.content_block as Record<string, unknown> | undefined
      const blockType = block?.type as string | undefined

      if (blockType === 'tool_use') {
        const state: BlockState = {
          index,
          type: 'tool-call',
          toolId: block?.id as string | undefined,
          toolName: block?.name as string | undefined,
          toolArgs: '',
        }
        activeBlocks.set(index, state)
        totalBlocks++
      } else if (blockType === 'thinking') {
        activeBlocks.set(index, { index, type: 'reasoning', text: '' })
        totalBlocks++
      } else {
        activeBlocks.set(index, { index, type: 'text', text: '' })
        totalBlocks++
      }
    } else if (eventType === 'content_block_delta') {
      const index = (event.index as number) ?? 0
      const delta = event.delta as Record<string, unknown> | undefined
      const deltaType = delta?.type as string | undefined

      if (deltaType === 'text_delta') {
        const text = (delta?.text as string) || ''
        if (text) {
          const state = activeBlocks.get(index)
          if (state) state.text = (state.text || '') + text
          yield { type: 'text-delta', text }
        }
      } else if (deltaType === 'thinking_delta') {
        const reasoning = (delta?.thinking as string) || ''
        if (reasoning) {
          const state = activeBlocks.get(index)
          if (state) state.text = (state.text || '') + reasoning
          yield { type: 'reasoning-delta', text: reasoning }
        }
      } else if (deltaType === 'input_json_delta') {
        const partialJson = (delta?.partial_json as string) || ''
        const state = activeBlocks.get(index)
        if (state) state.toolArgs = (state.toolArgs || '') + partialJson
        yield {
          type: 'tool-call-delta',
          index,
          id: (state?.toolId || `call-${index}`) as ToolCallId,
          ...(state?.toolName ? { name: state.toolName } : {}),
          argumentsDelta: partialJson,
        }
      }
    } else if (eventType === 'content_block_stop') {
      const index = (event.index as number) ?? 0
      const state = activeBlocks.get(index)
      if (state) {
        let block: ContentBlock
        if (state.type === 'text') {
          block = { type: 'text', text: state.text || '' }
        } else if (state.type === 'reasoning') {
          block = { type: 'reasoning', text: state.text || '' }
        } else {
          block = {
            type: 'tool-call',
            id: (state.toolId || `call-${index}`) as ToolCallId,
            name: state.toolName || '',
            arguments: state.toolArgs || '',
          }
        }
        activeBlocks.delete(index)
        totalBlocks++
        yield { type: 'block-end', index, block }
      }
    } else if (eventType === 'message_delta') {
      const usage = event.usage as Record<string, unknown> | undefined
      if (typeof usage?.output_tokens === 'number') {
        outputTokens = usage.output_tokens as number
      }
      const delta = event.delta as Record<string, unknown> | undefined
      const stopReason = delta?.stop_reason as string | undefined
      if (stopReason) {
        switch (stopReason) {
          case 'tool_use':
            finishReason = { kind: 'tool-calls' }
            break
          case 'max_tokens':
            finishReason = { kind: 'max-tokens' }
            break
          case 'end_turn':
          case 'stop_sequence':
          default:
            finishReason = { kind: 'stop' }
            break
        }
      }
    }
  }

  // Close any unclosed blocks
  for (const [index, state] of activeBlocks.entries()) {
    let block: ContentBlock
    if (state.type === 'text') {
      block = { type: 'text', text: state.text || '' }
    } else if (state.type === 'reasoning') {
      block = { type: 'reasoning', text: state.text || '' }
    } else {
      block = {
        type: 'tool-call',
        id: (state.toolId || `call-${index}`) as ToolCallId,
        name: state.toolName || '',
        arguments: state.toolArgs || '',
      }
    }
    totalBlocks++
    yield { type: 'block-end', index, block }
  }
  activeBlocks.clear()

  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
  }

  if (totalBlocks === 0 && inputTokens === 0 && outputTokens === 0) {
    throw new LlmError('Provider returned empty response', EMPTY_RESPONSE_CODE)
  }

  yield { type: 'usage', usage }

  yield {
    type: 'finish',
    reason: finishReason ?? { kind: 'stop' },
  }
}
