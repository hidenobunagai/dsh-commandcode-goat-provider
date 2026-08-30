# Command Code GOAT DSH Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, from-scratch DeepSeek Harness external bundle that exposes Command Code GOAT through the DSH Web profile.

**Architecture:** A single external package registers the `commandcode-goat` provider route on `ctx.llm`, resolves one API key through the DSH credential seam, and calls the official Command Code Provider API directly. The same package declares a Web client artifact that contributes a settings card through `settings.plugin.item`; the DSH Models page receives the provider catalog but does not own the custom editor. The DSH core remains unchanged.

**Tech Stack:** Bun 1.4.0, TypeScript strict ESM, Node 22 Web APIs, `tsdown`, Vitest, `eventsource-parser`, DeepSeek Harness `0.1.1-rc.2` peer packages, and React JSX for the Web settings card.

**Spec:** `docs/superpowers/specs/2026-08-30-commandcode-goat-dsh-provider-design.md`

## Global Constraints

- Project path is `/home/pi/projects/commandcode-goat-dsh-provider`.
- Existing `/home/pi/projects/commandcode-goat-provider` is a separate VS Code project and must not change.
- The package name is `dsh-commandcode-goat-provider` and the provider route is `commandcode-goat`.
- Only the official Command Code Provider API is used: `/provider/v1/models`, `/provider/v1/chat/completions`, and `/provider/v1/messages`.
- The default API base is `https://api.commandcode.ai`.
- Authentication uses one DSH credential reference, defaulting to `COMMANDCODE_API_KEY`; no custom key file is read.
- GOAT entitlement is server-side; the request never claims a plan name.
- Usage and balance endpoints, browser login, multi-account rotation, local proxies, and DSH core edits are excluded.
- OpenAI and Anthropic streams must emit DSH `usage` before `finish` and nothing after `finish`.
- Tool arguments remain raw JSON strings through conversion and streaming.
- Unknown models default to safe text-only capabilities and never receive speculative image or reasoning support.
- Web UI settings belong under `Settings → Plugins → Configurable` via `settings.plugin.item`.
- The live `web` profile is not changed by automated tasks; installation requires explicit user confirmation after verification.
- Secrets never enter source, fixtures, logs, snapshots, or Git history.
- Every meaningful change ends with a focused test command and a Git commit.

## File Map

- Create `package.json`: private external bundle manifest, peer dependencies, scripts, `dsh.bundle`, and `dsh.client` declarations.
- Create `tsconfig.json`: strict NodeNext source and test typechecking.
- Create `tsdown.config.ts`: separate host ESM and browser client CJS artifacts.
- Create `bunfig.toml`: Bun install and test settings.
- Create `cordis.patch.yml`: one host-side provider row for profile installation.
- Create `src/types.ts`: provider wire types, model capability types, configuration value types.
- Create `src/config.ts`: schema, defaults, and resolved connection values.
- Create `src/catalog.ts`: model discovery normalization, fallback catalog, protocol and capability resolution.
- Create `src/api/client.ts`: authenticated HTTP transport, status handling, timeout, and response body limits.
- Create `src/api/requests.ts`: endpoint URL and header construction.
- Create `src/wire/sse.ts`: SSE event framing independent of network chunk boundaries.
- Create `src/wire/openai.ts`: OpenAI event-to-DSH stream translation.
- Create `src/wire/anthropic.ts`: Anthropic event-to-DSH stream translation.
- Create `src/conversion/openai.ts`: DSH message and tool conversion to Chat Completions.
- Create `src/conversion/anthropic.ts`: DSH message and tool conversion to Messages.
- Create `src/errors.ts`: provider error parsing and stable DSH error mapping.
- Create `src/adapter.ts`: `CommandCodeAdapter` and request lifecycle.
- Create `src/index.ts`: host plugin exports, credential/settings resolution, and registrations.
- Create `src/client/index.ts`: Web slot contribution and client runtime wiring.
- Create `src/client/card-controller.ts`: redacted settings state and credential/settings mutations.
- Create `src/client/CommandCodeCard.tsx`: accessible settings card with pure props.
- Create `src/client/locales.ts`: English and Japanese card copy.
- Create `src/client/CommandCodeCard.module.css`: semantic DSH token styles.
- Create `tests/manifest.test.ts`: Loader-safe package and export shape checks.
- Create `tests/fixtures/messages.ts`: deterministic DSH message builders for conversion tests.
- Create `tests/config.test.ts`: schema defaults and validation.
- Create `tests/catalog.test.ts`: model list and capability resolution.
- Create `tests/api-client.test.ts`: headers, status mapping, body limits, and timeout.
- Create `tests/sse.test.ts`: split-frame and malformed-event behavior.
- Create `tests/openai-conversion.test.ts`: OpenAI request conversion.
- Create `tests/anthropic-conversion.test.ts`: Anthropic request conversion.
- Create `tests/openai-stream.test.ts`: OpenAI chunk ordering and usage.
- Create `tests/anthropic-stream.test.ts`: Anthropic chunk ordering and usage.
- Create `tests/adapter.test.ts`: adapter lifecycle, capture, cancellation, and attachment gating.
- Create `tests/card-controller.test.ts`: credential/settings state transitions.
- Create `tests/CommandCodeCard.client.spec.tsx`: visible Web card behavior and accessibility states.
- Create `tests/composition.test.ts`: real Loader composition with a mock Command Code server.
- Create `README.md`: installation, configuration, feature limits, and verification instructions.

---

### Task 1: Scaffold the private external bundle

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsdown.config.ts`
- Create: `bunfig.toml`
- Create: `cordis.patch.yml`
- Create: `src/index.ts`
- Create: `src/client/index.ts`
- Test: `tests/manifest.test.ts`

**Interfaces:**
- Produces package exports `name`, `inject`, `Config`, and `apply` from `src/index.ts`.
- Produces `lib/index.js` for the host and `lib/client.js` for the Web module loader.
- Produces bundle row id `llm-commandcode-goat` and provider route `commandcode-goat`.

- [ ] **Step 1: Write the manifest and Loader-shape test**

Create a test that imports the source module and rejects a default export:

```ts
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'

describe('plugin manifest', () => {
  it('exports a namespace plugin for the commandcode-goat route', () => {
    expect(plugin.name).toBe('llm-commandcode-goat')
    expect(plugin.inject).toEqual(['llm'])
    expect(typeof plugin.apply).toBe('function')
    expect('default' in plugin).toBe(false)
  })
})
```

- [ ] **Step 2: Run the focused test and verify the expected missing-export failure**

Run `bun run test -- tests/manifest.test.ts`. It must fail because the host entry has not been implemented yet.

- [ ] **Step 3: Create the exact package manifest and build faces**

Set `package.json` to private, ESM, Node 22, and the current DSH peer range. Include `@deepseek-ai/cordis`, `@deepseek-ai/dsh-attachment`, `@deepseek-ai/dsh-credentials`, `@deepseek-ai/dsh-launch-environment`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-settings`, `@deepseek-ai/dsh-timeout`, `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-api-remotes`, `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-settings`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `react`, and matching development dependencies. Put only `eventsource-parser@3.1.0` in runtime `dependencies`.

Declare these manifest faces:

```json
{
  "name": "dsh-commandcode-goat-provider",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": "./lib/client.js",
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "oxlint src tests"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-api-remotes"
      ],
      "external": ["@deepseek-ai/dsh-client-runtime/client"],
      "platform": "web"
    }
  }
}
```

Create `cordis.patch.yml` with one quoted package row:

```yaml
- insert:
    - id: llm-commandcode-goat
      name: dsh-commandcode-goat-provider
      config:
        apiKeyEnv: COMMANDCODE_API_KEY
```

Create `tsconfig.json` with strict NodeNext checking and JSX support:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

Create `tsdown.config.ts` with separate host ESM and browser-loader CJS outputs:

```ts
import { defineConfig } from 'tsdown'

const host = defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'lib',
  clean: true,
  sourcemap: true,
  dts: true,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/schemastery',
    '@deepseek-ai/dsh-attachment',
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-launch-environment',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-timeout',
  ],
})

const client = defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  dts: false,
  clean: false,
  external: [
    '@deepseek-ai/cordis',
    'react',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-runtime/client',
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-commandcode-goat-provider", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})

export default [host, client]
```

Set `bunfig.toml` to reject newly published packages for seven days:

```toml
[install]
minimumReleaseAge = 604800
```

Run `bun install` only after the manifest files exist.

- [ ] **Step 4: Implement the minimal named exports and client entry**

Create the host shape and a client no-op that will receive the settings contribution later:

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'llm-commandcode-goat'
export const inject = ['llm']
export const Config: z<Record<string, never>> = z.object({})

export function apply(_ctx: Context, _config: Record<string, never>): void {}
```

Create `src/client/index.ts` with an empty `apply` function and no default export.

- [ ] **Step 5: Build and test the scaffold**

Run `bun run test -- tests/manifest.test.ts` and `bun run build`. The focused test and both artifacts must pass. Do not install the bundle into any DSH profile.

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json tsconfig.json tsdown.config.ts bunfig.toml cordis.patch.yml src/index.ts src/client/index.ts tests/manifest.test.ts
git commit -m "build: scaffold private Command Code GOAT DSH bundle"
```

### Task 2: Define configuration, credential references, and model catalog

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `src/catalog.ts`
- Test: `tests/config.test.ts`
- Test: `tests/catalog.test.ts`

**Interfaces:**
- `CommandCodeConfig` contains `apiKeyEnv`, `baseURL`, `defaultContextWindow`, `maxTokens`, `requestTimeoutMs`, `streamIdleTimeoutMs`, `enableZdr`, `retryPolicy`, and `protocolOverrides`.
- `ResolvedConnection` contains detached connection settings and one resolved API key.
- `CommandCodeModel` contains `id`, `name`, `contextWindow`, `maxTokens`, `protocol`, `inputModalities`, `reasoningEfforts`, `defaultEffort`, and `supportsTools`.
- `RequestModel` is `{ protocol: Protocol; reasoningEfforts: readonly string[]; inputModalities: readonly ModelModality[]; supportsTools: boolean }`.
- `StreamModel` is `{ id: string; protocol: Protocol }`.
- `normalizeDiscoveredModels()` returns `LlmDiscoveredModel[]` without throwing for unknown optional fields.
- `resolveCommandCodeModel(provider, modelId, catalog, config)` returns `LlmResolvedModelInfo`.

- [ ] **Step 1: Write failing tests for defaults and catalog safety**

```ts
import { describe, expect, it } from 'vitest'
import { defaultConfig, resolveConfig } from '../src/config.ts'
import { normalizeDiscoveredModels, resolveCommandCodeModel } from '../src/catalog.ts'

describe('configuration', () => {
  it('uses the official API and safe time limits by default', () => {
    expect(defaultConfig).toMatchObject({
      apiKeyEnv: 'COMMANDCODE_API_KEY',
      baseURL: 'https://api.commandcode.ai',
      defaultContextWindow: 262144,
      maxTokens: 65536,
      requestTimeoutMs: 60000,
      streamIdleTimeoutMs: 300000,
      enableZdr: false,
    })
  })
})

describe('catalog', () => {
  it('keeps unknown models and disables unverified capabilities', () => {
    const models = normalizeDiscoveredModels({
      object: 'list',
      data: [{ id: 'new-model', name: 'New Model', context_length: 8192 }],
    })
    const resolved = resolveCommandCodeModel('commandcode-goat', 'new-model', models, defaultConfig)
    expect(resolved.inputModalities).toEqual(['text'])
    expect(resolved.reasoning).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the focused tests to confirm they fail**

Run `bun run test -- tests/config.test.ts tests/catalog.test.ts`. The imports and functions must be missing.

- [ ] **Step 3: Implement schema and resolved configuration**

Use `@deepseek-ai/schemastery` for `Config`. Set exact defaults from the specification, validate positive integer limits, require `https:` for production `baseURL`, and represent protocol overrides as `{ model: string; protocol: 'openai' | 'anthropic' }[]`. Keep the credential reference separate from the user-editable settings fields.

- [ ] **Step 4: Implement catalog normalization and capability resolution**

Parse only `id`, `name`, and positive `context_length`/`max_tokens` from the API list. Merge the explicit GOAT fallback catalog and static capability table by exact model id. Resolve protocol in this order: override, static table, known Claude id prefix, OpenAI default. Return `inputModalities: ['text']` for unknown models and never advertise unknown image or reasoning support.

- [ ] **Step 5: Run the focused tests and typecheck**

Run `bun run test -- tests/config.test.ts tests/catalog.test.ts` and `bun run typecheck`. Both must pass.

- [ ] **Step 6: Commit catalog and configuration**

```bash
git add src/types.ts src/config.ts src/catalog.ts tests/config.test.ts tests/catalog.test.ts
git commit -m "feat: add GOAT configuration and model catalog"
```

### Task 3: Implement HTTP transport, errors, and SSE framing

**Files:**
- Create: `src/api/requests.ts`
- Create: `src/api/client.ts`
- Create: `src/errors.ts`
- Create: `src/wire/sse.ts`
- Test: `tests/api-client.test.ts`
- Test: `tests/sse.test.ts`

**Interfaces:**
- `buildHeaders(apiKey, enableZdr)` returns a redacted-safe request header object and always merges DSH attribution headers.
- `CommandCodeApiClient.listModels(input)` returns normalized wire models.
- `CommandCodeApiClient.openStream(input)` returns a `Response` whose body is an SSE stream.
- `parseSse(response, signal)` yields `{ event?: string; data: string }` records.
- `mapProviderError(status, body, headers)` returns a `LlmError` with a stable code and optional `providerRetryAfterMs`.

- [ ] **Step 1: Write failing transport and SSE tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildHeaders } from '../src/api/requests.ts'
import { parseSse } from '../src/wire/sse.ts'

describe('request headers', () => {
  it('uses bearer auth, attribution, and optional ZDR without logging the key', () => {
    expect(buildHeaders('secret-value', true)).toEqual(expect.objectContaining({
      authorization: 'Bearer secret-value',
      accept: 'text/event-stream',
      'content-type': 'application/json',
      'x-cmd-zdr': '1',
      'user-agent': expect.stringContaining('deepseek-harness/'),
    }))
  })
})

describe('SSE framing', () => {
  it('joins data split across network chunks and emits events in order', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"he'))
        controller.enqueue(new TextEncoder().encode('llo"}\n\nevent: done\ndata: [DONE]\n\n'))
        controller.close()
      },
    })
    const events = []
    for await (const event of parseSse(new Response(body), new AbortController().signal)) events.push(event)
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"hello"}' },
      { event: 'done', data: '[DONE]' },
    ])
  })
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run `bun run test -- tests/api-client.test.ts tests/sse.test.ts`. The transport and parser implementations must not exist yet.

- [ ] **Step 3: Implement URL and header construction**

Normalize a trailing slash from `baseURL`, append `/provider/v1/models`, `/provider/v1/chat/completions`, or `/provider/v1/messages`, and use `Authorization: Bearer <key>` for authenticated requests. Add `attributionHeaders()` from `@deepseek-ai/dsh-llm` on every provider request. Add `x-cmd-zdr: 1` only when configured.

- [ ] **Step 4: Implement bounded fetch and provider error mapping**

Inject `fetch` for tests, pass the caller's `AbortSignal`, enforce `requestTimeoutMs` before the first response, and cap error-body reads at 64 KiB. Map 401 to `AUTH`, 403 `upgrade_required` to `PLAN_REQUIRED`, 422 `cmd_zdr_no_providers` to `ZDR_UNSUPPORTED`, 429 to `RATE_LIMIT` with a bounded `Retry-After`, 5xx to `SERVER`, context wording to `CONTEXT_WINDOW_EXCEEDED`, and all other non-2xx responses to `INVALID_REQUEST` or `HTTP_<status>`. Never include authorization or request bodies in error messages.

- [ ] **Step 5: Implement SSE parsing with abort support**

Use `eventsource-parser` to join arbitrary byte chunks, reject malformed event frames with a stable `PROTOCOL` error, ignore comments, preserve event names, and close the reader in `finally`. A caller abort must settle promptly and map to `ABORTED` in the adapter layer.

- [ ] **Step 6: Run tests, lint, and commit**

Run `bun run test -- tests/api-client.test.ts tests/sse.test.ts`, `bun run typecheck`, and `bun run lint`. Commit:

```bash
git add src/api src/errors.ts src/wire/sse.ts tests/api-client.test.ts tests/sse.test.ts
git commit -m "feat: add Command Code transport and SSE framing"
```

### Task 4: Convert DSH messages, tools, and images to provider requests

**Files:**
- Create: `src/conversion/openai.ts`
- Create: `src/conversion/anthropic.ts`
- Modify: `src/types.ts`
- Test: `tests/openai-conversion.test.ts`
- Test: `tests/anthropic-conversion.test.ts`

**Interfaces:**
- `toOpenAiRequest(options: GenerateOptions, model: RequestModel, resolveImage?: ResolveImage)` returns an OpenAI Chat Completions request.
- `toAnthropicRequest(options: GenerateOptions, model: RequestModel, resolveImage?: ResolveImage)` returns an Anthropic Messages request.
- `ResolveImage` is `(ref: ImageAttachmentRef, signal: AbortSignal) => Promise<{ mediaType: string; base64: string }>`.
- Both serializers accept DSH `GenerateOptions` and preserve raw tool argument strings.

- [ ] **Step 1: Write failing conversion tests**

```ts
import { describe, expect, it } from 'vitest'
import { CallId } from '@deepseek-ai/dsh-llm'
import { toOpenAiRequest } from '../src/conversion/openai.ts'
import { toAnthropicRequest } from '../src/conversion/anthropic.ts'
import { createUserMessage, createToolResultMessage } from './fixtures/messages.ts'

describe('OpenAI conversion', () => {
  it('maps system, tool calls, tool results, effort, and usage options', () => {
    const request = toOpenAiRequest({
      provider: 'commandcode-goat',
      model: 'gpt-5.6-luna',
      system: 'Follow the task.',
      reasoningEffort: 'high',
      messages: [createUserMessage('Use the tool.'), createToolResultMessage(CallId('call-1'), 'done')],
      tools: [{ name: 'read', description: 'Read a file.', parameters: { type: 'object' } }],
      maxTokens: 1024,
      temperature: 0.2,
    }, { protocol: 'openai', reasoningEfforts: ['low', 'high'] })
    expect(request.messages[0]).toEqual({ role: 'system', content: 'Follow the task.' })
    expect(request.stream_options).toEqual({ include_usage: true })
    expect(request.reasoning_effort).toBe('high')
    expect(request.tools).toHaveLength(1)
  })
})

describe('Anthropic conversion', () => {
  it('moves system text to the top level and merges adjacent user blocks', () => {
    const request = toAnthropicRequest({
      provider: 'commandcode-goat',
      model: 'claude-sonnet-4-6',
      system: 'Follow the task.',
      messages: [createUserMessage('first'), createUserMessage('second')],
      maxTokens: 1024,
    }, { protocol: 'anthropic', reasoningEfforts: [] })
    expect(request.system).toBe('Follow the task.')
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0].role).toBe('user')
    expect(request.messages[0].content).toHaveLength(2)
  })
})
```

Create the deterministic fixture imported by the tests:

```ts
import {
  createToolResultMessage as makeToolResult,
  createUserMessage as makeUserMessage,
} from '@deepseek-ai/dsh-llm'
import type { CallId } from '@deepseek-ai/dsh-llm'

export function createUserMessage(text: string) {
  return makeUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
}

export function createToolResultMessage(callId: CallId, text: string) {
  return makeToolResult({ callId, content: [{ type: 'text', text }], isError: false })
}
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run `bun run test -- tests/openai-conversion.test.ts tests/anthropic-conversion.test.ts`.

- [ ] **Step 3: Implement OpenAI conversion**

Convert DSH roles and content blocks to Chat Completions messages, map `ToolCallBlock` to `tool_calls`, map `ToolResultBlock` to `role: tool`, convert image attachments to `image_url` data URLs through `ResolveImage`, include `tools`, `stop`, `temperature`, `max_tokens`, and include `reasoning_effort` only when the resolved model advertises that effort. Keep arguments as JSON strings.

- [ ] **Step 4: Implement Anthropic conversion**

Move the system text to the top-level `system`, merge adjacent user and assistant messages, map tool calls to `tool_use`, map tool results to `tool_result`, convert supported images to Anthropic base64 blocks, set `anthropic-version: 2023-06-01` in the API header layer, and reject unsupported history with `INVALID_REQUEST` before fetch.

- [ ] **Step 5: Enforce image capability and bounds**

Reject any image when `inputModalities` excludes `image`, reject missing attachment resolution, enforce the configured image count and byte limits before constructing the body, and never silently downgrade or route an image to another model.

- [ ] **Step 6: Run focused tests and commit**

Run `bun run test -- tests/openai-conversion.test.ts tests/anthropic-conversion.test.ts` and `bun run typecheck`. Commit:

```bash
git add src/types.ts src/conversion tests/openai-conversion.test.ts tests/anthropic-conversion.test.ts tests/fixtures/messages.ts
git commit -m "feat: convert DSH messages to Command Code requests"
```

### Task 5: Translate OpenAI and Anthropic streams into DSH chunks

**Files:**
- Create: `src/wire/openai.ts`
- Create: `src/wire/anthropic.ts`
- Test: `tests/openai-stream.test.ts`
- Test: `tests/anthropic-stream.test.ts`

**Interfaces:**
- `streamOpenAi(events, model: StreamModel)` returns `AsyncIterable<StreamChunk>`.
- `streamAnthropic(events, model: StreamModel)` returns `AsyncIterable<StreamChunk>`.
- Both translators emit block indexes in first-seen order and return a terminal `finish` only once.

- [ ] **Step 1: Write failing stream tests**

```ts
import { describe, expect, it } from 'vitest'
import { streamOpenAi } from '../src/wire/openai.ts'

describe('OpenAI stream translation', () => {
  it('emits usage before finish and preserves raw tool argument fragments', async () => {
    const chunks = []
    for await (const chunk of streamOpenAi([
      { choices: [{ delta: { content: 'answer' }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'read', arguments: '{"p' } }] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ath":"a"}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 4, completion_tokens: 6 } },
    ], { id: 'gpt-5.6-luna', protocol: 'openai' })) chunks.push(chunk)
    expect(chunks.at(-2)?.type).toBe('usage')
    expect(chunks.at(-1)?.type).toBe('finish')
    expect(chunks.filter(chunk => chunk.type === 'tool-call-delta').map(chunk => chunk.argumentsDelta)).toEqual(['{"p', 'ath":"a"}'])
  })
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run `bun run test -- tests/openai-stream.test.ts tests/anthropic-stream.test.ts`.

- [ ] **Step 3: Implement OpenAI event translation**

Handle text deltas, provider reasoning fields, interleaved tool calls, finish reasons, final usage-only chunks, and `[DONE]`. Buffer terminal finish state until all usage is emitted. Assemble each tool call privately so `block-end` carries a complete `ToolCallBlock` while every argument fragment remains raw in `tool-call-delta`.

- [ ] **Step 4: Implement Anthropic event translation**

Handle `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, and `message_stop`. Map `text_delta`, `thinking_delta`, and `input_json_delta`; preserve content block indexes; map `end_turn`, `tool_use`, and `max_tokens`; emit final input/output usage before finish.

- [ ] **Step 5: Add malformed and empty-stream behavior**

Reject invalid JSON, missing required event fields, duplicate block endings, and a normal stop with no text/reasoning/tool block as `EMPTY_RESPONSE`. Emit no chunk after finish. Convert an in-band provider error to a terminal error finish with a redacted `LlmFailure`.

- [ ] **Step 6: Run stream tests, typecheck, and commit**

Run `bun run test -- tests/openai-stream.test.ts tests/anthropic-stream.test.ts`, `bun run typecheck`, and `bun run lint`. Commit:

```bash
git add src/wire/openai.ts src/wire/anthropic.ts tests/openai-stream.test.ts tests/anthropic-stream.test.ts
git commit -m "feat: translate Command Code streams into DSH chunks"
```

### Task 6: Integrate the adapter with DSH host services

**Files:**
- Modify: `src/config.ts`
- Modify: `src/adapter.ts`
- Modify: `src/index.ts`
- Create: `tests/adapter.test.ts`

**Interfaces:**
- `CommandCodeAdapter extends LlmAdapter`.
- `providerInfo('commandcode-goat')` returns `{ id: 'commandcode-goat', name: 'Command Code GOAT' }`.
- `providerRetryPolicy('commandcode-goat')` returns the resolved DSH retry policy.
- `listModels(provider)` returns detached `LlmModelInfo[]`.
- `resolveModel(provider, model, signal)` returns detached `LlmResolvedModelInfo`.
- `prepareCall(provider, model, signal)` captures connection facts and dispatches one generation.
- `apply(ctx, config)` registers adapter, configurable provider, model discovery, and settings namespace.

- [ ] **Step 1: Write failing adapter and registration tests**

```ts
import { describe, expect, it } from 'vitest'
import { CommandCodeAdapter } from '../src/adapter.ts'

describe('CommandCodeAdapter', () => {
  it('captures connection facts for prepareCall', async () => {
    let baseURL = 'https://api.commandcode.ai'
    const adapter = new CommandCodeAdapter({
      connection: () => ({ baseURL, apiKey: 'test-key', enableZdr: false }),
      catalog: () => [],
      fetchImpl: async () => new Response('event: done\\ndata: [DONE]\\n\\n', { headers: { 'content-type': 'text/event-stream' } }),
    })
    const prepared = await adapter.prepareCall('commandcode-goat', 'gpt-5.6-luna')
    baseURL = 'https://changed.example'
    expect(prepared.model.provider).toBe('commandcode-goat')
    expect(prepared.model.id).toBe('gpt-5.6-luna')
  })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run `bun run test -- tests/adapter.test.ts`.

- [ ] **Step 3: Implement request lifecycle and exact model resolution**

Resolve the API key once at the beginning of each stream, combine the caller signal with an idle watchdog, choose the protocol from the same catalog generation used by `resolveModel`, serialize the request, call the correct endpoint, and translate the response. Use `contentHasImage` and `ctx.get('attachments')` only when a request contains images. Use `prepareCall` so a settings change cannot mix metadata from one generation with transport from another.

- [ ] **Step 4: Implement DSH error and retry contracts**

Throw `LlmError` for transport and pre-stream protocol failures, return terminal error/aborted finishes for in-band stream failures, and call `resolveRetryPolicy(config.retryPolicy, 'llm-commandcode-goat.retryPolicy')`. Do not retry inside the adapter. Include `attributionHeaders()` on every API request.

- [ ] **Step 5: Implement host registrations and live settings updates**

In `apply`, use `installSettingsSection` for `llm-commandcode-goat`, resolve credentials per request through `credentialRef` and `ctx.get('credentials')`, fall back only to `launchEnvironmentOf(ctx)`, register `commandcode-goat` on `ctx.llm`, advertise `{ provider, displayName, settingsNs, settingsPath: [] }`, and register model discovery that honors the request signal and one-shot API key. Use atomic route/directory replacement when settings change.

- [ ] **Step 6: Run adapter tests and host checks**

Run `bun run test -- tests/adapter.test.ts tests/config.test.ts tests/catalog.test.ts`, `bun run typecheck`, and `bun run build`. Commit:

```bash
git add src/config.ts src/adapter.ts src/index.ts tests/adapter.test.ts
git commit -m "feat: register Command Code GOAT with DSH"
```

### Task 7: Add the Web settings card through the DSH slot system

**Files:**
- Modify: `src/client/index.ts`
- Create: `src/client/card-controller.ts`
- Create: `src/client/CommandCodeCard.tsx`
- Create: `src/client/locales.ts`
- Create: `src/client/CommandCodeCard.module.css`
- Test: `tests/card-controller.test.ts`
- Test: `tests/CommandCodeCard.client.spec.tsx`

**Interfaces:**
- `CommandCodeCardState` contains only redacted key state, editable settings, dirty/invalid/saving flags, and error copy.
- `defaultCardState` is the immutable initial state used by the controller and direct component tests.
- `CommandCodeCardFace` exposes `hooks`, `edit`, `resetField`, `save`, and `discard` through the slot inject face.
- The component receives `PropsRuntime<'settings.plugin.item'>`, locale props, and `InjectFace<CommandCodeCardFace>`; it never receives `Context` or service objects.

- [ ] **Step 1: Write failing controller and component tests**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommandCodeCard } from '../src/client/CommandCodeCard.tsx'
import type { CommandCodeCardProps } from '../src/client/CommandCodeCard.tsx'
import { defaultCardState } from '../src/client/card-controller.ts'

const testCardProps = (patch: Partial<typeof defaultCardState>): CommandCodeCardProps => ({
  useCommandCodeCard: <T,>(select: (state: typeof defaultCardState) => T) => select({ ...defaultCardState, ...patch }),
  edit: () => undefined,
  resetField: () => undefined,
  save: () => undefined,
  discard: () => undefined,
  t: (key: string) => key,
} as unknown as CommandCodeCardProps)

describe('CommandCodeCard', () => {
  it('renders a write-only credential field and a disabled save button when clean', () => {
    render(<CommandCodeCard {...testCardProps({ dirty: false, apiKeyConfigured: false })} />)
    expect(screen.getByLabelText('Command Code API key')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.queryByText('secret-value')).toBeNull()
  })
})
```

- [ ] **Step 2: Run client tests and verify failure**

Run `bun run test -- tests/card-controller.test.ts tests/CommandCodeCard.client.spec.tsx`.

- [ ] **Step 3: Implement the host-backed card controller**

Use the Web connection API's settings and credentials operations. Keep the API key write-only; expose only configured/unconfigured status to React. Stage editable values locally, validate URL and positive numeric limits before save, write the credential through `credentials.set` or `credentials.clear`, then persist non-secret settings with settings path operations. Publish state only after each operation settles successfully.

- [ ] **Step 4: Implement the slot contribution**

In `src/client/index.ts`, add type-only imports for the DSH client augmentations, register locale copy, create one snapshot store, and use `ctx.slots.inject('settings.plugin.item', ...)` to register the keyed `llm-commandcode-goat` contribution. The contribution must disappear when the slot declaration is unavailable and reappear after redeclaration. Do not import internal components from `@deepseek-ai/dsh-client-ui-settings-plugins`; render the card locally.

- [ ] **Step 5: Implement the accessible card and styles**

Use semantic labels, password input, status text, keyboard-visible focus, `aria-live` for save errors, and semantic `--dsw-*` tokens. Include fields for API key, API base URL, request timeout, stream idle timeout, and ZDR. Do not render usage/balance data. Honor `prefers-reduced-motion` by disabling nonessential transitions.

- [ ] **Step 6: Run client tests and build both artifacts**

Run `bun run test -- tests/card-controller.test.ts tests/CommandCodeCard.client.spec.tsx`, `bun run typecheck`, `bun run build`, and inspect that `lib/client.js` calls `window.__ModuleLoader__.load` with the exact package id. Commit:

```bash
git add src/client tests/card-controller.test.ts tests/CommandCodeCard.client.spec.tsx
git commit -m "feat: add Command Code GOAT Web settings card"
```

### Task 8: Add real composition coverage, documentation, and verification

**Files:**
- Create: `tests/composition.test.ts`
- Create: `README.md`
- Create: `LICENSE`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-08-30-commandcode-goat-dsh-provider-design.md` only if implementation decisions materially change the approved design.

**Interfaces:**
- `tests/composition.test.ts` boots a real Loader over a temporary `cordis.yml`, imports the built/private bundle, and serves deterministic mock models and SSE responses.
- README documents local bundle installation, `COMMANDCODE_API_KEY`, settings location, official API limits, and the explicit absence of usage/balance integration.

- [ ] **Step 1: Write the real Loader composition test**

Create a temporary package resolution map and `cordis.yml` containing the provider row plus the minimum real DSH `llm`, settings, credentials, and retry services. Use a mock HTTP server that returns a model list and one text stream. Assert `listProviders`, `listModels`, `discoverModels`, and the assembled `StreamChunk[]`. Assert that disposing the Loader removes the provider route.

- [ ] **Step 2: Run the composition test and verify any missing integration contract**

Run `bun run test -- tests/composition.test.ts`. If it exposes a DSH contract mismatch, fix the provider project and its focused tests before changing the DSH checkout.

- [ ] **Step 3: Write the user-facing README**

Document:

- `bun install`, `bun run typecheck`, `bun run test`, and `bun run build`.
- `dsh plugin --profile web add /home/pi/projects/commandcode-goat-dsh-provider` as a command that requires explicit operator approval and is not run by the automated workflow.
- API key storage through DSH credential service and the `COMMANDCODE_API_KEY` fallback.
- Settings path `Settings → Plugins → Configurable → Command Code GOAT`.
- Official endpoints and GOAT entitlement behavior.
- Supported streaming, tools, images, reasoning, cancellation, and ZDR.
- No balance endpoint, browser login, or multi-account rotation.
- No guarantee for unknown models beyond safe text-only behavior.

- [ ] **Step 4: Run the project check ladder**

Run the narrow checks in this order:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
bun pm pack --dry-run
```

Inspect the package payload and confirm it contains `lib/index.js`, `lib/client.js`, declarations, `cordis.patch.yml`, `README.md`, and `LICENSE`, with no source secrets or test fixtures containing API keys.

- [ ] **Step 5: Run a manual keyless profile smoke test**

Use a temporary profile and mock API only. Confirm the host boots, the provider route appears, the client artifact is served, model discovery works, and the mock stream reaches the DSH assembler. Do not touch the live `web` profile.

- [ ] **Step 6: Commit documentation and final checks**

```bash
git add README.md LICENSE package.json tests/composition.test.ts
git diff --cached --check
git commit -m "test: verify Command Code GOAT DSH composition"
```

## Verification and Live Installation Gate

After Task 8, collect the output of `git status --short --branch`, `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, and `bun pm pack --dry-run`. Only after those checks pass should the operator decide whether to install into the live Web profile. The installation command is intentionally outside this plan's automatic execution because it changes the running DSH configuration.
