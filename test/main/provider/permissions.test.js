import {
  findUnsupportedRequiredMethod,
  grantedAccountPermission,
  parseGetPermissions,
  parseRequestPermissions,
  requestedAccountPermission
} from '../../../main/provider/permissions'
import { getSignerCapabilities } from '../../../main/signers/capabilities'

it('accepts an empty get-permissions parameter list', () => {
  expect(parseGetPermissions([])).toBeUndefined()
  expect(parseGetPermissions(undefined)).toBeUndefined()
})

it('accepts exactly one unrestricted account permission request', () => {
  expect(parseRequestPermissions([{ eth_accounts: {} }])).toEqual({
    parentCapability: 'eth_accounts',
    requiredMethods: []
  })
})

it('normalizes a bounded required-method hint', () => {
  expect(
    parseRequestPermissions([
      { eth_accounts: { requiredMethods: ['personal_sign', 'eth_signTypedData_v4', 'personal_sign'] } }
    ])
  ).toEqual({
    parentCapability: 'eth_accounts',
    requiredMethods: ['personal_sign', 'eth_signTypedData_v4']
  })
})

it.each([
  [[{}]],
  [[{ eth_accounts: {} }, { eth_accounts: {} }]],
  [[{ eth_signTransaction: {} }]],
  [[{ eth_accounts: { unknownCaveat: true } }]],
  [[{ eth_accounts: { requiredMethods: 'personal_sign' } }]],
  [[{ eth_accounts: { requiredMethods: [''] } }]],
  [[{ eth_accounts: { requiredMethods: Array(33).fill('personal_sign') } }]]
])('rejects unsupported request shape %#', (params) => {
  expect(() => parseRequestPermissions(params)).toThrow(expect.objectContaining({ code: -32602 }))
})

it('checks required methods against the selected signer profile', () => {
  const software = getSignerCapabilities({ type: 'ring' })
  const trezor = getSignerCapabilities({ type: 'trezor' })
  const watchOnly = getSignerCapabilities({ type: 'address' })

  expect(
    findUnsupportedRequiredMethod(
      [
        'personal_sign',
        'eth_sign',
        'signTypedData_v3',
        'eth_signTypedData_v1',
        'eth_sendTransaction',
        'wallet_sendCalls'
      ],
      software
    )
  ).toBeUndefined()
  expect(findUnsupportedRequiredMethod(['eth_signTypedData_v3'], trezor)).toBe('eth_signTypedData_v3')
  expect(findUnsupportedRequiredMethod(['personal_sign'], watchOnly)).toBe('personal_sign')
  expect(findUnsupportedRequiredMethod(['wallet_unknownMethod'], software)).toBe('wallet_unknownMethod')
})

it('formats granted and newly requested account permissions', () => {
  expect(grantedAccountPermission('https://example.test')).toEqual({
    invoker: 'https://example.test',
    parentCapability: 'eth_accounts',
    caveats: []
  })
  expect(requestedAccountPermission(123)).toEqual({ parentCapability: 'eth_accounts', date: 123 })
})
