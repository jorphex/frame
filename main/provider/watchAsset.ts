import { getAddress } from 'ethers'
import { z } from 'zod'

const MAX_CHAIN_ID = Number.MAX_SAFE_INTEGER

const watchAssetSchema = z.object({
  type: z.string(),
  options: z.object({
    address: z.string(),
    chainId: z.number().int().positive().max(MAX_CHAIN_ID).optional()
  })
})

export interface WatchAssetRequest {
  type: 'ERC20'
  address: Address
  chainId: number
}

function invalidParams(message: string) {
  return { code: -32602, message: `Invalid params: ${message}` }
}

export function parseWatchAssetRequest(params: unknown, defaultChainId: number): WatchAssetRequest {
  const result = watchAssetSchema.safeParse(params)
  if (!result.success) throw invalidParams(result.error.issues[0].message)

  const { type, options } = result.data
  if (type.toUpperCase() !== 'ERC20') throw invalidParams(`unsupported asset type ${type}`)

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
    type: 'ERC20',
    address,
    chainId: options.chainId ?? defaultChainId
  }
}
