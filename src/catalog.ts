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

export interface ModelPricingFact {
  planTier: 'free' | 'go' | 'goat' | 'pro' | 'provider'
  planLabel: string
  dealLabel?: string
  priceComment?: string
}

export const KNOWN_PRICING: Readonly<Record<string, ModelPricingFact>> = {
  // Free
  'minimax/minimax-m3-free': { planTier: 'free', planLabel: 'FREE', dealLabel: '無料' },
  'minimax/minimax-m2.7-free': { planTier: 'free', planLabel: 'FREE', dealLabel: '無料' },
  'poolside/laguna-s-2.1-free': { planTier: 'free', planLabel: 'FREE', dealLabel: '無料' },

  // GOAT Flagships
  'gpt-5.6-luna': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'gpt-5.6-sol': { planTier: 'goat', planLabel: 'GOAT', priceComment: 'GOATプラン利用可' },
  'google/gemini-3.7-flash': { planTier: 'goat', planLabel: 'GOAT', dealLabel: '50% off', priceComment: 'GOATプラン利用可' },
  'xai/grok-4.6': { planTier: 'goat', planLabel: 'GOAT', priceComment: 'GOATプラン利用可' },
  'xai/grok-4.5': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'meta/muse-spark-1.2': { planTier: 'goat', planLabel: 'GOAT', priceComment: 'GOATプラン利用可' },
  'meta/muse-spark-1.2-contributor': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },

  // Go / GOAT Models
  'deepseek/deepseek-v4-pro': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'deepseek/deepseek-v4-flash': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'deepseek/deepseek-v4-flash-vision-exp': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'moonshotai/Kimi-K3': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'moonshotai/Kimi-K2.7-Code': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'moonshotai/Kimi-K2.7-Code-Highspeed': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'Qwen/Qwen3.8-Max': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'Qwen/Qwen3.8-27B': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'Qwen/Qwen3.8-Flash': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'z-ai/glm-5.3-flash': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'zai-org/GLM-5.3': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'MiniMaxAI/MiniMax-M3': { planTier: 'go', planLabel: 'Go / GOAT', dealLabel: '50% off', priceComment: 'GOATプラン利用可' },
  'stepfun/Step-3.7-Flash': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'tencent/hy4-preview': { planTier: 'go', planLabel: 'Go / GOAT', priceComment: 'GOATプラン利用可' },
  'xiaomi/mimo-v2.5-pro': { planTier: 'go', planLabel: 'Go / GOAT', dealLabel: '99% off', priceComment: 'GOATプラン利用可' },
  'nvidia/nemotron-3-ultra-550b-a55b': { planTier: 'go', planLabel: 'Go / GOAT' },
  'thinkingmachines/inkling': { planTier: 'go', planLabel: 'Go / GOAT' },

  // Pro Tier
  'claude-sonnet-5': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'claude-sonnet-4-6': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'claude-haiku-4-5-20251001': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'gpt-5.6-terra': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'gpt-5.5': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'gpt-5.4': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'gpt-5.4-mini': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'gpt-5.3-codex': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'google/gemini-3.6-flash': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },
  'meta/muse-spark-1.1': { planTier: 'pro', planLabel: 'Pro対象', priceComment: 'Pro以上' },

  // Provider / Max Tier
  'claude-opus-5': { planTier: 'provider', planLabel: 'Provider/Max対象', priceComment: 'Provider以上' },
  'claude-opus-4-8': { planTier: 'provider', planLabel: 'Provider/Max対象', priceComment: 'Provider以上' },
  'claude-opus-4-7': { planTier: 'provider', planLabel: 'Provider/Max対象', priceComment: 'Provider以上' },
  'claude-fable-5': { planTier: 'provider', planLabel: 'Provider/Max対象', priceComment: 'Provider以上' },
  'sakana/fugu-ultra': { planTier: 'provider', planLabel: 'Provider/Max対象', priceComment: 'Provider以上' },
}

/** Set of latest-generation model IDs to show by default. */
export const LATEST_MODEL_IDS: ReadonlySet<string> = new Set([
  // GOAT Flagships
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
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}M ctx`
  }
  return `${Math.floor(contextWindow / 1_000)}K ctx`
}

export function buildModelDescription(modelId: string, contextWindow?: number): string {
  const parts: string[] = []
  const pricing = KNOWN_PRICING[modelId]

  if (pricing) {
    let tierText = `[${pricing.planLabel}]`
    if (pricing.dealLabel) {
      tierText += ` (${pricing.dealLabel})`
    }
    parts.push(tierText)
  } else {
    parts.push('[Other]')
  }

  const ctxStr = formatContext(contextWindow)
  if (ctxStr) parts.push(ctxStr)

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
  // --- Flagship GOAT & Go Models ---
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

/** Sort comparator: GOAT/Go models first, then Pro, then Provider, then alphabetically. */
export function compareModels(a: LlmDiscoveredModel, b: LlmDiscoveredModel): number {
  const rank = (id: string): number => {
    const p = KNOWN_PRICING[id]?.planTier
    if (p === 'free') return 0
    if (p === 'go' || p === 'goat') return 1
    if (p === 'pro') return 2
    if (p === 'provider') return 3
    return 4
  }
  const rA = rank(a.id)
  const rB = rank(b.id)
  if (rA !== rB) return rA - rB
  const nameA = a.name ?? a.id
  const nameB = b.name ?? b.id
  return nameA.localeCompare(nameB)
}
