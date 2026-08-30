import type { GenerateOptions, ContentBlock, ToolResultBlock } from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type {
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicMessagesRequest,
  RequestModel,
  ResolveImage,
} from '../types.ts'

function parseJsonArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { value: parsed }
  } catch {
    return { raw }
  }
}

function extractTextContent(blocks: readonly ContentBlock[]): string {
  let result = ''
  for (const b of blocks) {
    if (b.type === 'text') {
      result += b.text
    } else if (b.type === 'tool-result') {
      result += extractTextContent(b.content)
    }
  }
  return result
}

export async function toAnthropicRequest(
  options: GenerateOptions,
  model: RequestModel,
  resolveImage?: ResolveImage,
): Promise<AnthropicMessagesRequest> {
  const supportsImage = model.inputModalities?.includes('image') ?? false
  const rawMessages: { role: 'user' | 'assistant'; blocks: AnthropicContentBlock[] }[] = []

  for (const message of options.messages) {
    if (message.source.kind === 'tool') {
      const toolResultBlock = message.content.find((b): b is ToolResultBlock => b.type === 'tool-result')
      const callId = toolResultBlock?.toolCallId ?? (message.source as { callId?: string }).callId
      const text = toolResultBlock ? extractTextContent(toolResultBlock.content) : extractTextContent(message.content)

      rawMessages.push({
        role: 'user',
        blocks: [
          {
            type: 'tool_result',
            tool_use_id: String(callId),
            content: text,
            is_error: toolResultBlock?.isError ?? false,
          },
        ],
      })
    } else if (message.source.kind === 'user') {
      const blocks: AnthropicContentBlock[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          if (block.text.length > 0) {
            blocks.push({ type: 'text', text: block.text })
          }
        } else if (block.type === 'image') {
          if (!supportsImage) {
            throw new LlmError(
              `Model ${options.model} does not support image input`,
              'UNSUPPORTED',
            )
          }
          if (!resolveImage) {
            throw new LlmError(
              'Image resolution service is not available',
              'INVALID_REQUEST',
            )
          }
          const { mediaType, base64 } = await resolveImage(block.attachment, options.signal)
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          })
        } else if (block.type === 'tool-result') {
          const text = extractTextContent(block.content)
          blocks.push({
            type: 'tool_result',
            tool_use_id: String(block.toolCallId),
            content: text,
            is_error: block.isError ?? false,
          })
        }
      }
      if (blocks.length > 0) {
        rawMessages.push({ role: 'user', blocks })
      }
    } else if (message.source.kind === 'model') {
      const blocks: AnthropicContentBlock[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          if (block.text.length > 0) {
            blocks.push({ type: 'text', text: block.text })
          }
        } else if (block.type === 'tool-call') {
          blocks.push({
            type: 'tool_use',
            id: String(block.id),
            name: block.name,
            input: parseJsonArguments(block.arguments),
          })
        }
      }
      if (blocks.length > 0) {
        rawMessages.push({ role: 'assistant', blocks })
      }
    }
  }

  // Merge adjacent messages with the same role (Anthropic requires strictly alternating user/assistant turns)
  const messages: AnthropicMessage[] = []
  for (const item of rawMessages) {
    const last = messages.at(-1)
    if (last && last.role === item.role) {
      if (Array.isArray(last.content)) {
        last.content.push(...item.blocks)
      } else {
        last.content = [{ type: 'text', text: last.content }, ...item.blocks]
      }
    } else {
      messages.push({
        role: item.role,
        content: [...item.blocks],
      })
    }
  }

  const request: AnthropicMessagesRequest = {
    model: options.model,
    messages,
    stream: true,
    max_tokens: options.maxTokens ?? 4096,
  }

  if (options.system && options.system.trim().length > 0) {
    request.system = options.system
  }

  if (options.temperature !== undefined) {
    request.temperature = options.temperature
  }

  if (options.stop && options.stop.length > 0) {
    request.stop_sequences = [...options.stop]
  }

  if (options.tools && options.tools.length > 0) {
    request.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
  }

  return request
}
