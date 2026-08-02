const UNSAFE_FORWARDING_PREFIXES = ['account_', 'admin_', 'engine_', 'miner_', 'personal_', 'wallet_']

// Geth's debug namespace also contains destructive and file-writing methods.
const SAFE_DEBUG_METHODS = new Set([
  'debug_getBadBlocks',
  'debug_getRawBlock',
  'debug_getRawBlockAccessList',
  'debug_getRawHeader',
  'debug_getRawReceipts',
  'debug_getRawTransaction',
  'debug_traceBlock',
  'debug_traceBlockByHash',
  'debug_traceBlockByNumber',
  'debug_traceCall',
  'debug_traceChain',
  'debug_traceTransaction'
])

export function isUnsafeRpcForwardingMethod(method: string) {
  if (method.startsWith('debug_')) return !SAFE_DEBUG_METHODS.has(method)

  return (
    method.startsWith('eth_sign') || UNSAFE_FORWARDING_PREFIXES.some((prefix) => method.startsWith(prefix))
  )
}
