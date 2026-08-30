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
import {
  deepEqualJson,
  installSettingsSection,
  settingsNamespace,
} from '@deepseek-ai/dsh-settings'
import { Config, DEFAULT_API_KEY_ENV, resolveConfig } from './config.ts'
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

const NS_STRING = 'llm-commandcode-goat'
const NS = settingsNamespace(NS_STRING)

export function apply(ctx: Context, config: CommandCodeConfig): void {
  let current: () => CommandCodeConfig = () => config
  let discoveredCatalog: readonly LlmDiscoveredModel[] | undefined

  const getCurrentConfig = () => resolveConfig(current())

  const resolveApiKey = async (): Promise<string> => {
    const activeConfig = getCurrentConfig()
    const ref = credentialRef(activeConfig.apiKeyEnv ?? DEFAULT_API_KEY_ENV)

    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined && hit.value.length > 0) {
        return assertUsableApiKey(hit.value, NS_STRING, ref)
      }
    } else {
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, NS_STRING, ref)
      }
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
      settingsNs: NS_STRING,
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

  ctx.llm.registerModelDiscovery(NS_STRING, async (req: LlmModelDiscoveryRequest) => {
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
    const client = new CommandCodeApiClient()
    const models = await client.listModels({
      baseURL,
      apiKey,
      signal: req.signal,
    })

    if (models.length > 0) {
      discoveredCatalog = models
    }
    return models
  })

  // Warm up dynamic model discovery in background
  ctx.effect(() => {
    void fetchDynamicCatalog().catch(() => {})
  }, 'dsh-commandcode-goat-provider: model discovery warmup')

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })
}
