import React from 'react'
import Restore from 'react-restore'
import svg from '../../../../../resources/svg'

export class ChainRequest extends React.Component {
  constructor(...args) {
    super(...args)
    this.state = { allowInput: false }
    setTimeout(() => {
      this.setState({ allowInput: true })
    }, 200)
  }

  render() {
    const { status, notice, type, chain } = this.props.req
    const origin = this.props.originName || 'Unknown'
    const destinationName = this.props.chainData?.destinationChainName || chain.name || 'Unknown'
    const sourceName = type === 'switchChain' ? this.props.chainData?.sourceChainName || 'Unknown' : ''

    let requestClass = 'signerRequest'
    if (status === 'success') requestClass += ' signerRequestSuccess'
    if (status === 'declined') requestClass += ' signerRequestDeclined'
    if (status === 'pending') requestClass += ' signerRequestPending'
    if (status === 'error') requestClass += ' signerRequestError'

    let originClass = 'requestProviderOrigin'
    if (origin.length > 28) originClass = 'requestProviderOrigin requestProviderOrigin18'
    if (origin.length > 36) originClass = 'requestProviderOrigin requestProviderOrigin12'
    return (
      <div key={this.props.req.id || this.props.req.handlerId} className={requestClass}>
        <div className='approveRequest'>
          {notice ? (
            <div className='requestNotice'>
              {status === 'pending' ? (
                <div className='requestNoticeInner'>
                  <div>
                    <div className='loader' />
                  </div>
                </div>
              ) : status === 'success' ? (
                <div className='requestNoticeInner'>{svg.octicon('check', { height: 80 })}</div>
              ) : status === 'error' || status === 'declined' ? (
                <div className='requestNoticeInner'>{svg.octicon('circle-slash', { height: 80 })}</div>
              ) : null}
            </div>
          ) : (
            <div className='approveTransactionPayload'>
              <div className='requestChainInner'>
                <div className={originClass}>{origin}</div>
                <div className={'requestChainOriginSub'}>
                  {type === 'switchChain' ? 'wants to switch chains' : 'wants to add chain'}
                </div>
                <div className='requestChainName'>
                  {type === 'switchChain'
                    ? `${sourceName} (${this.props.req.sourceChainId}) to ${destinationName} (${chain.id})`
                    : chain.name}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}

export default Restore.connect(ChainRequest)
