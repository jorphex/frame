import { Component, useState } from 'react'
import Restore from 'react-restore'
import BigNumber from 'bignumber.js'

import link from '../../link'

import { ClusterRow, ClusterValue } from '../Cluster'

import svg from '../../svg'
import { weiToGwei, hexToInt, roundGwei } from '../../utils'

function levelDisplay(level) {
  const gwei = weiToGwei(hexToInt(level))
  return roundGwei(gwei) || 0
}

function toDisplayUSD(num) {
  if (!num || num === 0) return '?'
  return BigNumber(num).toFixed(num >= 10 ? 0 : 2)
}

export function getAccountCodePresentation(classification) {
  if (classification?.status === 'no-code') {
    return {
      className: 'accountCodeType accountCodeTypeNoCode',
      label: 'RPC No Code',
      title:
        'The configured RPC reports no code for this address on this chain. This does not prove the address is an EOA.'
    }
  }
  if (classification?.status === 'delegated') {
    return {
      className: 'accountCodeType accountCodeTypeDelegated',
      label: 'RPC 7702',
      title: `The configured RPC reports an EIP-7702 delegation to ${classification.delegate}.`
    }
  }
  if (classification?.status === 'contract') {
    return {
      className: 'accountCodeType accountCodeTypeContract',
      label: 'RPC Contract',
      title: 'The configured RPC reports contract code for this account on this chain.'
    }
  }
  if (classification?.status === 'unavailable') {
    return {
      className: 'accountCodeType accountCodeTypeUnavailable',
      label: 'RPC Unknown',
      title: classification.reason || 'The configured RPC account code check is unavailable.'
    }
  }
  return {
    className: 'accountCodeType accountCodeTypePending',
    label: 'RPC Checking',
    title: 'Checking account code through the configured RPC.'
  }
}

const GasFees = ({ gasPrice, color }) => (
  <div className='gasItem gasItemLarge'>
    <div className='gasGweiNum'>{gasPrice}</div>
    <span className='gasGweiLabel' style={{ color }}>
      {'GWEI'}
    </span>
    <span className='gasLevelLabel'>{'Recommended'}</span>
  </div>
)

const GasFeesMarket = ({ gasPrice, fees: { nextBaseFee, maxPriorityFeePerGas }, color }) => {
  const [displayBaseHint, setDisplayBaseHint] = useState(false)
  const [displayPriorityHint, setDisplayPriorityHint] = useState(false)
  const calculatedFees = {
    actualBaseFee: roundGwei(weiToGwei(hexToInt(nextBaseFee))),
    priorityFee: levelDisplay(maxPriorityFeePerGas)
  }

  return (
    <>
      {displayBaseHint && (
        <div className='feeToolTip feeToolTipBase cardShow'>
          The current base fee is added with a buffer to cover the next 3 blocks, any amount greater than your
          block&apos;s base fee is refunded
        </div>
      )}
      {displayPriorityHint && (
        <div className='feeToolTip feeToolTipPriority cardShow'>
          A priority tip paid to validators is added to incentivize quick inclusion of your transaction into a
          block
        </div>
      )}
      <div className='gasItem gasItemSmall'>
        <div className='gasGweiNum'>{calculatedFees.actualBaseFee || '‹0.001'}</div>
        <span className='gasGweiLabel' style={{ color }}>
          {'GWEI'}
        </span>
        <span className='gasLevelLabel'>{'Current Base'}</span>
      </div>
      <div className='gasItem gasItemLarge'>
        <div
          className='gasArrow'
          onClick={() => setDisplayBaseHint(true)}
          onMouseLeave={() => setDisplayBaseHint(false)}
        >
          <div className='gasArrowNotify'>+</div>
          <div className='gasArrowInner'>{svg.chevron(27)}</div>
        </div>
        <div className='gasGweiNum'>{gasPrice || '‹0.001'}</div>
        <span className='gasGweiLabel' style={{ color }}>
          {'GWEI'}
        </span>
        <span className='gasLevelLabel'>{'Recommended'}</span>
        <div
          className='gasArrow gasArrowRight'
          onClick={() => setDisplayPriorityHint(true)}
          onMouseLeave={() => setDisplayPriorityHint(false)}
        >
          <div className='gasArrowInner'>{svg.chevron(27)}</div>
        </div>
      </div>
      <div className='gasItem gasItemSmall'>
        <div className='gasGweiNum'>{calculatedFees.priorityFee || '‹0.001'}</div>
        <span className='gasGweiLabel' style={{ color }}>
          {'GWEI'}
        </span>
        <span className='gasLevelLabel'>{'Priority Tip'}</span>
      </div>
    </>
  )
}

export class ChainSummaryComponent extends Component {
  constructor(...args) {
    super(...args)
    this.state = {
      expand: false,
      accountCode: undefined
    }
    this.accountCodeRequest = 0
  }

  componentDidMount() {
    this.refreshAccountCode()
    this.accountCodeRefresh = setInterval(() => this.refreshAccountCode(), 30_000)
  }

  componentDidUpdate(previousProps) {
    if (previousProps.address !== this.props.address || previousProps.chainId !== this.props.chainId) {
      this.refreshAccountCode()
    }
  }

  componentWillUnmount() {
    this.accountCodeRequest += 1
    clearInterval(this.accountCodeRefresh)
  }

  refreshAccountCode() {
    const { address, chainId } = this.props
    const request = ++this.accountCodeRequest
    if (!address || !chainId) return this.setState({ accountCode: undefined })

    this.setState({ accountCode: { status: 'pending', source: 'eth_getCode' } })
    link.rpc('getAccountCodeClassification', address, chainId, (error, result) => {
      if (request !== this.accountCodeRequest) return

      this.setState({
        accountCode: error
          ? { status: 'unavailable', source: 'eth_getCode', reason: String(error).slice(0, 240) }
          : result
      })
    })
  }

  render() {
    const { address, chainId } = this.props
    const type = 'ethereum'
    const currentChain = { type, id: chainId }
    const fees = this.store('main.networksMeta', type, chainId, 'gas.price.fees')
    const levels = this.store('main.networksMeta', type, chainId, 'gas.price.levels')
    const gasPrice = levelDisplay(levels.fast)

    const explorer = this.store('main.networks', type, chainId, 'explorer')
    const sampleOperations = this.store('main.networksMeta', type, chainId, 'gas.samples') || []

    // fees is either a populated object (EIP-1559 compatible) or falsy
    const displayFeeMarket = !!fees

    const actualFee = displayFeeMarket
      ? roundGwei(
          BigNumber(fees.maxPriorityFeePerGas).plus(BigNumber(fees.nextBaseFee)).shiftedBy(-9).toNumber()
        )
      : gasPrice
    const accountCode = address ? getAccountCodePresentation(this.state.accountCode) : undefined

    return (
      <>
        <ClusterRow>
          <ClusterValue
            onClick={() => {
              this.setState({ expanded: !this.state.expanded })
            }}
          >
            <div className='sliceTileGasPrice'>
              <div className='sliceTileGasPriceIcon' style={{ color: this.props.color }}>
                {svg.gas(12)}
              </div>
              <div className='sliceTileGasPriceNumber'>{actualFee || '‹0.001'}</div>
              <div className='sliceTileGasPriceUnit'>{'gwei'}</div>
            </div>
          </ClusterValue>
          <ClusterValue
            style={{ minWidth: '70px', maxWidth: '70px' }}
            onClick={
              explorer
                ? () => {
                    if (address) {
                      link.send('tray:openExplorer', currentChain, null, address)
                    } else {
                      link.rpc('openExplorer', currentChain, () => {})
                    }
                  }
                : undefined
            }
          >
            <div style={{ padding: '6px', color: !explorer && 'var(--outerspace05)' }}>
              <div>{address ? svg.accounts(16) : svg.telescope(18)}</div>
            </div>
          </ClusterValue>
          {accountCode && (
            <ClusterValue style={{ minWidth: '100px', maxWidth: '100px' }} pointerEvents={true}>
              <div className={accountCode.className} title={accountCode.title}>
                {accountCode.label}
              </div>
            </ClusterValue>
          )}
        </ClusterRow>
        {this.state.expanded && (
          <ClusterRow>
            <ClusterValue pointerEvents={true}>
              <div className='sliceGasBlock'>
                {displayFeeMarket ? (
                  <GasFeesMarket gasPrice={gasPrice} fees={fees} color={this.props.color} />
                ) : (
                  <GasFees gasPrice={gasPrice} color={this.props.color} />
                )}
              </div>
            </ClusterValue>
          </ClusterRow>
        )}
        <ClusterRow>
          {sampleOperations.map(({ label, estimates }, i) => {
            const cost = estimates.low?.cost.usd
            return (
              <ClusterValue key={i}>
                <div className='gasEstimate'>
                  <div className='gasEstimateRange'>
                    <span className='gasEstimateSymbol'>
                      {!cost || cost >= 0.01 || cost === '?' ? `$` : '<$'}
                    </span>
                    <span className='gasEstimateRangeLow'>{toDisplayUSD(cost)}</span>
                  </div>
                  <div className='gasEstimateLabel' style={{ color: this.props.color }}>
                    {label}
                  </div>
                </div>
              </ClusterValue>
            )
          })}
        </ClusterRow>
      </>
    )
  }
}

const Monitor = Restore.connect(ChainSummaryComponent)

export default Restore.connect(Monitor)
