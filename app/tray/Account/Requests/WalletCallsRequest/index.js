import React from 'react'
import { SimulationAllowance, SimulationEffects } from '../TransactionRequest/ViewData/effects'

const callDestination = (call) => call.to || 'Contract deployment'

const simulationPresentation = (simulation) => {
  if (!simulation || simulation.status === 'pending') {
    return { label: 'Checking ordered batch...', className: 'walletCallsSimulationPending' }
  }
  if (simulation.status === 'succeeded') {
    return { label: 'RPC reports all calls succeed', className: 'walletCallsSimulationGood' }
  }
  if (simulation.status === 'reverted') {
    return { label: 'RPC reports one or more calls revert', className: 'walletCallsSimulationBad' }
  }
  if (simulation.status === 'unavailable') {
    return { label: 'Stateful simulation unavailable', className: 'walletCallsSimulationWarning' }
  }
  return { label: 'Stateful simulation failed', className: 'walletCallsSimulationBad' }
}

export class WalletCallsRequest extends React.Component {
  render() {
    const { req } = this.props
    const originName = this.props.originName || 'Unknown'
    const chainName = this.props.chainData?.chainName || `Chain ${parseInt(req.chainId, 16)}`
    const callLabel = req.calls.length === 1 ? 'call' : 'calls'
    const simulation = simulationPresentation(req.simulation)

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

            <div className={`walletCallsSimulation ${simulation.className}`} role='status'>
              <div className='walletCallsSimulationTitle'>{simulation.label}</div>
              {req.simulation?.reason && (
                <div className='walletCallsSimulationReason'>{req.simulation.reason}</div>
              )}
              <div className='walletCallsSimulationNotice'>
                Results and token effects are reported by your configured RPC and are not independently
                verified.
              </div>
            </div>

            <div className='walletCallsList'>
              {req.calls.map((call, index) => {
                const callSimulation = req.simulation?.calls?.[index]
                return (
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
                    {callSimulation && (
                      <div className={`walletCallSimulation walletCallSimulation-${callSimulation.status}`}>
                        <div className='walletCallSimulationStatus'>
                          RPC result: {callSimulation.status}
                          {callSimulation.gasUsed ? ` - gas used ${callSimulation.gasUsed}` : ''}
                        </div>
                        {callSimulation.reason && (
                          <div className='walletCallSimulationReason'>{callSimulation.reason}</div>
                        )}
                        <SimulationAllowance simulation={callSimulation} />
                        {(callSimulation.effects?.length || callSimulation.effectsTruncated) && (
                          <SimulationEffects account={req.account} simulation={callSimulation} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default WalletCallsRequest
