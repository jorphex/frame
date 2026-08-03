import { Interface, getAddress, parseUnits } from 'ethers'

import {
  YearnWorkflowListResultSchema,
  YearnWorkflowSchema,
  YearnWorkflowsSchema,
  type YearnCatalogResult,
  type YearnVault,
  type YearnVaultVariant,
  type YearnWorkflow,
  type YearnWorkflowIdRequest,
  type YearnWorkflowRequest,
  type YearnWorkflows
} from '../../../resources/domain/yearn'
import { isWatchOnlyAccountType } from '../../../resources/domain/signer'
import { buildYearnRevokeWorkflow, buildYearnWorkflow } from './builders'
import { assertYearnWorkflowStep } from '../../transaction/actions/yearn'
import {
  cancelYearnWorkflow,
  confirmYearnStep,
  failYearnStep,
  hasOutstandingApproval,
  queueYearnStep,
  retryYearnStep,
  submitYearnStep
} from './transitions'

const erc20 = new Interface([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)'
])
const erc4626 = new Interface([
  'function asset() view returns (address)',
  'function maxWithdraw(address owner) view returns (uint256)',
  'function maxRedeem(address owner) view returns (uint256)',
  'function previewWithdraw(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)'
])

export interface YearnWorkflowAccount {
  id?: string
  address?: string
  lastSignerType?: string
  requests?: Record<string, unknown>
}

export interface YearnQueuedTransaction {
  chainId: number
  account: string
  target: string
  data: string
}

export interface YearnQueuedResult {
  hash?: string
  error?: string
}

interface YearnWorkflowServiceDependencies {
  getCatalog: () => Promise<YearnCatalogResult>
  getCurrentAccount: () => YearnWorkflowAccount | null
  getNetworkStatus: (chainId: number) => { on: boolean; connected: boolean } | null
  readContract: (chainId: number, address: string, data: string) => Promise<string>
  getReceipt: (chainId: number, hash: string) => Promise<unknown>
  queueTransaction: (
    transaction: YearnQueuedTransaction,
    onResult: (result: YearnQueuedResult) => void
  ) => Promise<void>
  readWorkflows: () => unknown
  writeWorkflows: (workflows: YearnWorkflows) => void
  hasQueuedTransaction?: (transaction: YearnQueuedTransaction) => boolean
  now?: () => number
}

const MAX_WORKFLOWS = 64
const terminalStatuses = new Set<YearnWorkflow['status']>(['complete', 'canceled'])

const boundedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Yearn workflow failed'
  return message.trim().slice(0, 240) || 'Yearn workflow failed'
}

const checksum = (address: string) => getAddress(address.toLowerCase())

const decodeUint = (contract: Interface, method: string, result: string) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(result)) throw new Error('Invalid contract response')
  return contract.decodeFunctionResult(method, result)[0] as bigint
}

const decodeAddress = (contract: Interface, method: string, result: string) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(result)) throw new Error('Invalid contract response')
  return checksum(contract.decodeFunctionResult(method, result)[0] as string)
}

const findVariant = (vault: YearnVault, id: YearnWorkflowRequest['variant']) => {
  const variant = vault.variants.find((candidate) => candidate.id === id)
  if (!variant) throw new Error(`${id} is not available for ${vault.name}`)
  return variant
}

const accountAddress = (account: YearnWorkflowAccount | null) => {
  const address = account?.id || account?.address
  if (!address) return null
  try {
    return checksum(address)
  } catch {
    return null
  }
}

export function createYearnWorkflowService({
  getCatalog,
  getCurrentAccount,
  getNetworkStatus,
  readContract,
  getReceipt,
  queueTransaction,
  readWorkflows,
  writeWorkflows,
  hasQueuedTransaction = () => false,
  now = Date.now
}: YearnWorkflowServiceDependencies) {
  const busy = new Set<string>()

  const load = (): YearnWorkflows => {
    const parsed = YearnWorkflowsSchema.safeParse(readWorkflows())
    return parsed.success ? parsed.data : {}
  }

  const persist = (next: YearnWorkflows) => {
    const ordered = Object.values(next).sort((a, b) => b.updatedAt - a.updatedAt)
    const retained = [
      ...ordered.filter(({ status }) => !terminalStatuses.has(status)),
      ...ordered.filter(({ status }) => terminalStatuses.has(status))
    ].slice(0, MAX_WORKFLOWS)
    writeWorkflows(Object.fromEntries(retained.map((workflow) => [workflow.id, workflow])))
  }

  const save = (workflow: YearnWorkflow) => {
    const parsed = YearnWorkflowSchema.parse(workflow)
    persist({ ...load(), [parsed.id]: parsed })
    return parsed
  }

  const requireWorkflow = (id: string) => {
    const workflow = load()[id]
    if (!workflow) throw new Error('Yearn workflow was not found')
    return workflow
  }

  const readUint = async (chainId: number, address: string, method: string, args: unknown[]) => {
    const contract = ['maxWithdraw', 'maxRedeem', 'previewWithdraw', 'previewRedeem'].includes(method)
      ? erc4626
      : erc20
    const result = await readContract(chainId, address, contract.encodeFunctionData(method, args))
    return decodeUint(contract, method, result)
  }

  const readAsset = async (chainId: number, address: string) => {
    const result = await readContract(chainId, address, erc4626.encodeFunctionData('asset'))
    return decodeAddress(erc4626, 'asset', result)
  }

  const assertProductRoute = async (vault: YearnVault, variant: YearnVaultVariant) => {
    const rootAsset = await readAsset(vault.chainId, vault.address)
    if (rootAsset !== checksum(vault.asset.address))
      throw new Error('Vault asset does not match Yearn metadata')
    if (variant.address.toLowerCase() === vault.address.toLowerCase()) return
    const companionAsset = await readAsset(vault.chainId, variant.address)
    if (companionAsset !== checksum(vault.address)) {
      throw new Error('Yearn companion vault does not match its allowlisted product')
    }
  }

  const resolveAmount = async (
    request: YearnWorkflowRequest,
    vault: YearnVault,
    variant: YearnVaultVariant,
    account: string
  ) => {
    if (request.action === 'cancel-cooldown') return { amount: 0n, displayAmount: '0' }
    if (vault.kind === 'yvUSD' && request.variant === 'locked') {
      if (request.action === 'withdraw') {
        if (request.max) {
          const lockedShares = await readUint(vault.chainId, variant.address, 'maxRedeem', [account])
          if (lockedShares <= 0n) throw new Error('Locked yvUSD is not in its withdrawal window')
          const unlockedShares = await readUint(vault.chainId, variant.address, 'previewRedeem', [
            lockedShares
          ])
          const underlyingAssets = await readUint(vault.chainId, vault.address, 'previewRedeem', [
            unlockedShares
          ])
          if (underlyingAssets <= 0n) throw new Error('Locked yvUSD withdrawal quote is unavailable')
          return {
            amount: underlyingAssets,
            operationAmount: lockedShares,
            secondaryAmount: unlockedShares,
            displayAmount: 'Max'
          }
        }
        let underlyingAssets: bigint
        try {
          underlyingAssets = parseUnits(request.amount, vault.asset.decimals)
        } catch {
          throw new Error(`Enter a valid ${vault.asset.symbol} amount`)
        }
        if (underlyingAssets <= 0n) throw new Error(`${vault.asset.symbol} amount must be greater than zero`)
        const unlockedShares = await readUint(vault.chainId, vault.address, 'previewWithdraw', [
          underlyingAssets
        ])
        const available = await readUint(vault.chainId, variant.address, 'maxWithdraw', [account])
        if (unlockedShares > available) {
          throw new Error('Amount exceeds locked yvUSD available in the current withdrawal window')
        }
        return {
          amount: underlyingAssets,
          operationAmount: unlockedShares,
          secondaryAmount: underlyingAssets,
          displayAmount: request.amount
        }
      }
      if (request.action === 'start-cooldown') {
        const lockedBalance = await readUint(vault.chainId, variant.address, 'balanceOf', [account])
        if (request.max) {
          if (lockedBalance <= 0n) throw new Error('No locked yvUSD is available to cool down')
          return {
            amount: lockedBalance,
            operationAmount: lockedBalance,
            displayAmount: 'Max'
          }
        }
        let underlyingAssets: bigint
        try {
          underlyingAssets = parseUnits(request.amount, vault.asset.decimals)
        } catch {
          throw new Error(`Enter a valid ${vault.asset.symbol} amount`)
        }
        const unlockedShares = await readUint(vault.chainId, vault.address, 'previewWithdraw', [
          underlyingAssets
        ])
        const lockedShares = await readUint(vault.chainId, variant.address, 'previewWithdraw', [
          unlockedShares
        ])
        if (lockedShares <= 0n || lockedShares > lockedBalance) {
          throw new Error('Amount exceeds the locked yvUSD balance')
        }
        return {
          amount: underlyingAssets,
          operationAmount: lockedShares,
          displayAmount: request.amount
        }
      }
    }
    const token =
      request.action === 'deposit'
        ? vault.asset
        : request.action === 'withdraw' && !request.max && ['direct', 'unlocked'].includes(request.variant)
          ? variant.asset
          : { ...variant, address: variant.address }
    let amount: bigint
    try {
      amount = request.max
        ? await readUint(vault.chainId, token.address, 'balanceOf', [account])
        : parseUnits(request.amount, token.decimals)
    } catch {
      throw new Error(`Enter a valid ${token.symbol} amount`)
    }
    if (amount <= 0n) throw new Error(`${token.symbol} amount must be greater than zero`)

    if (request.action === 'deposit' || request.action === 'stake') {
      const balance = await readUint(vault.chainId, token.address, 'balanceOf', [account])
      if (amount > balance) throw new Error(`Insufficient ${token.symbol} balance`)
    } else if (
      request.action === 'withdraw' &&
      !request.max &&
      ['direct', 'unlocked'].includes(request.variant)
    ) {
      const available = await readUint(vault.chainId, variant.address, 'maxWithdraw', [account])
      if (amount > available) throw new Error(`Amount exceeds the available ${token.symbol} withdrawal`)
    } else {
      const shares = await readUint(vault.chainId, variant.address, 'balanceOf', [account])
      if (amount > shares) throw new Error(`Amount exceeds the available ${variant.symbol} balance`)
    }
    return { amount, displayAmount: request.max ? 'Max' : request.amount }
  }

  const prepare = async (request: YearnWorkflowRequest) => {
    const account = getCurrentAccount()
    const address = accountAddress(account)
    if (!address) throw new Error('Select an account before using Earn')
    if (isWatchOnlyAccountType(account?.lastSignerType)) {
      throw new Error('Watch-only accounts cannot create Earn transactions')
    }

    const catalog = await getCatalog()
    const vault = catalog.vaults.find(({ id }) => id === request.vaultId)
    if (!vault) throw new Error("Vault is not in Frame's curated Yearn catalog")
    const isExit = ['withdraw', 'start-cooldown', 'cancel-cooldown', 'stake'].includes(request.action)
    if (!isExit && (catalog.status !== 'fresh' || vault.status !== 'available')) {
      throw new Error('Fresh eligible Yearn data is required before depositing')
    }
    const network = getNetworkStatus(vault.chainId)
    if (!network?.on) throw new Error(`Enable ${vault.chainName} before using this vault`)
    if (!network.connected) throw new Error(`${vault.chainName} is not connected`)

    const variant = findVariant(vault, request.variant)
    await assertProductRoute(vault, variant)
    const { amount, operationAmount, secondaryAmount, displayAmount } = await resolveAmount(
      request,
      vault,
      variant,
      address
    )
    const provisional = buildYearnWorkflow({
      vault,
      account: address,
      action: request.action,
      variant: request.variant,
      amountRaw: amount,
      displayAmount,
      max: request.max,
      allowance: 0n,
      ...(operationAmount !== undefined && { operationAmountRaw: operationAmount }),
      ...(secondaryAmount !== undefined && { secondaryAmountRaw: secondaryAmount }),
      now: now()
    })
    const approval = provisional.steps.find(({ kind }) => kind === 'approve')
    const allowance =
      approval?.approvalToken && approval.approvalSpender
        ? await readUint(vault.chainId, approval.approvalToken, 'allowance', [
            address,
            approval.approvalSpender
          ])
        : 0n
    return buildYearnWorkflow({
      vault,
      account: address,
      action: request.action,
      variant: request.variant,
      amountRaw: amount,
      displayAmount,
      max: request.max,
      allowance,
      ...(operationAmount !== undefined && { operationAmountRaw: operationAmount }),
      ...(secondaryAmount !== undefined && { secondaryAmountRaw: secondaryAmount }),
      now: now()
    })
  }

  const handleQueuedResult = (id: string, result: YearnQueuedResult) => {
    try {
      const workflow = requireWorkflow(id)
      if (result.error) {
        save(failYearnStep(workflow, result.error, now()))
        return
      }
      if (!result.hash) {
        save(failYearnStep(workflow, 'Transaction returned no hash', now()))
        return
      }
      save(submitYearnStep(workflow, result.hash, now()))
    } catch {
      // The request pipeline has already recorded the authoritative result.
    }
  }

  const queue = async (id: string) => {
    if (busy.has(id)) throw new Error('Yearn workflow is already being updated')
    busy.add(id)
    try {
      let workflow = requireWorkflow(id)
      if (workflow.status === 'error') workflow = save(retryYearnStep(workflow, now()))
      const current = workflow.steps[workflow.currentStep]
      if (!current) throw new Error('Yearn workflow has no current step')

      const selected = accountAddress(getCurrentAccount())
      if (!selected || selected !== checksum(workflow.account)) {
        throw new Error('Select the account that owns this Yearn workflow')
      }
      const network = getNetworkStatus(workflow.chainId)
      if (!network?.on || !network.connected) throw new Error('The workflow chain is not connected')

      const catalog = await getCatalog()
      const vault = catalog.vaults.find(({ id }) => id === workflow.vaultId)
      if (!vault) throw new Error("The workflow vault is no longer in Frame's curated catalog")
      const integrityWorkflow =
        workflow.action === 'revoke' && workflow.parentWorkflowId
          ? requireWorkflow(workflow.parentWorkflowId)
          : workflow
      assertYearnWorkflowStep(integrityWorkflow, current, vault)

      const lastConfirmedApproval = [...workflow.steps]
        .slice(0, workflow.currentStep)
        .reverse()
        .find(({ kind, status }) => ['approve', 'revoke'].includes(kind) && status === 'confirmed')
      if (lastConfirmedApproval?.approvalToken && lastConfirmedApproval.approvalSpender) {
        const allowance = await readUint(workflow.chainId, lastConfirmedApproval.approvalToken, 'allowance', [
          workflow.account,
          lastConfirmedApproval.approvalSpender
        ])
        const expected = lastConfirmedApproval.kind === 'approve' ? BigInt(workflow.amountRaw) : 0n
        if (allowance !== expected) {
          throw new Error('Token allowance changed; restart this Yearn workflow')
        }
      }

      workflow = save(queueYearnStep(workflow, now()))
      try {
        await queueTransaction(
          {
            chainId: workflow.chainId,
            account: workflow.account,
            target: current.target,
            data: current.data
          },
          (result) => handleQueuedResult(id, result)
        )
      } catch (error) {
        const latest = requireWorkflow(id)
        workflow =
          latest.status === 'error' ? latest : save(failYearnStep(latest, boundedError(error), now()))
      }
      return requireWorkflow(id)
    } finally {
      busy.delete(id)
    }
  }

  const syncOne = async (workflow: YearnWorkflow) => {
    const current = workflow.steps[workflow.currentStep]
    if (workflow.status !== 'waiting-confirmation' || current?.status !== 'submitted' || !current.txHash) {
      return workflow
    }
    try {
      const receipt = await getReceipt(workflow.chainId, current.txHash)
      if (receipt === null || receipt === undefined) return workflow
      if (!receipt || typeof receipt !== 'object') throw new Error('Transaction receipt was malformed')
      const candidate = receipt as Record<string, unknown>
      if (
        typeof candidate['transactionHash'] !== 'string' ||
        candidate['transactionHash'].toLowerCase() !== current.txHash.toLowerCase()
      ) {
        throw new Error('Transaction receipt did not match the Yearn step')
      }
      if (candidate['status'] === '0x1') {
        const confirmed = save(confirmYearnStep(workflow, now()))
        if (confirmed.status === 'complete' && confirmed.action === 'revoke' && confirmed.parentWorkflowId) {
          const parent = load()[confirmed.parentWorkflowId]
          if (parent && parent.status !== 'complete') {
            save(
              YearnWorkflowSchema.parse({ ...parent, status: 'canceled', error: undefined, updatedAt: now() })
            )
          }
        }
        return confirmed
      }
      if (candidate['status'] === '0x0') return save(failYearnStep(workflow, 'Transaction reverted', now()))
      throw new Error('Transaction receipt had an invalid status')
    } catch (error) {
      return save(YearnWorkflowSchema.parse({ ...workflow, error: boundedError(error), updatedAt: now() }))
    }
  }

  const list = async () => {
    const current = Object.values(load()).map((workflow) => {
      const step = workflow.steps[workflow.currentStep]
      if (
        workflow.status === 'active' &&
        step?.status === 'awaiting-review' &&
        !hasQueuedTransaction({
          chainId: workflow.chainId,
          account: workflow.account,
          target: step.target,
          data: step.data
        })
      ) {
        return save(
          failYearnStep(workflow, 'Frame restarted before this request completed; retry the step', now())
        )
      }
      return workflow
    })
    await Promise.all(current.map(syncOne))
    return YearnWorkflowListResultSchema.parse({
      workflows: Object.values(load()).sort((a, b) => b.updatedAt - a.updatedAt)
    })
  }

  const start = async (request: YearnWorkflowRequest) => {
    const workflow = save(await prepare(request))
    return queue(workflow.id)
  }

  const resume = async ({ id }: YearnWorkflowIdRequest) => {
    await syncOne(requireWorkflow(id))
    return queue(id)
  }

  const cancel = ({ id }: YearnWorkflowIdRequest) => save(cancelYearnWorkflow(requireWorkflow(id), now()))

  const revoke = async ({ id }: YearnWorkflowIdRequest) => {
    const parent = requireWorkflow(id)
    if (!hasOutstandingApproval(parent)) throw new Error('This workflow has no approval to revoke')
    const approval = [...parent.steps]
      .reverse()
      .find(({ kind, status }) => kind === 'approve' && status === 'confirmed')
    if (!approval) throw new Error('This workflow has no approval to revoke')
    const cleanup = save(buildYearnRevokeWorkflow(parent, approval, now()))
    return queue(cleanup.id)
  }

  return { start, list, resume, cancel, revoke }
}

export const YearnWorkflowReadInterfaces = { erc20, erc4626 }
