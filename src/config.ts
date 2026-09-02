import z from '@deepseek-ai/schemastery'
import { RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { CommandCodeConfig, ProtocolOverride } from './types.ts'

export const DEFAULT_API_KEY_ENV = 'COMMANDCODE_API_KEY'
export const DEFAULT_BASE_URL = 'https://api.commandcode.ai'
export const DEFAULT_CONTEXT_WINDOW = 262144
export const DEFAULT_MAX_TOKENS = 65536
export const DEFAULT_REQUEST_TIMEOUT_MS = 60000
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000
export const DEFAULT_ENABLE_ZDR = false

export const defaultConfig: Required<Omit<CommandCodeConfig, 'apiKey' | 'retryPolicy' | 'hiddenModels'>> & { apiKey?: string; retryPolicy?: undefined; hiddenModels: string[] } = {
  apiKey: undefined,
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  baseURL: DEFAULT_BASE_URL,
  defaultContextWindow: DEFAULT_CONTEXT_WINDOW,
  maxTokens: DEFAULT_MAX_TOKENS,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  enableZdr: DEFAULT_ENABLE_ZDR,
  protocolOverrides: [],
  hiddenModels: [],
}

const protocolOverrideSchema: z<ProtocolOverride> = z.object({
  model: z.string().required(),
  protocol: z.union(['openai', 'anthropic']).required(),
})

export const Config: z<CommandCodeConfig> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string()
    .default(DEFAULT_BASE_URL)
    .pattern(/^https?:\/\/.+/),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  maxTokens: z.number().step(1).min(1).default(DEFAULT_MAX_TOKENS),
  requestTimeoutMs: z.number().step(1).min(1).default(DEFAULT_REQUEST_TIMEOUT_MS),
  streamIdleTimeoutMs: z.number().step(1).min(1).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  enableZdr: z.boolean().default(DEFAULT_ENABLE_ZDR),
  retryPolicy: RetryPolicySchema,
  protocolOverrides: z.array(protocolOverrideSchema).default([]),
  hiddenModels: z.array(z.string()).default([]),
})

export function resolveConfig(config?: Partial<CommandCodeConfig>): Required<Omit<CommandCodeConfig, 'apiKey' | 'retryPolicy'>> & { apiKey?: string; retryPolicy?: CommandCodeConfig['retryPolicy']; hiddenModels: string[] } {
  return {
    apiKey: config?.apiKey,
    apiKeyEnv: config?.apiKeyEnv ?? defaultConfig.apiKeyEnv,
    baseURL: config?.baseURL ?? defaultConfig.baseURL,
    defaultContextWindow: config?.defaultContextWindow ?? defaultConfig.defaultContextWindow,
    maxTokens: config?.maxTokens ?? defaultConfig.maxTokens,
    requestTimeoutMs: config?.requestTimeoutMs ?? defaultConfig.requestTimeoutMs,
    streamIdleTimeoutMs: config?.streamIdleTimeoutMs ?? defaultConfig.streamIdleTimeoutMs,
    enableZdr: config?.enableZdr ?? defaultConfig.enableZdr,
    retryPolicy: config?.retryPolicy,
    protocolOverrides: config?.protocolOverrides ?? defaultConfig.protocolOverrides,
    hiddenModels: config?.hiddenModels ?? defaultConfig.hiddenModels,
  }
}
