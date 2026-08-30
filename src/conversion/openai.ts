import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type {
  OpenAiChatRequest,
  OpenAiContentPart,
  OpenAiMessage,
  OpenAiToolCall,
  RequestModel,
  ResolveImage,
} from '../types.ts'
import { extractTextContent, findToolResultBlock, resolveImageData, sanitizeCallId } from './shared.ts'

export async function toOpenAiRequest(
  options: GenerateOptions,
  model: RequestModel,
  resolveImage?: ResolveImage,
): Promise<OpenAiChatRequest> {
  const supportsImage = model.inputModalities?.includes('image') ?? false
  const messages: OpenAiMessage[] = []

  if (options.system && options.system.trim().length > 0) {
    messages.push({ role: 'system', content: options.system })
  }

  for (const message of options.messages) {
    if (message.source.kind === 'tool') {
      const toolResultBlock = findToolResultBlock(message.content)
      const callId = toolResultBlock?.toolCallId ?? (message.source as { callId?: string }).callId
      const text = toolResultBlock ? extractTextContent(toolResultBlock.content) : extractTextContent(message.content)

      messages.push({
        role: 'tool',
        tool_call_id: sanitizeCallId(String(callId)),
        content: text,
      })
    } else if (message.source.kind === 'user') {
      const parts: OpenAiContentPart[] = []
      let hasImage = false

      for (const block of message.content) {
        if (block.type === 'text') {
          if (block.text.length > 0) {
            parts.push({ type: 'text', text: block.text })
          }
        } else if (block.type === 'image') {
          hasImage = true
          const { mediaType, base64 } = await resolveImageData(block, options.model, supportsImage, resolveImage, options.signal)
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${base64}` },
          })
        } else if (block.type === 'tool-result') {
          const text = extractTextContent(block.content)
          messages.push({
            role: 'tool',
            tool_call_id: sanitizeCallId(String(block.toolCallId)),
            content: text,
          })
        }
      }

      if (parts.length > 0) {
        if (hasImage) {
          messages.push({ role: 'user', content: parts })
        } else {
          const text = parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
          messages.push({ role: 'user', content: text })
        }
      }
    } else if (message.source.kind === 'model') {
      const text = extractTextContent(message.content)
      const toolCalls: OpenAiToolCall[] = []

      for (const block of message.content) {
        if (block.type === 'tool-call') {
          toolCalls.push({
            id: sanitizeCallId(String(block.id)),
            type: 'function',
            function: {
              name: block.name,
              arguments: block.arguments,
            },
          })
        }
      }

      messages.push({
        role: 'assistant',
        content: text.length > 0 ? text : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    }
  }

  const request: OpenAiChatRequest = {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  }

  if (options.temperature !== undefined) {
    request.temperature = options.temperature
  }

  if (options.maxTokens !== undefined) {
    request.max_tokens = options.maxTokens
  }

  if (options.stop && options.stop.length > 0) {
    request.stop = [...options.stop]
  }

  if (
    options.reasoningEffort &&
    model.reasoningEfforts &&
    model.reasoningEfforts.includes(options.reasoningEffort)
  ) {
    request.reasoning_effort = String(options.reasoningEffort)
  }

  if (options.tools && options.tools.length > 0) {
    request.tools = options.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }

  return request
}
