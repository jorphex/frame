import type { Chain } from '../chains'
import type { TransactionData } from '../../resources/domain/transaction'
import { parseRpcQuantity } from '../../resources/domain/transaction/quantity'
import { parseSimulationEffects } from './effects'
import type { SimulationEffect } from './effects'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_ERROR_MESSAGE_LENGTH = 240
const MAX_RETURN_DATA_BYTES = 128 * 1024
const MAX_UINT64 = (1n << 64n) - 1n

type SimulationSource = 'eth_simulateV1' | 'eth_call'
type SimulationStatus = 'pending' | 'succeeded' | 'reverted' | 'unavailable' | 'failed'

export interface TransactionSimulation {
  status: SimulationStatus
  source?: SimulationSource
  gasUsed?: string
  reason?: string
  effects?: SimulationEffect[]
  effectsTruncated?: boolean
}

type ChainSend = (payload: JSONRPCRequestPayload, callback: RPCRequestCallback, targetChain: Chain) => void

interface SimulationDependencies {
  send: ChainSend
  timeoutMs?: number
}

type RpcOutcome = { response: RPCResponsePayload } | { timedOut: true }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedMessage(value: unknown, fallback: string) {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback
  return value.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

function isData(value: unknown) {
  return (
    typeof value === 'string' &&
    value.length <= MAX_RETURN_DATA_BYTES * 2 + 2 &&
    /^0x(?:[0-9a-fA-F]{2})*$/.test(value)
  )
}

function parseGasUsed(value: unknown) {
  const gasUsed = parseRpcQuantity(value)
  return gasUsed !== undefined && gasUsed <= MAX_UINT64 ? (value as string) : undefined
}

function errorResult(source: SimulationSource, error: EVMError): TransactionSimulation {
  const reason = boundedMessage(error.message, 'RPC execution check failed')

  if (error.code === 3 || /^execution reverted\b/i.test(reason)) {
    return { status: 'reverted', source, reason }
  }

  return { status: 'failed', source, reason }
}

function isUnsupportedMethod(error: EVMError) {
  return error.code === -32601 || error.code === -32004
}

function normalizeRpcError(value: unknown): EVMError | undefined {
  if (!isRecord(value) || typeof value.message !== 'string') return

  return {
    message: value.message,
    code: typeof value.code === 'number' ? value.code : undefined,
    data: value.data
  }
}

function requestRpc(
  send: ChainSend,
  payload: JSONRPCRequestPayload,
  targetChain: Chain,
  timeoutMs: number
): Promise<RpcOutcome> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (outcome: RpcOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(outcome)
    }
    const timer = setTimeout(() => finish({ timedOut: true }), timeoutMs)

    try {
      send(payload, (response) => finish({ response }), targetChain)
    } catch (error) {
      finish({
        response: {
          id: payload.id,
          jsonrpc: payload.jsonrpc,
          error: { message: error instanceof Error ? error.message : 'RPC execution check failed' }
        }
      })
    }
  })
}

function copyCallField(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) target[key] = value
}

export function buildSimulationCall(transaction: TransactionData) {
  const call: Record<string, unknown> = {}

  copyCallField(call, 'type', transaction.type)
  copyCallField(call, 'nonce', transaction.nonce)
  copyCallField(call, 'from', transaction.from)
  copyCallField(call, 'to', transaction.to)
  copyCallField(call, 'gas', transaction.gasLimit || transaction.gas)
  copyCallField(call, 'value', transaction.value)
  copyCallField(call, 'input', transaction.data)
  copyCallField(call, 'gasPrice', transaction.gasPrice)
  copyCallField(call, 'maxPriorityFeePerGas', transaction.maxPriorityFeePerGas)
  copyCallField(call, 'maxFeePerGas', transaction.maxFeePerGas)
  copyCallField(call, 'accessList', transaction.accessList)

  return call
}

export function buildEthCall(transaction: TransactionData) {
  const call = buildSimulationCall(transaction)
  const { input, nonce: _nonce, type: _type, ...ethCall } = call

  if (input !== undefined) ethCall.data = input
  return ethCall
}

export function parseSimulateResult(result: unknown): TransactionSimulation | undefined {
  if (!Array.isArray(result) || result.length !== 1 || !isRecord(result[0])) return

  const calls = result[0].calls
  if (!Array.isArray(calls) || calls.length !== 1 || !isRecord(calls[0])) return

  const call = calls[0]
  const gasUsed = parseGasUsed(call.gasUsed)
  if (!gasUsed || !isData(call.returnData)) return

  if (call.status === '0x1') {
    if (!Array.isArray(call.logs)) return
    const { effects, truncated } = parseSimulationEffects(call.logs)
    return {
      status: 'succeeded',
      source: 'eth_simulateV1',
      gasUsed,
      ...(effects.length ? { effects } : {}),
      ...(truncated ? { effectsTruncated: true } : {})
    }
  }

  if (call.status === '0x0' && isRecord(call.error)) {
    const code = call.error.code
    if (code !== 3 && code !== -32015) return

    return {
      status: 'reverted',
      source: 'eth_simulateV1',
      gasUsed,
      reason: boundedMessage(call.error.message, 'Execution reverted')
    }
  }
}

export async function simulateTransaction(
  transaction: TransactionData,
  dependencies: SimulationDependencies
): Promise<TransactionSimulation> {
  const { send } = dependencies
  const configuredTimeout = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? Math.min(configuredTimeout, DEFAULT_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()
  const chainId = parseRpcQuantity(transaction.chainId)

  if (chainId === undefined || chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { status: 'failed', reason: 'Transaction has an invalid chain ID' }
  }

  const targetChain: Chain = { type: 'ethereum', id: Number(chainId) }
  const simulatePayload: JSONRPCRequestPayload = {
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_simulateV1',
    params: [
      {
        blockStateCalls: [{ calls: [buildSimulationCall(transaction)] }],
        validation: false
      },
      'latest'
    ]
  }

  const simulateOutcome = await requestRpc(send, simulatePayload, targetChain, timeoutMs)
  if ('timedOut' in simulateOutcome) {
    return { status: 'failed', source: 'eth_simulateV1', reason: 'RPC execution check timed out' }
  }

  const simulateResponse = simulateOutcome.response
  if (!isRecord(simulateResponse)) {
    return { status: 'failed', source: 'eth_simulateV1', reason: 'RPC returned an invalid response' }
  }

  if (simulateResponse.error === undefined) {
    return (
      parseSimulateResult(simulateResponse.result) || {
        status: 'failed',
        source: 'eth_simulateV1',
        reason: 'RPC returned an invalid simulation result'
      }
    )
  }

  const simulateError = normalizeRpcError(simulateResponse.error)
  if (!simulateError) {
    return { status: 'failed', source: 'eth_simulateV1', reason: 'RPC returned an invalid error' }
  }

  if (!isUnsupportedMethod(simulateError)) {
    return errorResult('eth_simulateV1', simulateError)
  }

  const callPayload: JSONRPCRequestPayload = {
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [buildEthCall(transaction), 'latest']
  }
  const remainingTimeout = Math.max(1, timeoutMs - (Date.now() - startedAt))
  const callOutcome = await requestRpc(send, callPayload, targetChain, remainingTimeout)

  if ('timedOut' in callOutcome) {
    return { status: 'failed', source: 'eth_call', reason: 'RPC execution check timed out' }
  }

  const callResponse = callOutcome.response
  if (!isRecord(callResponse)) {
    return { status: 'failed', source: 'eth_call', reason: 'RPC returned an invalid response' }
  }

  if (callResponse.error !== undefined) {
    const callError = normalizeRpcError(callResponse.error)
    if (!callError) {
      return { status: 'failed', source: 'eth_call', reason: 'RPC returned an invalid error' }
    }

    return isUnsupportedMethod(callError)
      ? { status: 'unavailable', source: 'eth_call', reason: 'RPC execution check is unsupported' }
      : errorResult('eth_call', callError)
  }

  return isData(callResponse.result)
    ? { status: 'succeeded', source: 'eth_call' }
    : { status: 'failed', source: 'eth_call', reason: 'RPC returned an invalid call result' }
}
