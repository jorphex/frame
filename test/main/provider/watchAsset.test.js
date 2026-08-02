import { parseWatchAssetRequest } from '../../../main/provider/watchAsset'
import { TokenSchema } from '../../../main/store/state/types/token'
import { BalanceSchema } from '../../../main/store/state/types/balance'

const address = '0xBfa641051Ba0a0Ad1b0AcF549a89536A0D76472E'

it('normalizes a supported request and defaults to the active chain', () => {
  expect(parseWatchAssetRequest({ type: 'erc20', options: { address } }, 1)).toEqual({
    type: 'ERC20',
    address,
    chainId: 1
  })
})

it('uses a positive safe numeric asset chain id', () => {
  expect(parseWatchAssetRequest({ type: 'ERC20', options: { address, chainId: 8453 } }, 1).chainId).toBe(8453)
})

it('normalizes an ERC-1046 request with the same address and chain rules', () => {
  expect(parseWatchAssetRequest({ type: 'erc1046', options: { address, chainId: 10 } }, 1)).toEqual({
    type: 'ERC1046',
    address,
    chainId: 10
  })
})

it.each([
  ['missing params', undefined],
  ['an unsupported type', { type: 'ERC721', options: { address } }],
  ['a missing address', { type: 'ERC20', options: {} }],
  ['a non-checksummed address', { type: 'ERC20', options: { address: address.toLowerCase() } }],
  ['an invalid address', { type: 'ERC20', options: { address: '0x1234' } }],
  ['a string chain id', { type: 'ERC20', options: { address, chainId: '1' } }],
  ['a zero chain id', { type: 'ERC20', options: { address, chainId: 0 } }],
  ['an unsafe chain id', { type: 'ERC20', options: { address, chainId: Number.MAX_SAFE_INTEGER + 1 } }]
])('rejects %s with invalid params', (_description, params) => {
  expect(() => parseWatchAssetRequest(params, 1)).toThrow(
    expect.objectContaining({ code: -32602, message: expect.stringMatching(/^Invalid params:/) })
  )
})

it('allows zero-decimal tokens and balances in persisted state', () => {
  expect(TokenSchema.parse({ address, chainId: 1, name: 'Zero', symbol: 'ZERO', decimals: 0 })).toMatchObject(
    { decimals: 0 }
  )
  expect(
    BalanceSchema.parse({
      address,
      chainId: 1,
      name: 'Zero',
      symbol: 'ZERO',
      decimals: 0,
      balance: '0x1',
      displayBalance: '1'
    })
  ).toMatchObject({ decimals: 0 })
})
