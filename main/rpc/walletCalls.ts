import type { AccountRequest } from '../accounts/types'

interface WalletCallRPCRequest {
  handlerId?: unknown
  account?: unknown
  type?: unknown
}

interface WalletCallRPCAccounts {
  getRequestForAccount(accountId: string, handlerId: string): AccountRequest
}

export function routeWalletCallRequest(
  request: WalletCallRPCRequest,
  accounts: WalletCallRPCAccounts,
  action: (request: AccountRequest<'walletCalls'>) => void
) {
  if (!request || typeof request.handlerId !== 'string' || typeof request.account !== 'string') {
    return false
  }

  let storedRequest: AccountRequest
  try {
    storedRequest = accounts.getRequestForAccount(request.account, request.handlerId)
  } catch (_) {
    // A stale wallet-call UI event must not fall through to current-account signing paths.
    return request.type === 'walletCalls'
  }

  if (storedRequest.type !== 'walletCalls') return false

  action(storedRequest as AccountRequest<'walletCalls'>)
  return true
}
