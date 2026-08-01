export const MAX_UINT256 = (1n << 256n) - 1n

const quantityPattern = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/

export function parseRpcQuantity(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || value.length > 66 || !quantityPattern.test(value)) return

  const quantity = BigInt(value)
  return quantity <= MAX_UINT256 ? quantity : undefined
}

export function toRpcQuantity(value: bigint): string {
  if (value < 0n || value > MAX_UINT256) throw new Error('RPC quantity exceeds uint256')
  return `0x${value.toString(16)}`
}
