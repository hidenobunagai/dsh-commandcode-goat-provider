import { Buffer } from 'node:buffer'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ImageAttachmentRef,
} from '@deepseek-ai/dsh-attachment'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import {
  assertUsableApiKey,
  LlmError,
} from '@deepseek-ai/dsh-llm'
import type {
  LlmDiscoveredModel,
  LlmModelDiscoveryRequest,
} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { Config, DEFAULT_API_KEY_ENV, resolveConfig } from './config.ts'

const deepEqualJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
import type { CommandCodeConfig, ResolvedConnection, ResolveImage } from './types.ts'
import {
  CommandCodeAdapter,
  PROVIDER_DISPLAY_NAME,
  PROVIDER_ROUTE,
} from './adapter.ts'
import { CommandCodeApiClient } from './api/client.ts'

export const name = 'llm-commandcode-goat'
export const inject = ['llm']
export { Config }

const NS = 'llm-commandcode-goat'

export function apply(ctx: Context, config: CommandCodeConfig): void {
  let current: () => CommandCodeConfig = () => config
  let discoveredCatalog: readonly LlmDiscoveredModel[] | undefined

  const getCurrentConfig = () => resolveConfig(current())

  const resolveApiKey = async (): Promise<string> => {
    const activeConfig = getCurrentConfig()
    if (activeConfig.apiKey && activeConfig.apiKey.trim().length > 0) {
      return activeConfig.apiKey.trim()
    }
    const envName = activeConfig.apiKeyEnv ?? DEFAULT_API_KEY_ENV
    const ref = credentialRef(envName)

    // Try managed credential store first; fall back to ambient launch
    // environment so `COMMANDCODE_API_KEY=xxx dsh` keeps working even when
    // the credentials service is present but the key is not stored there.
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      try {
        const hit = await credentials.resolve(ref)
        if (hit !== undefined && hit.value.length > 0) {
          return assertUsableApiKey(hit.value, NS, ref)
        }
      } catch {
        // credential backend unavailable — try ambient next
      }
    }

    try {
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, NS, ref)
      }
    } catch {}

    const directEnv = process.env[envName] ?? process.env.COMMANDCODE_API_KEY
    if (directEnv && directEnv.trim().length > 0) {
      return assertUsableApiKey(directEnv.trim(), NS, ref)
    }

    throw new LlmError(
      `No API key configured for provider "${PROVIDER_ROUTE}". ` +
      `Configure it in Settings → Plugins → Configurable, or export ${ref} in your environment.`,
      'MISSING_CREDENTIAL',
    )
  }

  const resolveConnection = async (): Promise<ResolvedConnection> => {
    const activeConfig = getCurrentConfig()
    const apiKey = await resolveApiKey()
    return {
      baseURL: activeConfig.baseURL,
      apiKey,
      enableZdr: activeConfig.enableZdr,
      requestTimeoutMs: activeConfig.requestTimeoutMs,
      streamIdleTimeoutMs: activeConfig.streamIdleTimeoutMs,
    }
  }

  // `attachments` is intentionally NOT in `inject` — image input is optional.
  // Requiring it would keep the whole plugin pending in hosts without that
  // service (e.g. unit tests). The runtime check below is the contract.
  const resolveImage: ResolveImage = async (ref: ImageAttachmentRef, signal?: AbortSignal) => {
    const attachments = ctx.get('attachments')
    if (!attachments) {
      throw new LlmError('Attachment store is not available', 'INVALID_REQUEST')
    }
    const stored = await attachments.readImage(ref, signal)
    const base64 = Buffer.from(stored.data).toString('base64')
    return {
      mediaType: stored.ref.mediaType,
      base64,
    }
  }

  const fetchDynamicCatalog = async (signal?: AbortSignal): Promise<readonly LlmDiscoveredModel[]> => {
    const activeConfig = getCurrentConfig()
    let apiKey: string | undefined
    try {
      apiKey = await resolveApiKey()
    } catch {
      // discovery allows keyless interrogation or fallback
    }

    const client = new CommandCodeApiClient()
    const models = await client.listModels({
      baseURL: activeConfig.baseURL,
      apiKey,
      signal,
      requestTimeoutMs: activeConfig.requestTimeoutMs,
    })

    if (models.length > 0) {
      discoveredCatalog = models
    }
    return models
  }

  const adapter = new CommandCodeAdapter({
    connection: resolveConnection,
    catalog: () => discoveredCatalog,
    config: getCurrentConfig,
    discoverModels: fetchDynamicCatalog,
    resolveImage,
  })

  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER_ROUTE,
      displayName: PROVIDER_DISPLAY_NAME,
      settingsNs: NS,
      settingsPath: [],
    },
  ])

  const registration = ctx.llm.registerAdapter([PROVIDER_ROUTE], adapter)
  let registeredPolicy = getCurrentConfig().retryPolicy

  const ensureRegistrationFacts = (): void => {
    const policy = getCurrentConfig().retryPolicy
    if (deepEqualJson(policy, registeredPolicy)) return
    registration.replace([PROVIDER_ROUTE])
    registeredPolicy = policy
  }

  ctx.llm.registerModelDiscovery(NS, async (req: LlmModelDiscoveryRequest, signal?: AbortSignal) => {
    const activeConfig = getCurrentConfig()
    let apiKey: string | undefined = req.apiKey
    if (!apiKey) {
      try {
        apiKey = await resolveApiKey()
      } catch {
        // discovery allows keyless interrogation if possible
      }
    }

    const baseURL = req.baseURL ?? activeConfig.baseURL
    // Prefer the carrier-provided signal (Remote path), fall back to the
    // legacy request-embedded one for backward compat with older hosts.
    const effectiveSignal = signal ?? (req as any).signal
    const client = new CommandCodeApiClient()
    const models = await client.listModels({
      baseURL,
      apiKey,
      signal: effectiveSignal,
      requestTimeoutMs: activeConfig.requestTimeoutMs,
    })

    if (models.length > 0) {
      discoveredCatalog = models
    }
    return models
  })

  // Warm up dynamic model discovery in background
  ctx.effect(() => {
    const abortController = new AbortController()
    void fetchDynamicCatalog(abortController.signal).catch(() => {})
    return () => abortController.abort()
  }, 'dsh-commandcode-goat-provider: model discovery warmup')

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NS, Config, config, {
      setSource: (source) => {
        current = source
      },
      onChange: ensureRegistrationFacts,
    })
  })
}
