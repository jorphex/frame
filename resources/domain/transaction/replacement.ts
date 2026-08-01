import { parseRpcQuantity } from './quantity'

interface ReplacementData {
  nonce?: unknown
  gasPrice?: unknown
  maxFeePerGas?: unknown
  maxPriorityFeePerGas?: unknown
}

interface ReplacementRequest {
  mode?: string
  status?: string
  data?: ReplacementData
}

export type ReplacementStatus = {
  replacement: boolean
  possible: boolean
  reason?: 'nonce-used' | 'gas-price-too-low' | 'gas-fees-too-low'
}

export const increaseByTenPercent = (value: bigint) => (value * 11n + 9n) / 10n

export function minimumReplacementFee(value: bigint) {
  const increased = increaseByTenPercent(value)
  return increased > value ? increased : value + 1n
}

export const requiresReplacementFeeBump = (current: bigint, requested: bigint) =>
  current * 11n >= requested * 10n

export function maximumRpcQuantity<T>(values: readonly T[], getValue: (value: T) => unknown) {
  return values.reduce<bigint | undefined>((maximum, value) => {
    const quantity = parseRpcQuantity(getValue(value))
    if (quantity === undefined) return maximum
    return maximum === undefined || quantity > maximum ? quantity : maximum
  }, undefined)
}

export function getReplacementStatus(
  request: ReplacementRequest,
  requests: readonly ReplacementRequest[]
): ReplacementStatus {
  const status: ReplacementStatus = { replacement: false, possible: true }
  const nonce = request.data?.nonce
  if (request.mode === 'monitor' || !nonce) return status

  const existing = requests.filter(
    (candidate) =>
      candidate.mode === 'monitor' && candidate.status !== 'error' && candidate.data?.nonce === nonce
  )
  if (existing.length === 0) return status

  status.replacement = true
  if (existing.some((candidate) => candidate.status === 'confirming' || candidate.status === 'confirmed')) {
    return { replacement: true, possible: false, reason: 'nonce-used' }
  }

  if (request.data?.maxPriorityFeePerGas && request.data?.maxFeePerGas) {
    const requestedPriority = parseRpcQuantity(request.data.maxPriorityFeePerGas)
    const requestedMax = parseRpcQuantity(request.data.maxFeePerGas)
    if (requestedPriority === undefined || requestedMax === undefined || requestedMax < requestedPriority) {
      return status
    }

    const existingPriority = maximumRpcQuantity(existing, (candidate) => candidate.data?.maxPriorityFeePerGas)
    const existingMax = maximumRpcQuantity(existing, (candidate) => candidate.data?.maxFeePerGas)
    if (
      existingPriority !== undefined &&
      existingMax !== undefined &&
      existingMax >= existingPriority &&
      (requiresReplacementFeeBump(existingPriority, requestedPriority) ||
        requiresReplacementFeeBump(existingMax, requestedMax))
    ) {
      return { replacement: true, possible: false, reason: 'gas-fees-too-low' }
    }

    return status
  }

  const requestedPrice = parseRpcQuantity(request.data?.gasPrice)
  const existingPrice = maximumRpcQuantity(existing, (candidate) => candidate.data?.gasPrice)
  if (
    requestedPrice !== undefined &&
    existingPrice !== undefined &&
    requiresReplacementFeeBump(existingPrice, requestedPrice)
  ) {
    return { replacement: true, possible: false, reason: 'gas-price-too-low' }
  }

  return status
}
