import { getAddress } from 'ethers'
import { z } from 'zod'

const MAX_CHAIN_ID = Number.MAX_SAFE_INTEGER

const watchAssetSchema = z.object({
  type: z.string().max(32),
  options: z.object({
    address: z.string(),
    chainId: z.number().int().positive().max(MAX_CHAIN_ID).optional()
  })
})

export interface WatchAssetRequest {
  type: 'ERC20' | 'ERC1046'
  address: Address
  chainId: number
}

function invalidParams(message: string) {
  return { code: -32602, message: `Invalid params: ${message}` }
}

export function parseWatchAssetRequest(params: unknown, defaultChainId: number): WatchAssetRequest {
  const result = watchAssetSchema.safeParse(params)
  if (!result.success) throw invalidParams(result.error.issues[0]?.message || 'invalid asset request')

  const { type, options } = result.data
  const normalizedType = type.toUpperCase()
  if (normalizedType !== 'ERC20' && normalizedType !== 'ERC1046') {
    throw invalidParams(`unsupported asset type ${type}`)
  }

  let address: string
  try {
    address = getAddress(options.address)
  } catch {
    throw invalidParams('address must be a valid checksummed hexadecimal address')
  }

  if (address !== options.address) {
    throw invalidParams('address must be checksummed')
  }

  return {
    type: normalizedType,
    address,
    chainId: options.chainId ?? defaultChainId
  }
}
