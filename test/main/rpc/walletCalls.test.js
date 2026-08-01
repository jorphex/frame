import { routeWalletCallRequest } from '../../../main/rpc/walletCalls'

const walletCallsRequest = {
  type: 'walletCalls',
  handlerId: 'stored-handler',
  account: '0xstored',
  origin: 'stored-origin',
  payload: { id: 1, jsonrpc: '2.0', method: 'wallet_sendCalls', params: [] }
}

it('routes the exact stored wallet-call request instead of renderer-supplied data', () => {
  const accounts = { getRequestForAccount: jest.fn(() => walletCallsRequest) }
  const action = jest.fn()

  expect(
    routeWalletCallRequest(
      {
        type: 'walletCalls',
        handlerId: 'stored-handler',
        account: '0xstored',
        origin: 'forged-origin'
      },
      accounts,
      action
    )
  ).toBe(true)

  expect(accounts.getRequestForAccount).toHaveBeenCalledWith('0xstored', 'stored-handler')
  expect(action).toHaveBeenCalledWith(walletCallsRequest)
})

it('fails closed when a wallet-call UI event no longer resolves', () => {
  const accounts = {
    getRequestForAccount: jest.fn(() => {
      throw new Error('missing request')
    })
  }
  const action = jest.fn()

  expect(
    routeWalletCallRequest(
      { type: 'walletCalls', handlerId: 'stale-handler', account: '0xstale' },
      accounts,
      action
    )
  ).toBe(true)
  expect(action).not.toHaveBeenCalled()
})

it('leaves non-wallet requests to the legacy request handlers', () => {
  const transactionRequest = { ...walletCallsRequest, type: 'transaction' }
  const accounts = { getRequestForAccount: jest.fn(() => transactionRequest) }
  const action = jest.fn()

  expect(
    routeWalletCallRequest(
      { type: 'transaction', handlerId: 'stored-handler', account: '0xstored' },
      accounts,
      action
    )
  ).toBe(false)
  expect(action).not.toHaveBeenCalled()
})

it('rejects malformed renderer input before account lookup', () => {
  const accounts = { getRequestForAccount: jest.fn() }
  const action = jest.fn()

  expect(routeWalletCallRequest({ type: 'walletCalls' }, accounts, action)).toBe(false)
  expect(accounts.getRequestForAccount).not.toHaveBeenCalled()
  expect(action).not.toHaveBeenCalled()
})

it('does not swallow action failures', () => {
  const accounts = { getRequestForAccount: jest.fn(() => walletCallsRequest) }
  const failure = new Error('provider failed')

  expect(() =>
    routeWalletCallRequest(walletCallsRequest, accounts, () => {
      throw failure
    })
  ).toThrow(failure)
})
