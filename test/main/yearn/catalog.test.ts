import { toTokenId } from '../../../resources/domain/balance'
import { YEARN_CATALOG, YEARN_SYSTEM_TOKENS } from '../../../main/yearn/catalog'

test('hidden Yearn tracking covers every curated asset, vault, and companion once', () => {
  const expectedIds = YEARN_CATALOG.flatMap((vault) => [
    toTokenId({ chainId: vault.chainId, address: vault.asset.address }),
    toTokenId({ chainId: vault.chainId, address: vault.address }),
    ...(vault.companions || []).map(({ address }) => toTokenId({ chainId: vault.chainId, address }))
  ])
  const actualIds = YEARN_SYSTEM_TOKENS.map(toTokenId)

  expect(new Set(actualIds)).toEqual(new Set(expectedIds))
  expect(actualIds).toHaveLength(new Set(actualIds).size)
  expect(YEARN_SYSTEM_TOKENS.every(({ name, symbol }) => Boolean(name && symbol))).toBe(true)
})
