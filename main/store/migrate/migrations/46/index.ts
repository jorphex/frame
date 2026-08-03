import { z } from 'zod'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        networksMeta: z.unknown().optional()
      })
      .passthrough()
  })
  .passthrough()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

function normalizeChainMetadata(chainMetadata: unknown) {
  if (!isRecord(chainMetadata) || !isRecord(chainMetadata['gas'])) return chainMetadata
  const price = chainMetadata['gas']['price']
  if (!isRecord(price) || price['fees'] !== null) return chainMetadata

  return {
    ...chainMetadata,
    gas: {
      ...chainMetadata['gas'],
      price: { ...price, fees: {} }
    }
  }
}

const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial

  const networksMeta = parsed.data.main.networksMeta
  if (!isRecord(networksMeta) || !isRecord(networksMeta['ethereum'])) return parsed.data

  return {
    ...parsed.data,
    main: {
      ...parsed.data.main,
      networksMeta: {
        ...networksMeta,
        ethereum: Object.fromEntries(
          Object.entries(networksMeta['ethereum']).map(([chainId, metadata]) => [
            chainId,
            normalizeChainMetadata(metadata)
          ])
        )
      }
    }
  }
}

export default {
  version: 46,
  migrate
}
