import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
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
    let payload: unknown = rawEvent
    if (typeof rawEvent === 'object' && rawEvent !== null && 'data' in rawEvent) {
      const dataStr = (rawEvent as SseEvent).data.trim()
      if (dataStr === '[DONE]') break
      try {
        payload = JSON.parse(dataStr)
      } catch {
        continue
      }
    } else if (typeof rawEvent === 'string') {
      const trimmed = rawEvent.trim()
      if (trimmed === '[DONE]') break
      try {
        payload = JSON.parse(trimmed)
      } catch {
        continue
      }
    }

    if (!payload || typeof payload !== 'object') continue
    const chunk = payload as Record<string, any>

    if (chunk.type === 'error' || chunk.error) {
      const err = chunk.error ?? chunk
      const errMsg = typeof err === 'string' ? err : err.message || 'Stream error'
      throw new LlmError(errMsg, err.type || err.code || 'STREAM_ERROR')
    }

    if (chunk.type === 'message_start' && chunk.message) {
      if (typeof chunk.message.usage?.input_tokens === 'number') {
        inputTokens = chunk.message.usage.input_tokens
      }
    } else if (chunk.type === 'content_block_start') {
      const index = chunk.index ?? 0
      const block = chunk.content_block
      if (block?.type === 'text') {
        activeBlocks.set(index, { index, type: 'text', text: block.text || '' })
        yield { type: 'block-start', index, blockType: 'text' }
      } else if (block?.type === 'thinking') {
        activeBlocks.set(index, { index, type: 'reasoning', text: block.thinking || '' })
        yield { type: 'block-start', index, blockType: 'reasoning' }
      } else if (block?.type === 'tool_use') {
        activeBlocks.set(index, {
          index,
          type: 'tool-call',
          toolId: block.id,
          toolName: block.name,
          toolArgs: '',
        })
        yield { type: 'block-start', index, blockType: 'tool-call' }
      }
    } else if (chunk.type === 'content_block_delta') {
      const index = chunk.index ?? 0
      const delta = chunk.delta
      const state = activeBlocks.get(index)

      if (delta?.type === 'text_delta') {
        const text = delta.text || ''
        if (state) state.text = (state.text || '') + text
        yield { type: 'text-delta', index, text }
      } else if (delta?.type === 'thinking_delta') {
        const text = delta.thinking || ''
        if (state) state.text = (state.text || '') + text
        yield { type: 'reasoning-delta', index, text }
      } else if (delta?.type === 'input_json_delta') {
        const partialJson = delta.partial_json || ''
        if (state) state.toolArgs = (state.toolArgs || '') + partialJson
        yield {
          type: 'tool-call-delta',
          index,
          id: CallId(state?.toolId || `call-${index}`),
          ...(state?.toolName ? { name: state.toolName } : {}),
          argumentsDelta: partialJson,
        }
      }
    } else if (chunk.type === 'content_block_stop') {
      const index = chunk.index ?? 0
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
            id: CallId(state.toolId || `call-${index}`),
            name: state.toolName || '',
            arguments: state.toolArgs || '',
          }
        }
        activeBlocks.delete(index)
        totalBlocks++
        yield { type: 'block-end', index, block }
      }
    } else if (chunk.type === 'message_delta') {
      if (typeof chunk.usage?.output_tokens === 'number') {
        outputTokens = chunk.usage.output_tokens
      }
      const stopReason = chunk.delta?.stop_reason
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
        id: CallId(state.toolId || `call-${index}`),
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
