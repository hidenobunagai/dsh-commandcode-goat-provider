import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ModelModality, ReasoningEffortId, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'

export type Protocol = 'openai' | 'anthropic'

export type ResolveImage = (
  ref: ImageAttachmentRef,
  signal?: AbortSignal,
) => Promise<{ mediaType: string; base64: string }>

export interface ProtocolOverride {
  model: string
  protocol: Protocol
}

export interface CommandCodeConfig {
  apiKey?: string
  apiKeyEnv?: string
  baseURL?: string
  defaultContextWindow?: number
  maxTokens?: number
  requestTimeoutMs?: number
  streamIdleTimeoutMs?: number
  enableZdr?: boolean
  retryPolicy?: RetryPolicyConfig
  protocolOverrides?: ProtocolOverride[]
  hiddenModels?: string[]
}

export interface ResolvedConnection {
  baseURL: string
  apiKey: string
  enableZdr: boolean
  requestTimeoutMs: number
  streamIdleTimeoutMs: number
}

export interface CommandCodeStaticModel {
  id: string
  name: string
  description?: string
  contextWindow: number
  maxTokens: number
  protocol: Protocol
  inputModalities: readonly ModelModality[]
  reasoningEfforts?: readonly ReasoningEffortId[]
  defaultEffort?: ReasoningEffortId
  supportsTools?: boolean
}

export interface RequestModel {
  protocol: Protocol
  reasoningEfforts?: readonly ReasoningEffortId[]
  inputModalities?: readonly ModelModality[]
  supportsTools?: boolean
}

export interface StreamModel {
  id: string
  protocol: Protocol
}

// OpenAI Wire types
export interface OpenAiToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OpenAiContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface OpenAiChatRequest {
  model: string
  messages: OpenAiMessage[]
  stream: boolean
  stream_options?: { include_usage: boolean }
  temperature?: number
  max_tokens?: number
  stop?: string[]
  reasoning_effort?: string
  tools?: {
    type: 'function'
    function: {
      name: string
      description?: string
      parameters: Record<string, unknown>
    }
  }[]
}

// Anthropic Wire types
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | AnthropicContentBlock[]; is_error?: boolean }

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

export interface AnthropicMessagesRequest {
  model: string
  messages: AnthropicMessage[]
  stream: boolean
  system?: string
  max_tokens: number
  temperature?: number
  stop_sequences?: string[]
  tools?: AnthropicTool[]
}
