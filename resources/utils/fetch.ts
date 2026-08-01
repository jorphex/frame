import fetch, { RequestInit } from 'node-fetch'

import type { AbortSignal } from 'node-fetch/externals'

export async function fetchWithTimeout(url: string, options: RequestInit, timeout: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, { ...options, signal: controller.signal as AbortSignal })
  } finally {
    clearTimeout(timer)
  }
}
