import { Interface, getAddress } from 'ethers'
import { v4 as uuid } from 'uuid'

import {
  YEARN_WORKFLOW_POLICY_VERSION,
  YearnWorkflowSchema,
  type YearnVault,
  type YearnWorkflow,
  type YearnWorkflowAction,
  type YearnWorkflowStep,
  type YearnWorkflowStepKind
} from '../../../resources/domain/yearn'
import {
  YEARN_YBOLD_STAKED_ADDRESS,
  YEARN_YBOLD_ZAP_ADDRESS,
  YEARN_YVUSD_LOCKED_ADDRESS,
  YEARN_YVUSD_ZAP_ADDRESS,
  yearnVaultKey,
  YEARN_ALLOWED_TARGETS
} from '../catalog'

const erc20 = new Interface(['function approve(address spender,uint256 amount) returns (bool)'])
const erc4626 = new Interface([
  'function deposit(uint256 assets,address receiver) returns (uint256)',
  'function withdraw(uint256 assets,address receiver,address owner) returns (uint256)',
  'function redeem(uint256 shares,address receiver,address owner) returns (uint256)'
])
const yvUsdZap = new Interface([
  'function zapIn(uint256 assets,address receiver) returns (uint256)',
  'function zapOut(uint256 shares,address receiver) returns (uint256)'
])
const yvUsdLocked = new Interface(['function startCooldown(uint256 shares)', 'function cancelCooldown()'])
const yBoldZap = new Interface([
  'function zapIn(uint256 assets,address receiver) returns (uint256)',
  'function zapOut(uint256 shares,address receiver,uint256 maxLoss) returns (uint256)'
])

export interface BuildYearnWorkflowInput {
  vault: YearnVault
  account: string
  action: Exclude<YearnWorkflowAction, 'revoke'>
  variant: 'direct' | 'unlocked' | 'locked' | 'staked'
  amountRaw: bigint
  displayAmount: string
  max: boolean
  allowance: bigint
  operationAmountRaw?: bigint
  secondaryAmountRaw?: bigint
  now?: number
  createId?: () => string
}

interface Operation {
  kind: Exclude<YearnWorkflowStepKind, 'approve' | 'revoke'>
  label: string
  target: string
  data: string
  amountRaw: bigint
  followUp?: {
    kind: Exclude<YearnWorkflowStepKind, 'approve' | 'revoke'>
    label: string
    target: string
    data: string
    amountRaw: bigint
  }
  approval?: { token: string; spender: string; amount: bigint }
  symbol: string
}

const checksummed = (address: string) => getAddress(address.toLowerCase())

const requireTarget = (chainId: number, target: string) => {
  const address = checksummed(target)
  if (!YEARN_ALLOWED_TARGETS.has(yearnVaultKey(chainId, address))) {
    throw new Error('Yearn transaction target is not allowlisted')
  }
  return address
}

const requireAmount = (amount: bigint, action: string) => {
  if (amount <= 0n) throw new Error(`${action} amount must be greater than zero`)
}

function operationFor(input: BuildYearnWorkflowInput): Operation {
  const { vault, action, variant, amountRaw, max } = input
  const account = checksummed(input.account)
  const root = requireTarget(vault.chainId, vault.address)
  const requestedVariant = vault.variants.find(({ id }) => id === variant)
  if (!requestedVariant) throw new Error(`${variant} is not available for ${vault.name}`)
  const variantAddress = requireTarget(vault.chainId, requestedVariant.address)

  if (action === 'cancel-cooldown') {
    if (vault.kind !== 'yvUSD' || variant !== 'locked') {
      throw new Error('Cooldown cancellation is only available for locked yvUSD')
    }
    return {
      kind: 'cancel-cooldown',
      label: 'Cancel yvUSD cooldown',
      target: requireTarget(vault.chainId, YEARN_YVUSD_LOCKED_ADDRESS),
      data: yvUsdLocked.encodeFunctionData('cancelCooldown'),
      amountRaw: 0n,
      symbol: requestedVariant.symbol
    }
  }

  requireAmount(amountRaw, action)

  if (action === 'start-cooldown') {
    if (vault.kind !== 'yvUSD' || variant !== 'locked') {
      throw new Error('Cooldown is only available for locked yvUSD')
    }
    const cooldownShares = input.operationAmountRaw ?? amountRaw
    return {
      kind: 'start-cooldown',
      label: 'Start yvUSD withdrawal cooldown',
      target: requireTarget(vault.chainId, YEARN_YVUSD_LOCKED_ADDRESS),
      data: yvUsdLocked.encodeFunctionData('startCooldown', [cooldownShares]),
      amountRaw: cooldownShares,
      symbol: input.max ? requestedVariant.symbol : vault.asset.symbol
    }
  }

  if (action === 'stake') {
    if (vault.kind !== 'yBOLD' || variant !== 'direct') {
      throw new Error('Stake is only available for unstaked yBOLD')
    }
    const staked = requireTarget(vault.chainId, YEARN_YBOLD_STAKED_ADDRESS)
    return {
      kind: 'stake',
      label: 'Stake yBOLD',
      target: staked,
      data: erc4626.encodeFunctionData('deposit', [amountRaw, account]),
      amountRaw,
      approval: { token: root, spender: staked, amount: amountRaw },
      symbol: requestedVariant.symbol
    }
  }

  if (action === 'deposit') {
    if (vault.kind === 'yvUSD' && variant === 'locked') {
      const zap = requireTarget(vault.chainId, YEARN_YVUSD_ZAP_ADDRESS)
      return {
        kind: 'deposit',
        label: 'Deposit into locked yvUSD',
        target: zap,
        data: yvUsdZap.encodeFunctionData('zapIn', [amountRaw, account]),
        amountRaw,
        approval: { token: checksummed(vault.asset.address), spender: zap, amount: amountRaw },
        symbol: vault.asset.symbol
      }
    }
    if (vault.kind === 'yBOLD') {
      if (variant !== 'staked') throw new Error('New yBOLD deposits must finish staked')
      const zap = requireTarget(vault.chainId, YEARN_YBOLD_ZAP_ADDRESS)
      return {
        kind: 'deposit',
        label: 'Deposit BOLD and stake yBOLD',
        target: zap,
        data: yBoldZap.encodeFunctionData('zapIn', [amountRaw, account]),
        amountRaw,
        approval: { token: checksummed(vault.asset.address), spender: zap, amount: amountRaw },
        symbol: vault.asset.symbol
      }
    }
    if (!['direct', 'unlocked'].includes(variant)) throw new Error('Invalid direct deposit variant')
    return {
      kind: 'deposit',
      label: `Deposit into ${vault.name}`,
      target: variantAddress,
      data: erc4626.encodeFunctionData('deposit', [amountRaw, account]),
      amountRaw,
      approval: {
        token: checksummed(requestedVariant.asset.address),
        spender: variantAddress,
        amount: amountRaw
      },
      symbol: requestedVariant.asset.symbol
    }
  }

  if (action !== 'withdraw') throw new Error('Unsupported Yearn workflow action')

  if (vault.kind === 'yvUSD' && variant === 'locked') {
    const primaryAmount = input.operationAmountRaw
    const secondaryAmount = input.secondaryAmountRaw
    if (primaryAmount === undefined || secondaryAmount === undefined) {
      throw new Error('Locked yvUSD withdrawal quote is incomplete')
    }
    return {
      kind: max ? 'redeem' : 'withdraw',
      label: 'Unlock locked yvUSD',
      target: variantAddress,
      data: max
        ? erc4626.encodeFunctionData('redeem', [primaryAmount, account, account])
        : erc4626.encodeFunctionData('withdraw', [primaryAmount, account, account]),
      amountRaw: primaryAmount,
      followUp: {
        kind: max ? 'redeem' : 'withdraw',
        label: 'Withdraw yvUSD as USDC',
        target: root,
        data: max
          ? erc4626.encodeFunctionData('redeem', [secondaryAmount, account, account])
          : erc4626.encodeFunctionData('withdraw', [secondaryAmount, account, account]),
        amountRaw: secondaryAmount
      },
      symbol: vault.asset.symbol
    }
  }
  if (vault.kind === 'yBOLD') {
    if (variant !== 'staked') throw new Error('Use Stake to complete an unstaked yBOLD position')
    const zap = requireTarget(vault.chainId, YEARN_YBOLD_ZAP_ADDRESS)
    return {
      kind: 'redeem',
      label: 'Withdraw staked yBOLD as BOLD',
      target: zap,
      data: yBoldZap.encodeFunctionData('zapOut', [amountRaw, account, 0]),
      amountRaw,
      approval: { token: variantAddress, spender: zap, amount: amountRaw },
      symbol: requestedVariant.symbol
    }
  }
  if (!['direct', 'unlocked'].includes(variant)) throw new Error('Invalid direct withdrawal variant')
  return max
    ? {
        kind: 'redeem',
        label: `Withdraw maximum from ${vault.name}`,
        target: variantAddress,
        data: erc4626.encodeFunctionData('redeem', [amountRaw, account, account]),
        amountRaw,
        symbol: requestedVariant.asset.symbol
      }
    : {
        kind: 'withdraw',
        label: `Withdraw from ${vault.name}`,
        target: variantAddress,
        data: erc4626.encodeFunctionData('withdraw', [amountRaw, account, account]),
        amountRaw,
        symbol: requestedVariant.asset.symbol
      }
}

function approvalSteps(operation: Operation, allowance: bigint, createId: () => string): YearnWorkflowStep[] {
  if (!operation.approval || allowance === operation.approval.amount) return []
  const { token, spender, amount } = operation.approval
  const metadata = { approvalToken: checksummed(token), approvalSpender: checksummed(spender) }
  const steps: YearnWorkflowStep[] = []
  if (allowance > 0n) {
    steps.push({
      id: createId(),
      kind: 'revoke',
      label: 'Reset existing approval',
      target: checksummed(token),
      data: erc20.encodeFunctionData('approve', [spender, 0]),
      amountRaw: '0',
      status: 'pending',
      ...metadata
    })
  }
  steps.push({
    id: createId(),
    kind: 'approve',
    label: `Approve exactly ${operation.symbol}`,
    target: checksummed(token),
    data: erc20.encodeFunctionData('approve', [spender, amount]),
    amountRaw: amount.toString(),
    status: 'pending',
    ...metadata
  })
  return steps
}

export function buildYearnWorkflow(input: BuildYearnWorkflowInput): YearnWorkflow {
  const createId = input.createId || uuid
  const operation = operationFor(input)
  const steps = [
    ...approvalSteps(operation, input.allowance, createId),
    {
      id: createId(),
      kind: operation.kind,
      label: operation.label,
      target: checksummed(operation.target),
      data: operation.data,
      amountRaw: operation.amountRaw.toString(),
      status: 'pending' as const
    },
    ...(operation.followUp
      ? [
          {
            id: createId(),
            kind: operation.followUp.kind,
            label: operation.followUp.label,
            target: checksummed(operation.followUp.target),
            data: operation.followUp.data,
            amountRaw: operation.followUp.amountRaw.toString(),
            status: 'pending' as const
          }
        ]
      : [])
  ]
  const firstStep = steps[0]
  if (!firstStep) throw new Error('Yearn workflow has no transaction steps')
  steps[0] = { ...firstStep, status: 'ready' }
  const now = input.now ?? Date.now()

  return YearnWorkflowSchema.parse({
    policyVersion: YEARN_WORKFLOW_POLICY_VERSION,
    id: createId(),
    account: checksummed(input.account),
    vaultId: input.vault.id,
    chainId: input.vault.chainId,
    action: input.action,
    variant: input.variant,
    amountRaw: input.amountRaw.toString(),
    displayAmount: input.displayAmount,
    symbol: operation.symbol,
    max: input.max,
    maxLossBps: 0,
    status: 'ready',
    steps,
    currentStep: 0,
    createdAt: now,
    updatedAt: now
  })
}

export function buildYearnRevokeWorkflow(
  parent: YearnWorkflow,
  step: Pick<YearnWorkflowStep, 'approvalToken' | 'approvalSpender'>,
  now = Date.now(),
  createId: () => string = uuid
) {
  if (!step.approvalToken || !step.approvalSpender) {
    throw new Error('Yearn workflow has no approval to revoke')
  }
  const id = createId()
  return YearnWorkflowSchema.parse({
    policyVersion: YEARN_WORKFLOW_POLICY_VERSION,
    id,
    parentWorkflowId: parent.id,
    account: parent.account,
    vaultId: parent.vaultId,
    chainId: parent.chainId,
    action: 'revoke',
    variant: parent.variant,
    amountRaw: '0',
    displayAmount: '0',
    symbol: parent.symbol,
    max: false,
    maxLossBps: 0,
    status: 'ready',
    steps: [
      {
        id: createId(),
        kind: 'revoke',
        label: `Revoke ${parent.symbol} approval`,
        target: checksummed(step.approvalToken),
        data: erc20.encodeFunctionData('approve', [checksummed(step.approvalSpender), 0]),
        amountRaw: '0',
        status: 'ready',
        approvalToken: checksummed(step.approvalToken),
        approvalSpender: checksummed(step.approvalSpender)
      }
    ],
    currentStep: 0,
    createdAt: now,
    updatedAt: now
  })
}

export const YearnWorkflowInterfaces = { erc20, erc4626, yvUsdZap, yvUsdLocked, yBoldZap }
