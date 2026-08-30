import React, { useMemo, useState } from 'react'
import type { LocaleKey } from './locales.ts'
import type { CardState } from './card-controller.ts'
import { CATALOG } from '../catalog/data.ts'
import styles from './CommandCodeCard.module.css'

export interface CommandCodeCardProps {
  t: (key: LocaleKey) => string
  state: CardState
  onEdit: <K extends keyof CardState>(field: K, value: CardState[K]) => void
  onEditNumeric: (field: 'requestTimeoutMs' | 'streamIdleTimeoutMs', raw: string) => void
  onToggleHidden: (modelId: string) => void
  onSave: () => void
  onDiscard: () => void
}

const TIER_ORDER: Record<string, number> = { free: 0, go: 1, goat: 1, pro: 2, provider: 3 }
const TIER_LABEL: Record<string, string> = { free: 'Free', go: 'Go / GOAT', goat: 'GOAT', pro: 'Pro', provider: 'Provider' }

export function CommandCodeCard({
  t,
  state,
  onEdit,
  onEditNumeric,
  onToggleHidden,
  onSave,
  onDiscard,
}: CommandCodeCardProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [modelFilter, setModelFilter] = useState('')

  const filtered = useMemo(() => {
    const q = modelFilter.trim().toLowerCase()
    if (!q) return state.knownModelIds
    return state.knownModelIds.filter((id) => id.toLowerCase().includes(q))
  }, [state.knownModelIds, modelFilter])

  // Group by tier for display when no filter active
  const groups = useMemo(() => {
    if (modelFilter.trim()) return null
    const byTier = new Map<string, string[]>()
    for (const id of state.knownModelIds) {
      const entry = CATALOG.find((e) => e.id === id)
      const tier = entry?.tier ?? 'provider'
      const arr = byTier.get(tier) ?? []
      arr.push(id)
      byTier.set(tier, arr)
    }
    // sort tiers by TIER_ORDER, then alphabetically within
    return [...byTier.entries()].sort((a, b) => (TIER_ORDER[a[0]] ?? 99) - (TIER_ORDER[b[0]] ?? 99))
  }, [state.knownModelIds, modelFilter])

  const invalid = Object.keys(state.fieldErrors).length > 0
  const blocked = !state.isDirty || invalid || state.isSaving

  return (
    <li className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        aria-label={`${open ? t('saveFailed') : t('unsaved')}: ${t('title')}`}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.headText}>
          <span className={styles.title}>{t('title')}</span>
          <span className={styles.description}>{t('description')}</span>
        </span>
        {state.isDirty ? <span className={styles.pending}>{t('unsaved')}</span> : null}
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className={styles.body}>
          {/* Secret — API key */}
          <div className={styles.field}>
            <div className={styles.head}>
              <label className={styles.label} htmlFor="cmd-api-key">
                {t('apiKey')}
              </label>
              <span className={styles.badges}>
                <span className={state.apiKeyConfigured ? styles.badge : styles.badgeMuted}>
                  {state.apiKeyConfigured ? t('apiKeyConfigured') : t('apiKeyUnset')}
                </span>
              </span>
            </div>
            <input
              id="cmd-api-key"
              className={styles.input}
              type="password"
              autoComplete="off"
              placeholder={state.apiKeyConfigured ? '••••••••••••••••' : ''}
              value={state.apiKey}
              disabled={!state.apiKeyWritable || state.isSaving}
              onChange={(e) => onEdit('apiKey', e.target.value)}
            />
            <p className={styles.hint}>{t('apiKeyHint')}</p>
          </div>

          {/* Base URL */}
          <div className={styles.field}>
            <div className={styles.head}>
              <label className={styles.label} htmlFor="cmd-base-url">
                {t('baseURL')}
              </label>
            </div>
            <input
              id="cmd-base-url"
              className={state.fieldErrors.baseURL ? styles.inputInvalid : styles.input}
              type="text"
              value={state.baseURL}
              disabled={state.isSaving}
              aria-invalid={Boolean(state.fieldErrors.baseURL)}
              onChange={(e) => onEdit('baseURL', e.target.value)}
            />
            <p className={state.fieldErrors.baseURL ? styles.invalid : styles.hint}>
              {state.fieldErrors.baseURL ?? t('baseURLHint')}
            </p>
          </div>

          {/* Timeouts */}
          <div className={styles.field}>
            <div className={styles.head}>
              <label className={styles.label} htmlFor="cmd-req-timeout">
                {t('requestTimeout')}
              </label>
            </div>
            <input
              id="cmd-req-timeout"
              className={state.fieldErrors.requestTimeoutMs ? styles.inputInvalid : styles.input}
              type="text"
              inputMode="numeric"
              value={Number.isFinite(state.requestTimeoutMs) ? String(state.requestTimeoutMs) : ''}
              disabled={state.isSaving}
              aria-invalid={Boolean(state.fieldErrors.requestTimeoutMs)}
              onChange={(e) => onEditNumeric('requestTimeoutMs', e.target.value)}
            />
            <p className={state.fieldErrors.requestTimeoutMs ? styles.invalid : styles.hint}>
              {state.fieldErrors.requestTimeoutMs ?? t('requestTimeoutHint')}
            </p>
          </div>

          <div className={styles.field}>
            <div className={styles.head}>
              <label className={styles.label} htmlFor="cmd-stream-timeout">
                {t('streamIdleTimeout')}
              </label>
            </div>
            <input
              id="cmd-stream-timeout"
              className={state.fieldErrors.streamIdleTimeoutMs ? styles.inputInvalid : styles.input}
              type="text"
              inputMode="numeric"
              value={Number.isFinite(state.streamIdleTimeoutMs) ? String(state.streamIdleTimeoutMs) : ''}
              disabled={state.isSaving}
              aria-invalid={Boolean(state.fieldErrors.streamIdleTimeoutMs)}
              onChange={(e) => onEditNumeric('streamIdleTimeoutMs', e.target.value)}
            />
            <p className={state.fieldErrors.streamIdleTimeoutMs ? styles.invalid : styles.hint}>
              {state.fieldErrors.streamIdleTimeoutMs ?? t('streamIdleTimeoutHint')}
            </p>
          </div>

          {/* ZDR */}
          <div className={styles.field}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={state.enableZdr}
                disabled={state.isSaving}
                onChange={(e) => onEdit('enableZdr', e.target.checked)}
              />
              <span className={styles.label}>{t('enableZdr')}</span>
            </label>
            <p className={styles.hint}>{t('enableZdrHint')}</p>
          </div>

          {/* Model visibility — searchable, tier-grouped */}
          <div className={styles.field}>
            <div className={styles.head}>
              <span className={styles.label}>{t('hiddenModels')}</span>
              <span className={styles.badges}>
                <span className={styles.badge}>
                  {state.knownModelIds.length - state.hiddenModels.length}/{state.knownModelIds.length}
                </span>
              </span>
            </div>
            <p className={styles.hint}>{t('hiddenModelsHint')}</p>
            <input
              className={styles.modelSearch}
              type="text"
              placeholder={t('modelSearchPlaceholder')}
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            />
            <div className={styles.modelGrid}>
              {state.knownModelIds.length === 0 ? (
                <span className={styles.hint}>{t('hiddenModelsEmpty')}</span>
              ) : filtered.length === 0 ? (
                <span className={styles.hint}>{t('modelSearchNoResults')}</span>
              ) : groups ? (
                groups.map(([tier, ids]) => (
                  <React.Fragment key={tier}>
                    <div className={styles.tierGroup}>{TIER_LABEL[tier] ?? tier}</div>
                    {ids.map((modelId) => {
                      const hidden = state.hiddenModels.includes(modelId)
                      return (
                        <label key={modelId} className={`${styles.modelToggle} ${hidden ? styles.modelToggleHidden : ''}`}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={!hidden}
                            disabled={state.isSaving}
                            onChange={() => onToggleHidden(modelId)}
                          />
                          <span className={styles.modelToggleLabel} title={modelId}>
                            {modelId}
                          </span>
                        </label>
                      )
                    })}
                  </React.Fragment>
                ))
              ) : (
                filtered.map((modelId) => {
                  const hidden = state.hiddenModels.includes(modelId)
                  return (
                    <label key={modelId} className={`${styles.modelToggle} ${hidden ? styles.modelToggleHidden : ''}`}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={!hidden}
                        disabled={state.isSaving}
                        onChange={() => onToggleHidden(modelId)}
                      />
                      <span className={styles.modelToggleLabel} title={modelId}>
                        {modelId}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          <div className={styles.footer}>
            {state.saveError ? (
              <p className={styles.failed} role="status">
                {state.saveError}
              </p>
            ) : null}
            <button type="button" className={styles.discard} disabled={!state.isDirty || state.isSaving} onClick={onDiscard}>
              {t('discard')}
            </button>
            <button type="button" className={styles.save} disabled={blocked} onClick={onSave}>
              {state.isSaving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
