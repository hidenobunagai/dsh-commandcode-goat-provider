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

export const KNOWN_PLANS: Readonly<Record<string, string>> = {
  // Go (40)
  'MiniMaxAI/MiniMax-M2.5': 'go',
  'MiniMaxAI/MiniMax-M2.7': 'go',
  'MiniMaxAI/MiniMax-M3': 'go',
  'Qwen/Qwen3.6-Max-Preview': 'go',
  'Qwen/Qwen3.6-Plus': 'go',
  'Qwen/Qwen3.7-Flash': 'go',
  'Qwen/Qwen3.7-Max': 'go',
  'Qwen/Qwen3.7-Plus': 'go',
  'Qwen/Qwen3.8-27B': 'go',
  'Qwen/Qwen3.8-Flash': 'go',
  'Qwen/Qwen3.8-Max': 'go',
  'deepseek/deepseek-v4-flash': 'go',
  'deepseek/deepseek-v4-flash-vision-exp': 'go',
  'deepseek/deepseek-v4-pro': 'go',
  'gpt-5.6-luna': 'go',
  'meta/muse-spark-1.2-contributor': 'go',
  'minimax/minimax-m2.7-free': 'go',
  'minimax/minimax-m3-free': 'go',
  'moonshotai/Kimi-K2.5': 'go',
  'moonshotai/Kimi-K2.6': 'go',
  'moonshotai/Kimi-K2.7-Code': 'go',
  'moonshotai/Kimi-K2.7-Code-Highspeed': 'go',
  'moonshotai/Kimi-K3': 'go',
  'nvidia/nemotron-3-ultra-550b-a55b': 'go',
  'poolside/laguna-s-2.1-free': 'go',
  'stepfun/Step-3.5-Flash': 'go',
  'stepfun/Step-3.7-Flash': 'go',
  'tencent/hy3-paid': 'go',
  'tencent/hy4-preview': 'go',
  'thinkingmachines/inkling': 'go',
  'thinkingmachines/inkling-small': 'go',
  'xai/grok-4.5': 'go',
  'xiaomi/mimo-v2.5': 'go',
  'xiaomi/mimo-v2.5-pro': 'go',
  'z-ai/glm-5.3-flash': 'go',
  'zai-org/GLM-5': 'go',
  'zai-org/GLM-5.1': 'go',
  'zai-org/GLM-5.2': 'go',
  'zai-org/GLM-5.2-Fast': 'go',
  'zai-org/GLM-5.3': 'go',
  // GOAT (4 more)
  'google/gemini-3.7-flash': 'goat',
  'gpt-5.6-sol': 'goat',
  'meta/muse-spark-1.2': 'goat',
  'xai/grok-4.6': 'goat',
  // Pro (13 more)
  'claude-haiku-4-5-20251001': 'pro',
  'claude-sonnet-4-6': 'pro',
  'claude-sonnet-5': 'pro',
  'google/gemini-3.1-flash-lite': 'pro',
  'google/gemini-3.5-flash': 'pro',
  'google/gemini-3.5-flash-lite': 'pro',
  'google/gemini-3.6-flash': 'pro',
  'gpt-5.3-codex': 'pro',
  'gpt-5.4': 'pro',
  'gpt-5.4-mini': 'pro',
  'gpt-5.5': 'pro',
  'gpt-5.6-terra': 'pro',
  'meta/muse-spark-1.1': 'pro',
  // Provider / Max (5)
  'claude-fable-5': 'provider',
  'claude-opus-4-7': 'provider',
  'claude-opus-4-8': 'provider',
  'claude-opus-5': 'provider',
  'sakana/fugu-ultra': 'provider',
}

export const STATIC_MODELS: CommandCodeStaticModel[] = [
  // --- Flagship GOAT & Go Models ---
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    description: 'Command Code GPT-5.6 Luna (1M context, reasoning, vision)',
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
    description: 'Command Code GPT-5.6 Sol (1M context, reasoning, vision)',
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
    description: 'Google Gemini 3.7 Flash (1M context, vision, reasoning)',
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
    description: 'xAI Grok 4.6 (500K context, reasoning)',
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
    description: 'DeepSeek V4 Pro (1M context, reasoning)',
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
    description: 'DeepSeek V4 Flash (1M context, reasoning)',
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
    description: 'Moonshot AI Kimi K3 (1M context, thinking, vision)',
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'moonshotai/Kimi-K2.7-Code',
    name: 'Kimi K2.7 Code',
    description: 'Moonshot AI Kimi K2.7 Code (256K context, vision)',
    contextWindow: 256000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'Qwen/Qwen3.8-Max',
    name: 'Qwen 3.8 Max',
    description: 'Alibaba Qwen 3.8 Max (1M context, reasoning, vision)',
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
    description: 'Alibaba Qwen 3.8 Flash (1M context, reasoning, vision)',
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
    description: 'Zhipu GLM-5.3 Flash (1M context, reasoning, vision)',
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
    description: 'Zhipu GLM-5.3 (1M context, reasoning)',
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
    description: 'MiniMax M3 (1M context, thinking, vision)',
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'xai/grok-4.5',
    name: 'Grok 4.5',
    description: 'xAI Grok 4.5 (500K context, vision, reasoning)',
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
    description: 'Meta Muse Spark 1.2 (1M context, thinking, vision)',
    contextWindow: 1048576,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'stepfun/Step-3.7-Flash',
    name: 'Step 3.7 Flash',
    description: 'StepFun Step 3.7 Flash (256K context, vision)',
    contextWindow: 256000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'tencent/hy4-preview',
    name: 'Tencent Hy4 Preview',
    description: 'Tencent Hy4 Preview (1M context, thinking)',
    contextWindow: 1048576,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    supportsTools: true,
  },
  {
    id: 'xiaomi/mimo-v2.5-pro',
    name: 'MiMo V2.5 Pro',
    description: 'Xiaomi MiMo V2.5 Pro (1M context)',
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
    description: 'Anthropic Claude Sonnet 5 (1M context, reasoning, vision)',
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
    description: 'Anthropic Claude Sonnet 4.6 (1M context, reasoning, vision)',
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
    description: 'Anthropic Claude Opus 5 (1M context, reasoning, vision)',
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
    description: 'Anthropic Claude Opus 4.8 (1M context, reasoning, vision)',
    contextWindow: 1000000,
    maxTokens: 65536,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh'), ReasoningEffortId('max')],
    defaultEffort: ReasoningEffortId('high'),
    supportsTools: true,
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    description: 'Command Code GPT-5.6 Terra (1M context, reasoning, vision)',
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
    description: 'Command Code GPT-5.5 (400K context, reasoning, vision)',
    contextWindow: 400000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    description: 'Command Code GPT-5.4 (400K context, reasoning, vision)',
    contextWindow: 400000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    description: 'Command Code GPT-5.3 Codex (400K context, reasoning, vision)',
    contextWindow: 400000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high'), ReasoningEffortId('xhigh')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'sakana/fugu-ultra',
    name: 'Fugu Ultra',
    description: 'Sakana AI Fugu Ultra (1M context, reasoning, vision)',
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
  const description = staticEntry?.description
  const hasImage = KNOWN_IMAGE_MODELS.has(modelId) || (staticEntry?.inputModalities?.includes('image') ?? false)
  const inputModalities: readonly ModelModality[] = hasImage ? ['text', 'image'] : ['text']
  const contextWindow = discovered?.contextWindow ?? staticEntry?.contextWindow ?? config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW
  const defaultMaxTokens = discovered?.maxTokens ?? staticEntry?.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS

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
  return {
    provider,
    id: model.id,
    name: model.name ?? staticEntry?.name ?? model.id,
    description: staticEntry?.description,
    inputModalities: hasImage ? ['text', 'image'] : ['text'],
  }
}
