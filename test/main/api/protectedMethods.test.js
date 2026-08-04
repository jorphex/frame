import protectedMethods, {
  passivePermissionMethods,
  shouldRequestOriginAccess
} from '../../../main/api/protectedMethods'

it.each(['caip_request', 'wallet_request'])(
  'requires an authorized origin before unwrapping %s',
  (method) => {
    expect(protectedMethods).toContain(method)
  }
)

it.each(['eth_accounts', 'eth_coinbase', 'wallet_getAssets', 'wallet_getCapabilities'])(
  'handles passive permission probe %s without opening access UI',
  (method) => {
    expect(protectedMethods).toContain(method)
    expect(passivePermissionMethods).toContain(method)
    expect(shouldRequestOriginAccess(method)).toBe(false)
  }
)

it.each(['eth_requestAccounts', 'eth_sendTransaction', 'wallet_switchEthereumChain'])(
  'requests origin access for interactive method %s',
  (method) => expect(shouldRequestOriginAccess(method)).toBe(true)
)

it.each(['wallet_sendCalls', 'wallet_getCallsStatus', 'wallet_showCallsStatus', 'wallet_getCapabilities'])(
  'requires an authorized origin for %s',
  (method) => {
    expect(protectedMethods).toContain(method)
  }
)
