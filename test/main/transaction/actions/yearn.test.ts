import { getAddress } from 'ethers'

import {
  assertYearnWorkflowStep,
  recognizeYearnAction,
  YearnRecognitionInterfaces
} from '../../../../main/transaction/actions/yearn'
import {
  YEARN_CATALOG,
  YEARN_YBOLD_ZAP_ADDRESS,
  YEARN_YVUSD_LOCKED_ADDRESS
} from '../../../../main/yearn/catalog'
import { buildYearnWorkflow } from '../../../../main/yearn/workflows/builders'
import type { YearnVault } from '../../../../resources/domain/yearn'

const account = getAddress('0x94112434c4c3ea14a4328a5d9383a00e78d772eb')
const other = getAddress('0x1111111111111111111111111111111111111111')
const direct = YEARN_CATALOG.find(({ id }) => id === 'base-yvusdc-h')!
const yvUsd = YEARN_CATALOG.find(({ id }) => id === 'ethereum-yvusd')!
const yBold = YEARN_CATALOG.find(({ id }) => id === 'ethereum-ybold')!
const directAsset = {
  address: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase()),
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6
}
const hydratedDirect: YearnVault = {
  ...direct,
  symbol: 'yvUSDC-H',
  asset: directAsset,
  decimals: 6,
  tvlUsd: 1,
  apy: { value: 0.05, label: 'Est. APY', source: 'fixture' },
  riskLevel: 4,
  riskLabel: 'Aggressive',
  performanceFeeBps: 0,
  managementFeeBps: 0,
  inceptionTime: 1,
  yearnUrl: `https://yearn.fi/vaults/${direct.chainId}/${direct.address}`,
  status: 'available',
  variants: [
    {
      id: 'direct',
      address: direct.address,
      name: direct.name,
      symbol: 'yvUSDC-H',
      asset: directAsset,
      decimals: 6,
      tvlUsd: 1,
      apy: { value: 0.05, label: 'Est. APY', source: 'fixture' }
    }
  ]
}

it('recognizes an allowlisted direct vault deposit for the selected account', () => {
  const data = YearnRecognitionInterfaces.erc4626.encodeFunctionData('deposit', [1_000_000n, account])
  expect(
    recognizeYearnAction(data, {
      contractAddress: direct.address,
      chainId: direct.chainId,
      account,
      value: '0x0'
    })
  ).toMatchObject({
    id: 'yearn:deposit',
    data: { protocol: 'Yearn', vaultId: direct.id, amountRaw: '1000000', amountType: 'assets' }
  })
})

it('falls back when receiver, chain, target, or native value does not match', () => {
  const data = YearnRecognitionInterfaces.erc4626.encodeFunctionData('deposit', [1n, other])
  const context = { contractAddress: direct.address, chainId: direct.chainId, account }
  expect(recognizeYearnAction(data, context)).toBeUndefined()
  expect(recognizeYearnAction(data, { ...context, account: other, chainId: 1 })).toBeUndefined()
  expect(recognizeYearnAction(data, { ...context, account: other, value: '0x1' })).toBeUndefined()
})

it('recognizes exact approvals only when the spender is a curated Yearn route', () => {
  const token = directAsset.address
  const data = YearnRecognitionInterfaces.approve.encodeFunctionData('approve', [direct.address, 42n])
  expect(
    recognizeYearnAction(data, {
      contractAddress: token,
      chainId: direct.chainId,
      account,
      vaults: [hydratedDirect]
    })
  ).toMatchObject({
    id: 'yearn:approve',
    data: {
      token: getAddress(token.toLowerCase()),
      spender: getAddress(direct.address.toLowerCase()),
      amountRaw: '42'
    }
  })

  const unknown = YearnRecognitionInterfaces.approve.encodeFunctionData('approve', [other, 42n])
  expect(
    recognizeYearnAction(unknown, {
      contractAddress: token,
      chainId: direct.chainId,
      account,
      vaults: [hydratedDirect]
    })
  ).toBeUndefined()

  expect(
    recognizeYearnAction(data, {
      contractAddress: other,
      chainId: direct.chainId,
      account,
      vaults: [hydratedDirect]
    })
  ).toBeUndefined()
  expect(
    recognizeYearnAction(data, { contractAddress: token, chainId: direct.chainId, account })
  ).toBeUndefined()
})

it('recognizes locked yvUSD cooldown actions on the pinned companion', () => {
  const start = YearnRecognitionInterfaces.yvUsdLocked.encodeFunctionData('startCooldown', [9n])
  const cancel = YearnRecognitionInterfaces.yvUsdLocked.encodeFunctionData('cancelCooldown')
  const context = { contractAddress: YEARN_YVUSD_LOCKED_ADDRESS, chainId: yvUsd.chainId, account }

  expect(recognizeYearnAction(start, context)).toMatchObject({
    id: 'yearn:start-cooldown',
    data: { amountRaw: '9', amountType: 'shares' }
  })
  expect(recognizeYearnAction(cancel, context)).toMatchObject({ id: 'yearn:cancel-cooldown' })
})

it('recognizes yBOLD exits only with the selected receiver and zero maxLoss', () => {
  const valid = YearnRecognitionInterfaces.yBoldZap.encodeFunctionData('zapOut', [7n, account, 0])
  const lossy = YearnRecognitionInterfaces.yBoldZap.encodeFunctionData('zapOut', [7n, account, 1])
  const context = { contractAddress: YEARN_YBOLD_ZAP_ADDRESS, chainId: yBold.chainId, account }

  expect(recognizeYearnAction(valid, context)).toMatchObject({
    id: 'yearn:withdraw',
    data: { amountRaw: '7', amountType: 'shares', maxLossBps: 0 }
  })
  expect(recognizeYearnAction(lossy, context)).toBeUndefined()
})

it('rejects any persisted target, amount, receiver, or approval-scope mutation', () => {
  const workflow = buildYearnWorkflow({
    vault: hydratedDirect,
    account,
    action: 'deposit',
    variant: 'direct',
    amountRaw: 1_000_000n,
    displayAmount: '1',
    max: false,
    allowance: 0n
  })
  expect(assertYearnWorkflowStep(workflow, workflow.steps[0], hydratedDirect).id).toBe('yearn:approve')
  expect(() =>
    assertYearnWorkflowStep(workflow, { ...workflow.steps[0], target: other }, hydratedDirect)
  ).toThrow(/approval scope|curated vault/)
  expect(() =>
    assertYearnWorkflowStep(
      workflow,
      {
        ...workflow.steps[1],
        data: YearnRecognitionInterfaces.erc4626.encodeFunctionData('deposit', [2_000_000n, account])
      },
      hydratedDirect
    )
  ).toThrow('amount changed')
})
