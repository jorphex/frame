import { canApproveWalletCalls } from '../../../../app/tray/Footer'

const request = (overrides = {}) => ({
  type: 'walletCalls',
  handlerId: 'wallet-call-request',
  simulation: { status: 'succeeded' },
  preparation: { status: 'succeeded' },
  ...overrides
})

it('allows a fully reviewed wallet-call batch to be submitted', () => {
  expect(canApproveWalletCalls(request(), undefined, 'ledger')).toBe(true)
})

it('blocks wallet-call submission for watch-only or unknown account types', () => {
  expect(canApproveWalletCalls(request(), undefined, 'address')).toBe(false)
  expect(canApproveWalletCalls(request(), undefined, 'Address')).toBe(false)
  expect(canApproveWalletCalls(request())).toBe(false)
})

it('blocks only the wallet-call request with an action already in flight', () => {
  const pending = request({ handlerId: 'pending-request' })
  const next = request({ handlerId: 'next-request' })

  expect(canApproveWalletCalls(pending, 'pending-request', 'ledger')).toBe(false)
  expect(canApproveWalletCalls(next, 'pending-request', 'ledger')).toBe(true)
})

it.each([
  ['missing simulation', { simulation: undefined }],
  ['pending simulation', { simulation: { status: 'pending' } }],
  ['delegated sender', { simulation: { status: 'succeeded', delegation: { status: 'delegated' } } }],
  ['pending preparation', { preparation: { status: 'pending' } }],
  ['failed preparation', { preparation: { status: 'failed', reason: 'unavailable' } }],
  ['claimed request', { locked: true }],
  ['request with status', { status: 'error' }],
  ['different request type', { type: 'transaction' }]
])('blocks submission for %s', (_label, overrides) => {
  expect(canApproveWalletCalls(request(overrides), undefined, 'ledger')).toBe(false)
})
