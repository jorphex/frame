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
    calls,
    simulation: { status: 'pending', calls: [] }
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

it('renders ordered RPC execution evidence and qualified token effects', () => {
  const req = request([
    { to: target, value: '0x0', data: '0x' },
    { to: target, value: '0x1', data: '0xabcd' }
  ])
  req.simulation = {
    status: 'reverted',
    source: 'eth_simulateV1',
    calls: [
      {
        status: 'succeeded',
        source: 'eth_simulateV1',
        gasUsed: '0x5208',
        effects: [
          {
            type: 'transfer',
            standard: 'erc20',
            token: target,
            from: account,
            to: target,
            amount: '5'
          }
        ],
        allowance: {
          source: 'eth_call',
          token: target,
          owner: account,
          spender: target,
          currentAmount: '1',
          requestedAmount: '5'
        }
      },
      {
        status: 'reverted',
        source: 'eth_simulateV1',
        gasUsed: '0x42',
        reason: 'execution reverted: denied'
      }
    ]
  }

  render(<WalletCallsRequest originName='example.test' req={req} />)

  expect(screen.getByText('RPC reports one or more calls revert')).toBeTruthy()
  expect(screen.getByText('RPC result: succeeded - gas used 0x5208')).toBeTruthy()
  expect(screen.getByText('RPC result: reverted - gas used 0x42')).toBeTruthy()
  expect(screen.getByText('execution reverted: denied')).toBeTruthy()
  expect(screen.getByText('ERC-20 Send')).toBeTruthy()
  expect(screen.getByText('RPC-Reported Current Allowance')).toBeTruthy()
  expect(screen.getAllByText(/not independently verified/i).length).toBeGreaterThan(0)
})

it.each([
  ['unavailable', 'Stateful simulation unavailable', 'Configured RPC does not support stateful simulation'],
  ['failed', 'Stateful simulation failed', 'RPC returned malformed output']
])('renders a bounded %s batch result without per-call claims', (status, label, reason) => {
  const req = request([{ to: target, value: '0x0', data: '0x' }])
  req.simulation = { status, source: 'eth_simulateV1', calls: [], reason }

  render(<WalletCallsRequest originName='example.test' req={req} />)

  expect(screen.getByText(label)).toBeTruthy()
  expect(screen.getByText(reason)).toBeTruthy()
  expect(screen.queryByText(/RPC result:/)).toBeNull()
})
