import React from 'react'
import Restore from 'react-restore'

import RequestItem from '../../../../../../resources/Components/RequestItem'
import { getReplacementStatus } from '../../../../../../resources/domain/transaction/replacement'
import { getOriginDisplayName } from '../../../../../../resources/domain/origin'
import TxOverview from './overview'

const replacementNotices = {
  'nonce-used': 'nonce used',
  'gas-price-too-low': 'gas price too low',
  'gas-fees-too-low': 'gas fees too low'
}

export class TxMain extends React.Component {
  constructor(...args) {
    super(...args)
    this.state = {
      copied: false
    }
  }

  getReplacementStatus(req, r) {
    const status = getReplacementStatus(req, Object.values(r || {}))
    return { ...status, notice: replacementNotices[status.reason] || '' }
  }

  render() {
    const req = this.props.req
    const chainId = parseInt(req.data.chainId, 16)
    const chainName = this.store('main.networks.ethereum', chainId, 'name')
    const currentSymbol = this.store('main.networksMeta.ethereum', chainId, 'nativeCurrency.symbol') || '?'
    const { accountId } = this.props
    const reqs = this.store('main.accounts', accountId, 'requests')
    const replacementStatus = this.getReplacementStatus(req, reqs)

    const { primaryColor, icon } = this.store('main.networksMeta.ethereum', chainId)
    const originName = getOriginDisplayName(this.store('main.origins', req.origin, 'name'))
    return (
      <div className='_txMain' style={{ animationDelay: 0.1 * this.props.i + 's' }}>
        <div className='_txMainInner'>
          <div
            className='_txMainBackground'
            style={{ background: `linear-gradient(135deg, var(--${primaryColor}) 0%, transparent 100%)` }}
          />
          <RequestItem
            req={req}
            account={accountId}
            handlerId={req.handlerId}
            title={`${chainName} Transaction`}
            color={primaryColor ? `var(--${primaryColor})` : ``}
            img={icon}
            headerMode={true}
          >
            <TxOverview
              req={req}
              chainName={chainName}
              chainColor={primaryColor}
              symbol={currentSymbol}
              replacementStatus={replacementStatus}
              originName={originName}
            />
          </RequestItem>
        </div>
      </div>
    )
  }
}

export default Restore.connect(TxMain)
