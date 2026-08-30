import type { ModelModality, ReasoningEffortId, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'

export type Protocol = 'openai' | 'anthropic'

export interface ProtocolOverride {
  model: string
  protocol: Protocol
}

export interface CommandCodeConfig {
  apiKeyEnv?: string
  baseURL?: string
  defaultContextWindow?: number
  maxTokens?: number
  requestTimeoutMs?: number
  streamIdleTimeoutMs?: number
  enableZdr?: boolean
  retryPolicy?: RetryPolicyConfig
  protocolOverrides?: ProtocolOverride[]
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
