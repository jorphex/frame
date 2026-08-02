import type { TypedTransaction } from '@ethereumjs/tx'
import { padToEven, stripHexPrefix } from '@ethereumjs/util'

import { hexToInt } from '../../../resources/utils'

const normalizeQuantity = (value: string | undefined) => (value && padToEven(stripHexPrefix(value))) || ''

export function normalizeTrezorTransaction(chainId: string, transaction: TypedTransaction) {
  if (transaction.type === 1) {
    throw new Error('Trezor Connect does not support EIP-2930 type-1 transaction signing')
  }

  const json = transaction.toJSON()
  const normalized = {
    nonce: normalizeQuantity(json.nonce),
    gasLimit: normalizeQuantity(json.gasLimit),
    to: normalizeQuantity(json.to),
    value: normalizeQuantity(json.value),
    data: normalizeQuantity(json.data),
    chainId: hexToInt(chainId),
    ...(json.accessList !== undefined && {
      accessList: json.accessList.map((entry) => ({
        address: entry.address,
        storageKeys: [...entry.storageKeys]
      }))
    })
  } as Record<string, unknown>

  const optionalFields = ['gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas'] as const
  optionalFields.forEach((field) => {
    const value = json[field]
    if (value) normalized[field] = normalizeQuantity(value)
  })

  return normalized
}
