import { getAddress, isAddress } from 'ethers'

import type { Chain } from '../chains'
import { parseAccountCode } from '../../resources/domain/account/code'

interface AccountCodeConnection {
  send(payload: JSONRPCRequestPayload, callback: RPCRequestCallback, targetChain: Chain): void
}

interface AccountCodeReaderOptions {
  timeoutMs?: number
  schedule?: typeof setTimeout
  cancel?: typeof clearTimeout
}

export type AccountCodeClassification = Readonly<{
  status: 'no-code' | 'delegated' | 'contract' | 'unavailable'
  source: 'eth_getCode'
  account: string
  chainId: number
  delegate?: string
  reason?: string
}>

const DEFAULT_TIMEOUT_MS = 8_000
const MAX_ERROR_MESSAGE_LENGTH = 240
const REQUEST_ID_BASE = 8_000_000_000_000_000
const REQUEST_ID_RANGE = 1_000_000

function boundedMessage(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  return value.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

function rpcErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('message' in value)) {
    return 'Account code lookup failed'
  }
  return boundedMessage(value.message, 'Account code lookup failed')
}

export function createAccountCodeReader(
  connection: AccountCodeConnection,
  options: AccountCodeReaderOptions = {}
) {
  if (
    !connection ||
    typeof connection.send !== 'function' ||
    (options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) ||
    (options.schedule !== undefined && typeof options.schedule !== 'function') ||
    (options.cancel !== undefined && typeof options.cancel !== 'function')
  ) {
    throw new Error('Invalid account code reader dependencies')
  }

  const send = connection.send.bind(connection)
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const schedule = options.schedule || setTimeout
  const cancel = options.cancel || clearTimeout
  let requestId = 0

  const read = (address: unknown, chainId: unknown): Promise<AccountCodeClassification> => {
    if (typeof address !== 'string' || !isAddress(address)) {
      return Promise.reject(new Error('Invalid account code address'))
    }
    if (!Number.isSafeInteger(chainId) || (chainId as number) < 1) {
      return Promise.reject(new Error('Invalid account code chain id'))
    }

    const account = getAddress(address).toLowerCase()
    const numericChainId = chainId as number
    const source = 'eth_getCode' as const
    const targetChain = Object.freeze({ type: 'ethereum' as const, id: numericChainId })
    requestId = (requestId % REQUEST_ID_RANGE) + 1
    const payload: JSONRPCRequestPayload = Object.freeze({
      id: REQUEST_ID_BASE + requestId,
      jsonrpc: '2.0',
      method: source,
      params: [account, 'latest']
    })
    const unavailable = (reason: string): AccountCodeClassification =>
      Object.freeze({ status: 'unavailable', source, account, chainId: numericChainId, reason })

    return new Promise((resolve) => {
      let settled = false
      const finish = (result: AccountCodeClassification) => {
        if (settled) return
        settled = true
        cancel(timer)
        resolve(result)
      }
      const timer = schedule(() => finish(unavailable('Account code lookup timed out')), timeoutMs)
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
              return finish(unavailable('RPC returned a malformed account code response'))
            }
            if (response.error !== undefined) return finish(unavailable(rpcErrorMessage(response.error)))

            const parsed = parseAccountCode(response.result)
            if (!parsed) return finish(unavailable('RPC returned invalid account code'))
            if (parsed.status === 'delegated') {
              return finish(
                Object.freeze({
                  status: parsed.status,
                  source,
                  account,
                  chainId: numericChainId,
                  delegate: parsed.delegate
                })
              )
            }
            finish(Object.freeze({ status: parsed.status, source, account, chainId: numericChainId }))
          },
          targetChain
        )
      } catch (error) {
        finish(unavailable(boundedMessage((error as Error)?.message, 'Account code lookup failed')))
      }
    })
  }

  return Object.freeze({ read })
}
