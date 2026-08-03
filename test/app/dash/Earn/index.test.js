import Restore from 'react-restore'

import { render, screen, waitFor } from '../../../componentSetup'
import { Earn, formatReceiptAmount, formatUpdatedAt, positionsMatchAccount } from '../../../../app/dash/Earn'
import {
  getYearnCatalog,
  getYearnPositions,
  getYearnWorkflows,
  revokeYearnWorkflow,
  startYearnWorkflow
} from '../../../../app/dash/Earn/api'
import link from '../../../../resources/link'

jest.mock('../../../../app/dash/Earn/api', () => ({
  getYearnCatalog: jest.fn(),
  getYearnPositions: jest.fn(),
  getYearnWorkflows: jest.fn(),
  startYearnWorkflow: jest.fn(),
  resumeYearnWorkflow: jest.fn(),
  cancelYearnWorkflow: jest.fn(),
  revokeYearnWorkflow: jest.fn()
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

const lockedPosition = {
  ...position,
  variants: [
    ...position.variants,
    {
      id: 'locked',
      address: '0x0000000000000000000000000000000000000002',
      symbol: 'styvUSD',
      decimals: 6,
      sharesRaw: '2000000',
      shares: '2.0',
      assetSymbol: 'yvUSD',
      assetDecimals: 6,
      assetsRaw: '1900000',
      assets: '1.9',
      cooldown: {
        status: 'none',
        sharesRaw: '0',
        shares: '0.0',
        cooldownEnd: 0,
        windowEnd: 0,
        cooldownDuration: 1_209_600,
        withdrawalWindow: 432_000
      }
    }
  ]
}

const makeWorkflow = () => ({
  policyVersion: 1,
  id: '00000000-0000-4000-8000-000000000001',
  account: address,
  vaultId: 'ethereum-yvusd',
  chainId: 1,
  action: 'deposit',
  variant: 'unlocked',
  amountRaw: '1250000',
  displayAmount: '1.25',
  symbol: 'USDC',
  max: false,
  maxLossBps: 0,
  status: 'complete',
  steps: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'deposit',
      label: 'Deposit into yvUSD',
      target: address,
      data: '0x12345678',
      amountRaw: '1250000',
      status: 'confirmed',
      txHash: `0x${'ab'.repeat(32)}`
    }
  ],
  currentStep: 0,
  createdAt: 1,
  updatedAt: 2
})

const makeReadyWorkflow = () => ({
  ...makeWorkflow(),
  status: 'ready',
  steps: [
    {
      ...makeWorkflow().steps[0],
      status: 'ready',
      txHash: undefined
    }
  ]
})

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
  getYearnWorkflows.mockResolvedValue({ workflows: [] })
  startYearnWorkflow.mockReset()
  revokeYearnWorkflow.mockReset()
  link.send.mockClear()
})

it('formats Yearn data freshness without exposing an invalid timestamp', () => {
  expect(formatUpdatedAt(1_000_000, 1_030_000)).toBe('just now')
  expect(formatUpdatedAt(1_000_000, 1_300_000)).toBe('5m ago')
  expect(formatUpdatedAt(null, 1_300_000)).toBe('Unavailable')
})

it('formats receipt base units without floating-point conversion', () => {
  expect(formatReceiptAmount('1200000', 6)).toBe('1.2')
  expect(formatReceiptAmount('1234567890123456789', 18)).toBe('~1.234567')
  expect(formatReceiptAmount('42', 0)).toBe('42')
})

it('fails closed while positions belong to the previously selected account', () => {
  const positions = makePositions()
  expect(positionsMatchAccount(positions, address.toUpperCase())).toBe(true)
  expect(positionsMatchAccount(positions, '0x00000000000000000000000000000000000000aa')).toBe(false)
  expect(positionsMatchAccount(positions, '')).toBe(false)
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

it('supports arrow-key navigation across chain tabs', async () => {
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  const all = screen.getByRole('tab', { name: 'All' })
  all.focus()

  await user.keyboard('{ArrowRight}')

  expect(screen.getByRole('tab', { name: 'Ethereum' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByRole('heading', { name: 'Base' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Ethereum' }))
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
  expect(screen.getByText(/Performance fee/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'View vault contract (external)' })).toBeTruthy()
})

it('moves focus through vault details and restores the invoking controls', async () => {
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  const vaultButton = screen.getByRole('button', { name: 'View yvUSD on Ethereum' })

  await user.click(vaultButton)
  expect(document.activeElement).toBe(document.querySelector('.earnDetails'))

  const depositButton = screen.getByRole('button', { name: 'Deposit' })
  await user.click(depositButton)
  expect(document.activeElement).toBe(document.querySelector('.earnActionForm'))
  await user.click(screen.getByRole('button', { name: 'Close Earn action' }))
  expect(document.activeElement).toBe(depositButton)

  await user.click(screen.getByRole('button', { name: '<- All vaults' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View yvUSD on Ethereum' }))
})

it('uses selected locked yvUSD metrics and labels root risk explicitly', async () => {
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'View yvUSD on Ethereum' }))
  await user.click(screen.getByRole('button', { name: /^Locked/ }))

  expect(screen.getByText('7%')).toBeTruthy()
  expect(screen.getByText('$500,000.0')).toBeTruthy()
  expect(screen.getByText('Underlying vault risk')).toBeTruthy()
})

it('clears an open action when the selected account changes', () => {
  const component = new Earn({})
  const nextAddress = '0x0000000000000000000000000000000000000002'
  component.accountKey = address
  component.state = { ...component.state, form: { action: 'deposit' } }
  component.store = jest.fn((path) => {
    if (path === 'selected.current') return nextAddress
    return {}
  })
  component.storeKey = component.currentStoreKey()
  component.setState = jest.fn()
  component.loadPositions = jest.fn()

  component.componentDidUpdate()

  expect(component.setState).toHaveBeenCalledWith({ form: null, error: '' })
})

it('keeps persisted workflow mutations disabled for a watch-only account', async () => {
  getYearnPositions.mockResolvedValue(makePositions(true))
  const approvalWorkflow = {
    ...makeReadyWorkflow(),
    id: '00000000-0000-4000-8000-000000000004',
    status: 'canceled',
    error: 'Approval transaction confirmed, but the token allowance remains nonzero',
    currentStep: 1,
    steps: [
      {
        ...makeReadyWorkflow().steps[0],
        kind: 'approve',
        status: 'confirmed',
        approvalToken: address,
        approvalSpender: address
      },
      { ...makeReadyWorkflow().steps[0], id: '00000000-0000-4000-8000-000000000003', status: 'error' }
    ]
  }
  getYearnWorkflows.mockResolvedValue({ workflows: [makeReadyWorkflow(), approvalWorkflow] })
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'View yvUSD on Ethereum' }))

  expect(screen.getByRole('button', { name: 'Resume' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Revoke approval' }).disabled).toBe(true)
})

it('requires a separate recheck before offering to retry an unknown approval cleanup', async () => {
  const cleanup = {
    ...makeWorkflow(),
    action: 'revoke',
    status: 'canceled',
    cleanupRecovery: 'unknown-outcome',
    error: 'Request outcome is unknown after restart; verify the account on-chain before starting again',
    steps: [
      {
        ...makeWorkflow().steps[0],
        kind: 'revoke',
        status: 'error',
        approvalToken: address,
        approvalSpender: address
      }
    ]
  }
  const rechecked = {
    ...cleanup,
    cleanupRecovery: 'allowance-nonzero',
    error: 'Allowance remains nonzero; verify no prior request is pending before choosing Revoke again'
  }
  revokeYearnWorkflow
    .mockResolvedValueOnce(rechecked)
    .mockResolvedValueOnce({ ...rechecked, status: 'active', cleanupRecovery: undefined, error: undefined })
  getYearnWorkflows.mockResolvedValue({ workflows: [cleanup] })
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'View yvUSD on Ethereum' }))

  await user.click(screen.getByRole('button', { name: 'Recheck approval' }))
  expect(revokeYearnWorkflow).toHaveBeenCalledWith(cleanup.id)

  await user.click(await screen.findByRole('button', { name: 'Revoke again' }))
  expect(revokeYearnWorkflow).toHaveBeenCalledTimes(2)
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

it('builds a locked yvUSD deposit intent from explicit variant and amount choices', async () => {
  startYearnWorkflow.mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    account: address,
    vaultId: 'ethereum-yvusd',
    chainId: 1,
    action: 'deposit',
    variant: 'locked',
    amountRaw: '1250000',
    displayAmount: '1.25',
    symbol: 'USDC',
    max: false,
    maxLossBps: 0,
    status: 'active',
    steps: [],
    currentStep: 0,
    createdAt: 1,
    updatedAt: 1
  })
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'View yvUSD on Ethereum' }))
  await user.click(screen.getByRole('button', { name: /^Locked/ }))
  await user.click(screen.getByRole('button', { name: 'Deposit' }))
  await user.type(screen.getByRole('textbox', { name: 'Amount in USDC' }), '1.25')
  await user.click(screen.getByRole('button', { name: 'Review Deposit' }))

  expect(startYearnWorkflow).toHaveBeenCalledWith({
    vaultId: 'ethereum-yvusd',
    action: 'deposit',
    variant: 'locked',
    amount: '1.25',
    max: false
  })
})

it('builds a locked yvUSD cooldown intent from the on-chain position state', async () => {
  getYearnPositions.mockResolvedValue({
    ...makePositions(),
    chains: makePositions().chains.map((chain) =>
      chain.chainId === 1 ? { ...chain, positions: [lockedPosition] } : chain
    )
  })
  startYearnWorkflow.mockResolvedValue(makeWorkflow())
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'Manage yvUSD position' }))
  await user.click(screen.getByRole('button', { name: 'Start locked cooldown' }))
  await user.click(screen.getByRole('button', { name: 'Max' }))
  await user.click(screen.getByRole('button', { name: 'Review Start cooldown' }))

  expect(startYearnWorkflow).toHaveBeenCalledWith({
    vaultId: 'ethereum-yvusd',
    action: 'start-cooldown',
    variant: 'locked',
    amount: '0',
    max: true
  })
})

it('shows cooldown-held locked shares in the withdrawal form', async () => {
  const coolingPosition = {
    ...lockedPosition,
    variants: lockedPosition.variants.map((variant) =>
      variant.id === 'locked'
        ? {
            ...variant,
            sharesRaw: '0',
            shares: '0.0',
            assetsRaw: '0',
            assets: '0.0',
            cooldown: {
              ...variant.cooldown,
              status: 'withdrawal-window',
              sharesRaw: '2000000',
              shares: '2.0'
            }
          }
        : variant
    )
  }
  getYearnPositions.mockResolvedValue({
    ...makePositions(),
    chains: makePositions().chains.map((chain) =>
      chain.chainId === 1 ? { ...chain, positions: [coolingPosition] } : chain
    )
  })
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'Manage yvUSD position' }))
  await user.click(screen.getByRole('button', { name: /^Locked/ }))
  await user.click(screen.getByRole('button', { name: 'Withdraw' }))

  expect(screen.getByText('Cooldown: 2 styvUSD')).toBeTruthy()
  expect(screen.queryByText('Position: 0 yvUSD')).toBeNull()
})

it('disables cooldown actions when the on-chain cooldown read failed', async () => {
  const unreadableCooldown = {
    ...lockedPosition,
    variants: lockedPosition.variants.map((variant) =>
      variant.id === 'locked' ? { ...variant, cooldown: null } : variant
    )
  }
  getYearnPositions.mockResolvedValue({
    ...makePositions(),
    chains: makePositions().chains.map((chain) =>
      chain.chainId === 1 ? { ...chain, positions: [unreadableCooldown] } : chain
    )
  })
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'Manage yvUSD position' }))

  expect(screen.getByRole('button', { name: 'Start locked cooldown' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel cooldown' }).disabled).toBe(true)
})

it('links confirmed workflow steps to the matching chain explorer', async () => {
  const workflow = {
    ...makeWorkflow(),
    steps: [
      {
        ...makeWorkflow().steps[0],
        receiptTransfers: [
          {
            token: address,
            direction: 'in',
            amountRaw: '1200000',
            symbol: 'yvUSD',
            decimals: 6
          }
        ]
      }
    ]
  }
  getYearnWorkflows.mockResolvedValue({ workflows: [workflow] })
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'View yvUSD on Ethereum' }))
  expect(screen.getByTitle(address).textContent).toMatch(/Received.*1\.2.*yvUSD/)
  await user.click(screen.getByRole('button', { name: 'View transaction' }))

  expect(link.send).toHaveBeenCalledWith(
    'tray:openExplorer',
    { type: 'ethereum', id: 1 },
    workflow.steps[0].txHash
  )
})

it('disables stale deposits while preserving exits from an existing position', async () => {
  getYearnCatalog.mockResolvedValue({
    status: 'stale',
    fetchedAt: 1234,
    vaults: vaults.map((vault) =>
      vault.id === 'ethereum-yvusd'
        ? { ...vault, status: 'unavailable', statusReason: 'No longer eligible' }
        : vault
    ),
    errors: [{ message: 'Kong unavailable' }]
  })
  const { user } = render(<ConnectedEarn />)
  await screen.findByRole('heading', { name: 'Ethereum' })
  await user.click(screen.getByRole('button', { name: 'Manage yvUSD position' }))

  expect(screen.getByRole('button', { name: 'Deposit' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Withdraw' }).disabled).toBe(false)
  expect(screen.getByText(/Existing positions remain withdrawable/)).toBeTruthy()
})
