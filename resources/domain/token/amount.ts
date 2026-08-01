import { MAX_UINT256 } from '../transaction/quantity'

export const MAX_TOKEN_DECIMALS = 255
export const MAX_TOKEN_AMOUNT_INPUT_LENGTH = 512
const DECIMAL_INTEGER = /^(?:0|[1-9][0-9]*)$/
const HEX_INTEGER = /^0x[0-9a-fA-F]+$/
const TOKEN_DECIMAL = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/

export function parseTokenBaseUnitAmount(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TOKEN_AMOUNT_INPUT_LENGTH) {
    return
  }
  if (!DECIMAL_INTEGER.test(value) && !HEX_INTEGER.test(value)) return

  try {
    const amount = BigInt(value)
    return amount <= MAX_UINT256 ? amount : undefined
  } catch {
    return
  }
}

export function parseTokenDecimalAmount(value: unknown, decimals: unknown): bigint | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TOKEN_AMOUNT_INPUT_LENGTH ||
    !Number.isInteger(decimals) ||
    (decimals as number) < 0 ||
    (decimals as number) > MAX_TOKEN_DECIMALS ||
    !TOKEN_DECIMAL.test(value)
  ) {
    return
  }

  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length > (decimals as number)) return

  const baseUnits = `${whole || '0'}${fraction.padEnd(decimals as number, '0')}`.replace(/^0+(?=[0-9])/, '')
  return parseTokenBaseUnitAmount(baseUnits)
}

export function formatTokenBaseUnitAmount(value: unknown, decimals: unknown): string | undefined {
  const amount = parseTokenBaseUnitAmount(value)
  if (
    amount === undefined ||
    !Number.isInteger(decimals) ||
    (decimals as number) < 0 ||
    (decimals as number) > MAX_TOKEN_DECIMALS
  ) {
    return
  }

  if (decimals === 0) return amount.toString(10)

  const padded = amount.toString(10).padStart((decimals as number) + 1, '0')
  const whole = padded.slice(0, -(decimals as number))
  const fraction = padded.slice(-(decimals as number)).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}
