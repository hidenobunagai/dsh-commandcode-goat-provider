import type { ContentBlock, ToolResultBlock } from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ResolveImage } from '../types.ts'

export function extractTextContent(blocks: readonly ContentBlock[]): string {
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

export function parseJsonArguments(raw: string): Record<string, unknown> {
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

export function findToolResultBlock(blocks: readonly ContentBlock[]): ToolResultBlock | undefined {
  return blocks.find((b): b is ToolResultBlock => b.type === 'tool-result')
}

export async function resolveImageData(
  attachment: ContentBlock & { type: 'image' },
  modelId: string,
  supportsImage: boolean,
  resolveImage: ResolveImage | undefined,
  signal?: AbortSignal,
): Promise<{ mediaType: string; base64: string }> {
  if (!supportsImage) {
    throw new LlmError(`Model ${modelId} does not support image input`, 'UNSUPPORTED')
  }
  if (!resolveImage) {
    throw new LlmError('Image resolution service is not available', 'INVALID_REQUEST')
  }
  return resolveImage(attachment.attachment, signal)
}
