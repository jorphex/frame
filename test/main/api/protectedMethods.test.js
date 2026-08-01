import protectedMethods from '../../../main/api/protectedMethods'

it.each(['wallet_sendCalls', 'wallet_getCallsStatus', 'wallet_showCallsStatus', 'wallet_getCapabilities'])(
  'requires an authorized origin for %s',
  (method) => {
    expect(protectedMethods).toContain(method)
  }
)
