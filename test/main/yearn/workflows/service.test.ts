import { Interface, getAddress } from 'ethers'

import {
  createYearnWorkflowService,
  YearnWorkflowReadInterfaces,
  type YearnQueuedResult
} from '../../../../main/yearn/workflows/service'
import { YEARN_CATALOG } from '../../../../main/yearn/catalog'
import type { YearnCatalogResult, YearnVault, YearnWorkflows } from '../../../../resources/domain/yearn'

const definition = YEARN_CATALOG.find(({ id }) => id === 'base-yvusdc-h')!
const account = getAddress('0x94112434c4c3ea14a4328a5d9383a00e78d772eb')
const asset = {
  address: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase()),
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6
}
const vault: YearnVault = {
  ...definition,
  symbol: 'yvUSDC-H',
  asset,
  decimals: 6,
  tvlUsd: 1,
  apy: { value: 0.05, label: 'Est. APY', source: 'fixture' },
  riskLevel: 4,
  riskLabel: 'Aggressive',
  performanceFeeBps: 0,
  managementFeeBps: 0,
  inceptionTime: 1,
  yearnUrl: `https://yearn.fi/vaults/${definition.chainId}/${definition.address}`,
  status: 'available',
  variants: [
    {
      id: 'direct',
      address: definition.address,
      name: definition.name,
      symbol: 'yvUSDC-H',
      asset,
      decimals: 6,
      tvlUsd: 1,
      apy: { value: 0.05, label: 'Est. APY', source: 'fixture' }
    }
  ]
}
const catalog = (status: YearnCatalogResult['status'] = 'fresh'): YearnCatalogResult => ({
  status,
  fetchedAt: 1,
  vaults: [vault],
  errors: []
})

const yvUsdDefinition = YEARN_CATALOG.find(({ id }) => id === 'ethereum-yvusd')!
const lockedDefinition = yvUsdDefinition.companions!.find(({ id }) => id === 'locked')!
const yvUsdVault: YearnVault = {
  ...yvUsdDefinition,
  symbol: 'yvUSD',
  asset: {
    address: getAddress('0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase()),
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6
  },
  decimals: 6,
  tvlUsd: 1,
  apy: { value: 0.05, label: 'Est. APY', source: 'fixture' },
  riskLevel: 2,
  riskLabel: 'Moderate',
  performanceFeeBps: 0,
  managementFeeBps: 0,
  inceptionTime: 1,
  yearnUrl: `https://yearn.fi/vaults/1/${yvUsdDefinition.address}`,
  status: 'available',
  variants: [
    {
      id: 'unlocked',
      address: yvUsdDefinition.address,
      name: 'yvUSD',
      symbol: 'yvUSD',
      asset: {
        address: getAddress('0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase()),
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6
      },
      decimals: 6,
      tvlUsd: 1,
      apy: { value: 0.05, label: 'Est. APY', source: 'fixture' }
    },
    {
      id: 'locked',
      address: lockedDefinition.address,
      name: 'Locked yvUSD',
      symbol: 'styvUSD',
      asset: {
        address: yvUsdDefinition.address,
        name: 'yvUSD',
        symbol: 'yvUSD',
        decimals: 6
      },
      decimals: 6,
      tvlUsd: 1,
      apy: { value: 0.07, label: 'Est. APY', source: 'fixture' }
    }
  ]
}

const erc20 = YearnWorkflowReadInterfaces.erc20
const erc4626 = YearnWorkflowReadInterfaces.erc4626
const erc4626Writes = new Interface([
  'function withdraw(uint256 assets,address receiver,address owner) returns (uint256)'
])
const selector = (contract: Interface, method: string) => contract.getFunction(method)!.selector

function setup(options: { readOnly?: boolean; catalogStatus?: YearnCatalogResult['status'] } = {}) {
  let workflows: YearnWorkflows = {}
  let clock = 10
  let allowance = 0n
  let tokenBalance = 100_000_000n
  let shareBalance = 50_000_000n
  let maxWithdraw = 45_000_000n
  const queued: Array<{
    transaction: { chainId: number; account: string; target: string; data: string }
    respond: (result: YearnQueuedResult) => void
  }> = []
  const receipts = new Map<string, unknown>()
  const readContract = jest.fn(async (_chainId: number, target: string, data: string) => {
    if (data.startsWith(selector(erc4626, 'asset'))) {
      return erc4626.encodeFunctionResult('asset', [asset.address])
    }
    if (data.startsWith(selector(erc20, 'allowance'))) {
      return erc20.encodeFunctionResult('allowance', [allowance])
    }
    if (data.startsWith(selector(erc4626, 'maxWithdraw'))) {
      return erc4626.encodeFunctionResult('maxWithdraw', [maxWithdraw])
    }
    if (data.startsWith(selector(erc20, 'balanceOf'))) {
      const value = target.toLowerCase() === asset.address.toLowerCase() ? tokenBalance : shareBalance
      return erc20.encodeFunctionResult('balanceOf', [value])
    }
    throw new Error('Unexpected contract call')
  })
  const service = createYearnWorkflowService({
    getCatalog: async () => catalog(options.catalogStatus),
    getCurrentAccount: () => ({
      id: account,
      lastSignerType: options.readOnly ? 'watch' : 'ring'
    }),
    getNetworkStatus: () => ({ on: true, connected: true }),
    readContract,
    getReceipt: async (_chainId, hash) => receipts.get(hash) ?? null,
    queueTransaction: async (transaction, respond) => {
      queued.push({ transaction, respond })
    },
    readWorkflows: () => workflows,
    writeWorkflows: (next) => {
      workflows = next
    },
    now: () => ++clock
  })
  return {
    service,
    queued,
    receipts,
    readContract,
    workflows: () => workflows,
    setAllowance: (value: bigint) => (allowance = value),
    setTokenBalance: (value: bigint) => (tokenBalance = value),
    setShareBalance: (value: bigint) => (shareBalance = value),
    setMaxWithdraw: (value: bigint) => (maxWithdraw = value)
  }
}

function setupLocked() {
  let workflows: YearnWorkflows = {}
  const queued: Array<{
    transaction: { chainId: number; account: string; target: string; data: string }
    respond: (result: YearnQueuedResult) => void
  }> = []
  const readContract = jest.fn(async (_chainId: number, target: string, data: string) => {
    const root = target.toLowerCase() === yvUsdVault.address.toLowerCase()
    if (data.startsWith(selector(erc4626, 'asset'))) {
      return erc4626.encodeFunctionResult('asset', [root ? yvUsdVault.asset.address : yvUsdVault.address])
    }
    if (data.startsWith(selector(erc4626, 'maxWithdraw'))) {
      return erc4626.encodeFunctionResult('maxWithdraw', [5_000_000n])
    }
    if (data.startsWith(selector(erc4626, 'maxRedeem'))) {
      return erc4626.encodeFunctionResult('maxRedeem', [2_000_000n])
    }
    if (data.startsWith(selector(erc4626, 'previewWithdraw'))) {
      const [amount] = erc4626.decodeFunctionData('previewWithdraw', data)
      return erc4626.encodeFunctionResult('previewWithdraw', [root ? amount + 100_000n : amount + 50_000n])
    }
    if (data.startsWith(selector(erc4626, 'previewRedeem'))) {
      const [amount] = erc4626.decodeFunctionData('previewRedeem', data)
      return erc4626.encodeFunctionResult('previewRedeem', [amount - 100_000n])
    }
    if (data.startsWith(selector(erc20, 'balanceOf'))) {
      return erc20.encodeFunctionResult('balanceOf', [2_000_000n])
    }
    throw new Error('Unexpected contract call')
  })
  const service = createYearnWorkflowService({
    getCatalog: async () => ({ status: 'fresh', fetchedAt: 1, vaults: [yvUsdVault], errors: [] }),
    getCurrentAccount: () => ({ id: account, lastSignerType: 'ring' }),
    getNetworkStatus: () => ({ on: true, connected: true }),
    readContract,
    getReceipt: async () => null,
    queueTransaction: async (transaction, respond) => queued.push({ transaction, respond }),
    readWorkflows: () => workflows,
    writeWorkflows: (next) => (workflows = next),
    now: () => 10
  })
  return { service, queued, readContract }
}

const depositRequest = {
  vaultId: vault.id,
  action: 'deposit' as const,
  variant: 'direct' as const,
  amount: '12.5',
  max: false
}

it('queues an exact approval and advances only after a matching successful receipt', async () => {
  const subject = setup()
  const started = await subject.service.start(depositRequest)

  expect(started.status).toBe('active')
  expect(started.steps.map(({ kind, status }) => [kind, status])).toEqual([
    ['approve', 'awaiting-review'],
    ['deposit', 'pending']
  ])
  expect(subject.queued).toHaveLength(1)
  subject.queued[0].respond({ hash: `0x${'ab'.repeat(32)}` })
  expect(subject.workflows()[started.id].status).toBe('waiting-confirmation')

  subject.receipts.set(`0x${'ab'.repeat(32)}`, {
    transactionHash: `0x${'ab'.repeat(32)}`,
    status: '0x1'
  })
  const listed = await subject.service.list()
  const approved = listed.workflows.find(({ id }) => id === started.id)!
  expect(approved.steps.map(({ status }) => status)).toEqual(['confirmed', 'ready'])

  subject.setAllowance(12_500_000n)
  const resumed = await subject.service.resume({ id: started.id })
  expect(resumed.steps[1].status).toBe('awaiting-review')
  expect(subject.queued[1].transaction.target).toBe(getAddress(vault.address.toLowerCase()))
})

it('uses the on-chain share balance for a Max direct withdrawal', async () => {
  const subject = setup()
  subject.setShareBalance(77n)
  const started = await subject.service.start({
    vaultId: vault.id,
    action: 'withdraw',
    variant: 'direct',
    amount: '0',
    max: true
  })

  expect(started.amountRaw).toBe('77')
  expect(started.displayAmount).toBe('Max')
  expect(started.steps).toHaveLength(1)
  expect(started.steps[0].kind).toBe('redeem')
})

it('quotes locked yvUSD exits across the locked and unlocked vaults', async () => {
  const exact = setupLocked()
  const exactWorkflow = await exact.service.start({
    vaultId: yvUsdVault.id,
    action: 'withdraw',
    variant: 'locked',
    amount: '1',
    max: false
  })
  expect(exactWorkflow.steps.map(({ kind, amountRaw }) => [kind, amountRaw])).toEqual([
    ['withdraw', '1100000'],
    ['withdraw', '1000000']
  ])
  expect(erc4626Writes.decodeFunctionData('withdraw', exactWorkflow.steps[0].data)[0]).toBe(1_100_000n)
  expect(erc4626Writes.decodeFunctionData('withdraw', exactWorkflow.steps[1].data)[0]).toBe(1_000_000n)

  const max = setupLocked()
  const maxWorkflow = await max.service.start({
    vaultId: yvUsdVault.id,
    action: 'withdraw',
    variant: 'locked',
    amount: '0',
    max: true
  })
  expect(maxWorkflow.amountRaw).toBe('1800000')
  expect(maxWorkflow.steps.map(({ kind, amountRaw }) => [kind, amountRaw])).toEqual([
    ['redeem', '2000000'],
    ['redeem', '1900000']
  ])
})

it('converts an exact locked yvUSD cooldown amount into locked shares', async () => {
  const subject = setupLocked()
  const workflow = await subject.service.start({
    vaultId: yvUsdVault.id,
    action: 'start-cooldown',
    variant: 'locked',
    amount: '1',
    max: false
  })

  expect(workflow.amountRaw).toBe('1000000')
  expect(workflow.steps).toHaveLength(1)
  expect(workflow.steps[0]).toMatchObject({ kind: 'start-cooldown', amountRaw: '1150000' })
})

it('rejects unsafe account, balance, and deposit data while allowing stale exits', async () => {
  await expect(setup({ readOnly: true }).service.start(depositRequest)).rejects.toThrow('Watch-only')

  const insufficient = setup()
  insufficient.setTokenBalance(1n)
  await expect(insufficient.service.start(depositRequest)).rejects.toThrow('Insufficient')

  await expect(setup({ catalogStatus: 'stale' }).service.start(depositRequest)).rejects.toThrow(
    'Fresh eligible'
  )
  await expect(
    setup({ catalogStatus: 'stale' }).service.start({
      vaultId: vault.id,
      action: 'withdraw',
      variant: 'direct',
      amount: '1',
      max: false
    })
  ).resolves.toMatchObject({ action: 'withdraw', status: 'active' })
})

it('keeps a submitted workflow pending across transient or malformed receipt responses', async () => {
  const subject = setup()
  subject.setAllowance(12_500_000n)
  await subject.service.start(depositRequest)
  const hash = `0x${'cd'.repeat(32)}`
  subject.queued[0].respond({ hash })
  subject.receipts.set(hash, { transactionHash: `0x${'ef'.repeat(32)}`, status: '0x1' })

  const [workflow] = (await subject.service.list()).workflows
  expect(workflow.status).toBe('waiting-confirmation')
  expect(workflow.error).toMatch(/did not match/)
})

it('persists rejection for retry and cleans up a confirmed approval before canceling its parent', async () => {
  const subject = setup()
  const rejected = await subject.service.start(depositRequest)
  subject.queued[0].respond({ error: 'User rejected the request' })
  expect(subject.workflows()[rejected.id]).toMatchObject({ status: 'error' })
  await expect(subject.service.resume({ id: rejected.id })).resolves.toMatchObject({ status: 'active' })

  const hash = `0x${'11'.repeat(32)}`
  subject.queued[1].respond({ hash })
  subject.receipts.set(hash, { transactionHash: hash, status: '0x1' })
  await subject.service.list()
  expect(() => subject.service.cancel({ id: rejected.id })).toThrow('Revoke')

  const cleanup = await subject.service.revoke({ id: rejected.id })
  expect(cleanup.action).toBe('revoke')
  const revokeHash = `0x${'22'.repeat(32)}`
  subject.queued[2].respond({ hash: revokeHash })
  subject.receipts.set(revokeHash, { transactionHash: revokeHash, status: '0x1' })
  await subject.service.list()
  expect(subject.workflows()[rejected.id].status).toBe('canceled')
})

it('rejects exact direct withdrawals above maxWithdraw', async () => {
  const subject = setup()
  subject.setMaxWithdraw(999_999n)
  await expect(
    subject.service.start({
      vaultId: vault.id,
      action: 'withdraw',
      variant: 'direct',
      amount: '1',
      max: false
    })
  ).rejects.toThrow('exceeds')
})

it('recovers an awaiting-review workflow when its request did not survive restart', async () => {
  const subject = setup()
  const started = await subject.service.start(depositRequest)

  const [recovered] = (await subject.service.list()).workflows
  expect(recovered).toMatchObject({ id: started.id, status: 'error' })
  expect(recovered.error).toMatch(/restarted/)

  await expect(subject.service.resume({ id: started.id })).resolves.toMatchObject({ status: 'active' })
  expect(subject.queued).toHaveLength(2)
})
