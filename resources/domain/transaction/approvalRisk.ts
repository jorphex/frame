import { MAX_UINT256 } from './quantity'

const APPROVE_SELECTOR = '095ea7b3'
const SET_APPROVAL_FOR_ALL_SELECTOR = 'a22cb465'
const ABI_CALL_HEX_LENGTH = 8 + 64 + 64
const ABI_ADDRESS_PADDING = '0'.repeat(24)
const ABI_TRUE = `${'0'.repeat(63)}1`
const MAX_UINT256_HEX = MAX_UINT256.toString(16).padStart(64, '0')
const ABI_CALL = new RegExp(`^0x[0-9a-fA-F]{${ABI_CALL_HEX_LENGTH}}$`)

export type BroadTokenAuthorityIntent = {
  type: 'max-approve' | 'operator-approval'
  delegate: string
}

function sameAddress(left: unknown, right: unknown) {
  return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase()
}

export function parseBroadTokenAuthorityIntent(calldata: unknown): BroadTokenAuthorityIntent | undefined {
  if (typeof calldata !== 'string' || !ABI_CALL.test(calldata)) return

  const encoded = calldata.slice(2).toLowerCase()
  const selector = encoded.slice(0, 8)
  const addressWord = encoded.slice(8, 72)
  const valueWord = encoded.slice(72)
  if (!addressWord.startsWith(ABI_ADDRESS_PADDING)) return

  const delegate = `0x${addressWord.slice(24)}`
  if (selector === APPROVE_SELECTOR && valueWord === MAX_UINT256_HEX) {
    return { type: 'max-approve', delegate }
  }
  if (selector === SET_APPROVAL_FOR_ALL_SELECTOR && valueWord === ABI_TRUE) {
    return { type: 'operator-approval', delegate }
  }
}

export function effectReportsBroadTokenAuthorityIntent(
  intent: BroadTokenAuthorityIntent,
  effect: unknown,
  account: unknown,
  contract: unknown
) {
  if (typeof effect !== 'object' || effect === null || Array.isArray(effect)) return false

  const candidate = effect as Record<string, unknown>
  if (
    !sameAddress(candidate.owner, account) ||
    !sameAddress(candidate.contract, contract) ||
    !sameAddress(candidate.spender ?? candidate.operator, intent.delegate)
  ) {
    return false
  }

  if (intent.type === 'max-approve') {
    return (
      candidate.type === 'approval' &&
      candidate.standard === 'erc20' &&
      candidate.amount === MAX_UINT256.toString(10)
    )
  }

  return candidate.type === 'operator-approval' && candidate.approved === true
}
