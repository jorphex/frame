import {
  cancelYearnWorkflow,
  confirmYearnStep,
  failYearnStep,
  hasOutstandingApproval,
  queueYearnStep,
  retryYearnStep,
  submitYearnStep
} from '../../../../main/yearn/workflows/transitions'
import { buildYearnWorkflow } from '../../../../main/yearn/workflows/builders'
import { YEARN_CATALOG } from '../../../../main/yearn/catalog'
import type { YearnVault } from '../../../../resources/domain/yearn'

const definition = YEARN_CATALOG.find(({ id }) => id === 'base-yvusdc-h')!
const asset = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
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
let next = 0
const createId = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`
const workflow = () => {
  next = 0
  return buildYearnWorkflow({
    vault,
    account: '0x94112434c4c3ea14a4328a5d9383a00e78d772eb',
    action: 'deposit',
    variant: 'direct',
    amountRaw: 1_000_000n,
    displayAmount: '1',
    max: false,
    allowance: 0n,
    now: 1,
    createId
  })
}

it('advances only after a queued transaction is submitted and confirmed', () => {
  const queued = queueYearnStep(workflow(), 2)
  const submitted = submitYearnStep(queued, `0x${'ab'.repeat(32)}`, 3)
  const confirmed = confirmYearnStep(submitted, 4)

  expect(queued.steps[0].status).toBe('awaiting-review')
  expect(submitted.status).toBe('waiting-confirmation')
  expect(confirmed.steps.map(({ status }) => status)).toEqual(['confirmed', 'ready'])
  expect(confirmed.currentStep).toBe(1)
  expect(confirmYearnStep(submitYearnStep(queueYearnStep(confirmed), `0x${'cd'.repeat(32)}`)).status).toBe(
    'complete'
  )
})

it('keeps rejected steps retryable without inventing a transaction hash', () => {
  const failed = failYearnStep(queueYearnStep(workflow()), 'User rejected the request')
  expect(failed.status).toBe('error')
  expect(retryYearnStep(failed).steps[0].status).toBe('ready')
})

it('does not retry submitted failures or confirm unsubmitted steps', () => {
  const submitted = submitYearnStep(queueYearnStep(workflow()), `0x${'ab'.repeat(32)}`)
  const reverted = failYearnStep(submitted, 'Transaction reverted')
  expect(() => retryYearnStep(reverted)).toThrow('cannot be retried')
  expect(() => confirmYearnStep(workflow())).toThrow('no submitted step')
})

it('requires a revoke after a confirmed approval and blocks cancellation in flight', () => {
  const original = workflow()
  const submitted = submitYearnStep(queueYearnStep(original), `0x${'ab'.repeat(32)}`)
  expect(() => cancelYearnWorkflow(submitted)).toThrow('cannot be canceled')

  const approved = confirmYearnStep(submitted)
  expect(hasOutstandingApproval(approved)).toBe(true)
  expect(() => cancelYearnWorkflow(approved)).toThrow('Revoke')
  expect(cancelYearnWorkflow(original).status).toBe('canceled')
})
