import type { Chain } from '../chains'

interface WalletCallEvidenceConnection {
  send(payload: JSONRPCRequestPayload, callback: RPCRequestCallback, targetChain: Chain): void
}

interface WalletCallEvidenceRPCOptions {
  timeoutMs?: number
  schedule?: typeof setTimeout
  cancel?: typeof clearTimeout
}

const DEFAULT_RPC_TIMEOUT_MS = 15_000
const CHAIN_ID = /^0x(?:0|[1-9a-f][0-9a-f]*)$/
const HASH = /^0x[0-9a-f]{64}$/

function rpcError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return new Error(error.message)
  }
  return new Error('Wallet-call evidence RPC failed')
}

export function createWalletCallEvidenceRPC(
  connection: WalletCallEvidenceConnection,
  options: WalletCallEvidenceRPCOptions = {}
) {
  if (
    !connection ||
    typeof connection.send !== 'function' ||
    (options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) ||
    (options.schedule !== undefined && typeof options.schedule !== 'function') ||
    (options.cancel !== undefined && typeof options.cancel !== 'function')
  ) {
    throw new Error('Invalid wallet-call evidence RPC dependencies')
  }

  const send = connection.send.bind(connection)
  const timeoutMs = options.timeoutMs || DEFAULT_RPC_TIMEOUT_MS
  const schedule = options.schedule || setTimeout
  const cancel = options.cancel || clearTimeout
  let requestId = 0

  const request = (chainId: string, method: string, hash: string) => {
    if (!CHAIN_ID.test(chainId)) {
      return Promise.reject(new Error('Invalid wallet-call evidence chain id'))
    }
    if (!HASH.test(hash)) {
      return Promise.reject(new Error('Invalid wallet-call evidence transaction hash'))
    }

    let numericChainId: number
    try {
      numericChainId = Number(BigInt(chainId))
    } catch (_) {
      return Promise.reject(new Error('Invalid wallet-call evidence chain id'))
    }
    if (!Number.isSafeInteger(numericChainId) || numericChainId < 1) {
      return Promise.reject(new Error('Unsupported wallet-call evidence chain id'))
    }

    requestId = (requestId % Number.MAX_SAFE_INTEGER) + 1
    const payload: JSONRPCRequestPayload = { id: requestId, jsonrpc: '2.0', method, params: [hash] }
    const targetChain = Object.freeze({ type: 'ethereum' as const, id: numericChainId })

    return new Promise<unknown>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error, result?: unknown) => {
        if (settled) return
        settled = true
        cancel(timer)
        if (error) reject(error)
        else resolve(result)
      }
      const timer = schedule(() => finish(new Error(`Wallet-call evidence ${method} timed out`)), timeoutMs)
      timer.unref?.()

      try {
        send(
          payload,
          (response) => {
            if (
              !response ||
              typeof response !== 'object' ||
              Array.isArray(response) ||
              response.id !== payload.id ||
              response.jsonrpc !== payload.jsonrpc
            ) {
              return finish(new Error('Wallet-call evidence RPC returned a malformed response'))
            }
            if (response.error) return finish(rpcError(response.error))
            if (!Object.prototype.hasOwnProperty.call(response, 'result')) {
              return finish(new Error('Wallet-call evidence RPC returned no result'))
            }
            finish(undefined, response.result)
          },
          targetChain
        )
      } catch (error) {
        finish(rpcError(error))
      }
    })
  }

  return Object.freeze({
    getTransactionReceipt: (chainId: string, hash: string) =>
      request(chainId, 'eth_getTransactionReceipt', hash),
    getTransaction: (chainId: string, hash: string) => request(chainId, 'eth_getTransactionByHash', hash)
  })
}
