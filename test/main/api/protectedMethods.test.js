import protectedMethods from '../../../main/api/protectedMethods'

it.each(['wallet_sendCalls', 'wallet_getCallsStatus', 'wallet_getCapabilities'])(
  'requires an authorized origin for %s',
  (method) => {
    expect(protectedMethods).toContain(method)
  }
)

it('does not advertise the unimplemented wallet_showCallsStatus method', () => {
  expect(protectedMethods).not.toContain('wallet_showCallsStatus')
})
