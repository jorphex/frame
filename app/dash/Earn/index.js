import React from 'react'
import Restore from 'react-restore'

import link from '../../../resources/link'
import {
  cancelYearnWorkflow,
  getYearnCatalog,
  getYearnPositions,
  getYearnWorkflows,
  resumeYearnWorkflow,
  revokeYearnWorkflow,
  startYearnWorkflow
} from './api'

const CHAINS = [
  { id: 'all', name: 'All' },
  { id: 1, name: 'Ethereum' },
  { id: 8453, name: 'Base' },
  { id: 747474, name: 'Katana' }
]

export const formatPercent = (value) =>
  typeof value === 'number'
    ? `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
    : 'Unavailable'

export const formatUsd = (value) => {
  if (typeof value !== 'number') return 'Unavailable'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1_000 ? 1 : 0
  }).format(value)
}

export const formatAmount = (value) => {
  if (value === null || value === undefined) return 'Unavailable'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return numeric.toLocaleString(undefined, { maximumFractionDigits: numeric < 1 ? 6 : 4 })
}

export const formatUpdatedAt = (value, now = Date.now()) => {
  if (!Number.isSafeInteger(value) || value <= 0) return 'Unavailable'
  const elapsed = Math.max(0, now - value)
  if (elapsed < 60_000) return 'just now'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`
  return `${Math.floor(elapsed / 86_400_000)}d ago`
}

const formatFee = (basisPoints) =>
  `${(basisPoints / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`

const formatInception = (value) =>
  Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    : 'Unavailable'

const chainName = (chainId) => CHAINS.find(({ id }) => id === chainId)?.name || `Chain ${chainId}`

const ChainStatus = ({ chain }) => {
  if (!chain || ['ready', 'partial'].includes(chain.status)) {
    return chain?.status === 'partial' ? (
      <div className='earnNotice earnNoticeWarn'>
        Some balances could not be read. Available data is shown.
      </div>
    ) : null
  }
  return (
    <div className='earnNotice'>
      <span>{chain.reason || 'Position data is unavailable.'}</span>
      {['disabled', 'disconnected'].includes(chain.status) ? (
        <button
          type='button'
          onClick={() => link.send('tray:action', 'navDash', { view: 'chains', data: {} })}
        >
          Manage chain
        </button>
      ) : null}
    </div>
  )
}

const Metric = ({ label, value, detail }) => (
  <div className='earnMetric'>
    <div className='earnMetricLabel'>{label}</div>
    <div className='earnMetricValue'>{value}</div>
    {detail ? <div className='earnMetricDetail'>{detail}</div> : null}
  </div>
)

const VaultCard = ({ vault, position, onSelect }) => {
  const unavailable = vault.status !== 'available'
  return (
    <button
      type='button'
      className={`earnVault ${unavailable ? 'earnVaultUnavailable' : ''}`}
      onClick={() => onSelect(vault.id)}
      aria-label={`View ${vault.name} on ${vault.chainName}`}
    >
      <div className='earnVaultTop'>
        <div>
          <div className='earnVaultName'>{vault.name}</div>
          <div className='earnVaultAsset'>
            {vault.asset.symbol} / {vault.chainName}
          </div>
        </div>
        <div className='earnApy'>
          <strong>{formatPercent(vault.apy.value)}</strong>
          <span>{vault.apy.label}</span>
        </div>
      </div>
      <div className='earnVaultMetrics'>
        <span>{formatUsd(vault.tvlUsd)} TVL</span>
        <span>{vault.riskLabel} risk</span>
        {position?.assetBalance !== null && position?.assetBalance !== undefined ? (
          <span>
            {formatAmount(position.assetBalance)} {vault.asset.symbol} available
          </span>
        ) : null}
        {position?.hasPosition ? <span className='earnPositionPill'>Position</span> : null}
      </div>
      {unavailable ? <div className='earnVaultReason'>{vault.statusReason}</div> : null}
    </button>
  )
}

const PositionCard = ({ vault, position, onSelect }) => {
  const owned = position.variants.filter(
    ({ sharesRaw, cooldown }) => sharesRaw !== '0' || (cooldown?.sharesRaw || '0') !== '0'
  )
  return (
    <button
      type='button'
      className='earnPosition'
      onClick={() => onSelect(vault.id)}
      aria-label={`Manage ${vault.name} position`}
    >
      <div>
        <div className='earnPositionName'>{vault.name}</div>
        <div className='earnPositionChain'>{vault.chainName}</div>
      </div>
      <div className='earnPositionAmounts'>
        {owned.map((variant) => (
          <div key={variant.address}>
            {(variant.cooldown?.sharesRaw || '0') !== '0' ? (
              <>
                {formatAmount(variant.cooldown.shares)} {variant.symbol} ({variant.cooldown.status})
              </>
            ) : (
              <>
                {variant.assets !== null ? formatAmount(variant.assets) : formatAmount(variant.shares)}{' '}
                {variant.assets !== null ? variant.assetSymbol : variant.symbol}
              </>
            )}
          </div>
        ))}
      </div>
    </button>
  )
}

const actionTitle = (action) =>
  ({
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    stake: 'Stake yBOLD',
    'start-cooldown': 'Start cooldown',
    'cancel-cooldown': 'Cancel cooldown',
    revoke: 'Revoke approval'
  })[action] || 'Yearn action'

const durationDays = (seconds, fallback) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback
  const days = seconds / 86_400
  return Number.isInteger(days) ? `${days}-day` : `${days.toFixed(1)}-day`
}

const WorkflowCard = ({ workflow, onResume, onCancel, onRevoke, busy }) => {
  const lastConfirmedApproval = [...workflow.steps]
    .reverse()
    .find(({ kind, status }) => ['approve', 'revoke'].includes(kind) && status === 'confirmed')
  const outstandingApproval = lastConfirmedApproval?.kind === 'approve'
  const current = workflow.steps[workflow.currentStep]
  const canResume =
    ['ready', 'error'].includes(workflow.status) && current && !(current.status === 'error' && current.txHash)
  return (
    <div className='earnWorkflow'>
      <div className='earnWorkflowHead'>
        <strong>{actionTitle(workflow.action)}</strong>
        <span>{workflow.status.replaceAll('-', ' ')}</span>
      </div>
      <div className='earnWorkflowAmount'>
        {workflow.displayAmount} {workflow.symbol}
      </div>
      <ol>
        {workflow.steps.map((step, index) => (
          <li className={step.status} key={step.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <em>{step.status.replaceAll('-', ' ')}</em>
              {step.txHash ? (
                <button
                  type='button'
                  className='earnReceiptLink'
                  onClick={() =>
                    link.send('tray:openExplorer', { type: 'ethereum', id: workflow.chainId }, step.txHash)
                  }
                >
                  View transaction
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {workflow.error ? <div className='earnWorkflowError'>{workflow.error}</div> : null}
      <div className='earnWorkflowActions'>
        {canResume ? (
          <button type='button' disabled={busy} onClick={() => onResume(workflow.id)}>
            {workflow.status === 'error' ? 'Retry' : 'Resume'}
          </button>
        ) : null}
        {outstandingApproval && !['complete', 'canceled'].includes(workflow.status) ? (
          <button type='button' disabled={busy} onClick={() => onRevoke(workflow.id)}>
            Revoke approval
          </button>
        ) : null}
        {!outstandingApproval &&
        !['complete', 'canceled', 'waiting-confirmation'].includes(workflow.status) ? (
          <button type='button' disabled={busy} onClick={() => onCancel(workflow.id)}>
            Close
          </button>
        ) : null}
      </div>
    </div>
  )
}

const ActionForm = ({ vault, position, form, onChange, onSubmit, onClose }) => {
  const variant = vault.variants.find(({ id }) => id === form.variant)
  const owned = position?.variants.find(({ id }) => id === form.variant)
  const isCancel = form.action === 'cancel-cooldown'
  const symbol =
    form.action === 'deposit' ||
    (form.action === 'withdraw' && ['direct', 'unlocked', 'locked'].includes(form.variant)) ||
    form.action === 'start-cooldown'
      ? vault.asset.symbol
      : variant?.symbol || vault.symbol
  return (
    <div className='earnActionForm' aria-label={`${actionTitle(form.action)} ${vault.name}`}>
      <div className='earnActionHead'>
        <div>
          <span>{vault.chainName}</span>
          <h2>{actionTitle(form.action)}</h2>
        </div>
        <button type='button' onClick={onClose} aria-label='Close Earn action'>
          x
        </button>
      </div>
      <p>
        {form.action === 'deposit'
          ? `Deposit only ${vault.asset.symbol}; Frame will not swap or bridge assets.`
          : form.action === 'start-cooldown'
            ? 'Choose how much locked yvUSD to prepare for withdrawal.'
            : form.action === 'cancel-cooldown'
              ? 'Return cooling-down shares to the liquid locked position.'
              : form.variant === 'locked'
                ? `Exit locked yvUSD into ${vault.asset.symbol} during the active withdrawal window.`
                : `Withdraw directly to ${vault.asset.symbol}.`}
      </p>
      {!isCancel ? (
        <div className='earnAmountField'>
          <label htmlFor='earn-action-amount'>Amount in {symbol}</label>
          <div>
            <input
              id='earn-action-amount'
              type='text'
              inputMode='decimal'
              autoComplete='off'
              value={form.amount}
              disabled={form.max || form.busy}
              onChange={(event) => onChange({ amount: event.target.value, max: false, error: '' })}
              placeholder='0.0'
            />
            <button
              type='button'
              className={form.max ? 'active' : ''}
              disabled={form.busy}
              onClick={() => onChange({ max: !form.max, error: '' })}
            >
              Max
            </button>
          </div>
        </div>
      ) : null}
      {owned ? (
        <div className='earnAvailable'>
          Position: {formatAmount(owned.assets ?? owned.shares)}{' '}
          {owned.assets !== null ? owned.assetSymbol : owned.symbol}
        </div>
      ) : null}
      {form.error ? <div className='earnNotice earnNoticeWarn'>{form.error}</div> : null}
      <div className='earnActionSafety'>
        Exact approvals only. Every step opens Frame&apos;s normal simulation and signer review. Vault loss
        tolerance is 0%.
      </div>
      <button
        type='button'
        className='earnPrimaryAction'
        disabled={form.busy || (!isCancel && !form.max && !form.amount)}
        onClick={onSubmit}
      >
        {form.busy ? 'Preparing...' : `Review ${actionTitle(form.action)}`}
      </button>
    </div>
  )
}

const VaultDetails = ({
  vault,
  position,
  catalogStatus,
  catalogFetchedAt,
  account,
  chain,
  workflows,
  form,
  workflowBusy,
  selectedVariant: selectedVariantProp,
  onBack,
  onOpenAction,
  onFormChange,
  onSubmit,
  onCloseForm,
  onResume,
  onCancel,
  onRevoke
}) => {
  const signingAccount = account && !account.readOnly && ['ready', 'partial'].includes(chain?.status)
  const canDeposit = signingAccount && vault.status === 'available' && catalogStatus === 'fresh'
  const canExit = signingAccount && position?.hasPosition
  const selectedVariant =
    form?.variant ||
    selectedVariantProp ||
    (vault.kind === 'yvUSD' ? 'unlocked' : vault.kind === 'yBOLD' ? 'staked' : 'direct')
  const locked = position?.variants.find(({ id }) => id === 'locked')
  const direct = position?.variants.find(({ id }) => id === 'direct')
  const cooldown = locked?.cooldown
  const canStartCooldown =
    canExit && locked?.sharesRaw !== '0' && ['none', 'expired'].includes(cooldown?.status || 'none')
  const canWithdrawLocked = canExit && cooldown?.status === 'withdrawal-window'
  const selectedOwned = position?.variants.find(({ id }) => id === selectedVariant)
  const canWithdrawSelected =
    selectedVariant === 'locked'
      ? canWithdrawLocked
      : Boolean(canExit && selectedOwned && selectedOwned.sharesRaw !== '0')
  const canCancelCooldown =
    canExit && ['cooling-down', 'withdrawal-window', 'expired'].includes(cooldown?.status)
  return (
    <div className='earnDetails cardShow'>
      <button type='button' className='earnTextButton' onClick={onBack}>
        {'<- All vaults'}
      </button>
      <div className='earnDetailsHero'>
        <div className='earnEyebrow'>
          {vault.chainName} / {vault.asset.symbol}
        </div>
        <h1>{vault.name}</h1>
        <p>{vault.description}</p>
      </div>
      <div className='earnDetailsMetrics'>
        <Metric label={vault.apy.label} value={formatPercent(vault.apy.value)} />
        <Metric label='TVL' value={formatUsd(vault.tvlUsd)} />
        <Metric
          label='Risk'
          value={vault.riskLabel}
          detail={vault.riskLevel ? `Yearn level ${vault.riskLevel}` : ''}
        />
      </div>
      <div className='earnVaultFacts'>
        <span>Performance fee {formatFee(vault.performanceFeeBps)}</span>
        <span>Management fee {formatFee(vault.managementFeeBps)}</span>
        <span>Available since {formatInception(vault.inceptionTime)}</span>
        <span>Yearn data updated {formatUpdatedAt(catalogFetchedAt)}</span>
      </div>
      {vault.kind === 'yvUSD' ? (
        <div className='earnVariants'>
          <h2>Choose how to earn</h2>
          <div className='earnVariantGrid'>
            {vault.variants.map((variant) => (
              <button
                type='button'
                className={`earnVariant ${selectedVariant === variant.id ? 'earnVariantSelected' : ''}`}
                key={variant.id}
                onClick={() => onFormChange({ variant: variant.id, error: '' })}
              >
                <strong>{variant.id === 'locked' ? 'Locked' : 'Flexible'}</strong>
                <span>
                  {formatPercent(variant.apy.value)} {variant.apy.label}
                </span>
                <p>
                  {variant.id === 'locked'
                    ? `Higher yield with a ${durationDays(
                        cooldown?.cooldownDuration,
                        '14-day'
                      )} cooldown and ${durationDays(cooldown?.withdrawalWindow, '5-day')} withdrawal window.`
                    : 'Deposit and withdraw without a cooldown.'}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {vault.kind === 'yBOLD' ? (
        <div className='earnProductNote'>
          Deposits finish staked as ysyBOLD. Existing unstaked yBOLD can be staked separately.
        </div>
      ) : null}
      {position?.hasPosition ? (
        <div className='earnOwned'>
          <h2>Your position</h2>
          {position.variants
            .filter(({ sharesRaw, cooldown }) => sharesRaw !== '0' || (cooldown?.sharesRaw || '0') !== '0')
            .map((variant) => (
              <div className='earnOwnedLine' key={variant.address}>
                <span>{variant.id}</span>
                <strong>
                  {formatAmount(variant.cooldown?.shares ?? variant.shares)} {variant.symbol}
                </strong>
                {variant.cooldown && variant.cooldown.status !== 'none' ? (
                  <em>{variant.cooldown.status.replace('-', ' ')}</em>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
      {cooldown ? (
        <div className='earnProductNote'>
          Locked yvUSD: {cooldown.status.replace('-', ' ')}.{' '}
          {durationDays(cooldown.cooldownDuration, '14-day')} cooldown,{' '}
          {durationDays(cooldown.withdrawalWindow, '5-day')} withdrawal window.
        </div>
      ) : null}
      {!signingAccount ? (
        <div className='earnNotice earnDetailsNotice'>
          {account?.readOnly
            ? 'Watch-only accounts can inspect positions but cannot transact.'
            : chain?.reason || 'Select a signing account to transact.'}
        </div>
      ) : null}
      {catalogStatus !== 'fresh' || vault.status !== 'available' ? (
        <div className='earnNotice earnDetailsNotice'>
          Deposits are disabled because current eligibility data is unavailable. Existing positions remain
          withdrawable.
        </div>
      ) : null}
      <div className='earnActions'>
        <button type='button' disabled={!canDeposit} onClick={() => onOpenAction('deposit', selectedVariant)}>
          Deposit
        </button>
        <button
          type='button'
          disabled={!canWithdrawSelected}
          onClick={() => onOpenAction('withdraw', selectedVariant)}
        >
          Withdraw
        </button>
      </div>
      {vault.kind === 'yvUSD' && locked ? (
        <div className='earnSecondaryActions'>
          <button
            type='button'
            disabled={!canStartCooldown}
            onClick={() => onOpenAction('start-cooldown', 'locked')}
          >
            Start locked cooldown
          </button>
          <button
            type='button'
            disabled={!canCancelCooldown}
            onClick={() => onOpenAction('cancel-cooldown', 'locked')}
          >
            Cancel cooldown
          </button>
        </div>
      ) : null}
      {vault.kind === 'yBOLD' && direct?.sharesRaw !== '0' ? (
        <div className='earnSecondaryActions'>
          <button type='button' disabled={!canExit} onClick={() => onOpenAction('stake', 'direct')}>
            Stake existing yBOLD
          </button>
        </div>
      ) : null}
      {form ? (
        <ActionForm
          vault={vault}
          position={position}
          form={form}
          onChange={onFormChange}
          onSubmit={onSubmit}
          onClose={onCloseForm}
        />
      ) : null}
      {workflows.length ? (
        <div className='earnWorkflows'>
          <h2>Recent activity</h2>
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              busy={workflowBusy}
              onResume={onResume}
              onCancel={onCancel}
              onRevoke={onRevoke}
            />
          ))}
        </div>
      ) : null}
      <button
        type='button'
        className='earnYearnLink'
        onClick={() => link.send('tray:openExternal', vault.yearnUrl)}
      >
        View on Yearn (external)
      </button>
      <button
        type='button'
        className='earnYearnLink'
        onClick={() =>
          link.send('tray:openExplorer', { type: 'ethereum', id: vault.chainId }, null, vault.address)
        }
      >
        View vault contract (external)
      </button>
      <div className='earnDisclosure'>
        Powered by Yearn. Vault deposits involve smart-contract and strategy risk.
      </div>
    </div>
  )
}

export class Earn extends React.Component {
  state = {
    loading: true,
    refreshing: false,
    error: '',
    catalog: null,
    positions: null,
    workflows: [],
    filter: 'all',
    selected: '',
    selectedVariant: '',
    form: null,
    workflowBusy: false
  }

  componentDidMount() {
    this.mounted = true
    this.storeKey = this.currentStoreKey()
    this.load(false)
    this.workflowTimer = setInterval(() => this.loadWorkflows(), 15_000)
  }

  componentDidUpdate() {
    const nextKey = this.currentStoreKey()
    if (nextKey !== this.storeKey) {
      this.storeKey = nextKey
      this.loadPositions()
    }
  }

  componentWillUnmount() {
    this.mounted = false
    clearInterval(this.workflowTimer)
  }

  currentStoreKey() {
    const selected = this.store('selected.current') || ''
    const networks = [1, 8453, 747474].map((id) => {
      const network = this.store('main.networks.ethereum', id) || {}
      return [
        id,
        network.on,
        network.connection?.primary?.connected,
        network.connection?.secondary?.connected
      ]
    })
    return JSON.stringify([selected, networks])
  }

  async load(force) {
    this.setState({ loading: !this.state.catalog, refreshing: Boolean(this.state.catalog), error: '' })
    try {
      const [catalog, positions, workflowResult] = await Promise.all([
        getYearnCatalog(force),
        getYearnPositions(),
        getYearnWorkflows()
      ])
      if (this.mounted) {
        this.setState({
          catalog,
          positions,
          workflows: workflowResult.workflows,
          loading: false,
          refreshing: false
        })
      }
    } catch {
      if (this.mounted) {
        this.setState({ error: 'Earn data could not be loaded.', loading: false, refreshing: false })
      }
    }
  }

  async loadPositions() {
    try {
      const positions = await getYearnPositions()
      if (this.mounted) this.setState({ positions })
    } catch {
      if (this.mounted) this.setState({ error: 'Account positions could not be refreshed.' })
    }
  }

  async loadWorkflows() {
    try {
      const result = await getYearnWorkflows()
      if (this.mounted) {
        const previous = new Map(this.state.workflows.map(({ id, status }) => [id, status]))
        const completed = result.workflows.some(
          ({ id, status }) => status === 'complete' && previous.get(id) !== 'complete'
        )
        this.setState({ workflows: result.workflows })
        if (completed) this.loadPositions()
      }
    } catch {
      if (this.mounted) this.setState({ error: 'Earn activity could not be refreshed.' })
    }
  }

  selectVault(selected) {
    const vault = this.state.catalog?.vaults.find(({ id }) => id === selected)
    const selectedVariant =
      vault?.kind === 'yvUSD' ? 'unlocked' : vault?.kind === 'yBOLD' ? 'staked' : 'direct'
    this.setState({ selected, selectedVariant, form: null, error: '' })
  }

  openAction(action, variant) {
    const vault = this.state.catalog?.vaults.find(({ id }) => id === this.state.selected)
    const safeVariant = vault?.kind === 'yBOLD' && action === 'deposit' ? 'staked' : variant
    this.setState({
      selectedVariant: safeVariant,
      form: { action, variant: safeVariant, amount: '', max: false, busy: false, error: '' }
    })
  }

  changeForm(changes) {
    if (!this.state.form) {
      if (changes.variant) this.setState({ selectedVariant: changes.variant })
      return
    }
    this.setState(({ form }) => ({ form: { ...form, ...changes } }))
  }

  async submitForm() {
    const form = this.state.form
    if (!form) return
    this.changeForm({ busy: true, error: '' })
    try {
      const workflow = await startYearnWorkflow({
        vaultId: this.state.selected,
        action: form.action,
        variant: form.variant,
        amount: form.amount || '0',
        max: form.max
      })
      if (this.mounted) {
        this.setState(({ workflows }) => ({
          workflows: [workflow, ...workflows.filter(({ id }) => id !== workflow.id)],
          form: null
        }))
      }
    } catch (error) {
      if (this.mounted)
        this.changeForm({ busy: false, error: error.message || 'Could not prepare transaction.' })
    }
  }

  async runWorkflow(operation, id) {
    if (this.state.workflowBusy) return
    this.setState({ workflowBusy: true, error: '' })
    try {
      const workflow = await operation(id)
      if (this.mounted) {
        this.setState(({ workflows }) => ({
          workflows: [workflow, ...workflows.filter(({ id: candidate }) => candidate !== workflow.id)],
          workflowBusy: false
        }))
      }
    } catch (error) {
      if (this.mounted)
        this.setState({ workflowBusy: false, error: error.message || 'Workflow update failed.' })
    }
  }

  positionFor(vaultId) {
    return this.state.positions?.chains
      .flatMap(({ positions }) => positions)
      .find((position) => position.vaultId === vaultId)
  }

  renderChain(chainId, vaults) {
    const positionChain = this.state.positions?.chains.find((chain) => chain.chainId === chainId)
    const positions = vaults
      .map((vault) => ({ vault, position: this.positionFor(vault.id) }))
      .filter(({ position }) => position?.hasPosition)
    return (
      <section className='earnChain' key={chainId} aria-labelledby={`earn-chain-${chainId}`}>
        <div className='earnChainHeading'>
          <h2 id={`earn-chain-${chainId}`}>{chainName(chainId)}</h2>
          <span>
            {vaults.length} curated {vaults.length === 1 ? 'vault' : 'vaults'}
          </span>
        </div>
        <ChainStatus chain={positionChain} />
        {positions.length ? (
          <div className='earnSection'>
            <h3>Your positions</h3>
            {positions.map(({ vault, position }) => (
              <PositionCard
                key={vault.id}
                vault={vault}
                position={position}
                onSelect={(selected) => this.selectVault(selected)}
              />
            ))}
          </div>
        ) : null}
        <div className='earnSection'>
          <h3>Opportunities</h3>
          {vaults.map((vault) => (
            <VaultCard
              key={vault.id}
              vault={vault}
              position={this.positionFor(vault.id)}
              onSelect={(selected) => this.selectVault(selected)}
            />
          ))}
        </div>
      </section>
    )
  }

  render() {
    const { catalog, positions, workflows, filter, selected } = this.state
    if (this.state.loading) return <div className='earnState cardShow'>Loading curated Yearn vaults...</div>
    if (!catalog) {
      return (
        <div className='earnState cardShow'>
          {this.state.error || 'Earn is unavailable.'}
          <button type='button' onClick={() => this.load(true)}>
            Try again
          </button>
        </div>
      )
    }
    const selectedVault = catalog.vaults.find(({ id }) => id === selected)
    if (selectedVault) {
      return (
        <VaultDetails
          vault={selectedVault}
          position={this.positionFor(selectedVault.id)}
          catalogStatus={catalog.status}
          catalogFetchedAt={catalog.fetchedAt}
          account={positions?.account}
          chain={positions?.chains.find(({ chainId }) => chainId === selectedVault.chainId)}
          workflows={workflows.filter(
            ({ vaultId, account }) =>
              vaultId === selectedVault.id &&
              account.toLowerCase() === positions?.account?.address.toLowerCase()
          )}
          form={this.state.form}
          workflowBusy={this.state.workflowBusy}
          selectedVariant={this.state.selectedVariant}
          onBack={() => this.setState({ selected: '', selectedVariant: '', form: null })}
          onOpenAction={(action, variant) => this.openAction(action, variant)}
          onFormChange={(changes) => this.changeForm(changes)}
          onSubmit={() => this.submitForm()}
          onCloseForm={() => this.setState({ form: null })}
          onResume={(id) => this.runWorkflow(resumeYearnWorkflow, id)}
          onCancel={(id) => this.runWorkflow(cancelYearnWorkflow, id)}
          onRevoke={(id) => this.runWorkflow(revokeYearnWorkflow, id)}
        />
      )
    }
    const visibleChains = CHAINS.slice(1).filter(({ id }) => filter === 'all' || id === filter)
    return (
      <div className='earn cardShow'>
        <header className='earnHero'>
          <div className='earnEyebrow'>Powered by Yearn</div>
          <h1>Earn</h1>
          <p>A focused list of established Yearn vaults, separated by chain.</p>
          <button
            type='button'
            className='earnRefresh'
            disabled={this.state.refreshing}
            onClick={() => this.load(true)}
          >
            {this.state.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </header>
        {catalog.status !== 'fresh' ? (
          <div className='earnNotice earnNoticeWarn'>
            Showing {catalog.status === 'stale' ? 'cached' : 'unavailable'} Yearn data. New deposits are
            disabled; existing positions remain manageable.
          </div>
        ) : null}
        {positions?.account ? (
          <div className='earnAccount'>
            <span>Account</span>
            <strong>
              {positions.account.name ||
                `${positions.account.address.slice(0, 6)}...${positions.account.address.slice(-4)}`}
            </strong>
            {positions.account.readOnly ? <em>Read only</em> : null}
          </div>
        ) : null}
        <div className='earnTabs' role='tablist' aria-label='Filter Earn by chain'>
          {CHAINS.map((chain) => (
            <button
              type='button'
              role='tab'
              aria-selected={filter === chain.id}
              className={filter === chain.id ? 'earnTabActive' : ''}
              key={chain.id}
              onClick={() => this.setState({ filter: chain.id })}
            >
              {chain.name}
            </button>
          ))}
        </div>
        {this.state.error ? <div className='earnNotice earnNoticeWarn'>{this.state.error}</div> : null}
        {visibleChains.map(({ id }) =>
          this.renderChain(
            id,
            catalog.vaults.filter(({ chainId }) => chainId === id)
          )
        )}
        <footer className='earnFooter'>
          Curated locally. Vault data from Yearn · Updated {formatUpdatedAt(catalog.fetchedAt)}.
        </footer>
      </div>
    )
  }
}

export default Restore.connect(Earn)
