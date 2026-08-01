import React from 'react'

const callDestination = (call) => call.to || 'Contract deployment'

export class WalletCallsRequest extends React.Component {
  render() {
    const { req } = this.props
    const originName = this.props.originName || 'Unknown'
    const chainName = this.props.chainData?.chainName || `Chain ${parseInt(req.chainId, 16)}`
    const callLabel = req.calls.length === 1 ? 'call' : 'calls'

    return (
      <div key={req.handlerId} className='signerRequest cardShow'>
        <div className='approveRequest'>
          <div className='walletCallsReview'>
            <div className='walletCallsHeader'>
              <div className='walletCallsOrigin'>{originName}</div>
              <div className='walletCallsIntent'>
                requests {req.calls.length} ordered {callLabel}
              </div>
              <div className='walletCallsChain'>
                {chainName} ({req.chainId})
              </div>
              <div className='walletCallsSender'>{req.account}</div>
            </div>

            <div className='walletCallsWarning' role='alert'>
              <div className='walletCallsWarningTitle'>Non-atomic batch</div>
              <div>
                Each call becomes a separate transaction and can incur its own gas fee. A later call can
                remain unsent after earlier calls are already onchain. No call is sent before the whole batch
                is approved.
              </div>
            </div>

            <div className='walletCallsList'>
              {req.calls.map((call, index) => (
                <div className='walletCall' key={`${index}:${call.to || 'deployment'}`}>
                  <div className='walletCallNumber'>Call {index + 1}</div>
                  <dl>
                    <div className='walletCallField'>
                      <dt>Destination</dt>
                      <dd>{callDestination(call)}</dd>
                    </div>
                    <div className='walletCallField'>
                      <dt>Raw value</dt>
                      <dd>{call.value}</dd>
                    </div>
                    <div className='walletCallField'>
                      <dt>Calldata</dt>
                      <dd>{(call.data.length - 2) / 2} bytes</dd>
                    </div>
                  </dl>
                  <div className='walletCallData'>{call.data}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default WalletCallsRequest
