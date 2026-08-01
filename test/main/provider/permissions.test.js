import {
  grantedAccountPermission,
  parseGetPermissions,
  parseRequestPermissions,
  requestedAccountPermission
} from '../../../main/provider/permissions'

it('accepts an empty get-permissions parameter list', () => {
  expect(parseGetPermissions([])).toBeUndefined()
  expect(parseGetPermissions(undefined)).toBeUndefined()
})

it('accepts exactly one unrestricted account permission request', () => {
  expect(parseRequestPermissions([{ eth_accounts: {} }])).toBe('eth_accounts')
})

it.each([
  [[{}]],
  [[{ eth_accounts: {} }, { eth_accounts: {} }]],
  [[{ eth_signTransaction: {} }]],
  [[{ eth_accounts: { requiredMethods: ['personal_sign'] } }]]
])('rejects unsupported request shape %#', (params) => {
  expect(() => parseRequestPermissions(params)).toThrow(expect.objectContaining({ code: -32602 }))
})

it('formats granted and newly requested account permissions', () => {
  expect(grantedAccountPermission('https://example.test')).toEqual({
    invoker: 'https://example.test',
    parentCapability: 'eth_accounts',
    caveats: []
  })
  expect(requestedAccountPermission(123)).toEqual({ parentCapability: 'eth_accounts', date: 123 })
})
