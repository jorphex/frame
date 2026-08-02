import link from '../../../../resources/link'
import { ChainSummaryComponent, getAccountCodePresentation } from '../../../../resources/Components/Monitor'

jest.mock('../../../../resources/link', () => ({ rpc: jest.fn(), send: jest.fn() }))

const account = '0x690b9a9e9aa1c9db991c7721a92d351db4fac990'

function component(props = {}) {
  const instance = new ChainSummaryComponent({ address: account, chainId: 1, ...props })
  instance.setState = (update) => {
    instance.state = { ...instance.state, ...update }
  }
  return instance
}

beforeEach(() => {
  link.rpc.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

it.each([
  ['no-code', 'RPC No Code', /does not prove.*EOA/i],
  ['contract', 'RPC Contract', /contract code/],
  ['delegated', 'RPC 7702', /delegation/],
  ['unavailable', 'RPC Unknown', /unavailable/],
  ['pending', 'RPC Checking', /checking account code/i]
])('presents %s as qualified configured-RPC evidence', (status, label, title) => {
  const presentation = getAccountCodePresentation(
    status === 'delegated'
      ? { status, delegate: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
      : status === 'unavailable'
        ? { status, reason: 'node unavailable' }
        : { status }
  )

  expect(presentation.label).toBe(label)
  expect(presentation.title).toMatch(title)
})

it('requests only the displayed account and chain', () => {
  const instance = component()

  instance.refreshAccountCode()

  expect(instance.state.accountCode).toEqual({ status: 'pending', source: 'eth_getCode' })
  expect(link.rpc).toHaveBeenCalledWith('getAccountCodeClassification', account, 1, expect.any(Function))
})

it('ignores stale account and chain responses', () => {
  const instance = component()
  instance.refreshAccountCode()
  const firstResponse = link.rpc.mock.calls[0][3]

  instance.props = { address: account, chainId: 10 }
  instance.refreshAccountCode()
  const secondResponse = link.rpc.mock.calls[1][3]
  firstResponse(null, { status: 'contract' })
  expect(instance.state.accountCode).toEqual({ status: 'pending', source: 'eth_getCode' })

  secondResponse(null, { status: 'no-code' })
  expect(instance.state.accountCode).toEqual({ status: 'no-code' })
})

it('ignores a response after unmount', () => {
  const instance = component()
  instance.refreshAccountCode()
  const respond = link.rpc.mock.calls[0][3]
  instance.componentWillUnmount()

  respond(null, { status: 'contract' })

  expect(instance.state.accountCode).toEqual({ status: 'pending', source: 'eth_getCode' })
})

it('refreshes a long-open monitor and cancels refresh on unmount', () => {
  jest.useFakeTimers()
  const instance = component()
  instance.refreshAccountCode = jest.fn()

  instance.componentDidMount()
  expect(instance.refreshAccountCode).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(30_000)
  expect(instance.refreshAccountCode).toHaveBeenCalledTimes(2)

  instance.componentWillUnmount()
  jest.advanceTimersByTime(30_000)
  expect(instance.refreshAccountCode).toHaveBeenCalledTimes(2)
})

it('qualifies and bounds internal RPC failures', () => {
  const instance = component()
  instance.refreshAccountCode()
  const respond = link.rpc.mock.calls[0][3]

  respond('x'.repeat(500))

  expect(instance.state.accountCode).toEqual({
    status: 'unavailable',
    source: 'eth_getCode',
    reason: 'x'.repeat(240)
  })
})
