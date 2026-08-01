const RISK_MESSAGES = {
  'legacy-v1': () =>
    'Legacy V1 typed data has no EIP-712 domain separation. Verify every field before signing.',
  'domain-chain-missing': () =>
    'This signature does not declare a domain chain ID and may be valid on more than one chain.',
  'domain-chain-invalid': () =>
    'The domain chain ID cannot be compared with the chain handling this request.',
  'domain-chain-mismatch': ({ domainChainId, requestChainId }) =>
    `Domain chain ${domainChainId} does not match request chain ${requestChainId}.`
}

const displayKey = (key) => key.replace(/([A-Z])/g, ' $1').trim()

const displayValue = (value, quoteStrings) => {
  if (value === undefined) return 'undefined'
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'string') return quoteStrings ? JSON.stringify(value) : value || '""'
  return JSON.stringify(value)
}

export const SimpleJSON = ({ humanizeKeys = false, json, quoteStrings = true }) => {
  if (json === null || typeof json !== 'object') {
    return <span>{displayValue(json, quoteStrings)}</span>
  }

  const entries = Object.entries(json)
  if (entries.length === 0) return <div className='simpleJsonEmpty'>{Array.isArray(json) ? '[]' : '{}'}</div>

  return (
    <div className='simpleJson'>
      {entries.map(([key, value], index) => (
        <div key={`${key}:${index}`} className='simpleJsonChild'>
          <div className='simpleJsonKey simpleJsonKeyTx'>
            {Array.isArray(json) ? `[${key}]` : humanizeKeys ? displayKey(key) : key}
          </div>
          <div className='simpleJsonValue'>
            {value !== null && typeof value === 'object' ? (
              <SimpleJSON humanizeKeys={humanizeKeys} json={value} quoteStrings={quoteStrings} />
            ) : (
              displayValue(value, quoteStrings)
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export const Section = ({ children, first = false, title }) => (
  <section>
    <div className={`simpleJsonHeader${first ? ' simpleJsonHeaderFirst' : ''}`}>{title}</div>
    {children}
  </section>
)

export const TypedDataWarnings = ({ context }) => {
  const risks = context?.risks || []

  return risks.length ? (
    <div className='typedDataWarnings' aria-label='Signing warnings'>
      {risks.map((risk) => {
        const message = RISK_MESSAGES[risk]
        return message ? (
          <div key={risk} className='typedDataWarning' role='alert'>
            {message(context)}
          </div>
        ) : null
      })}
    </div>
  ) : null
}

const SigningContext = ({ chainName, context, origin, originName, typedMessage }) => {
  const structured = !Array.isArray(typedMessage.data)
  const requestChainId = context?.requestChainId
  const requestChain =
    requestChainId !== undefined ? `${chainName || 'Unknown chain'} (${requestChainId})` : 'Unknown chain'

  return (
    <>
      <Section first title='Signing Context'>
        <SimpleJSON
          humanizeKeys
          quoteStrings={false}
          json={{
            origin: originName || origin || 'Unknown origin',
            requestChain,
            signatureVersion: typedMessage.version,
            primaryType: structured ? typedMessage.data.primaryType : 'Legacy fields'
          }}
        />
      </Section>
      <TypedDataWarnings context={context} />
    </>
  )
}

const StructuredTypedData = ({ typedData }) => (
  <>
    <Section title='Domain'>
      <SimpleJSON json={typedData.domain} />
    </Section>
    <Section title={`Message: ${typedData.primaryType}`}>
      <SimpleJSON json={typedData.message} />
    </Section>
    <Section title='Type Definitions'>
      <SimpleJSON json={typedData.types} />
    </Section>
  </>
)

const LegacyTypedData = ({ typedData }) => (
  <Section title='Signed Fields'>
    <SimpleJSON json={typedData} />
  </Section>
)

export const SimpleTypedData = ({ chainName, originName, req }) => {
  const { context, origin, typedMessage, type } = req

  return type === 'signTypedData' || type === 'signErc20Permit' ? (
    <div className='accountViewScroll cardShow'>
      <div className='txViewData'>
        <div className='txViewDataHeader'>Typed Data Review</div>
        <div className='signTypedDataInner'>
          <SigningContext {...{ chainName, context, origin, originName, typedMessage }} />
          {Array.isArray(typedMessage.data) ? (
            <LegacyTypedData typedData={typedMessage.data} />
          ) : (
            <StructuredTypedData typedData={typedMessage.data} />
          )}
        </div>
      </div>
    </div>
  ) : (
    <div className='unknownType'>{'Unknown: ' + type}</div>
  )
}
