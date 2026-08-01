import { utils } from 'ethers'

import {
  effectReportsBroadTokenAuthorityIntent,
  parseBroadTokenAuthorityIntent
} from '../../../../resources/domain/transaction/approvalRisk'

const account = '0x1111111111111111111111111111111111111111'
const contract = '0x2222222222222222222222222222222222222222'
const delegate = '0x3333333333333333333333333333333333333333'
const max = 2n ** 256n - 1n
const tokenInterface = new utils.Interface([
  'function approve(address spender, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)'
])

it('recognizes exact maximum approve calldata', () => {
  expect(
    parseBroadTokenAuthorityIntent(tokenInterface.encodeFunctionData('approve', [delegate, max]))
  ).toEqual({ type: 'max-approve', delegate })
})

it('recognizes exact enabled operator calldata', () => {
  expect(
    parseBroadTokenAuthorityIntent(tokenInterface.encodeFunctionData('setApprovalForAll', [delegate, true]))
  ).toEqual({ type: 'operator-approval', delegate })
})

it.each([
  '0x',
  tokenInterface.encodeFunctionData('approve', [delegate, max - 1n]),
  tokenInterface.encodeFunctionData('setApprovalForAll', [delegate, false]),
  `${tokenInterface.encodeFunctionData('approve', [delegate, max])}00`,
  tokenInterface.encodeFunctionData('approve', [delegate, max]).replace(/^0x095ea7b3/, '0x095ea7b4'),
  `0x095ea7b3${'f'.repeat(64)}${'f'.repeat(64)}`,
  null
])('rejects safe or malformed calldata %p', (calldata) => {
  expect(parseBroadTokenAuthorityIntent(calldata)).toBeUndefined()
})

it('matches a directly requested maximum approval to the corresponding reported effect', () => {
  const intent = parseBroadTokenAuthorityIntent(tokenInterface.encodeFunctionData('approve', [delegate, max]))
  const effect = {
    type: 'approval',
    standard: 'erc20',
    contract,
    owner: account,
    spender: delegate,
    amount: max.toString(10)
  }

  expect(effectReportsBroadTokenAuthorityIntent(intent, effect, account, contract)).toBe(true)
  expect(effectReportsBroadTokenAuthorityIntent(intent, effect, account, delegate)).toBe(false)
})

it('matches a directly requested operator approval to the corresponding reported effect', () => {
  const intent = parseBroadTokenAuthorityIntent(
    tokenInterface.encodeFunctionData('setApprovalForAll', [delegate, true])
  )
  const effect = {
    type: 'operator-approval',
    standard: 'erc721-or-erc1155',
    contract,
    owner: account,
    operator: delegate,
    approved: true
  }

  expect(effectReportsBroadTokenAuthorityIntent(intent, effect, account, contract)).toBe(true)
  expect(
    effectReportsBroadTokenAuthorityIntent(intent, { ...effect, approved: false }, account, contract)
  ).toBe(false)
})
