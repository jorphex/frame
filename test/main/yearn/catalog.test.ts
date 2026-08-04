import { toTokenId } from '../../../resources/domain/balance'
import {
  isYearnSystemToken,
  isYearnSystemTokenId,
  YEARN_CATALOG,
  YEARN_SYSTEM_TOKENS
} from '../../../main/yearn/catalog'

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

test('recognizes locally pinned Yearn tokens independently of remote token metadata', () => {
  YEARN_SYSTEM_TOKENS.forEach((token) => {
    expect(isYearnSystemToken(token)).toBe(true)
    expect(isYearnSystemTokenId(toTokenId(token))).toBe(true)
  })

  expect(isYearnSystemToken({ chainId: 1, address: '0x0000000000000000000000000000000000000001' })).toBe(
    false
  )
  expect(isYearnSystemTokenId('1:0x0000000000000000000000000000000000000001')).toBe(false)
})
