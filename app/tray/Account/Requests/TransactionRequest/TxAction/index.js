import React from 'react'
import Restore from 'react-restore'
import BigNumber from 'bignumber.js'

import svg from '../../../../../../resources/svg'
import link from '../../../../../../resources/link'
import { ClusterBox, Cluster, ClusterRow, ClusterValue } from '../../../../../../resources/Components/Cluster'
import { formatDisplayDecimal, isUnlimited } from '../../../../../../resources/utils/numbers'
import { DisplayValue, DisplayCoinBalance } from '../../../../../../resources/Components/DisplayValue'
import { getAddress } from '../../../../../../resources/utils'

class TxSending extends React.Component {
  constructor(...args) {
    super(...args)
    this.state = {
      copied: false
    }
  }
  copyAddress(data) {
    link.send('tray:clipboardData', data)
    this.setState({ copied: true })
    setTimeout((_) => this.setState({ copied: false }), 1000)
  }
  render() {
    const req = this.props.req
    const contract = req.data.to.toLowerCase()
    const chainId = parseInt(req.data.chainId, 16)
    const chainName = this.store('main.networks.ethereum', chainId, 'name')

    const { action } = this.props
    const [actionClass, actionType] = action.id.split(':')

    if (actionClass === 'yearn') {
      const { amountRaw, decimals, symbol, spender, vaultName, maxLossBps } = action.data || {}
      const labels = {
        approve: amountRaw === '0' ? 'Revoke Yearn Approval' : 'Exact Yearn Approval',
        deposit: 'Yearn Vault Deposit',
        withdraw: 'Yearn Vault Withdrawal',
        stake: 'Stake Yearn Position',
        'start-cooldown': 'Start Yearn Cooldown',
        'cancel-cooldown': 'Cancel Yearn Cooldown'
      }
      const displayAmount =
        amountRaw !== undefined && decimals !== undefined
          ? `${formatDisplayDecimal(amountRaw, decimals)} ${symbol || ''}`.trim()
          : amountRaw

      return (
        <ClusterBox
          title={labels[actionType] || 'Yearn Vault Action'}
          subtitle={vaultName}
          animationSlot={this.props.i}
        >
          <Cluster>
            {displayAmount ? (
              <ClusterRow>
                <ClusterValue>
                  <div className='clusterFocus'>
                    <div>{amountRaw === '0' ? 'Allowance' : 'Amount'}</div>
                    <div className='clusterFocusHighlight'>{displayAmount}</div>
                  </div>
                </ClusterValue>
              </ClusterRow>
            ) : null}
            <ClusterRow>
              <ClusterValue>
                <div className='clusterTag'>Allowlisted Yearn contract on {chainName}</div>
              </ClusterValue>
            </ClusterRow>
            {spender ? (
              <ClusterRow>
                <ClusterValue>
                  <div className='clusterTag'>Exact approval only: {spender}</div>
                </ClusterValue>
              </ClusterRow>
            ) : null}
            {maxLossBps === 0 ? (
              <ClusterRow>
                <ClusterValue>
                  <div className='clusterTag'>Vault loss tolerance: 0%</div>
                </ClusterValue>
              </ClusterRow>
            ) : null}
          </Cluster>
        </ClusterBox>
      )
    }

    if (actionClass === 'erc20') {
      if (actionType === 'transfer') {
        const {
          amount,
          decimals,
          name,
          recipient: { address: recipientAddress, type: recipientType, ens: recipientEns },
          symbol
        } = action.data || {}
        const address = getAddress(recipientAddress)
        const ensName = recipientEns

        const isTestnet = this.store('main.networks', this.props.chain.type, this.props.chain.id, 'isTestnet')
        const rate = this.store('main.rates', contract)

        return (
          <ClusterBox title={`Sending ${symbol}`} subtitle={name} animationSlot={this.props.i}>
            <Cluster>
              <ClusterRow>
                <ClusterValue grow={2}>
                  <div className='txSendingValue'>
                    <DisplayCoinBalance amount={amount} decimals={decimals} symbol={symbol} />
                  </div>
                </ClusterValue>
                <ClusterValue>
                  <span className='_txMainTransferringEq'>{isTestnet ? '=' : '≈'}</span>
                  <DisplayValue
                    type='fiat'
                    value={amount}
                    valueDataParams={{ currencyRate: rate && rate.usd, isTestnet, decimals }}
                    currencySymbol='$'
                  />
                </ClusterValue>
              </ClusterRow>
              {address && recipientType === 'contract' ? (
                <ClusterRow>
                  <ClusterValue>
                    <div className='clusterTag'>{`to contract on ${chainName}`}</div>
                  </ClusterValue>
                </ClusterRow>
              ) : address ? (
                <ClusterRow>
                  <ClusterValue>
                    <div className='clusterTag'>{`to account on ${chainName}`}</div>
                  </ClusterValue>
                </ClusterRow>
              ) : null}

              {address && (
                <ClusterRow>
                  <ClusterValue
                    pointerEvents={true}
                    onClick={() => {
                      this.copyAddress(address)
                    }}
                  >
                    <div className='clusterAddress'>
                      {ensName ? (
                        <span className='clusterAddressRecipient'>{ensName}</span>
                      ) : (
                        <span className='clusterAddressRecipient'>
                          {address.substring(0, 8)}
                          {svg.octicon('kebab-horizontal', { height: 15 })}
                          {address.substring(address.length - 6)}
                        </span>
                      )}
                      <div className='clusterAddressRecipientFull'>
                        {this.state.copied ? (
                          <span>{'Address Copied'}</span>
                        ) : (
                          <span className='clusterFira'>{address}</span>
                        )}
                      </div>
                    </div>
                  </ClusterValue>
                </ClusterRow>
              )}
            </Cluster>
          </ClusterBox>
        )
      } else if (actionType === 'approve') {
        const {
          amount,
          decimals,
          spender: { address: recipientAddress, ens: spenderEns },
          symbol
        } = action.data || {}
        const address = recipientAddress
        const ensName = spenderEns
        const value = new BigNumber(amount)
        const revoke = value.eq(0)
        const displayAmount = isUnlimited(this.state.amount)
          ? 'unlimited'
          : formatDisplayDecimal(amount, decimals)
        const isSubmitted = req.status !== undefined

        return (
          <ClusterBox title={'Token Approval'} animationSlot={this.props.i}>
            <Cluster>
              {revoke ? (
                <ClusterRow>
                  <ClusterValue
                    onClick={() => {
                      if (!isSubmitted) {
                        link.send('nav:update', 'panel', {
                          data: { step: 'adjustApproval', actionId: action.id, requestedAmountHex: amount }
                        })
                      }
                    }}
                    style={isSubmitted ? { cursor: 'auto' } : {}}
                  >
                    <div className='clusterFocus'>
                      <div>{`Revoking Approval To Spend `}</div>
                      <div className='clusterFocusHighlight'>{`${symbol}`}</div>
                    </div>
                  </ClusterValue>
                </ClusterRow>
              ) : (
                <ClusterRow>
                  <ClusterValue
                    onClick={() => {
                      if (!isSubmitted) {
                        link.send('nav:update', 'panel', {
                          data: { step: 'adjustApproval', actionId: action.id, requestedAmountHex: amount }
                        })
                      }
                    }}
                    style={isSubmitted ? { cursor: 'auto' } : {}}
                  >
                    <div className='clusterFocus'>
                      <div>{`Granting Approval To Spend`}</div>
                      <div className='clusterFocusHighlight'>{`${displayAmount} ${symbol}`}</div>
                    </div>
                  </ClusterValue>
                </ClusterRow>
              )}
              {address && (
                <ClusterRow>
                  <ClusterValue
                    pointerEvents={true}
                    onClick={() => {
                      this.copyAddress(address)
                    }}
                  >
                    <div className='clusterAddress'>
                      {ensName ? (
                        <span className='clusterAddressRecipient'>{ensName}</span>
                      ) : (
                        <span className='clusterAddressRecipient'>
                          {address.substring(0, 8)}
                          {svg.octicon('kebab-horizontal', { height: 15 })}
                          {address.substring(address.length - 6)}
                        </span>
                      )}
                      <div className='clusterAddressRecipientFull'>
                        {this.state.copied ? (
                          <span>{'Address Copied'}</span>
                        ) : (
                          <span className='clusterFira'>{address}</span>
                        )}
                      </div>
                    </div>
                  </ClusterValue>
                </ClusterRow>
              )}
            </Cluster>
          </ClusterBox>
        )
      }
    }
  }
}

export default Restore.connect(TxSending)
