export const MAX_REQUEST_BYTES = 1024 * 1024

export interface JsonRpcError {
  code: number
  message: string
}

export interface InvalidPayload {
  success: false
  id: string | number | null
  error: JsonRpcError
}

export interface ValidPayload<T extends JSONRPCRequestPayload> {
  success: true
  payload: T
}

export type PayloadResult<T extends JSONRPCRequestPayload> = ValidPayload<T> | InvalidPayload

const invalidRequest = (id: string | number | null, message = 'Invalid Request'): InvalidPayload => ({
  success: false,
  id,
  error: { code: -32600, message }
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRequestId = (payload: Record<string, unknown>) => {
  const id = payload.id
  return typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)) ? id : null
}

export default function parsePayload<T extends JSONRPCRequestPayload>(data: unknown): PayloadResult<T> {
  if (typeof data !== 'string') return invalidRequest(null)

  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return {
      success: false,
      id: null,
      error: { code: -32700, message: 'Parse error' }
    }
  }

  if (!isObject(parsed)) return invalidRequest(null)

  const id = getRequestId(parsed)
  if (parsed.jsonrpc !== '2.0') return invalidRequest(id)
  if (!('id' in parsed) || id === null) return invalidRequest(null)
  if (typeof parsed.method !== 'string' || !parsed.method.length) return invalidRequest(id)

  const params = parsed.params
  if (params !== undefined && !Array.isArray(params) && !isObject(params)) return invalidRequest(id)

  return {
    success: true,
    payload: { ...parsed, params: params ?? [] } as unknown as T
  }
}
