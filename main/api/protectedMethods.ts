const protectedMethods = [
  'caip_request',
  'wallet_request',
  'eth_coinbase',
  'eth_accounts',
  'eth_requestAccounts',
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'personal_sign',
  'personal_ecRecover',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'wallet_addEthereumChain',
  'wallet_switchEthereumChain',
  'wallet_getEthereumChains',
  'wallet_getAssets',
  'wallet_watchAsset',
  'wallet_sendCalls',
  'wallet_getCallsStatus',
  'wallet_showCallsStatus',
  'wallet_getCapabilities'
]

export const passivePermissionMethods = new Set([
  'eth_accounts',
  'eth_coinbase',
  'wallet_getAssets',
  'wallet_getCapabilities'
])

export const shouldRequestOriginAccess = (method: string) =>
  protectedMethods.includes(method) && !passivePermissionMethods.has(method)

export default protectedMethods
