import { isBroadTokenAuthorityEffect } from '../../../../resources/domain/transaction/effects'

const account = '0x1111111111111111111111111111111111111111'
const max = (2n ** 256n - 1n).toString(10)

it('identifies broad authority granted by the selected account', () => {
  expect(
    isBroadTokenAuthorityEffect(
      { type: 'approval', standard: 'erc20', owner: account.toUpperCase(), amount: max },
      account
    )
  ).toBe(true)
  expect(
    isBroadTokenAuthorityEffect(
      { type: 'operator-approval', standard: 'erc721-or-erc1155', owner: account, approved: true },
      account
    )
  ).toBe(true)
})

it.each([
  ['unrelated owner', { type: 'approval', standard: 'erc20', owner: '0x2', amount: max }],
  ['finite amount', { type: 'approval', standard: 'erc20', owner: account, amount: '100' }],
  ['ERC-721 token approval', { type: 'approval', standard: 'erc721', owner: account, tokenId: max }],
  [
    'disabled operator',
    { type: 'operator-approval', standard: 'erc721-or-erc1155', owner: account, approved: false }
  ],
  ['transfer', { type: 'transfer', standard: 'erc20', owner: account, amount: max }],
  ['malformed input', null]
])('does not classify %s as broad authority', (_name, effect) => {
  expect(isBroadTokenAuthorityEffect(effect, account)).toBe(false)
})
