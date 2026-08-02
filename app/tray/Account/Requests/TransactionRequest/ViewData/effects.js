import { SimpleJSON } from '../../../../../../resources/Components/SimpleTypedData'
import { MAX_UINT256 } from '../../../../../../resources/domain/transaction/quantity'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const MAX_UINT256_DECIMAL = MAX_UINT256.toString(10)

const STANDARD_NAMES = {
  erc20: 'ERC-20',
  erc721: 'ERC-721',
  erc1155: 'ERC-1155'
}

const standardName = (standard) => STANDARD_NAMES[standard] || 'ERC-721 / ERC-1155'

const transferTitle = (effect, account) => {
  const selected = account?.toLowerCase()
  const direction =
    effect.from === ZERO_ADDRESS
      ? 'Mint'
      : effect.to === ZERO_ADDRESS
        ? 'Burn'
        : selected && effect.from === selected && effect.to === selected
          ? 'Self Transfer'
          : selected && effect.from === selected
            ? 'Send'
            : selected && effect.to === selected
              ? 'Receive'
              : 'Transfer'

  return `${standardName(effect.standard)} ${direction}`
}

export const getEffectPresentation = (effect, account) => {
  if (effect.type === 'transfer') {
    return {
      title: transferTitle(effect, account),
      fields: {
        tokenContract: effect.token,
        from: effect.from,
        to: effect.to,
        ...(effect.tokenId !== undefined ? { tokenId: effect.tokenId } : {}),
        ...(effect.amount !== undefined ? { amountRawUnits: effect.amount } : {})
      },
      risky: false
    }
  }

  if (effect.type === 'approval') {
    const unlimited = effect.standard === 'erc20' && effect.amount === MAX_UINT256_DECIMAL
    const revoke = effect.standard === 'erc20' && effect.amount === '0'
    return {
      title: `${standardName(effect.standard)} ${unlimited ? 'Unlimited ' : revoke ? 'Revoke ' : ''}Approval`,
      fields: {
        tokenContract: effect.token,
        owner: effect.owner,
        spender: effect.spender,
        ...(effect.tokenId !== undefined ? { tokenId: effect.tokenId } : {}),
        ...(effect.amount !== undefined ? { amountRawUnits: effect.amount } : {})
      },
      risky: unlimited
    }
  }

  return {
    title: `${effect.approved ? 'Enable' : 'Disable'} ERC-721 / ERC-1155 Operator`,
    fields: {
      tokenContract: effect.token,
      owner: effect.owner,
      operator: effect.operator,
      approvedForAll: effect.approved
    },
    risky: effect.approved
  }
}

export const SimulationEffects = ({ account, simulation }) => {
  if (simulation?.status !== 'succeeded' || simulation.source !== 'eth_simulateV1') return null

  const effects = simulation.effects || []
  return (
    <div className='txViewData'>
      <div className='txViewDataHeader'>RPC-Reported Effects</div>
      <div className='simulationEffectsNotice' role='note'>
        Derived from standard event logs returned by your configured RPC. This is not a verified or complete
        balance diff.
      </div>
      {effects.length ? (
        effects.map((effect, index) => {
          const presentation = getEffectPresentation(effect, account)
          return (
            <section className='simulationEffect' key={`${effect.type}:${effect.token}:${index}`}>
              <div
                className={
                  presentation.risky ? 'simulationEffectTitle simulationEffectRisk' : 'simulationEffectTitle'
                }
              >
                {presentation.title}
              </div>
              <SimpleJSON humanizeKeys json={presentation.fields} quoteStrings={false} />
            </section>
          )
        })
      ) : (
        <div className='simulationEffectsEmpty'>No supported token events were reported.</div>
      )}
      {simulation.effectsTruncated && (
        <div className='simulationEffectsTruncated' role='alert'>
          Effect preview truncated. Review the transaction through another trusted source before signing.
        </div>
      )}
    </div>
  )
}

export const SimulationAllowance = ({ simulation }) => {
  const allowance = simulation?.allowance
  if (!allowance) return null

  return (
    <div className='txViewData'>
      <div className='txViewDataHeader'>RPC-Reported Current Allowance</div>
      <div className='simulationEffectsNotice' role='note'>
        Read from your configured RPC at review time. Contract identity and current state are not
        independently verified.
      </div>
      <SimpleJSON
        humanizeKeys
        quoteStrings={false}
        json={{
          tokenContract: allowance.token,
          owner: allowance.owner,
          spender: allowance.spender,
          currentAmountRawUnits: allowance.currentAmount,
          requestedAmountRawUnits: allowance.requestedAmount
        }}
      />
    </div>
  )
}

export const SimulationDelegation = ({ simulation }) => {
  const delegation = simulation?.delegation
  if (delegation?.status !== 'delegated' && delegation?.status !== 'unavailable') return null

  return (
    <div className='txViewData'>
      <div className='txViewDataHeader'>Account Delegation Check</div>
      <div
        className={
          delegation.status === 'delegated' ? 'simulationEffectsTruncated' : 'simulationEffectsNotice'
        }
        role={delegation.status === 'delegated' ? 'alert' : 'note'}
      >
        {delegation.status === 'delegated'
          ? "Your configured RPC reports EIP-7702 delegated code. Transactions execute with the delegate's code and may not behave like ordinary account transactions."
          : `Frame could not determine whether this account delegates execution. ${
              delegation.reason || ''
            }`.trim()}
      </div>
      <SimpleJSON
        humanizeKeys
        quoteStrings={false}
        json={{
          account: delegation.account,
          ...(delegation.delegate ? { delegate: delegation.delegate } : {}),
          source: delegation.source
        }}
      />
    </div>
  )
}
