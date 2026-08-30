import {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmError,
  QUOTA_EXCEEDED_CODE,
} from '@deepseek-ai/dsh-llm'

export const MAX_ERROR_BODY_BYTES = 65536

export function redactSensitive(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(?:api[_-]?key|secret|token)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{8,}["']?/gi, '$1: [REDACTED]')
}

export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined
  const trimmed = headerValue.trim()
  if (!trimmed) return undefined

  const asSeconds = Number(trimmed)
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.min(Math.floor(asSeconds * 1000), 3600000) // cap at 1 hour
  }

  const asDate = Date.parse(trimmed)
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now()
    if (diff > 0) {
      return Math.min(diff, 3600000)
    }
  }

  return undefined
}

export function mapProviderError(
  status: number,
  rawBody: string,
  headers?: Headers,
): LlmError {
  const cappedBody = rawBody.slice(0, MAX_ERROR_BODY_BYTES)
  let parsedMessage: string | undefined
  let parsedCode: string | undefined

  try {
    const json = JSON.parse(cappedBody)
    if (json && typeof json === 'object') {
      if (typeof json.error === 'string') {
        parsedMessage = json.error
      } else if (json.error && typeof json.error === 'object') {
        parsedMessage = typeof json.error.message === 'string' ? json.error.message : undefined
        parsedCode = typeof json.error.code === 'string' ? json.error.code : undefined
      } else if (typeof json.message === 'string') {
        parsedMessage = json.message
      }
    }
  } catch {
    // not JSON
  }

  const messageText = parsedMessage ?? cappedBody.trim() ?? `HTTP ${status}`
  const sanitizedMessage = redactSensitive(messageText)
  const fullDetail = `${parsedCode ?? ''} ${sanitizedMessage}`

  let errorCode = 'INVALID_REQUEST'
  const retryAfterMs = parseRetryAfter(headers?.get('retry-after'))

  if (isContextWindowExceededError(fullDetail)) {
    errorCode = CONTEXT_WINDOW_EXCEEDED_CODE
  } else if (isQuotaExceededError(fullDetail)) {
    errorCode = QUOTA_EXCEEDED_CODE
  } else if (status === 401) {
    errorCode = 'AUTH'
  } else if (status === 403) {
    if (parsedCode === 'upgrade_required' || /upgrade_required|goat/i.test(fullDetail)) {
      errorCode = 'PLAN_REQUIRED'
    } else {
      errorCode = 'AUTH'
    }
  } else if (status === 422) {
    if (parsedCode === 'cmd_zdr_no_providers' || /cmd_zdr_no_providers|zdr/i.test(fullDetail)) {
      errorCode = 'ZDR_UNSUPPORTED'
    } else {
      errorCode = 'INVALID_REQUEST'
    }
  } else if (status === 429) {
    errorCode = 'RATE_LIMIT'
  } else if (status >= 500 && status <= 599) {
    errorCode = 'SERVER'
  }

  const validStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined

  return new LlmError(
    sanitizedMessage.length > 0 ? sanitizedMessage : `Provider returned HTTP ${status}`,
    errorCode,
    {
      status: validStatus,
      ...(retryAfterMs ? { providerRetryAfterMs: retryAfterMs } : {}),
    },
  )
}
