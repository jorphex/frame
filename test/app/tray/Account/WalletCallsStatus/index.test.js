import { screen, render } from '../../../../componentSetup'
import { WalletCallsStatus } from '../../../../../app/tray/Account/WalletCallsStatus'

const account = '0x1111111111111111111111111111111111111111'
const transactionHash = `0x${'a'.repeat(64)}`

const status = (overrides = {}) => ({
  version: '2.0.0',
  id: 'batch-id',
  chainId: '0x1',
  status: 100,
  atomic: false,
  ...overrides
})

it('renders pending batch identity without approval controls', () => {
  render(
    <WalletCallsStatus accountId={account} chainName='Ethereum' originName='example.test' status={status()} />
  )

  expect(screen.getByText('example.test')).toBeTruthy()
  expect(screen.getByText('Ethereum (0x1)')).toBeTruthy()
  expect(screen.getByText(account)).toBeTruthy()
  expect(screen.getByText('batch-id')).toBeTruthy()
  expect(screen.getByText('Pending')).toBeTruthy()
  expect(screen.getByText('Non-atomic execution')).toBeTruthy()
  expect(screen.getByText(/No transaction receipts/i)).toBeTruthy()
  expect(screen.queryByText('Approve')).toBeNull()
  expect(screen.queryByText('Submit Batch')).toBeNull()
})

it.each([
  [200, 'Confirmed'],
  [400, 'Failed'],
  [500, 'Reverted'],
  [600, 'Partially executed']
])('renders status %i as %s', (code, label) => {
  render(
    <WalletCallsStatus
      accountId={account}
      chainName='Ethereum'
      originName='example.test'
      status={status({ status: code })}
    />
  )

  expect(screen.getByText(label)).toBeTruthy()
})

it('renders bounded transaction evidence in receipt order', () => {
  render(
    <WalletCallsStatus
      accountId={account}
      chainName='Ethereum'
      originName='example.test'
      status={status({
        status: 600,
        receipts: [
          { status: '0x1', blockNumber: '0x10', gasUsed: '0x5208', transactionHash },
          {
            status: '0x0',
            blockNumber: '0x11',
            gasUsed: '0x42',
            transactionHash: `0x${'b'.repeat(64)}`
          }
        ]
      })}
    />
  )

  expect(screen.getByText('Transaction 1')).toBeTruthy()
  expect(screen.getByText('Transaction 2')).toBeTruthy()
  expect(screen.getByText(transactionHash)).toBeTruthy()
  expect(screen.getByText('0x10')).toBeTruthy()
  expect(screen.getByText('0x5208')).toBeTruthy()
  expect(screen.getByText('Confirmed')).toBeTruthy()
  expect(screen.getByText('Reverted')).toBeTruthy()
})
