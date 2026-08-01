import { MAX_UINT256 } from './quantity'

const MAX_UINT256_DECIMAL = MAX_UINT256.toString(10)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isBroadTokenAuthorityEffect(effect: unknown, account: unknown) {
  if (!isRecord(effect) || typeof account !== 'string' || typeof effect.owner !== 'string') return false
  if (effect.owner.toLowerCase() !== account.toLowerCase()) return false

  return (
    (effect.type === 'approval' && effect.standard === 'erc20' && effect.amount === MAX_UINT256_DECIMAL) ||
    (effect.type === 'operator-approval' && effect.approved === true)
  )
}
