import Restore from 'react-restore'

import { render, screen, waitFor } from '../../../componentSetup'
import { Earn } from '../../../../app/dash/Earn'
import { getYearnCatalog, getYearnPositions } from '../../../../app/dash/Earn/api'
import link from '../../../../resources/link'

jest.mock('../../../../app/dash/Earn/api', () => ({
  getYearnCatalog: jest.fn(),
  getYearnPositions: jest.fn()
}))
jest.mock('../../../../resources/link', () => ({ send: jest.fn() }))

const address = '0x0000000000000000000000000000000000000001'
const makeVault = (id, chainId, chainName, kind = 'direct') => ({
  id,
  chainId,
  chainName,
  address,
  kind,
  name: id === 'ethereum-yvusd' ? 'yvUSD' : `${chainName} Vault`,
  symbol: 'yvUSDC',
  description: 'A curated Yearn vault.',
  asset: { address, name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  decimals: 6,
  tvlUsd: 1_500_000,
  apy: { value: 0.0512, label: 'Est. APY', source: 'estimated' },
  riskLevel: 1,
  riskLabel: 'Conservative',
  performanceFeeBps: 1000,
  managementFeeBps: 0,
  inceptionTime: 1_700_000_000,
  yearnUrl: `https://yearn.fi/vaults/${chainId}/${address}`,
  status: 'available',
  variants:
    kind === 'yvUSD'
      ? [
          {
            id: 'unlocked',
            address,
            name: 'yvUSD',
            symbol: 'yvUSD',
            asset: { address, name: 'USD Coin', symbol: 'USDC', decimals: 6 },
            decimals: 6,
            tvlUsd: 1_000_000,
            apy: { value: 0.05, label: 'Est. APY', source: 'estimated' }
          },
          {
            id: 'locked',
            address: '0x0000000000000000000000000000000000000002',
            name: 'Locked yvUSD',
            symbol: 'Locked yvUSD',
            asset: { address, name: 'yvUSD', symbol: 'yvUSD', decimals: 6 },
            decimals: 6,
            tvlUsd: 500_000,
            apy: { value: 0.07, label: 'Est. APY', source: 'estimated' }
          }
        ]
      : [
          {
            id: 'direct',
            address,
            name: 'Vault',
            symbol: 'yvUSDC',
            asset: { address, name: 'USD Coin', symbol: 'USDC', decimals: 6 },
            decimals: 6,
            tvlUsd: 1_500_000,
            apy: { value: 0.0512, label: 'Est. APY', source: 'estimated' }
          }
        ]
})

const vaults = [
  makeVault('ethereum-yvusd', 1, 'Ethereum', 'yvUSD'),
  makeVault('base-yvusdc-h', 8453, 'Base'),
  makeVault('katana-yvvbusdc', 747474, 'Katana')
]
const position = {
  vaultId: 'ethereum-yvusd',
  chainId: 1,
  status: 'available',
  hasPosition: true,
  assetBalanceRaw: '5000000',
  assetBalance: '5.0',
  variants: [
    {
      id: 'unlocked',
      address,
      symbol: 'yvUSD',
      decimals: 6,
      sharesRaw: '1500000',
      shares: '1.5',
      assetSymbol: 'USDC',
      assetDecimals: 6,
      assetsRaw: '1500000',
      assets: '1.5'
    }
  ]
}

const makePositions = (readOnly = false) => ({
  account: { address, name: 'Treasury', readOnly },
  chains: [
    { chainId: 1, status: 'ready', positions: [position] },
    { chainId: 8453, status: 'disabled', reason: 'Enable this chain in Frame', positions: [] },
    { chainId: 747474, status: 'ready', positions: [] }
  ]
})

const store = Restore.create(
  {
    selected: { current: address },
    main: {
      networks: {
        ethereum: {
          1: { on: true, connection: { primary: { connected: true }, secondary: { connected: false } } },
          8453: { on: false, connection: { primary: { connected: false }, secondary: { connected: false } } },
          747474: { on: true, connection: { primary: { connected: true }, secondary: { connected: false } } }
        }
      }
    }
  },
  {}
)
const ConnectedEarn = Restore.connect(Earn, store)

beforeEach(() => {
  getYearnCatalog.mockResolvedValue({ status: 'fresh', fetchedAt: 1234, vaults, errors: [] })
  getYearnPositions.mockResolvedValue(makePositions())
  link.send.mockClear()
})

it('shows positions before chain-separated opportunities', async () => {
  render(<ConnectedEarn />)

  await screen.findByRole('heading', { name: 'Ethereum' })
  expect(screen.getByRole('heading', { name: 'Base' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Katana' })).toBeTruthy()
  const positionHeading = screen.getByRole('heading', { name: 'Your positions' })
  const opportunityHeadings = screen.getAllByRole('heading', { name: 'Opportunities' })
  expect(
    positionHeading.compareDocumentPosition(opportunityHeadings[0]) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Manage yvUSD position' })).toBeTruthy()
})

it('filters by chain without mixing vaults', async () => {
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })

  await user.click(screen.getByRole('tab', { name: 'Base' }))

  expect(screen.getByRole('heading', { name: 'Base' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Ethereum' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Katana' })).toBeNull()
})

it('opens product details and keeps watch-only transactions disabled', async () => {
  getYearnPositions.mockResolvedValue(makePositions(true))
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })

  await user.click(screen.getByRole('button', { name: 'View yvUSD on Ethereum' }))

  expect(screen.getByRole('heading', { name: 'Choose how to earn' })).toBeTruthy()
  expect(screen.getByText(/14-day cooldown/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Deposit' }).disabled).toBe(true)
  expect(screen.getByText(/Watch-only accounts/)).toBeTruthy()
})

it('opens chain settings explicitly instead of activating a chain', async () => {
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Base' })

  await user.click(screen.getByRole('button', { name: 'Manage chain' }))

  expect(link.send).toHaveBeenCalledWith('tray:action', 'navDash', { view: 'chains', data: {} })
})

it('refreshes catalog and positions as one user action', async () => {
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })

  await user.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(getYearnCatalog).toHaveBeenLastCalledWith(true))
  expect(getYearnPositions).toHaveBeenCalledTimes(2)
})
