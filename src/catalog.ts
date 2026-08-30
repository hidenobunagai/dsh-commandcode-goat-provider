import type {
  LlmDiscoveredModel,
  LlmModelInfo,
  LlmResolvedModelInfo,
  ModelModality,
} from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { CommandCodeConfig, CommandCodeStaticModel, Protocol, ProtocolOverride } from './types.ts'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from './config.ts'

export const KNOWN_EFFORTS: Readonly<Record<string, readonly string[]>> = {
  'Qwen/Qwen3.8-Max': ['low', 'medium', 'xhigh'],
  'Qwen/Qwen3.8-27B': ['low', 'medium', 'xhigh'],
  'Qwen/Qwen3.8-Flash': ['low', 'medium', 'xhigh'],
  'claude-fable-5': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-opus-4-7': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-opus-4-8': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-opus-5': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-sonnet-4-6': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-sonnet-5': ['low', 'medium', 'high', 'xhigh', 'max'],
  'deepseek/deepseek-v4-flash': ['high', 'max'],
  'deepseek/deepseek-v4-flash-vision-exp': ['high', 'max'],
  'deepseek/deepseek-v4-pro': ['high', 'max'],
  'google/gemini-3.1-flash-lite': ['low', 'medium', 'high'],
  'google/gemini-3.5-flash': ['low', 'medium', 'high'],
  'google/gemini-3.5-flash-lite': ['low', 'medium', 'high'],
  'google/gemini-3.6-flash': ['low', 'medium', 'high'],
  'google/gemini-3.7-flash': ['low', 'medium', 'high'],
  'gpt-5.3-codex': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.4': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.4-mini': ['low', 'medium', 'high'],
  'gpt-5.5': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6-terra': ['low', 'medium', 'high', 'xhigh', 'max'],
  'sakana/fugu-ultra': ['high', 'xhigh'],
  'xai/grok-4.5': ['low', 'medium', 'high'],
  'xai/grok-4.6': ['low', 'medium', 'high', 'xhigh'],
  'z-ai/glm-5.3-flash': ['low', 'high', 'max'],
  'zai-org/GLM-5.2': ['high', 'max'],
  'zai-org/GLM-5.3': ['low', 'high', 'max'],
}

export const KNOWN_IMAGE_MODELS: ReadonlySet<string> = new Set([
  'MiniMaxAI/MiniMax-M3',
  'Qwen/Qwen3.6-Plus',
  'Qwen/Qwen3.7-Flash',
  'Qwen/Qwen3.7-Plus',
  'Qwen/Qwen3.8-27B',
  'Qwen/Qwen3.8-Flash',
  'Qwen/Qwen3.8-Max',
  'claude-fable-5',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'deepseek/deepseek-v4-flash-vision-exp',
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash',
  'google/gemini-3.5-flash-lite',
  'google/gemini-3.6-flash',
  'google/gemini-3.7-flash',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'meta/muse-spark-1.1',
  'meta/muse-spark-1.2',
  'meta/muse-spark-1.2-contributor',
  'minimax/minimax-m3-free',
  'moonshotai/Kimi-K2.5',
  'moonshotai/Kimi-K2.6',
  'moonshotai/Kimi-K2.7-Code',
  'moonshotai/Kimi-K2.7-Code-Highspeed',
  'moonshotai/Kimi-K3',
  'sakana/fugu-ultra',
  'stepfun/Step-3.7-Flash',
  'thinkingmachines/inkling',
  'thinkingmachines/inkling-small',
  'xai/grok-4.5',
  'xiaomi/mimo-v2.5',
  'z-ai/glm-5.3-flash',
])

export interface ModelStats {
  planTier: 'free' | 'go' | 'goat' | 'pro' | 'provider'
  planLabel: string
  intelligence?: number
  inputPrice?: number | 'free' // in USD per 1M tokens
  outputPrice?: number | 'free'
  discount?: string
}

export const KNOWN_STATS: Readonly<Record<string, ModelStats>> = {
  // Free (3)
  'poolside/laguna-s-2.1-free': { planTier: 'free', planLabel: 'Free', inputPrice: 'free', outputPrice: 'free' },
  'minimax/minimax-m2.7-free': { planTier: 'free', planLabel: 'Free', intelligence: 38.9, inputPrice: 'free', outputPrice: 'free' },
  'minimax/minimax-m3-free': { planTier: 'free', planLabel: 'Free', intelligence: 45.4, inputPrice: 'free', outputPrice: 'free' },

  // GOAT Plan (44)
  'Qwen/Qwen3.7-Flash': { planTier: 'go', planLabel: 'Go/GOAT', inputPrice: 0.03, outputPrice: 0.13 },
  'meta/muse-spark-1.2-contributor': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 56.8, inputPrice: 0.10, outputPrice: 0.20 },
  'stepfun/Step-3.5-Flash': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 26.5, inputPrice: 0.10, outputPrice: 0.30 },
  'xiaomi/mimo-v2.5': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 38.0, inputPrice: 0.14, outputPrice: 0.28, discount: '-98%' },
  'tencent/hy3-paid': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 42.2, inputPrice: 0.14, outputPrice: 0.58 },
  'z-ai/glm-5.3-flash': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 57.5, inputPrice: 0.15, outputPrice: 0.50 },
  'Qwen/Qwen3.8-Flash': { planTier: 'go', planLabel: 'Go/GOAT', inputPrice: 0.16, outputPrice: 0.47 },
  'gpt-5.6-luna': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 52.3, inputPrice: 0.20, outputPrice: 1.20 },
  'stepfun/Step-3.7-Flash': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 30.9, inputPrice: 0.20, outputPrice: 1.15 },
  'deepseek/deepseek-v4-flash': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 52.0, inputPrice: 0.22, outputPrice: 0.66 },
  'deepseek/deepseek-v4-flash-vision-exp': { planTier: 'go', planLabel: 'Go/GOAT', inputPrice: 0.22, outputPrice: 0.66 },
  'MiniMaxAI/MiniMax-M2.5': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 34.5, inputPrice: 0.30, outputPrice: 1.20 },
  'MiniMaxAI/MiniMax-M2.7': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 38.9, inputPrice: 0.30, outputPrice: 1.20 },
  'MiniMaxAI/MiniMax-M3': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 45.4, inputPrice: 0.30, outputPrice: 1.20, discount: '-50%' },
  'Qwen/Qwen3.7-Plus': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 39.4, inputPrice: 0.40, outputPrice: 1.60 },
  'Qwen/Qwen3.8-27B': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 52.0, inputPrice: 0.40, outputPrice: 3.00 },
  'xiaomi/mimo-v2.5-pro': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 42.9, inputPrice: 0.435, outputPrice: 0.87, discount: '-99%' },
  'thinkingmachines/inkling-small': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 41.2, inputPrice: 0.50, outputPrice: 1.20 },
  'Qwen/Qwen3.6-Plus': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 40.5, inputPrice: 0.50, outputPrice: 3.00 },
  'moonshotai/Kimi-K2.5': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 36.0, inputPrice: 0.60, outputPrice: 3.00 },
  'nvidia/nemotron-3-ultra-550b-a55b': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 38.3, inputPrice: 0.60, outputPrice: 2.40 },
  'deepseek/deepseek-v4-pro': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 53.2, inputPrice: 0.66, outputPrice: 1.98 },
  'google/gemini-3.7-flash': { planTier: 'goat', planLabel: 'GOAT', intelligence: 56.0, inputPrice: 0.75, outputPrice: 3.75, discount: '-50%' },
  'tencent/hy4-preview': { planTier: 'go', planLabel: 'Go/GOAT', inputPrice: 0.834, outputPrice: 2.501 },
  'moonshotai/Kimi-K2.6': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 45.1, inputPrice: 0.95, outputPrice: 4.00 },
  'moonshotai/Kimi-K2.7-Code': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 43.0, inputPrice: 0.95, outputPrice: 4.00 },
  'zai-org/GLM-5': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 40.6, inputPrice: 1.00, outputPrice: 3.20 },
  'thinkingmachines/inkling': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 42.3, inputPrice: 1.00, outputPrice: 4.05 },
  'meta/muse-spark-1.2': { planTier: 'goat', planLabel: 'GOAT', intelligence: 56.8, inputPrice: 1.25, outputPrice: 4.25 },
  'Qwen/Qwen3.6-Max-Preview': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 41.1, inputPrice: 1.30, outputPrice: 7.80 },
  'zai-org/GLM-5.1': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 41.0, inputPrice: 1.40, outputPrice: 4.40 },
  'zai-org/GLM-5.2': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 52.6, inputPrice: 1.40, outputPrice: 4.40 },
  'zai-org/GLM-5.3': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 59.5, inputPrice: 1.40, outputPrice: 4.40 },
  'moonshotai/Kimi-K2.7-Code-Highspeed': { planTier: 'go', planLabel: 'Go/GOAT', inputPrice: 1.90, outputPrice: 8.00 },
  'xai/grok-4.5': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 55.8, inputPrice: 2.00, outputPrice: 6.00 },
  'xai/grok-4.6': { planTier: 'goat', planLabel: 'GOAT', intelligence: 60.9, inputPrice: 2.00, outputPrice: 6.00 },
  'Qwen/Qwen3.8-Max': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 58.1, inputPrice: 2.00, outputPrice: 6.00 },
  'Qwen/Qwen3.7-Max': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 46.7, inputPrice: 2.50, outputPrice: 7.50 },
  'zai-org/GLM-5.2-Fast': { planTier: 'go', planLabel: 'Go/GOAT', inputPrice: 3.00, outputPrice: 10.25 },
  'moonshotai/Kimi-K3': { planTier: 'go', planLabel: 'Go/GOAT', intelligence: 59.7, inputPrice: 3.00, outputPrice: 15.00 },
  'gpt-5.6-sol': { planTier: 'goat', planLabel: 'GOAT', intelligence: 60.9, inputPrice: 5.00, outputPrice: 30.00 },

  // Pro & Provider Flagships
  'claude-sonnet-5': { planTier: 'pro', planLabel: 'Pro', intelligence: 62.5, inputPrice: 3.00, outputPrice: 15.00 },
  'claude-sonnet-4-6': { planTier: 'pro', planLabel: 'Pro', intelligence: 60.0, inputPrice: 3.00, outputPrice: 15.00 },
  'claude-opus-5': { planTier: 'provider', planLabel: 'Provider', intelligence: 65.0, inputPrice: 15.00, outputPrice: 75.00 },
  'claude-opus-4-8': { planTier: 'provider', planLabel: 'Provider', intelligence: 63.5, inputPrice: 15.00, outputPrice: 75.00 },
  'claude-haiku-4-5-20251001': { planTier: 'pro', planLabel: 'Pro', intelligence: 48.0, inputPrice: 1.00, outputPrice: 5.00 },
  'gpt-5.6-terra': { planTier: 'pro', planLabel: 'Pro', intelligence: 61.2, inputPrice: 3.00, outputPrice: 15.00 },
  'gpt-5.5': { planTier: 'pro', planLabel: 'Pro', intelligence: 58.0, inputPrice: 2.50, outputPrice: 10.00 },
  'google/gemini-3.6-flash': { planTier: 'pro', planLabel: 'Pro', intelligence: 54.0, inputPrice: 0.50, outputPrice: 1.50 },
  'sakana/fugu-ultra': { planTier: 'provider', planLabel: 'Provider', intelligence: 58.0, inputPrice: 5.00, outputPrice: 20.00 },
}

/** Set of latest-generation model IDs to show by default. */
export const LATEST_MODEL_IDS: ReadonlySet<string> = new Set([
  // GOAT Flagships & Popular Models
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'google/gemini-3.7-flash',
  'xai/grok-4.6',
  'xai/grok-4.5',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'moonshotai/Kimi-K3',
  'moonshotai/Kimi-K2.7-Code',
  'Qwen/Qwen3.8-Max',
  'Qwen/Qwen3.8-Flash',
  'Qwen/Qwen3.8-27B',
  'z-ai/glm-5.3-flash',
  'zai-org/GLM-5.3',
  'MiniMaxAI/MiniMax-M3',
  'minimax/minimax-m3-free',
  'meta/muse-spark-1.2',
  'meta/muse-spark-1.2-contributor',
  'stepfun/Step-3.7-Flash',
  'tencent/hy4-preview',
  'xiaomi/mimo-v2.5-pro',
  // Pro / Provider Flagships
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-haiku-4-5-20251001',
  'gpt-5.6-terra',
  'gpt-5.5',
  'google/gemini-3.6-flash',
  'sakana/fugu-ultra',
])

export function formatContext(contextWindow: number | undefined): string | undefined {
  if (contextWindow === undefined || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return undefined
  }
  if (contextWindow >= 1_000_000) {
    const m = contextWindow / 1_000_000
    const rounded = Math.round(m * 10) / 10
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}M`
  }
  return `${Math.floor(contextWindow / 1_000)}K`
}

function formatPrice(val: number): string {
  if (Number.isInteger(val)) return `$${val}.00`
  const str = val.toString()
  const parts = str.split('.')
  if (parts[1]?.length === 1) return `$${val}0`
  return `$${val}`
}

export function buildModelDescription(modelId: string, contextWindow?: number): string {
  const parts: string[] = []
  const stats = KNOWN_STATS[modelId]

  // 1. Pricing / In-Out
  if (stats) {
    if (stats.inputPrice === 'free') {
      parts.push('Free')
    } else if (typeof stats.inputPrice === 'number') {
      const inStr = formatPrice(stats.inputPrice)
      const outStr = typeof stats.outputPrice === 'number' ? `/${formatPrice(stats.outputPrice)}` : ''
      const disc = stats.discount ? ` (${stats.discount})` : ''
      parts.push(`In ${inStr}${outStr}${disc}`)
    }
  }

  // 2. Intelligence Score
  if (stats?.intelligence !== undefined) {
    parts.push(`IQ ${stats.intelligence}`)
  }

  // 3. Context
  const ctxStr = formatContext(contextWindow)
  if (ctxStr) parts.push(ctxStr)

  // 4. Modalities & Capabilities
  if (KNOWN_IMAGE_MODELS.has(modelId)) {
    parts.push('Vision')
  }

  const efforts = KNOWN_EFFORTS[modelId]
  if (efforts && efforts.length > 0) {
    parts.push('Reasoning')
  }

  return parts.join(' · ')
}

export const STATIC_MODELS: CommandCodeStaticModel[] = [
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    description: buildModelDescription('gpt-5.6-luna', 1050000),
    contextWindow: 1050000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    description: buildModelDescription('gpt-5.6-sol', 1050000),
    contextWindow: 1050000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'google/gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: buildModelDescription('google/gemini-3.7-flash', 1048576),
    contextWindow: 1048576,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'xai/grok-4.6',
    name: 'Grok 4.6',
    description: buildModelDescription('xai/grok-4.6', 500000),
    contextWindow: 500000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: buildModelDescription('deepseek/deepseek-v4-pro', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    reasoningEfforts: [ReasoningEffortId('high'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: buildModelDescription('deepseek/deepseek-v4-flash', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    reasoningEfforts: [ReasoningEffortId('high'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
  {
    id: 'moonshotai/Kimi-K3',
    name: 'Kimi K3',
    description: buildModelDescription('moonshotai/Kimi-K3', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'moonshotai/Kimi-K2.7-Code',
    name: 'Kimi K2.7 Code',
    description: buildModelDescription('moonshotai/Kimi-K2.7-Code', 256000),
    contextWindow: 256000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'Qwen/Qwen3.8-Max',
    name: 'Qwen 3.8 Max',
    description: buildModelDescription('Qwen/Qwen3.8-Max', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'Qwen/Qwen3.8-Flash',
    name: 'Qwen 3.8 Flash',
    description: buildModelDescription('Qwen/Qwen3.8-Flash', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'Qwen/Qwen3.8-27B',
    name: 'Qwen 3.8 27B',
    description: buildModelDescription('Qwen/Qwen3.8-27B', 262144),
    contextWindow: 262144,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'z-ai/glm-5.3-flash',
    name: 'GLM-5.3 Flash',
    description: buildModelDescription('z-ai/glm-5.3-flash', 1048576),
    contextWindow: 1048576,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('high'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
  {
    id: 'zai-org/GLM-5.3',
    name: 'GLM-5.3',
    description: buildModelDescription('zai-org/GLM-5.3', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('high'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
  {
    id: 'MiniMaxAI/MiniMax-M3',
    name: 'MiniMax M3',
    description: buildModelDescription('MiniMaxAI/MiniMax-M3', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'minimax/minimax-m3-free',
    name: 'MiniMax M3 (Free)',
    description: buildModelDescription('minimax/minimax-m3-free', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'xai/grok-4.5',
    name: 'Grok 4.5',
    description: buildModelDescription('xai/grok-4.5', 500000),
    contextWindow: 500000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'meta/muse-spark-1.2',
    name: 'Muse Spark 1.2',
    description: buildModelDescription('meta/muse-spark-1.2', 1048576),
    contextWindow: 1048576,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'meta/muse-spark-1.2-contributor',
    name: 'Muse Spark 1.2 Contributor',
    description: buildModelDescription('meta/muse-spark-1.2-contributor', 1048576),
    contextWindow: 1048576,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'stepfun/Step-3.7-Flash',
    name: 'Step 3.7 Flash',
    description: buildModelDescription('stepfun/Step-3.7-Flash', 256000),
    contextWindow: 256000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'tencent/hy4-preview',
    name: 'Tencent Hy4 Preview',
    description: buildModelDescription('tencent/hy4-preview', 1048576),
    contextWindow: 1048576,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    supportsTools: true,
  },
  {
    id: 'xiaomi/mimo-v2.5-pro',
    name: 'MiMo V2.5 Pro',
    description: buildModelDescription('xiaomi/mimo-v2.5-pro', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    supportsTools: true,
  },
  // --- Pro / Provider Models ---
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    description: buildModelDescription('claude-sonnet-5', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: buildModelDescription('claude-sonnet-4-6', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    description: buildModelDescription('claude-opus-5', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    description: buildModelDescription('claude-opus-4-8', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: buildModelDescription('claude-haiku-4-5-20251001', 200000),
    contextWindow: 200000,
    maxTokens: 65536,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    description: buildModelDescription('gpt-5.6-terra', 1050000),
    contextWindow: 1050000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    description: buildModelDescription('gpt-5.5', 400000),
    contextWindow: 400000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'google/gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    description: buildModelDescription('google/gemini-3.6-flash', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'sakana/fugu-ultra',
    name: 'Fugu Ultra',
    description: buildModelDescription('sakana/fugu-ultra', 1000000),
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('high'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
]

export const STATIC_CAPABILITIES = new Map<string, CommandCodeStaticModel>(
  STATIC_MODELS.map((m) => [m.id, m]),
)

export const FALLBACK_MODELS: LlmDiscoveredModel[] = STATIC_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  contextWindow: m.contextWindow,
  maxTokens: m.maxTokens,
}))

export function normalizeDiscoveredModels(response: unknown): LlmDiscoveredModel[] {
  if (!response || typeof response !== 'object') {
    return []
  }

  let items: unknown[] = []
  if (Array.isArray(response)) {
    items = response
  } else if ('data' in response && Array.isArray((response as { data: unknown }).data)) {
    items = (response as { data: unknown[] }).data
  }

  const result: LlmDiscoveredModel[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    if (typeof raw.id !== 'string' || !raw.id.trim()) continue

    const id = raw.id.trim()
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined

    let contextWindow: number | undefined
    if (typeof raw.context_length === 'number' && raw.context_length > 0) {
      contextWindow = Math.floor(raw.context_length)
    } else if (typeof raw.context_window === 'number' && raw.context_window > 0) {
      contextWindow = Math.floor(raw.context_window)
    }

    let maxTokens: number | undefined
    if (typeof raw.max_tokens === 'number' && raw.max_tokens > 0) {
      maxTokens = Math.floor(raw.max_tokens)
    }

    result.push({
      id,
      name,
      contextWindow,
      maxTokens,
    })
  }

  return result
}

export function resolveModelProtocol(modelId: string, overrides?: readonly ProtocolOverride[]): Protocol {
  if (overrides) {
    const matched = overrides.find((o) => o.model === modelId)
    if (matched) return matched.protocol
  }

  const staticEntry = STATIC_CAPABILITIES.get(modelId)
  if (staticEntry) return staticEntry.protocol

  if (modelId.toLowerCase().startsWith('claude-')) {
    return 'anthropic'
  }

  return 'openai'
}

export function resolveCommandCodeModel(
  provider: string,
  modelId: string,
  catalog: readonly LlmDiscoveredModel[] | undefined,
  config: CommandCodeConfig,
): LlmResolvedModelInfo {
  const discovered = catalog?.find((m) => m.id === modelId)
  const staticEntry = STATIC_CAPABILITIES.get(modelId)

  const name = discovered?.name ?? staticEntry?.name ?? modelId
  const contextWindow = discovered?.contextWindow ?? staticEntry?.contextWindow ?? config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW
  const defaultMaxTokens = discovered?.maxTokens ?? staticEntry?.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS
  const description = buildModelDescription(modelId, contextWindow)
  const hasImage = KNOWN_IMAGE_MODELS.has(modelId) || (staticEntry?.inputModalities?.includes('image') ?? false)
  const inputModalities: readonly ModelModality[] = hasImage ? ['text', 'image'] : ['text']

  const knownEfforts = KNOWN_EFFORTS[modelId] ?? (staticEntry?.reasoningEfforts?.map(e => String(e)))
  const reasoning = knownEfforts && knownEfforts.length > 0
    ? {
        efforts: knownEfforts.map((id) => ({
          id: ReasoningEffortId(id),
          name: id,
        })),
        defaultEffort: staticEntry?.defaultEffort ?? ReasoningEffortId(knownEfforts[0]),
      }
    : undefined

  return {
    provider,
    id: modelId,
    name,
    description,
    inputModalities,
    context: { contextWindow },
    defaultMaxTokens,
    reasoning,
  }
}

export function toModelInfo(provider: string, model: LlmDiscoveredModel): LlmModelInfo {
  const staticEntry = STATIC_CAPABILITIES.get(model.id)
  const hasImage = KNOWN_IMAGE_MODELS.has(model.id) || (staticEntry?.inputModalities?.includes('image') ?? false)
  const description = buildModelDescription(model.id, model.contextWindow ?? staticEntry?.contextWindow)
  return {
    provider,
    id: model.id,
    name: model.name ?? staticEntry?.name ?? model.id,
    description,
    inputModalities: hasImage ? ['text', 'image'] : ['text'],
  }
}

/** Sort comparator: Cheapest / Tier first (Free -> Go/GOAT ascending price -> Pro -> Provider). */
export function compareModels(a: LlmDiscoveredModel, b: LlmDiscoveredModel): number {
  const statsA = KNOWN_STATS[a.id]
  const statsB = KNOWN_STATS[b.id]

  const rankTier = (tier?: string): number => {
    if (tier === 'free') return 0
    if (tier === 'go' || tier === 'goat') return 1
    if (tier === 'pro') return 2
    if (tier === 'provider') return 3
    return 4
  }

  const rA = rankTier(statsA?.planTier)
  const rB = rankTier(statsB?.planTier)
  if (rA !== rB) return rA - rB

  // Compare input price within same tier
  const priceVal = (p?: number | 'free') => {
    if (p === 'free') return 0
    if (typeof p === 'number') return p
    return 999
  }
  const pA = priceVal(statsA?.inputPrice)
  const pB = priceVal(statsB?.inputPrice)
  if (pA !== pB) return pA - pB

  const nameA = a.name ?? a.id
  const nameB = b.name ?? b.id
  return nameA.localeCompare(nameB)
}
