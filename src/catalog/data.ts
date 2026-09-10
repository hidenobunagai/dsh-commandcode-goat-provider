import type { ReasoningEffortId as ReasoningEffortIdType } from '@deepseek-ai/dsh-llm'
import type { CommandCodeStaticModel, Protocol } from '../types.ts'

// ponytail: local identity keeps client bundle free of @deepseek-ai/dsh-llm runtime require
const ReasoningEffortId = (id: string): ReasoningEffortIdType => id as ReasoningEffortIdType

// ── Single source of truth for every known model ──────────────────────
// Each entry declares everything about a model once. All derived maps
// (KNOWN_EFFORTS, KNOWN_IMAGE_MODELS, KNOWN_STATS, STATIC_MODELS, etc.)
// are computed from this array — never hand-duplicated.

export interface CatalogEntry {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  protocol: Protocol
  modalities: readonly ('text' | 'image')[]
  // Reasoning
  efforts?: readonly string[]
  defaultEffort?: string
  supportsTools?: boolean
  // Pricing / discovery
  tier: 'free' | 'go' | 'goat' | 'pro' | 'provider'
  label: string
  intelligence?: number
  inputPrice?: number | 'free'
  outputPrice?: number | 'free'
  discount?: string
  // Whether this model is a "latest" pick shown by default
  latest?: boolean
}

export const CATALOG: readonly CatalogEntry[] = [
  // ── GO / GOAT ─────────────────────────────────────────────────────────
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextWindow: 1050000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', intelligence: 52.3, inputPrice: 0.20, outputPrice: 1.20, latest: true },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: 1050000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium', tier: 'goat', label: 'GOAT', intelligence: 60.9, inputPrice: 5.00, outputPrice: 30.00, latest: true },
  { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'goat', label: 'GOAT', intelligence: 56.0, inputPrice: 0.75, outputPrice: 3.75, discount: '-50%', latest: true },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'goat', label: 'GOAT', inputPrice: 0.75, outputPrice: 3.75, latest: true },
  { id: 'xai/grok-4.6', name: 'Grok 4.6', contextWindow: 500000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium', tier: 'goat', label: 'GOAT', intelligence: 60.9, inputPrice: 2.00, outputPrice: 6.00, latest: true },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro (latest)', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], efforts: ['high', 'max'], defaultEffort: 'high', tier: 'go', label: 'Go/GOAT', intelligence: 53.2, inputPrice: 0.66, outputPrice: 1.98, latest: true },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash (latest)', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], efforts: ['high', 'max'], defaultEffort: 'high', tier: 'go', label: 'Go/GOAT', intelligence: 52.0, inputPrice: 0.22, outputPrice: 0.66, latest: true },
  { id: 'deepseek/deepseek-v4-flash-fast', name: 'DeepSeek V4 Flash Fast', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], efforts: ['high', 'max'], defaultEffort: 'high', tier: 'go', label: 'Go/GOAT', inputPrice: 0.28, outputPrice: 0.56, latest: true },
  { id: 'moonshotai/Kimi-K3', name: 'Kimi K3', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 59.7, inputPrice: 3.00, outputPrice: 15.00, latest: true },
  { id: 'moonshotai/Kimi-K2.7-Code', name: 'Kimi K2.7 Code', contextWindow: 256000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 43.0, inputPrice: 0.95, outputPrice: 4.00, latest: true },
  { id: 'Qwen/Qwen3.8-Max', name: 'Qwen 3.8 Max', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'xhigh'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', intelligence: 58.1, inputPrice: 2.00, outputPrice: 6.00, latest: true },
  { id: 'Qwen/Qwen3.8-Max-0902', name: 'Qwen 3.8 Max 0902', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'xhigh'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', inputPrice: 2.00, outputPrice: 6.00, latest: true },
  { id: 'Qwen/Qwen3.8-Flash', name: 'Qwen 3.8 Flash', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'xhigh'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', inputPrice: 0.16, outputPrice: 0.47, latest: true },
  { id: 'Qwen/Qwen3.8-27B', name: 'Qwen 3.8 27B', contextWindow: 262144, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'xhigh'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', intelligence: 52.0, inputPrice: 0.40, outputPrice: 3.00, latest: true },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM-5.3 Flash', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'high', 'max'], defaultEffort: 'high', tier: 'go', label: 'Go/GOAT', intelligence: 57.5, inputPrice: 0.15, outputPrice: 0.50, latest: true },
  { id: 'zai-org/GLM-5.3', name: 'GLM-5.3', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], efforts: ['low', 'high', 'max'], defaultEffort: 'high', tier: 'go', label: 'Go/GOAT', intelligence: 59.5, inputPrice: 1.40, outputPrice: 4.40, latest: true },
  { id: 'MiniMaxAI/MiniMax-M3', name: 'MiniMax M3', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 45.4, inputPrice: 0.30, outputPrice: 1.20, discount: '-50%', latest: true },
  { id: 'xai/grok-4.5', name: 'Grok 4.5', contextWindow: 500000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', intelligence: 55.8, inputPrice: 2.00, outputPrice: 6.00, latest: true },
  { id: 'meta/muse-spark-1.3', name: 'Muse Spark 1.3', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'goat', label: 'GOAT', intelligence: 56.8, inputPrice: 1.25, outputPrice: 4.25, latest: true },
  { id: 'meta/muse-spark-1.3-contributor', name: 'Muse Spark 1.3 Contributor', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 56.8, inputPrice: 0.10, outputPrice: 0.20, latest: true },
  { id: 'meta/muse-spark-1.2', name: 'Muse Spark 1.2', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'goat', label: 'GOAT', intelligence: 56.8, inputPrice: 1.25, outputPrice: 4.25 },
  { id: 'meta/muse-spark-1.2-contributor', name: 'Muse Spark 1.2 Contributor', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 56.8, inputPrice: 0.10, outputPrice: 0.20 },
  { id: 'stepfun/Step-3.7-Flash', name: 'Step 3.7 Flash', contextWindow: 256000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 30.9, inputPrice: 0.20, outputPrice: 1.15, latest: true },
  { id: 'tencent/hy4-preview', name: 'Tencent Hy4 Preview', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', inputPrice: 0.834, outputPrice: 2.501, latest: true },
  { id: 'xiaomi/mimo-v2.5-pro', name: 'MiMo V2.5 Pro', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', intelligence: 42.9, inputPrice: 0.435, outputPrice: 0.87, discount: '-99%', latest: true },

  // ── Extra known models (pricing / capabilities without "latest" flag) ──
  { id: 'Qwen/Qwen3.7-Flash', name: 'Qwen 3.7 Flash', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', inputPrice: 0.03, outputPrice: 0.13 },
  { id: 'stepfun/Step-3.5-Flash', name: 'Step 3.5 Flash', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 26.5, inputPrice: 0.10, outputPrice: 0.30 },
  { id: 'xiaomi/mimo-v2.5', name: 'MiMo V2.5', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 38.0, inputPrice: 0.14, outputPrice: 0.28, discount: '-98%' },
  { id: 'tencent/hy3-paid', name: 'Tencent Hy3', contextWindow: 262144, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', intelligence: 42.2, inputPrice: 0.14, outputPrice: 0.58 },
  { id: 'Qwen/Qwen3.7-Plus', name: 'Qwen 3.7 Plus', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 39.4, inputPrice: 0.40, outputPrice: 1.60 },
  { id: 'Qwen/Qwen3.6-Plus', name: 'Qwen 3.6 Plus', contextWindow: 200000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 40.5, inputPrice: 0.50, outputPrice: 3.00 },
  { id: 'moonshotai/Kimi-K2.5', name: 'Kimi K2.5', contextWindow: 256000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 36.0, inputPrice: 0.60, outputPrice: 3.00 },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', intelligence: 38.3, inputPrice: 0.60, outputPrice: 2.40 },
  { id: 'zai-org/GLM-5', name: 'GLM-5', contextWindow: 200000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', intelligence: 40.6, inputPrice: 1.00, outputPrice: 3.20 },
  { id: 'thinkingmachines/inkling', name: 'Inkling', contextWindow: 256000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 42.3, inputPrice: 1.00, outputPrice: 4.05 },
  { id: 'Qwen/Qwen3.6-Max-Preview', name: 'Qwen 3.6 Max Preview', contextWindow: 200000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', intelligence: 41.1, inputPrice: 1.30, outputPrice: 7.80 },
  { id: 'zai-org/GLM-5.1', name: 'GLM-5.1', contextWindow: 200000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', intelligence: 41.0, inputPrice: 1.40, outputPrice: 4.40 },
  { id: 'zai-org/GLM-5.2', name: 'GLM-5.2', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], efforts: ['high', 'max'], defaultEffort: 'high', tier: 'go', label: 'Go/GOAT', intelligence: 52.6, inputPrice: 1.40, outputPrice: 4.40 },
  { id: 'moonshotai/Kimi-K2.6', name: 'Kimi K2.6', contextWindow: 256000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 45.1, inputPrice: 0.95, outputPrice: 4.00 },
  { id: 'moonshotai/Kimi-K2.7-Code-Highspeed', name: 'Kimi K2.7 Code HighSpeed', contextWindow: 262000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', inputPrice: 1.90, outputPrice: 8.00 },
  { id: 'Qwen/Qwen3.7-Max', name: 'Qwen 3.7 Max', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', intelligence: 46.7, inputPrice: 2.50, outputPrice: 7.50 },
  { id: 'zai-org/GLM-5.2-Fast', name: 'GLM-5.2 Fast', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'go', label: 'Go/GOAT', inputPrice: 3.00, outputPrice: 10.25 },
  { id: 'thinkingmachines/inkling-small', name: 'Inkling Small', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 41.2, inputPrice: 0.50, outputPrice: 1.20 },
  { id: 'MiniMaxAI/MiniMax-M2.5', name: 'MiniMax M2.5', contextWindow: 200000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 34.5, inputPrice: 0.30, outputPrice: 1.20 },
  { id: 'MiniMaxAI/MiniMax-M2.7', name: 'MiniMax M2.7', contextWindow: 200000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'go', label: 'Go/GOAT', intelligence: 38.9, inputPrice: 0.30, outputPrice: 1.20 },
  { id: 'deepseek/deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision (exp)', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['high', 'max'], defaultEffort: 'high', tier: 'go', label: 'Go/GOAT', inputPrice: 0.22, outputPrice: 0.66 },

  // ── Free tier extras ───────────────────────────────────────────────
  { id: 'meituan/LongCat-2.0:free', name: 'LongCat 2.0', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'free', label: 'Free', inputPrice: 'free', outputPrice: 'free', latest: true },
  { id: 'inclusionai/ling-3.0-flash-sante:free', name: 'Ling 3.0 Flash Sante', contextWindow: 262144, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'free', label: 'Free', inputPrice: 'free', outputPrice: 'free', latest: true },
  { id: 'poolside/laguna-s-2.1-free', name: 'Laguna S 2.1', contextWindow: 256000, maxTokens: 65536, protocol: 'openai', modalities: ['text'], tier: 'free', label: 'Free', inputPrice: 'free', outputPrice: 'free' },

  // ── Legacy models still served by /provider/v1/models (API returns no pricing) ──
  // Pricing backfilled from last known Command Code catalog; mark as legacy tier.
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', contextWindow: 1000000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium', tier: 'pro', label: 'Pro', inputPrice: 15.00, outputPrice: 75.00, latest: true },
  { id: 'claude-fable-5', name: 'Claude Fable 5', contextWindow: 1000000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium', tier: 'pro', label: 'Pro', intelligence: 64.0, inputPrice: 15.00, outputPrice: 75.00 },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', contextWindow: 1000000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high', tier: 'provider', label: 'Provider', intelligence: 63.0, inputPrice: 15.00, outputPrice: 75.00 },
  { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', inputPrice: 0.50, outputPrice: 1.50 },
  { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', inputPrice: 0.50, outputPrice: 1.50 },
  { id: 'google/gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', inputPrice: 0.50, outputPrice: 1.50 },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', contextWindow: 400000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', intelligence: 56.0, inputPrice: 2.00, outputPrice: 8.00 },
  { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: 400000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', intelligence: 57.0, inputPrice: 2.50, outputPrice: 10.00 },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextWindow: 400000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'go', label: 'Go/GOAT', intelligence: 48.0, inputPrice: 1.00, outputPrice: 5.00 },
  { id: 'meta/muse-spark-1.1', name: 'Muse Spark 1.1', contextWindow: 1048576, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], tier: 'goat', label: 'GOAT', intelligence: 55.0, inputPrice: 1.25, outputPrice: 4.25 },

  // ── Pro / Provider ────────────────────────────────────────────────
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', contextWindow: 1000000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium', tier: 'pro', label: 'Pro', intelligence: 62.5, inputPrice: 3.00, outputPrice: 15.00, latest: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 1000000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium', tier: 'pro', label: 'Pro', intelligence: 60.0, inputPrice: 3.00, outputPrice: 15.00, latest: true },
  { id: 'claude-opus-5', name: 'Claude Opus 5', contextWindow: 1000000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high', tier: 'provider', label: 'Provider', intelligence: 65.0, inputPrice: 15.00, outputPrice: 75.00, latest: true },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', contextWindow: 1000000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high', tier: 'provider', label: 'Provider', intelligence: 63.5, inputPrice: 15.00, outputPrice: 75.00, latest: true },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, maxTokens: 65536, protocol: 'anthropic', modalities: ['text', 'image'], tier: 'pro', label: 'Pro', intelligence: 48.0, inputPrice: 1.00, outputPrice: 5.00, latest: true },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', contextWindow: 1050000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium', tier: 'pro', label: 'Pro', intelligence: 61.2, inputPrice: 3.00, outputPrice: 15.00, latest: true },
  { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 400000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium', tier: 'pro', label: 'Pro', intelligence: 58.0, inputPrice: 2.50, outputPrice: 10.00, latest: true },
  { id: 'google/gemini-3.6-flash', name: 'Gemini 3.6 Flash', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', tier: 'pro', label: 'Pro', intelligence: 54.0, inputPrice: 0.50, outputPrice: 1.50, latest: true },
  { id: 'sakana/fugu-ultra', name: 'Fugu Ultra', contextWindow: 1000000, maxTokens: 65536, protocol: 'openai', modalities: ['text', 'image'], efforts: ['high', 'xhigh'], defaultEffort: 'high', tier: 'provider', label: 'Provider', intelligence: 58.0, inputPrice: 5.00, outputPrice: 20.00, latest: true },
] as const

// ── Derived helpers ─────────────────────────────────────────────────

export function toStaticModel(entry: CatalogEntry): CommandCodeStaticModel {
  return {
    id: entry.id,
    name: entry.name,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
    protocol: entry.protocol,
    inputModalities: [...entry.modalities] as CommandCodeStaticModel['inputModalities'],
    ...(entry.efforts ? { reasoningEfforts: entry.efforts.map((e) => ReasoningEffortId(e)) } : {}),
    ...(entry.defaultEffort ? { defaultEffort: ReasoningEffortId(entry.defaultEffort) } : {}),
    supportsTools: entry.supportsTools ?? true,
  }
}
