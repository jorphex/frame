const RPC_TRANSPORTS: Record<string, string> = {
  'http:': 'http',
  'https:': 'https',
  'ws:': 'ws',
  'wss:': 'wss'
}

export function summarizeRpcEndpoint(target: unknown) {
  if (typeof target !== 'string' || target.trim() === '') return { configured: false }

  try {
    const transport = RPC_TRANSPORTS[new URL(target).protocol]
    return transport ? { configured: true, transport } : { configured: true, transport: 'other' }
  } catch {
    return { configured: true, transport: 'other' }
  }
}

export function summarizeRpcError(error: unknown) {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' }

  const candidate = error as { name?: unknown; code?: unknown }
  const name =
    typeof candidate.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(candidate.name)
      ? candidate.name
      : 'Error'
  const code =
    typeof candidate.code === 'string' && /^[A-Z][A-Z0-9_-]{0,63}$/.test(candidate.code)
      ? candidate.code
      : undefined

  return code ? { name, code } : { name }
}
