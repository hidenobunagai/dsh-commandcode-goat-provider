import { attributionHeaders } from '@deepseek-ai/dsh-llm'

export function buildUrl(baseURL: string, path: string): string {
  const normalizedBase = baseURL.replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedPath}`
}

export function buildHeaders(
  apiKey?: string,
  enableZdr?: boolean,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...attributionHeaders(),
    'content-type': 'application/json',
    accept: 'text/event-stream',
    ...extraHeaders,
  }

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`
  }

  if (enableZdr) {
    headers['x-cmd-zdr'] = '1'
  }

  return headers
}
