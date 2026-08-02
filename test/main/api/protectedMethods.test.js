import protectedMethods from '../../../main/api/protectedMethods'

it.each(['caip_request', 'wallet_request'])(
  'requires an authorized origin before unwrapping %s',
  (method) => {
    expect(protectedMethods).toContain(method)
  }
)

it.each(['wallet_sendCalls', 'wallet_getCallsStatus', 'wallet_showCallsStatus', 'wallet_getCapabilities'])(
  'requires an authorized origin for %s',
  (method) => {
    expect(protectedMethods).toContain(method)
  }
)
