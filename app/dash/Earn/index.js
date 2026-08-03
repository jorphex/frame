import React from 'react'
import Restore from 'react-restore'

import link from '../../../resources/link'
import { getYearnCatalog, getYearnPositions } from './api'

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
        {position?.hasPosition ? <span className='earnPositionPill'>Position</span> : null}
      </div>
      {unavailable ? <div className='earnVaultReason'>{vault.statusReason}</div> : null}
    </button>
  )
}

const PositionCard = ({ vault, position, onSelect }) => {
  const owned = position.variants.filter(({ sharesRaw }) => sharesRaw !== '0')
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
            {variant.assets !== null ? formatAmount(variant.assets) : formatAmount(variant.shares)}{' '}
            {variant.assets !== null ? variant.assetSymbol : variant.symbol}
          </div>
        ))}
      </div>
    </button>
  )
}

const VaultDetails = ({ vault, position, catalogStatus, account, chain, onBack }) => {
  const canTransact =
    vault.status === 'available' &&
    catalogStatus === 'fresh' &&
    account &&
    !account.readOnly &&
    ['ready', 'partial'].includes(chain?.status)
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
      {vault.kind === 'yvUSD' ? (
        <div className='earnVariants'>
          <h2>Choose how to earn</h2>
          <div className='earnVariantGrid'>
            {vault.variants.map((variant) => (
              <div className='earnVariant' key={variant.id}>
                <strong>{variant.id === 'locked' ? 'Locked' : 'Flexible'}</strong>
                <span>
                  {formatPercent(variant.apy.value)} {variant.apy.label}
                </span>
                <p>
                  {variant.id === 'locked'
                    ? 'Higher yield with a 14-day cooldown and 5-day withdrawal window.'
                    : 'Deposit and withdraw without a cooldown.'}
                </p>
              </div>
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
            .filter(({ sharesRaw }) => sharesRaw !== '0')
            .map((variant) => (
              <div className='earnOwnedLine' key={variant.address}>
                <span>{variant.id}</span>
                <strong>
                  {formatAmount(variant.shares)} {variant.symbol}
                </strong>
              </div>
            ))}
        </div>
      ) : null}
      {!canTransact ? (
        <div className='earnNotice earnDetailsNotice'>
          {account?.readOnly
            ? 'Watch-only accounts can inspect positions but cannot transact.'
            : catalogStatus !== 'fresh'
              ? 'Fresh Yearn data is required before creating a transaction.'
              : chain?.reason || vault.statusReason || 'Select a signing account to transact.'}
        </div>
      ) : null}
      <div className='earnActions'>
        <button type='button' disabled={!canTransact}>
          Deposit
        </button>
        <button type='button' disabled={!canTransact || !position?.hasPosition}>
          Withdraw
        </button>
      </div>
      <button
        type='button'
        className='earnYearnLink'
        onClick={() => link.send('tray:openExternal', vault.yearnUrl)}
      >
        View on Yearn (external)
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
    filter: 'all',
    selected: ''
  }

  componentDidMount() {
    this.mounted = true
    this.storeKey = this.currentStoreKey()
    this.load(false)
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
      const catalog = await getYearnCatalog(force)
      const positions = await getYearnPositions()
      if (this.mounted) this.setState({ catalog, positions, loading: false, refreshing: false })
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
                onSelect={(selected) => this.setState({ selected })}
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
              onSelect={(selected) => this.setState({ selected })}
            />
          ))}
        </div>
      </section>
    )
  }

  render() {
    const { catalog, positions, filter, selected } = this.state
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
          account={positions?.account}
          chain={positions?.chains.find(({ chainId }) => chainId === selectedVault.chainId)}
          onBack={() => this.setState({ selected: '' })}
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
            Showing {catalog.status === 'stale' ? 'cached' : 'unavailable'} Yearn data. Transactions are
            disabled.
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
        <footer className='earnFooter'>Curated locally. Metadata and estimated APY from Yearn Kong.</footer>
      </div>
    )
  }
}

export default Restore.connect(Earn)
