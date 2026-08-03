import { z } from 'zod'

export const YEARN_CHAIN_IDS = [1, 8453, 747474] as const
export type YearnChainId = (typeof YEARN_CHAIN_IDS)[number]

export const YearnChainIdSchema = z.union([z.literal(1), z.literal(8453), z.literal(747474)])
export const YearnAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)

export const YearnAssetSchema = z
  .object({
    address: YearnAddressSchema,
    name: z.string().min(1).max(128),
    symbol: z.string().min(1).max(32),
    decimals: z.number().int().min(0).max(255)
  })
  .strict()

export const YearnApySchema = z
  .object({
    value: z.number().finite().nonnegative().nullable(),
    label: z.enum(['Est. APY', 'Historical APY', 'Unavailable']),
    source: z.string().min(1).max(64),
    baseValue: z.number().finite().nonnegative().nullable().optional(),
    appRewardsValue: z.number().finite().nonnegative().nullable().optional()
  })
  .strict()

export const YearnVaultVariantSchema = z
  .object({
    id: z.enum(['direct', 'unlocked', 'locked', 'staked']),
    address: YearnAddressSchema,
    name: z.string().min(1).max(128),
    symbol: z.string().min(1).max(32),
    asset: YearnAssetSchema,
    decimals: z.number().int().min(0).max(255),
    tvlUsd: z.number().finite().nonnegative(),
    apy: YearnApySchema
  })
  .strict()

export const YearnVaultSchema = z
  .object({
    id: z.string().min(1).max(128),
    chainId: YearnChainIdSchema,
    chainName: z.enum(['Ethereum', 'Base', 'Katana']),
    address: YearnAddressSchema,
    kind: z.enum(['direct', 'yvUSD', 'yBOLD']),
    name: z.string().min(1).max(128),
    symbol: z.string().min(1).max(32),
    description: z.string().min(1).max(1024),
    asset: YearnAssetSchema,
    decimals: z.number().int().min(0).max(255),
    tvlUsd: z.number().finite().nonnegative(),
    apy: YearnApySchema,
    riskLevel: z.number().int().min(1).max(5).nullable(),
    riskLabel: z.enum(['Conservative', 'Moderate', 'Aggressive', 'Unrated']),
    performanceFeeBps: z.number().int().min(0).max(10_000),
    managementFeeBps: z.number().int().min(0).max(10_000),
    inceptionTime: z.number().int().nonnegative().nullable(),
    yearnUrl: z.string().url().max(8192),
    status: z.enum(['available', 'unavailable', 'withdraw-only']),
    statusReason: z.string().min(1).max(240).optional(),
    variants: z.array(YearnVaultVariantSchema).min(1).max(3)
  })
  .strict()

export const YearnCatalogCacheSchema = z
  .object({
    version: z.literal(1),
    fetchedAt: z.number().int().nonnegative(),
    vaults: z.array(YearnVaultSchema).max(16)
  })
  .strict()

export const YearnCatalogResultSchema = z
  .object({
    status: z.enum(['fresh', 'stale', 'unavailable']),
    fetchedAt: z.number().int().nonnegative().nullable(),
    vaults: z.array(YearnVaultSchema).max(16),
    errors: z
      .array(
        z
          .object({
            chainId: YearnChainIdSchema.optional(),
            message: z.string().min(1).max(240)
          })
          .strict()
      )
      .max(16)
  })
  .strict()

export type YearnAsset = z.infer<typeof YearnAssetSchema>
export type YearnApy = z.infer<typeof YearnApySchema>
export type YearnVaultVariant = z.infer<typeof YearnVaultVariantSchema>
export type YearnVault = z.infer<typeof YearnVaultSchema>
export type YearnCatalogCache = z.infer<typeof YearnCatalogCacheSchema>
export type YearnCatalogResult = z.infer<typeof YearnCatalogResultSchema>
