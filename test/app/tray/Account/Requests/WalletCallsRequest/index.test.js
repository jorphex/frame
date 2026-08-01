import { screen, render } from '../../../../../componentSetup'
import { WalletCallsRequest } from '../../../../../../app/tray/Account/Requests/WalletCallsRequest'

const account = '0x1111111111111111111111111111111111111111'
const target = '0x2222222222222222222222222222222222222222'

function request(calls) {
  return {
    handlerId: 'wallet-calls-request',
    type: 'walletCalls',
    account,
    chainId: '0x1',
    atomic: false,
    calls
  }
}

it('shows exact parent, chain, sender, call order, value, and calldata', () => {
  render(
    <WalletCallsRequest
      originName='example.test'
      chainData={{ chainName: 'Ethereum' }}
      req={request([
        { to: target, value: '0xf', data: '0xabcd' },
        { value: '0x0', data: '0x6000' }
      ])}
    />
  )

  expect(screen.getByText('example.test')).toBeTruthy()
  expect(screen.getByText('Ethereum (0x1)')).toBeTruthy()
  expect(screen.getByText(account)).toBeTruthy()
  expect(screen.getByText('Call 1')).toBeTruthy()
  expect(screen.getByText('Call 2')).toBeTruthy()
  expect(screen.getByText(target)).toBeTruthy()
  expect(screen.getByText('Contract deployment')).toBeTruthy()
  expect(screen.getByText('0xf')).toBeTruthy()
  expect(screen.getByText('0xabcd')).toBeTruthy()
  expect(screen.getByText('0x6000')).toBeTruthy()
  expect(screen.getAllByText('2 bytes')).toHaveLength(2)
})

it('warns about non-atomic partial execution and exposes no approval control', () => {
  render(
    <WalletCallsRequest
      originName='example.test'
      chainData={{ chainName: 'Ethereum' }}
      req={request([{ to: target, value: '0x0', data: '0x' }])}
    />
  )

  const warning = screen.getByRole('alert')
  expect(warning.textContent).toMatch(/separate transaction/i)
  expect(warning.textContent).toMatch(/own gas fee/i)
  expect(warning.textContent).toMatch(/remain unsent/i)
  expect(warning.textContent).toMatch(/no call is sent before the whole batch is approved/i)
  expect(screen.queryByText('Approve')).toBeNull()
  expect(screen.queryByText('Sign')).toBeNull()
})

it('renders complete long calldata rather than a shortened preview', () => {
  const calldata = `0x${'ab'.repeat(256)}`
  render(
    <WalletCallsRequest
      originName='example.test'
      chainData={{ chainName: 'Ethereum' }}
      req={request([{ to: target, value: '0x0', data: calldata }])}
    />
  )

  expect(screen.getByText('256 bytes')).toBeTruthy()
  expect(screen.getByText(calldata).textContent).toBe(calldata)
})
