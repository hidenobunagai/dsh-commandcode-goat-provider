import type { CommandCodeConfig } from '../types.ts'

export interface CardState {
  isDirty: boolean
  isSaving: boolean
  apiKeyConfigured: boolean
  apiKeyWritable: boolean
  apiKey: string
  baseURL: string
  requestTimeoutMs: number
  streamIdleTimeoutMs: number
  enableZdr: boolean
  fieldErrors: {
    baseURL?: string
    requestTimeoutMs?: string
    streamIdleTimeoutMs?: string
  }
  saveError?: string
}

export interface SettingsScopeLike<T> {
  getSnapshot(): { value?: T }
  set(field: string, value: unknown): Promise<void>
  subscribe(listener: () => void): () => void
}

export interface CredentialsApiLike {
  describe?(payload: { refs: string[] }, signal?: AbortSignal): Promise<any>
  set?(payload: { ref: string; value: string }, signal?: AbortSignal): Promise<any>
  resolve?(ref: string): Promise<{ configured: boolean; writable: boolean } | undefined>
}

const DEFAULT_API_KEY_REF = 'COMMANDCODE_API_KEY'

export class CommandCodeCardController {
  private state: CardState
  private listeners = new Set<() => void>()
  private unsubscribeScope: () => void

  constructor(
    private readonly scope: SettingsScopeLike<CommandCodeConfig>,
    private readonly credentials?: CredentialsApiLike,
  ) {
    this.state = {
      isDirty: false,
      isSaving: false,
      apiKeyConfigured: false,
      apiKeyWritable: true,
      apiKey: '',
      baseURL: 'https://api.commandcode.ai',
      requestTimeoutMs: 60000,
      streamIdleTimeoutMs: 300000,
      enableZdr: false,
      fieldErrors: {},
    }

    this.syncFromScope()
    this.unsubscribeScope = this.scope.subscribe(() => {
      this.syncFromScope()
      this.notify()
    })
    void this.syncCredentials()
  }

  private syncFromScope(): void {
    const s = this.scope.getSnapshot()?.value || {}
    if (!this.state.isDirty) {
      this.state = {
        ...this.state,
        baseURL: s.baseURL ?? 'https://api.commandcode.ai',
        requestTimeoutMs: s.requestTimeoutMs ?? 60000,
        streamIdleTimeoutMs: s.streamIdleTimeoutMs ?? 300000,
        enableZdr: s.enableZdr ?? false,
      }
    }
  }

  private validateBaseURL(value: string): string | undefined {
    const trimmed = value.trim()
    if (!trimmed) return 'Base URL is required'
    try {
      const url = new URL(trimmed)
      if (!['http:', 'https:'].includes(url.protocol)) {
        return 'Must use http or https'
      }
    } catch {
      return 'Must be a valid http(s) URL'
    }
    return undefined
  }

  private validateTimeout(value: number, field: string): string | undefined {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      return `${field} must be a positive integer`
    }
    return undefined
  }

  private recomputeFieldErrors(state: CardState): CardState['fieldErrors'] {
    const errors: CardState['fieldErrors'] = {}
    const urlErr = this.validateBaseURL(state.baseURL)
    if (urlErr) errors.baseURL = urlErr
    const reqErr = this.validateTimeout(state.requestTimeoutMs, 'Request timeout')
    if (reqErr) errors.requestTimeoutMs = reqErr
    const idleErr = this.validateTimeout(state.streamIdleTimeoutMs, 'Stream idle timeout')
    if (idleErr) errors.streamIdleTimeoutMs = idleErr
    return errors
  }

  private async syncCredentials(): Promise<void> {
    if (!this.credentials) return
    const s = this.scope.getSnapshot()?.value || {}
    const ref = s.apiKeyEnv ?? DEFAULT_API_KEY_REF
    try {
      if (typeof this.credentials.describe === 'function') {
        const res = await this.credentials.describe({ refs: [ref] })
        const payload = res?.value ?? res
        const info = payload?.credentials?.[ref]
        if (info) {
          this.state = {
            ...this.state,
            apiKeyConfigured: info.configured ?? false,
            apiKeyWritable: info.writable ?? true,
          }
          this.notify()
        }
      } else if (typeof this.credentials.resolve === 'function') {
        const res = await this.credentials.resolve(ref)
        if (res) {
          this.state = {
            ...this.state,
            apiKeyConfigured: res.configured,
            apiKeyWritable: res.writable,
          }
          this.notify()
        }
      }
    } catch {
      // ignore
    }
  }

  getState(): CardState {
    return { ...this.state }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }

  editField<K extends keyof CardState>(field: K, value: CardState[K]): void {
    const next = {
      ...this.state,
      [field]: value,
      isDirty: true,
      saveError: undefined,
    } as CardState
    next.fieldErrors = this.recomputeFieldErrors(next)
    this.state = next
    this.notify()
  }

  /** Parse a raw number input string into a validated integer or NaN guard. */
  editNumericField(field: 'requestTimeoutMs' | 'streamIdleTimeoutMs', raw: string): void {
    const trimmed = raw.trim()
    if (trimmed === '') {
      // Keep dirty but record error so save is blocked
      const next = { ...this.state, [field]: NaN as unknown as number, isDirty: true, saveError: undefined } as CardState
      next.fieldErrors = this.recomputeFieldErrors(next)
      this.state = next
      this.notify()
      return
    }
    const parsed = Number(trimmed)
    const next = { ...this.state, [field]: parsed, isDirty: true, saveError: undefined } as CardState
    next.fieldErrors = this.recomputeFieldErrors(next)
    this.state = next
    this.notify()
  }

  discard(): void {
    const s = this.scope.getSnapshot()?.value || {}
    this.state = {
      ...this.state,
      isDirty: false,
      apiKey: '',
      baseURL: s.baseURL ?? 'https://api.commandcode.ai',
      requestTimeoutMs: s.requestTimeoutMs ?? 60000,
      streamIdleTimeoutMs: s.streamIdleTimeoutMs ?? 300000,
      enableZdr: s.enableZdr ?? false,
      fieldErrors: {},
      saveError: undefined,
    }
    this.notify()
  }

  canSave(): boolean {
    return Object.keys(this.state.fieldErrors).length === 0 && this.state.isDirty
  }

  async save(): Promise<void> {
    const errors = this.recomputeFieldErrors(this.state)
    if (Object.keys(errors).length > 0) {
      this.state = { ...this.state, fieldErrors: errors, saveError: 'Please fix validation errors before saving' }
      this.notify()
      return
    }

    this.state = { ...this.state, isSaving: true, saveError: undefined }
    this.notify()

    try {
      const s = this.scope.getSnapshot()?.value || {}
      const ref = s.apiKeyEnv ?? DEFAULT_API_KEY_REF

      if (this.state.apiKey.trim().length > 0 && this.credentials) {
        if (typeof this.credentials.set === 'function') {
          try {
            await this.credentials.set({ ref, value: this.state.apiKey.trim() })
          } catch {
            await (this.credentials.set as any)(ref, this.state.apiKey.trim())
          }
        }
        this.state.apiKeyConfigured = true
      }

      await this.scope.set('baseURL', this.state.baseURL.trim())
      await this.scope.set('requestTimeoutMs', Number(this.state.requestTimeoutMs))
      await this.scope.set('streamIdleTimeoutMs', Number(this.state.streamIdleTimeoutMs))
      await this.scope.set('enableZdr', Boolean(this.state.enableZdr))

      this.state = {
        ...this.state,
        isDirty: false,
        isSaving: false,
        apiKey: '',
        fieldErrors: {},
        saveError: undefined,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.state = { ...this.state, isSaving: false, saveError: msg }
      this.notify()
      throw err
    }

    this.notify()
  }

  dispose(): void {
    this.unsubscribeScope()
    this.listeners.clear()
  }
}
