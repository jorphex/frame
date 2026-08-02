import { MAX_UINT256 } from './quantity'
import { parseErc20ApprovalIntent } from './allowance'

const SET_APPROVAL_FOR_ALL_SELECTOR = 'a22cb465'
const ABI_CALL_HEX_LENGTH = 8 + 64 + 64
const ABI_ADDRESS_PADDING = '0'.repeat(24)
const ABI_TRUE = `${'0'.repeat(63)}1`
const ABI_CALL = new RegExp(`^0x[0-9a-fA-F]{${ABI_CALL_HEX_LENGTH}}$`)

export type BroadTokenAuthorityIntent = {
  type: 'max-approve' | 'operator-approval'
  delegate: string
}

interface EffectCandidate extends Record<string, unknown> {
  owner?: unknown
  contract?: unknown
  spender?: unknown
  operator?: unknown
  type?: unknown
  standard?: unknown
  amount?: unknown
  approved?: unknown
}

function isEffectCandidate(value: unknown): value is EffectCandidate {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameAddress(left: unknown, right: unknown) {
  return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase()
}

export function parseBroadTokenAuthorityIntent(calldata: unknown): BroadTokenAuthorityIntent | undefined {
  const approval = parseErc20ApprovalIntent(calldata)
  if (approval?.amount === MAX_UINT256.toString(10)) {
    return { type: 'max-approve', delegate: approval.spender }
  }

  if (typeof calldata !== 'string' || !ABI_CALL.test(calldata)) return

  const encoded = calldata.slice(2).toLowerCase()
  const selector = encoded.slice(0, 8)
  const addressWord = encoded.slice(8, 72)
  const valueWord = encoded.slice(72)
  if (!addressWord.startsWith(ABI_ADDRESS_PADDING)) return

  const delegate = `0x${addressWord.slice(24)}`
  if (selector === SET_APPROVAL_FOR_ALL_SELECTOR && valueWord === ABI_TRUE) {
    return { type: 'operator-approval', delegate }
  }

  return undefined
}

export function effectReportsBroadTokenAuthorityIntent(
  intent: BroadTokenAuthorityIntent,
  effect: unknown,
  account: unknown,
  contract: unknown
) {
  if (!isEffectCandidate(effect)) return false

  if (
    !sameAddress(effect.owner, account) ||
    !sameAddress(effect.contract, contract) ||
    !sameAddress(effect.spender ?? effect.operator, intent.delegate)
  ) {
    return false
  }

  if (intent.type === 'max-approve') {
    return (
      effect.type === 'approval' && effect.standard === 'erc20' && effect.amount === MAX_UINT256.toString(10)
    )
  }

  return effect.type === 'operator-approval' && effect.approved === true
}
