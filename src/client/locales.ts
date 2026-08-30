export type LocaleKey =
  | 'title'
  | 'description'
  | 'apiKey'
  | 'apiKeyHint'
  | 'apiKeyConfigured'
  | 'apiKeyUnset'
  | 'baseURL'
  | 'baseURLHint'
  | 'requestTimeout'
  | 'requestTimeoutHint'
  | 'streamIdleTimeout'
  | 'streamIdleTimeoutHint'
  | 'enableZdr'
  | 'enableZdrHint'
  | 'save'
  | 'saving'
  | 'discard'
  | 'clearKey'
  | 'configured'
  | 'unconfigured'
  | 'readonly'
  | 'validationError'

export const EN_LOCALES: Record<LocaleKey, string> = {
  title: 'Command Code GOAT',
  description: 'Connect to Command Code Provider API for bleeding-edge reasoning and coding models.',
  apiKey: 'API Key',
  apiKeyHint: 'Write-only credential stored securely in DSH. Never logged or exposed.',
  apiKeyConfigured: 'Configured',
  apiKeyUnset: 'Not configured',
  baseURL: 'Base URL',
  baseURLHint: 'Command Code API base URL (default: https://api.commandcode.ai).',
  requestTimeout: 'Request Timeout (ms)',
  requestTimeoutHint: 'Maximum wait time for initial response (default: 60000).',
  streamIdleTimeout: 'Stream Idle Timeout (ms)',
  streamIdleTimeoutHint: 'Maximum silence between streaming tokens (default: 300000).',
  enableZdr: 'Zero Data Retention (ZDR)',
  enableZdrHint: 'Request zero-data-retention routing where supported by Command Code.',
  save: 'Save Changes',
  saving: 'Saving...',
  discard: 'Discard',
  clearKey: 'Clear Key',
  configured: 'Ready',
  unconfigured: 'Unconfigured',
  readonly: 'Read-only in environment',
  validationError: 'Please fix validation errors before saving',
}

export const JA_LOCALES: Record<LocaleKey, string> = {
  title: 'Command Code GOAT',
  description: 'Command Code Provider API 経由で最新の推論・コーディングモデルを利用します。',
  apiKey: 'APIキー',
  apiKeyHint: 'DSH 資格情報ストアに安全に保存される書き込み専用キー。ログや画面に露出しません。',
  apiKeyConfigured: '設定済み',
  apiKeyUnset: '未設定',
  baseURL: 'ベースURL',
  baseURLHint: 'Command Code API のベースURL（デフォルト: https://api.commandcode.ai）。',
  requestTimeout: 'リクエストタイムアウト (ms)',
  requestTimeoutHint: '初回レスポンスの最大待機時間（デフォルト: 60000）。',
  streamIdleTimeout: 'ストリームアイドルタイムアウト (ms)',
  streamIdleTimeoutHint: 'トークン間の無通信最大時間（デフォルト: 300000）。',
  enableZdr: 'ゼロデータ保持 (ZDR)',
  enableZdrHint: 'Command Code 側で対応している場合に Zero Data Retention を要求します。',
  save: '変更を保存',
  saving: '保存中...',
  discard: '破棄',
  clearKey: 'キーをクリア',
  configured: '利用可能',
  unconfigured: '未設定',
  readonly: '環境変数による読み取り専用',
  validationError: '入力エラーを修正してから保存してください',
}

export function getLocaleText(lang: string = 'en'): (key: LocaleKey) => string {
  const dict = lang.startsWith('ja') ? JA_LOCALES : EN_LOCALES
  return (key: LocaleKey) => dict[key] ?? EN_LOCALES[key] ?? key
}
