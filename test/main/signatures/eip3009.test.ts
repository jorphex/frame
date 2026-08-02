import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import { getEip3009Authorization } from '../../../main/signatures/eip3009'
import type { TypedMessage } from '../../../main/accounts/types'

const from = '0x1111111111111111111111111111111111111111'
const to = '0x2222222222222222222222222222222222222222'
const token = '0x3333333333333333333333333333333333333333'
const authorizationNonce = `0x${'ab'.repeat(32)}`
const transferFields = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' }
]

const data = (primaryType = 'TransferWithAuthorization') => ({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    [primaryType]: transferFields
  },
  primaryType,
  domain: { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: token },
  message: {
    from,
    to,
    value: '100',
    validAfter: '0',
    validBefore: '2000000000',
    nonce: authorizationNonce
  }
})
const message = (value: Record<string, unknown>, version = SignTypedDataVersion.V4) =>
  ({ data: value, version }) as TypedMessage

it.each([
  ['TransferWithAuthorization', 'transfer'],
  ['ReceiveWithAuthorization', 'receive']
])('normalizes %s direct transfer authority', (primaryType, kind) => {
  expect(getEip3009Authorization(message(data(primaryType)))).toEqual({
    kind,
    primaryType,
    verifyingContract: token,
    authorizer: from,
    from,
    to,
    value: '100',
    validAfter: '0',
    validBefore: '2000000000',
    nonce: authorizationNonce,
    grantsAuthority: true,
    maximumAmount: false
  })
})

it('normalizes cancellation without claiming spend authority', () => {
  const value = data('CancelAuthorization')
  value.types.CancelAuthorization = [
    { name: 'authorizer', type: 'address' },
    { name: 'nonce', type: 'bytes32' }
  ]
  value.message = { authorizer: from, nonce: authorizationNonce }

  expect(getEip3009Authorization(message(value))).toEqual({
    kind: 'cancel',
    primaryType: 'CancelAuthorization',
    verifyingContract: token,
    authorizer: from,
    nonce: authorizationNonce,
    grantsAuthority: false,
    maximumAmount: false
  })
})

it('distinguishes zero and maximum transfer values', () => {
  const zero = data()
  zero.message.value = '0'
  const maximum = data()
  maximum.message.value = (2n ** 256n - 1n).toString(10)

  expect(getEip3009Authorization(message(zero))).toMatchObject({ grantsAuthority: false })
  expect(getEip3009Authorization(message(maximum))).toMatchObject({
    grantsAuthority: true,
    maximumAmount: true
  })
})

it.each([
  ['reordered fields', (value: ReturnType<typeof data>) => value.types[value.primaryType].reverse()],
  [
    'unsigned chain binding',
    (value: ReturnType<typeof data>) =>
      (value.types.EIP712Domain = value.types.EIP712Domain.filter(({ name }) => name !== 'chainId'))
  ],
  ['malformed nonce', (value: ReturnType<typeof data>) => (value.message.nonce = '0xab')]
])('rejects a lookalike with %s', (_name, mutate) => {
  const value = data()
  mutate(value)
  expect(getEip3009Authorization(message(value))).toBeUndefined()
})

it('rejects legacy typed-data versions', () => {
  expect(getEip3009Authorization(message(data(), SignTypedDataVersion.V3))).toBeUndefined()
})
