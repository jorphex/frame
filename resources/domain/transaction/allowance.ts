import { MAX_UINT256 } from './quantity'

const APPROVE_SELECTOR = '095ea7b3'
const ALLOWANCE_SELECTOR = 'dd62ed3e'
const ABI_WORD_HEX_LENGTH = 64
const ABI_ADDRESS_PADDING = '0'.repeat(24)
const ABI_CALL = new RegExp(`^0x[0-9a-fA-F]{${8 + ABI_WORD_HEX_LENGTH * 2}}$`)
const ABI_UINT256_RESULT = /^0x[0-9a-fA-F]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export interface Erc20ApprovalIntent {
  spender: string
  amount: string
}

function normalizeAddress(value: unknown) {
  return typeof value === 'string' && ADDRESS.test(value) ? value.toLowerCase() : undefined
}

function encodeAddressWord(address: string) {
  return `${ABI_ADDRESS_PADDING}${address.slice(2)}`
}

export function parseErc20ApprovalIntent(calldata: unknown): Erc20ApprovalIntent | undefined {
  if (typeof calldata !== 'string' || !ABI_CALL.test(calldata)) return

  const encoded = calldata.slice(2).toLowerCase()
  if (encoded.slice(0, 8) !== APPROVE_SELECTOR) return

  const addressWord = encoded.slice(8, 8 + ABI_WORD_HEX_LENGTH)
  if (!addressWord.startsWith(ABI_ADDRESS_PADDING)) return

  return {
    spender: `0x${addressWord.slice(ABI_ADDRESS_PADDING.length)}`,
    amount: BigInt(`0x${encoded.slice(8 + ABI_WORD_HEX_LENGTH)}`).toString(10)
  }
}

export function buildErc20AllowanceCalldata(owner: unknown, spender: unknown) {
  const normalizedOwner = normalizeAddress(owner)
  const normalizedSpender = normalizeAddress(spender)
  if (!normalizedOwner || !normalizedSpender) return

  return `0x${ALLOWANCE_SELECTOR}${encodeAddressWord(normalizedOwner)}${encodeAddressWord(normalizedSpender)}`
}

export function parseErc20AllowanceResult(result: unknown) {
  if (typeof result !== 'string' || !ABI_UINT256_RESULT.test(result)) return

  const amount = BigInt(result)
  return amount <= MAX_UINT256 ? amount.toString(10) : undefined
}
