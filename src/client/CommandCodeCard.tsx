import React from 'react'
import type { LocaleKey } from './locales.ts'
import type { CardState } from './card-controller.ts'
import styles from './CommandCodeCard.module.css'

export interface CommandCodeCardProps {
  t: (key: LocaleKey) => string
  state: CardState
  onEdit: <K extends keyof CardState>(field: K, value: CardState[K]) => void
  onEditNumeric: (field: 'requestTimeoutMs' | 'streamIdleTimeoutMs', raw: string) => void
  onSave: () => void
  onDiscard: () => void
}

export function CommandCodeCard({
  t,
  state,
  onEdit,
  onEditNumeric,
  onSave,
  onDiscard,
}: CommandCodeCardProps): React.JSX.Element {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h3 className={styles.title}>{t('title')}</h3>
          <p className={styles.description}>{t('description')}</p>
        </div>
        <span
          className={`${styles.badge} ${
            state.apiKeyConfigured ? styles.badgeSuccess : styles.badgeNeutral
          }`}
        >
          {state.apiKeyConfigured ? t('apiKeyConfigured') : t('apiKeyUnset')}
        </span>
      </div>

      {state.saveError && (
        <div className={styles.errorBanner} role="alert">
          {state.saveError}
        </div>
      )}

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor="cmd-api-key" className={styles.label}>
            {t('apiKey')}
          </label>
          <input
            id="cmd-api-key"
            type="password"
            className={styles.input}
            placeholder={state.apiKeyConfigured ? '••••••••••••••••' : ''}
            value={state.apiKey}
            disabled={!state.apiKeyWritable || state.isSaving}
            onChange={(e) => onEdit('apiKey', e.target.value)}
          />
          <span className={styles.hint}>{t('apiKeyHint')}</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="cmd-base-url" className={styles.label}>
            {t('baseURL')}
          </label>
          <input
            id="cmd-base-url"
            type="text"
            className={`${styles.input} ${state.fieldErrors.baseURL ? styles.inputError : ''}`}
            value={state.baseURL}
            disabled={state.isSaving}
            aria-invalid={Boolean(state.fieldErrors.baseURL)}
            onChange={(e) => onEdit('baseURL', e.target.value)}
          />
          {state.fieldErrors.baseURL ? (
            <span className={styles.fieldError} role="alert">{state.fieldErrors.baseURL}</span>
          ) : (
            <span className={styles.hint}>{t('baseURLHint')}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="cmd-req-timeout" className={styles.label}>
            {t('requestTimeout')}
          </label>
          <input
            id="cmd-req-timeout"
            type="number"
            className={`${styles.input} ${state.fieldErrors.requestTimeoutMs ? styles.inputError : ''}`}
            value={Number.isFinite(state.requestTimeoutMs) ? state.requestTimeoutMs : ''}
            disabled={state.isSaving}
            aria-invalid={Boolean(state.fieldErrors.requestTimeoutMs)}
            onChange={(e) => onEditNumeric('requestTimeoutMs', e.target.value)}
          />
          {state.fieldErrors.requestTimeoutMs ? (
            <span className={styles.fieldError} role="alert">{state.fieldErrors.requestTimeoutMs}</span>
          ) : (
            <span className={styles.hint}>{t('requestTimeoutHint')}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="cmd-stream-timeout" className={styles.label}>
            {t('streamIdleTimeout')}
          </label>
          <input
            id="cmd-stream-timeout"
            type="number"
            className={`${styles.input} ${state.fieldErrors.streamIdleTimeoutMs ? styles.inputError : ''}`}
            value={Number.isFinite(state.streamIdleTimeoutMs) ? state.streamIdleTimeoutMs : ''}
            disabled={state.isSaving}
            aria-invalid={Boolean(state.fieldErrors.streamIdleTimeoutMs)}
            onChange={(e) => onEditNumeric('streamIdleTimeoutMs', e.target.value)}
          />
          {state.fieldErrors.streamIdleTimeoutMs ? (
            <span className={styles.fieldError} role="alert">{state.fieldErrors.streamIdleTimeoutMs}</span>
          ) : (
            <span className={styles.hint}>{t('streamIdleTimeoutHint')}</span>
          )}
        </div>

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
          <span className={styles.hint}>{t('enableZdrHint')}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSecondary}`}
          disabled={!state.isDirty || state.isSaving}
          onClick={onDiscard}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={!state.isDirty || state.isSaving || Object.keys(state.fieldErrors).length > 0}
          onClick={onSave}
        >
          {state.isSaving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  )
}
