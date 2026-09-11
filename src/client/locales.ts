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
  | 'unsaved'
  | 'saveFailed'
  | 'overridden'
  | 'reset'
  | 'readOnly'
  | 'invalidNumber'
  | 'hiddenModels'
  | 'hiddenModelsHint'
  | 'hiddenModelsEmpty'
  | 'modelSearchPlaceholder'
  | 'modelSearchNoResults'
  // legacy aliases kept for compat
  | 'clearKey'
  | 'configured'
  | 'unconfigured'
  | 'readonly'
  | 'validationError'
  | 'modelVisibility'
  | 'hideModel'
  | 'showModel'
  // usage badge
  | 'usageGo'
  | 'usageGoat'
  | 'usageWindow5h'
  | 'usageWindowWeek'
  | 'usageWindowMonth'
  | 'usageAuto'
  | 'usageAutoOn'
  | 'usageAutoTurnOn'
  | 'usageAutoTurnOff'
  | 'usageAutoSaving'
  | 'usageAutoFailed'
  | 'usageAutoUnknown'
  | 'usageManual'
  | 'usageAutoOff'
  | 'usageAutoNever'
  | 'usageAutoLast'
  | 'usageResets'
  | 'usageHot'
  | 'usageQuota'

export const EN_LOCALES: Record<LocaleKey, string> = {
  title: 'Command Code GOAT',
  description: 'Command Code Provider API — reasoning and coding models.',
  apiKey: 'API key',
  apiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key.',
  apiKeyConfigured: 'A key is configured.',
  apiKeyUnset: 'No key is configured; chat is unavailable until one is.',
  baseURL: 'Endpoint',
  baseURLHint: 'Leave blank to use the provider default.',
  requestTimeout: 'Request timeout (ms)',
  requestTimeoutHint: 'How long to wait for the first response.',
  streamIdleTimeout: 'Stream idle timeout (ms)',
  streamIdleTimeoutHint: 'Max silence between streaming tokens.',
  enableZdr: 'Zero Data Retention (ZDR)',
  enableZdrHint: 'Request ZDR routing where the provider supports it.',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
  hiddenModels: 'Visible models',
  hiddenModelsHint: 'Uncheck to hide from the picker. Hidden models still work in existing sessions.',
  hiddenModelsEmpty: 'No models to configure.',
  modelSearchPlaceholder: 'Filter models…',
  modelSearchNoResults: 'No models match.',
  clearKey: 'Clear Key',
  configured: 'Ready',
  unconfigured: 'Unconfigured',
  readonly: 'Read-only in environment',
  validationError: 'Please fix validation errors before saving',
  modelVisibility: 'Model visibility',
  hideModel: 'Hide',
  showModel: 'Show',
  usageGo: 'Go',
  usageGoat: 'GOAT',
  usageWindow5h: '5h',
  usageWindowWeek: 'week',
  usageWindowMonth: 'month',
  usageAuto: 'Auto-switch',
  usageAutoOn: 'Auto-switch on',
  usageAutoTurnOn: 'Turn automatic switching on',
  usageAutoTurnOff: 'Turn automatic switching off',
  usageAutoSaving: 'Saving…',
  usageAutoFailed: 'Could not save the setting',
  usageAutoUnknown: 'Unavailable in this deployment',
  usageManual: 'Manual',
  usageAutoOff: 'Auto-switch off',
  usageAutoNever: 'No switch has fired yet',
  usageAutoLast: 'Last switch',
  usageResets: 'resets',
  usageHot: 'at or over threshold',
  usageQuota: 'Provider quota',
}

export const JA_LOCALES: Record<LocaleKey, string> = {
  title: 'Command Code GOAT',
  description: 'Command Code Provider API — 推論・コーディングモデル。',
  apiKey: 'APIキー',
  apiKeyHint: '設定ファイル外に保存。空欄のままでは現在のキーを保持します。',
  apiKeyConfigured: 'キーが設定されています。',
  apiKeyUnset: 'キーが未設定のためチャットは利用できません。',
  baseURL: 'エンドポイント',
  baseURLHint: '空欄でプロバイダーの既定値を使用。',
  requestTimeout: 'リクエストタイムアウト (ms)',
  requestTimeoutHint: '初回レスポンスまでの最大待機時間。',
  streamIdleTimeout: 'ストリームアイドルタイムアウト (ms)',
  streamIdleTimeoutHint: 'トークン間の無通信の最大時間。',
  enableZdr: 'ゼロデータ保持 (ZDR)',
  enableZdrHint: '対応プロバイダーで ZDR ルーティングを要求します。',
  save: '保存',
  saving: '保存中…',
  discard: '破棄',
  unsaved: '未保存',
  saveFailed: '値が受け入れられませんでした。修正して再保存してください。',
  overridden: '上書き',
  reset: '既定に戻す',
  readOnly: 'このデプロイは設定を読み取り専用で保持しています。',
  invalidNumber: '数値を入力するか、空欄で既定値を使用してください。',
  hiddenModels: '表示モデル',
  hiddenModelsHint: 'チェックを外すとピッカーに表示されません。既存セッションは維持されます。',
  hiddenModelsEmpty: '設定可能なモデルがありません。',
  modelSearchPlaceholder: 'モデルを絞り込む…',
  modelSearchNoResults: '一致するモデルがありません。',
  clearKey: 'キーをクリア',
  configured: '利用可能',
  unconfigured: '未設定',
  readonly: '環境変数により読み取り専用',
  validationError: '入力エラーを修正してから保存してください',
  modelVisibility: 'モデルの表示',
  hideModel: '非表示',
  showModel: '表示',
  usageGo: 'Go',
  usageGoat: 'GOAT',
  usageWindow5h: '5h',
  usageWindowWeek: '週',
  usageWindowMonth: '月',
  usageAuto: '自動切替',
  usageAutoOn: '自動切替オン',
  usageAutoTurnOn: '自動切替をオンにする',
  usageAutoTurnOff: '自動切替をオフにする',
  usageAutoSaving: '保存中…',
  usageAutoFailed: '設定を保存できませんでした',
  usageAutoUnknown: 'この構成では利用できません',
  usageManual: '手動',
  usageAutoOff: '自動切替オフ',
  usageAutoNever: 'まだ切り替わっていません',
  usageAutoLast: '前回の切替',
  usageResets: 'リセット',
  usageHot: 'しきい値以上',
  usageQuota: 'プロバイダー残量',
}

export function getLocaleText(lang: string = 'en'): (key: LocaleKey) => string {
  const dict = lang.startsWith('ja') ? JA_LOCALES : EN_LOCALES
  return (key: LocaleKey) => dict[key] ?? EN_LOCALES[key] ?? key
}
