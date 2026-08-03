export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function readJsonWithLimit<T>(response: Response, maxBytes: number): Promise<T> {
  const contentLength = Number(response.headers.get('content-length'))

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel()
    throw new RangeError(`Response exceeds ${maxBytes} bytes`)
  }

  if (!response.body) return JSON.parse(await response.text()) as T

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ''

  try {
    let chunk = await reader.read()
    while (!chunk.done) {
      bytesRead += chunk.value.byteLength
      if (bytesRead > maxBytes) {
        await reader.cancel()
        throw new RangeError(`Response exceeds ${maxBytes} bytes`)
      }

      body += decoder.decode(chunk.value, { stream: true })
      chunk = await reader.read()
    }

    body += decoder.decode()
    return JSON.parse(body) as T
  } finally {
    reader.releaseLock()
  }
}
