import { createHash } from 'node:crypto'
import type { ContentBlock, ToolResultBlock } from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ResolveImage } from '../types.ts'

/**
 * Command Code gateway (meta provider) enforces `call_id` <= 64 chars.
 * openai-codex history uses 83-char composite ids like `call_...|fc_...`.
 * Sanitize deterministically so tool-call ↔ tool-result correlation survives
 * a provider switch without mutating durable storage.
 */
export function sanitizeCallId(id: string): string {
  const s = String(id)
  if (s.length <= 64) return s
  const hash = createHash('sha256').update(s).digest('hex').slice(0, 32)
  return `call_${hash}`
}

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
