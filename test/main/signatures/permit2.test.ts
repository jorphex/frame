import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import { getPermit2Authority, PERMIT2_ADDRESS } from '../../../main/signatures/permit2'
import type { TypedMessage } from '../../../main/accounts/types'

const token = '0x1111111111111111111111111111111111111111'
const secondToken = '0x2222222222222222222222222222222222222222'
const spender = '0x3333333333333333333333333333333333333333'
const maxUint160 = (2n ** 160n - 1n).toString(10)
const maxUint256 = (2n ** 256n - 1n).toString(10)

const domainType = [
  { name: 'name', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' }
]
const permitDetailsType = [
  { name: 'token', type: 'address' },
  { name: 'amount', type: 'uint160' },
  { name: 'expiration', type: 'uint48' },
  { name: 'nonce', type: 'uint48' }
]
const tokenPermissionsType = [
  { name: 'token', type: 'address' },
  { name: 'amount', type: 'uint256' }
]

const typedMessage = (data: Record<string, unknown>, version = SignTypedDataVersion.V4) =>
  ({ data, version }) as TypedMessage

const permitSingle = () => ({
  types: {
    EIP712Domain: domainType,
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' }
    ],
    PermitDetails: permitDetailsType
  },
  primaryType: 'PermitSingle',
  domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2_ADDRESS },
  message: {
    details: { token, amount: '100', expiration: '2000000000', nonce: '7' },
    spender,
    sigDeadline: '1900000000'
  }
})

const permitBatchTransfer = () => ({
  types: {
    EIP712Domain: domainType,
    PermitBatchTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions[]' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ],
    TokenPermissions: tokenPermissionsType
  },
  primaryType: 'PermitBatchTransferFrom',
  domain: { name: 'Permit2', chainId: '0x1', verifyingContract: PERMIT2_ADDRESS },
  message: {
    permitted: [
      { token, amount: '0x64' },
      { token: secondToken, amount: maxUint256 }
    ],
    spender,
    nonce: '9',
    deadline: '1900000000'
  }
})

const permitBatch = () => ({
  types: {
    EIP712Domain: domainType,
    PermitBatch: [
      { name: 'details', type: 'PermitDetails[]' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' }
    ],
    PermitDetails: permitDetailsType
  },
  primaryType: 'PermitBatch',
  domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2_ADDRESS },
  message: {
    details: [
      { token, amount: '100', expiration: '2000000000', nonce: '7' },
      { token: secondToken, amount: '200', expiration: '2000000001', nonce: '8' }
    ],
    spender,
    sigDeadline: '1900000000'
  }
})

const permitTransfer = () => ({
  types: {
    EIP712Domain: domainType,
    PermitTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ],
    TokenPermissions: tokenPermissionsType
  },
  primaryType: 'PermitTransferFrom',
  domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2_ADDRESS },
  message: {
    permitted: { token, amount: '100' },
    spender,
    nonce: '9',
    deadline: '1900000000'
  }
})

it('normalizes a canonical standing Permit2 allowance', () => {
  expect(getPermit2Authority(typedMessage(permitSingle()))).toEqual({
    kind: 'allowance',
    primaryType: 'PermitSingle',
    verifyingContract: PERMIT2_ADDRESS,
    canonicalContract: true,
    spender,
    deadline: '1900000000',
    permissions: [{ token, amount: '100', expiration: '2000000000' }],
    batch: false,
    witness: false,
    grantsAuthority: true,
    maximumAmount: false
  })
})

it('normalizes a batch transfer and detects maximum uint256 authority', () => {
  expect(getPermit2Authority(typedMessage(permitBatchTransfer()))).toMatchObject({
    kind: 'transfer',
    primaryType: 'PermitBatchTransferFrom',
    canonicalContract: true,
    batch: true,
    witness: false,
    maximumAmount: true,
    permissions: [
      { token, amount: '100' },
      { token: secondToken, amount: maxUint256 }
    ]
  })
})

it('normalizes a batch standing allowance', () => {
  expect(getPermit2Authority(typedMessage(permitBatch()))).toMatchObject({
    kind: 'allowance',
    primaryType: 'PermitBatch',
    batch: true,
    witness: false,
    permissions: [
      { token, amount: '100', expiration: '2000000000' },
      { token: secondToken, amount: '200', expiration: '2000000001' }
    ]
  })
})

it('normalizes a single one-time transfer', () => {
  expect(getPermit2Authority(typedMessage(permitTransfer()))).toMatchObject({
    kind: 'transfer',
    primaryType: 'PermitTransferFrom',
    batch: false,
    witness: false,
    permissions: [{ token, amount: '100' }]
  })
})

it('recognizes witness transfer types while preserving witness data for raw review', () => {
  const data = permitBatchTransfer()
  data.primaryType = 'PermitBatchWitnessTransferFrom'
  data.types.PermitBatchWitnessTransferFrom = [
    ...data.types.PermitBatchTransferFrom,
    { name: 'witness', type: 'Order' }
  ]
  data.types.Order = [
    { name: 'recipient', type: 'address' },
    { name: 'minimumAmount', type: 'uint256' }
  ]
  data.message.witness = { recipient: spender, minimumAmount: '1' }

  expect(getPermit2Authority(typedMessage(data))).toMatchObject({
    kind: 'transfer',
    primaryType: 'PermitBatchWitnessTransferFrom',
    batch: true,
    witness: true
  })
})

it('recognizes a single witness transfer type', () => {
  const data = permitTransfer()
  const witnessData = {
    ...data,
    primaryType: 'PermitWitnessTransferFrom',
    types: {
      ...data.types,
      PermitWitnessTransferFrom: [...data.types.PermitTransferFrom, { name: 'witness', type: 'Order' }],
      Order: [{ name: 'recipient', type: 'address' }]
    },
    message: { ...data.message, witness: { recipient: spender } }
  }

  expect(getPermit2Authority(typedMessage(witnessData))).toMatchObject({
    primaryType: 'PermitWitnessTransferFrom',
    batch: false,
    witness: true
  })
})

it('flags an exact Permit2 request using a noncanonical verifying contract', () => {
  const data = permitSingle()
  data.domain.verifyingContract = '0x4444444444444444444444444444444444444444'

  expect(getPermit2Authority(typedMessage(data))).toMatchObject({ canonicalContract: false })
})

it('detects maximum uint160 allowance authority', () => {
  const data = permitSingle()
  data.message.details.amount = maxUint160

  expect(getPermit2Authority(typedMessage(data))).toMatchObject({ maximumAmount: true })
})

it('recognizes a zero-amount permit without reporting spend authority', () => {
  const data = permitSingle()
  data.message.details.amount = '0'

  expect(getPermit2Authority(typedMessage(data))).toMatchObject({
    grantsAuthority: false,
    maximumAmount: false
  })
})

it.each([
  ['wrong domain name', (data: ReturnType<typeof permitSingle>) => (data.domain.name = 'Not Permit2')],
  ['reordered primary fields', (data: ReturnType<typeof permitSingle>) => data.types.PermitSingle.reverse()],
  [
    'wrong nested amount width',
    (data: ReturnType<typeof permitSingle>) => (data.types.PermitDetails[1].type = 'uint256')
  ],
  [
    'missing permission value',
    (data: ReturnType<typeof permitSingle>) =>
      delete (data.message.details as Partial<typeof data.message.details>).token
  ]
])('rejects a Permit2 lookalike with %s', (_name, mutate) => {
  const data = permitSingle()
  mutate(data)

  expect(getPermit2Authority(typedMessage(data))).toBeUndefined()
})

it('does not classify a V3 request as canonical Permit2', () => {
  expect(getPermit2Authority(typedMessage(permitSingle(), SignTypedDataVersion.V3))).toBeUndefined()
})
