import React from 'react'
import type { LocaleKey } from './locales.ts'
import type { CardState } from './card-controller.ts'
import styles from './CommandCodeCard.module.css'

export interface CommandCodeCardProps {
  t: (key: LocaleKey) => string
  state: CardState
  onEdit: <K extends keyof CardState>(field: K, value: CardState[K]) => void
  onSave: () => void
  onDiscard: () => void
}

export function CommandCodeCard({
  t,
  state,
  onEdit,
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
            className={styles.input}
            value={state.baseURL}
            disabled={state.isSaving}
            onChange={(e) => onEdit('baseURL', e.target.value)}
          />
          <span className={styles.hint}>{t('baseURLHint')}</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="cmd-req-timeout" className={styles.label}>
            {t('requestTimeout')}
          </label>
          <input
            id="cmd-req-timeout"
            type="number"
            className={styles.input}
            value={state.requestTimeoutMs}
            disabled={state.isSaving}
            onChange={(e) => onEdit('requestTimeoutMs', Number(e.target.value))}
          />
          <span className={styles.hint}>{t('requestTimeoutHint')}</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="cmd-stream-timeout" className={styles.label}>
            {t('streamIdleTimeout')}
          </label>
          <input
            id="cmd-stream-timeout"
            type="number"
            className={styles.input}
            value={state.streamIdleTimeoutMs}
            disabled={state.isSaving}
            onChange={(e) => onEdit('streamIdleTimeoutMs', Number(e.target.value))}
          />
          <span className={styles.hint}>{t('streamIdleTimeoutHint')}</span>
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
          disabled={!state.isDirty || state.isSaving}
          onClick={onSave}
        >
          {state.isSaving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  )
}
