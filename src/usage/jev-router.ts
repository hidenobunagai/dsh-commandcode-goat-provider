/**
 * jev-router — 既存の quota 軸 failover に「タスク難度」軸を足すモデル選択。
 *
 * 既存の decideFailover が stay（quota 冷却）のときだけ動き、ユーザーが事前選択した
 * tier 付き候補の中から「最安の十分なルート」を Jev 判定（難度/リスク）と残枠で選ぶ。
 * mode は 'off' | 'dry-run'（記録のみ・切替なし） | 'live'（実際に切替）。
 * 判断は確率的なので: 昇格は低 confidence でも許容、安側への降格は高 confidence が要る
 * という非対称ゲート（confidence-gated routing パターン）。
 *
 * @module dsh-commandcode-goat-provider/usage/jev-router
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { sideOf, type FailoverSide } from './failover.ts'

const SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone'
const DEFAULT_JEV_MODEL = 'jev-latest'

/** tier → 想定 capability（0-1。Jev の requiredCap と比較する）。 */
export const TASK_TIER_CAPABILITY = { light: 0.35, normal: 0.7, heavy: 1 } as const

export type JevTier = keyof typeof TASK_TIER_CAPABILITY

export interface JevCandidate {
  provider: string
  model: string
  tier: JevTier
  /** CLI/実機運用（SSH・systemd・デプロイ）に向かない候補（設計・コード生成向き）→ cliOps 判定が高いと外れる。 */
  avoidCliOps?: boolean
  /** 内部情報が学習に使われ得る候補（contributor tier など）→ privateInfo 判定が高いと外れる。 */
  avoidRiskyPrivacy?: boolean
  /** 無料/枠外モデル。quota を気にせず常に冷却扱い（残高次第で無料をトライする用途）。 */
  quotaExempt?: boolean
}

/** 既定の候補梯子: 現行ペア + Free。candidates 空のときのフォールバック。 */
export const DEFAULT_CANDIDATES: JevCandidate[] = [
  { provider: 'opencode-go-v41', model: 'deepseek-flash', tier: 'heavy' },
  { provider: 'commandcode-goat', model: 'deepseek/deepseek-v4.1-flash', tier: 'normal' },
  { provider: 'commandcode-goat', model: 'poolside/laguna-s-2.1-free', tier: 'light' },
]

/** Jev の 1 呼び出しを組み立てる（文字列 body をそのまま fetch へ渡すこと）。 */
export function buildJevRequest(params: { apiKey: string; model?: string }, state: unknown, questions: unknown) {
  return {
    url: 'https://api.typesafe.ai/v1/systemone',
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: DEFAULT_JEV_MODEL, state, questions }),
  }
}

/** Jev 応答の検証。失敗時 throw、成功時 parsed を返す。 */
export function parseJevResponse(status: number, ok: boolean, text: string) {
  if (!ok) throw new Error(`Jev request failed (${status}): ${text.slice(0, 200)}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Jev returned malformed JSON')
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('answers' in parsed) ||
    (parsed as Record<string, unknown>).answers === null ||
    typeof (parsed as Record<string, unknown>).answers !== 'object'
  ) {
    throw new Error('Jev response is missing answers')
  }
  return parsed as { answers: Record<string, unknown> }
}

const noulAnswer = (answers: Record<string, unknown>, name: string): number => {
  const answer = answers[name] as { noul?: unknown } | undefined
  if (!answer || typeof answer.noul !== 'number' || !Number.isFinite(answer.noul)) {
    throw new Error(`Invalid Jev answer for ${name}`)
  }
  return answer.noul
}

const scoreAnswer = (answers: Record<string, unknown>, name: string, topLevel: number): { score: number; confidence: number } => {
  const answer = answers[name] as { score?: unknown; confidence?: unknown } | undefined
  if (!answer || typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
    throw new Error(`Invalid Jev answer for ${name}`)
  }
  const confidence = typeof answer.confidence === 'number' ? answer.confidence : 0
  return { score: Math.min(Math.max(answer.score / topLevel, 0), 1), confidence }
}

/** プロセス環境 → dotenvx 加密ストア（jev-router → jev-compaction）の順で解決。 */
export function resolveApiKey(apiKeyEnv: string): string | null {
  const env = process.env[apiKeyEnv]
  if (env) return env
  for (const dir of ['jev-router', 'jev-compaction']) {
    try {
      const value = execFileSync(
        'dotenvx',
        ['get', apiKeyEnv, '-f', join(process.env.HOME ?? '~', '.config', dir, '.env')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim()
      if (value) return value
    } catch {
      /* 次の候補へ */
    }
  }
  return null
}

const CONTEXT =
  'A coding agent receives one user task. A cheap router must decide which LLM tier answers it. ' +
  'Heavy tier is expensive and reserved for tasks needing careful multi-file reasoning, nontrivial design, ' +
  'or careful diagnosis. Light tier handles chat, trivia, and trivial edits. Normal tier handles routine coding work.'

/**
 * 最新の user メッセージ本文（先頭 headChars 文字）。読めなければ null。
 * 判定コスト節約のためプロンプト頭部だけ見る。
 */
export function latestUserPrompt(session: unknown, headChars: number): string | null {
  try {
    const s = session as {
      surface?: { nodes: Iterable<number> }
      eventAt?: (seq: number) => unknown
      deriveEventMessage?: (event: unknown) => { role?: string; content?: { type?: string; text?: string }[] } | null
    } | null
    if (!s?.surface?.nodes || !s.eventAt || !s.deriveEventMessage) return null
    for (const seq of [...s.surface.nodes].reverse()) {
      const event = s.eventAt(seq)
      if (!event) continue
      const message = s.deriveEventMessage(event)
      if (!message || message.role !== 'user') continue
      const text = (message.content ?? [])
        .map((block) => (block?.type === 'text' ? (block.text ?? '') : ''))
        .join('')
        .trim()
      return text ? text.slice(0, headChars) : null
    }
    return null
  } catch {
    return null
  }
}

/** 難度とリスクから必要 capability を算出（リスクは 0.7 未満に閉じる: 重い判定は難度側の役目）。 */
export function requiredCapability(difficulty: number, risk: number): number {
  return Math.max(difficulty, Math.min(risk, 0.7))
}

export interface RouterOutcome {
  action: 'stay' | 'switch'
  to?: { provider: string; model: string; tier: JevTier }
  reason: string
}

/**
 * 候補梯子からの選択（純関数）。
 * - capability が requiredCap 未満の候補は対象外
 * - 現在ルートが対象内で quota 冷却なら stay（チャーン防止）
 * - 対象内で「必要能力との余りが最小（= 最安の十分）」×quota 冷却の候補へ
 * - 全候補が熱い / 不足なら stay（quota 軸の既存 failover が最下層として引き継ぐ）
 */
export function pickRoute(input: {
  candidates: JevCandidate[]
  quotaPct: Partial<Record<FailoverSide, number>>
  threshold: number
  requiredCap: number
  /** Jev の特徴判定。cliOps ≥0.6 で avoidCliOps 候補、privateInfo ≥0.6 で avoidRiskyPrivacy 候補を除外する。 */
  verdict?: { cliOps?: number; privateInfo?: number }
  current: { provider: string; model: string }
  freeModel: string
}): RouterOutcome {
  const { candidates, quotaPct, threshold, requiredCap, verdict, current, freeModel } = input
  /** 候補の quota 側。free は goat 枠で計上、正規ペア外はプロバイダ名で推定する。 */
  const sideFor = (c: JevCandidate): FailoverSide => {
    const matched = sideOf(c.provider, c.model, freeModel)
    if (matched === 'free') return 'goat'
    if (matched) return matched
    return c.provider.startsWith('opencode') ? 'go' : 'goat'
  }
  /** 無料/枠外モデルは常に冷却扱い（安くて十分なら積極的に使う）。 */
  const pctOf = (c: JevCandidate): number =>
    c.quotaExempt ? 0 : (quotaPct[sideFor(c)] ?? Number.POSITIVE_INFINITY)
  const same = (a: { provider: string; model: string }, b: { provider: string; model: string }): boolean =>
    a.provider === b.provider && a.model === b.model
  let eligible = candidates.filter((c) => TASK_TIER_CAPABILITY[c.tier] >= requiredCap)
  if ((verdict?.cliOps ?? 0) >= 0.6) eligible = eligible.filter((c) => !c.avoidCliOps)
  if ((verdict?.privateInfo ?? 0) >= 0.6) eligible = eligible.filter((c) => !c.avoidRiskyPrivacy)
  if (eligible.length === 0) return { action: 'stay', reason: 'no_sufficient_candidate' }
  const cool = eligible
    .filter((c) => pctOf(c) < threshold)
    .sort(
      (a, b) =>
        TASK_TIER_CAPABILITY[a.tier] - requiredCap - (TASK_TIER_CAPABILITY[b.tier] - requiredCap) ||
        pctOf(a) - pctOf(b),
    )
  const best = cool[0]
  if (!best) return { action: 'stay', reason: 'all_candidates_hot' }
  if (same(best, current)) return { action: 'stay', reason: 'current_adequate' }
  return {
    action: 'switch',
    to: { provider: best.provider, model: best.model, tier: best.tier },
    reason: `requiredCap=${requiredCap.toFixed(2)} tier=${best.tier} side=${sideFor(best)} usage=${Math.round(pctOf(best))}%<${threshold}%`,
  }
}

/**
 * 直近 1 タスクを Jev で分類する。
 * difficulty は 3 段階 Score（light/normal/heavy の situation を level 化）で 0-1 正規化、
 * risk は 2 値 noul。失敗時は null（fail-open: 何もしない）。
 */
export async function classifyTask(
  apiKey: string,
  promptHead: string,
): Promise<{ difficulty: number; risk: number; cliOps: number; privateInfo: number; confidence: number } | null> {
  try {
    const req = buildJevRequest(
      { apiKey },
      {
        context: CONTEXT,
        task: promptHead,
      },
      {
        difficulty: {
          type: 'score',
          instructions:
            'What tier of model capability does answering this task WELL require? Judge the whole task, not a single sentence.',
          criteria: [
            'Chat, questions, trivia, small well-trodden edits, or mechanical transformations; a lightweight model is sufficient.',
            'Routine coding work: single-file changes, standard features, straightforward debugging, common refactors, clear small tasks.',
            'Needs careful multi-file reasoning, nontrivial design, tricky diagnosis, or high-stakes accuracy; a weaker model would plausibly produce wrong output.',
          ],
        },
        risk: {
          type: 'noul',
          instructions:
            'The task involves destructive, irreversible, or security-sensitive operations (deletion, credential/secret handling, production data, public exposure).',
          criteria: {
            true: 'At least a destructive or security-sensitive operation is in scope.',
            false: 'Nothing destructive or security-sensitive is in scope.',
          },
        },
        cliOps: {
          type: 'noul',
          instructions:
            'The task is primarily CLI/ops work: terminal commands, SSH, systemd/services, environment or infrastructure configuration, deployment, log triage — rather than writing substantial new code.',
          criteria: {
            true: 'Most of the work is operations on a real machine (shell, services, config files, deployments).',
            false: 'The work is mainly code design, implementation, refactoring, or document/chat work.',
          },
        },
        privateInfo: {
          type: 'noul',
          instructions:
            'The task exposes internal/private information that the user would not want used for model training: local IPs, SSH host details, internal domains, file system layout of private machines, credentials.',
          criteria: {
            true: 'Internal/private details (private IPs, host names, SSH details, internal services) are part of the task.',
            false: 'The task involves no private/internal information.',
          },
        },
      },
    )
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
    const parsed = parseJevResponse(res.status, res.ok, await res.text()) as { answers: Record<string, unknown> }
    const difficulty = scoreAnswer(parsed.answers, 'difficulty', 2)
    return {
      difficulty: difficulty.score,
      risk: noulAnswer(parsed.answers, 'risk'),
      cliOps: noulAnswer(parsed.answers, 'cliOps'),
      privateInfo: noulAnswer(parsed.answers, 'privateInfo'),
      confidence: difficulty.confidence,
    }
  } catch {
    return null
  }
}

/** 判定ログ（dry-run 観測の正本）。既定 ~/.dsh/jev-router.log */
export function appendRouterLog(path: string, line: string): void {
  try {
    appendFileSync(path, `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* ログに出せなくても本体の動きは止めない */
  }
}
