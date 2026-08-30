import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { StreamModel } from '../types.ts'
import type { SseEvent } from './sse.ts'

interface ToolCallState {
  index: number
  id: string
  name: string
  arguments: string
}

export async function* streamOpenAi(
  events: AsyncIterable<SseEvent | unknown> | unknown[],
  _model: StreamModel,
): AsyncGenerator<StreamChunk, void, undefined> {
  let nextBlockIndex = 0
  let totalBlocks = 0

  let currentText: { index: number; text: string } | null = null
  let currentReasoning: { index: number; text: string } | null = null
  const toolCalls = new Map<number, ToolCallState>()

  let finishReason: FinishReason | null = null
  let usage: TokenUsage | null = null

  const closeReasoning = (): StreamChunk[] => {
    if (!currentReasoning) return []
    const chunk: StreamChunk = {
      type: 'block-end',
      index: currentReasoning.index,
      block: { type: 'reasoning', text: currentReasoning.text },
    }
    currentReasoning = null
    totalBlocks++
    return [chunk]
  }

  const closeText = (): StreamChunk[] => {
    if (!currentText) return []
    const chunk: StreamChunk = {
      type: 'block-end',
      index: currentText.index,
      block: { type: 'text', text: currentText.text },
    }
    currentText = null
    totalBlocks++
    return [chunk]
  }

  const closeToolCalls = (): StreamChunk[] => {
    const chunks: StreamChunk[] = []
    for (const tc of toolCalls.values()) {
      chunks.push({
        type: 'block-end',
        index: tc.index,
        block: {
          type: 'tool-call',
          id: CallId(tc.id),
          name: tc.name,
          arguments: tc.arguments,
        },
      })
      totalBlocks++
    }
    toolCalls.clear()
    return chunks
  }

  for await (const rawEvent of events) {
    let payload: unknown = rawEvent
    if (typeof rawEvent === 'object' && rawEvent !== null && 'data' in rawEvent) {
      const dataStr = (rawEvent as SseEvent).data.trim()
      if (dataStr === '[DONE]') {
        break
      }
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

    // Check for provider error in stream
    if (chunk.error) {
      const errMsg = typeof chunk.error === 'string' ? chunk.error : chunk.error.message || 'Stream error'
      throw new LlmError(errMsg, chunk.error.code || 'STREAM_ERROR')
    }

    if (chunk.usage) {
      const u = chunk.usage
      const prompt = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0
      const completion = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0
      const cached = u.prompt_tokens_details?.cached_tokens
      const reasoning = u.completion_tokens_details?.reasoning_tokens

      usage = {
        inputTokens: typeof cached === 'number' ? Math.max(0, prompt - cached) : prompt,
        outputTokens: completion,
        ...(typeof cached === 'number' ? { cacheReadTokens: cached } : {}),
        ...(typeof reasoning === 'number' ? { reasoningTokens: reasoning } : {}),
      }
    }

    const choices = Array.isArray(chunk.choices) ? chunk.choices : []
    for (const choice of choices) {
      const delta = choice.delta
      if (delta) {
        // Reasoning delta
        const reasoningText = delta.reasoning_content ?? delta.reasoning
        if (typeof reasoningText === 'string' && reasoningText.length > 0) {
          if (!currentReasoning) {
            currentReasoning = { index: nextBlockIndex++, text: '' }
            yield { type: 'block-start', index: currentReasoning.index, blockType: 'reasoning' }
          }
          currentReasoning.text += reasoningText
          yield { type: 'reasoning-delta', index: currentReasoning.index, text: reasoningText }
        }

        // Text delta
        const textContent = delta.content
        if (typeof textContent === 'string' && textContent.length > 0) {
          if (currentReasoning) {
            for (const c of closeReasoning()) yield c
          }
          if (!currentText) {
            currentText = { index: nextBlockIndex++, text: '' }
            yield { type: 'block-start', index: currentText.index, blockType: 'text' }
          }
          currentText.text += textContent
          yield { type: 'text-delta', index: currentText.index, text: textContent }
        }

        // Tool calls delta
        if (Array.isArray(delta.tool_calls)) {
          if (currentReasoning) {
            for (const c of closeReasoning()) yield c
          }
          if (currentText) {
            for (const c of closeText()) yield c
          }

          for (const tc of delta.tool_calls) {
            const tcIndex = tc.index ?? 0
            let state = toolCalls.get(tcIndex)
            if (!state) {
              state = {
                index: nextBlockIndex++,
                id: tc.id || `call-${tcIndex}`,
                name: tc.function?.name || '',
                arguments: '',
              }
              toolCalls.set(tcIndex, state)
              yield { type: 'block-start', index: state.index, blockType: 'tool-call' }
            } else {
              if (tc.id) state.id = tc.id
              if (tc.function?.name) state.name = tc.function.name
            }

            const argsDelta = tc.function?.arguments ?? ''
            state.arguments += argsDelta
            yield {
              type: 'tool-call-delta',
              index: state.index,
              id: CallId(state.id),
              ...(tc.function?.name ? { name: tc.function.name } : {}),
              argumentsDelta: argsDelta,
            }
          }
        }
      }

      if (choice.finish_reason) {
        switch (choice.finish_reason) {
          case 'tool_calls':
            finishReason = { kind: 'tool-calls' }
            break
          case 'length':
            finishReason = { kind: 'max-tokens' }
            break
          case 'stop':
          default:
            finishReason = { kind: 'stop' }
            break
        }
      }
    }
  }

  // Close all open blocks
  for (const c of closeReasoning()) yield c
  for (const c of closeText()) yield c
  for (const c of closeToolCalls()) yield c

  if (totalBlocks === 0) {
    throw new LlmError('Provider returned empty response', EMPTY_RESPONSE_CODE)
  }

  if (usage) {
    yield { type: 'usage', usage }
  }

  yield {
    type: 'finish',
    reason: finishReason ?? { kind: 'stop' },
  }
}
