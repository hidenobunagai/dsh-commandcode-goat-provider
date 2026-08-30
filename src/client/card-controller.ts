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
    this.state = {
      ...this.state,
      [field]: value,
      isDirty: true,
    }
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
    }
    this.notify()
  }

  async save(): Promise<void> {
    this.state = { ...this.state, isSaving: true }
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

      await this.scope.set('baseURL', this.state.baseURL)
      await this.scope.set('requestTimeoutMs', Number(this.state.requestTimeoutMs))
      await this.scope.set('streamIdleTimeoutMs', Number(this.state.streamIdleTimeoutMs))
      await this.scope.set('enableZdr', Boolean(this.state.enableZdr))

      this.state = {
        ...this.state,
        isDirty: false,
        isSaving: false,
        apiKey: '',
      }
    } catch (err) {
      this.state = { ...this.state, isSaving: false }
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
