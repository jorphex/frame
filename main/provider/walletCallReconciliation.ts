import { WalletCallReceiptSchema, type WalletCallReceipt } from '../store/state/types/walletCallBatch'
import type { WalletCallTransactionCandidate } from './walletCallBatches'
import {
  MAX_SIGNED_RESERVATION_CANDIDATES,
  snapshotWalletCallCandidate,
  snapshotWalletCallCandidateQueue,
  walletCallDiagnostic
} from './walletCallEvidence'

interface WalletCallReconciliationLedger {
  markTransactionSubmitted(origin: string, account: string, id: string, hash: string): void
  recordReceipt(origin: string, account: string, id: string, receipt: WalletCallReceipt): void
}

interface WalletCallReconciliationDependencies {
  ledger: WalletCallReconciliationLedger
  getTransactionReceipt(chainId: string, hash: string): Promise<unknown>
  getTransaction(chainId: string, hash: string): Promise<unknown>
}

export interface WalletCallReconciliationOutcome {
  status: 'receipt-recorded' | 'transaction-submitted' | 'unresolved' | 'error'
  reason?: string
}

function combineDiagnostics(first: string, second: string) {
  return walletCallDiagnostic(
    [...new Set([first, second].filter(Boolean))].join('; '),
    'Reconciliation failed'
  )
}

function transactionMatches(value: unknown, hash: string) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, 'hash') &&
    (value as { hash?: unknown }).hash === hash
  )
}

export async function reconcileWalletCallReservation(
  candidate: WalletCallTransactionCandidate,
  dependencies: WalletCallReconciliationDependencies
): Promise<WalletCallReconciliationOutcome> {
  let target: Readonly<WalletCallTransactionCandidate>
  try {
    target = snapshotWalletCallCandidate(candidate)
  } catch (error) {
    return { status: 'error', reason: walletCallDiagnostic(error, 'Invalid reconciliation candidate') }
  }

  let receiptError = ''
  let receipt: unknown
  try {
    receipt = await dependencies.getTransactionReceipt(target.chainId, target.hash)
  } catch (error) {
    receiptError = walletCallDiagnostic(error, 'Transaction receipt lookup failed')
  }

  if (receipt !== null && receipt !== undefined) {
    const parsed = WalletCallReceiptSchema.safeParse(receipt)
    if (!parsed.success || parsed.data.transactionHash !== target.hash) {
      receiptError = 'Transaction receipt is malformed or does not match the reserved hash'
    } else {
      try {
        dependencies.ledger.recordReceipt(target.origin, target.account, target.id, parsed.data)
        return { status: 'receipt-recorded' }
      } catch (error) {
        return {
          status: 'error',
          reason: walletCallDiagnostic(error, 'Transaction receipt persistence failed')
        }
      }
    }
  }

  try {
    const transaction = await dependencies.getTransaction(target.chainId, target.hash)
    if (transactionMatches(transaction, target.hash)) {
      dependencies.ledger.markTransactionSubmitted(target.origin, target.account, target.id, target.hash)
      return { status: 'transaction-submitted', ...(receiptError ? { reason: receiptError } : {}) }
    }

    if (transaction !== null && transaction !== undefined) {
      return {
        status: 'unresolved',
        reason: combineDiagnostics(receiptError, 'Transaction lookup returned mismatched or malformed data')
      }
    }
    return {
      status: 'unresolved',
      ...(receiptError ? { reason: receiptError } : {})
    }
  } catch (error) {
    const transactionError = walletCallDiagnostic(error, 'Transaction lookup failed')
    return {
      status: 'error',
      reason: combineDiagnostics(receiptError, transactionError)
    }
  }
}

export async function reconcileWalletCallReservations(
  candidates: readonly WalletCallTransactionCandidate[],
  dependencies: WalletCallReconciliationDependencies
) {
  const queue = snapshotWalletCallCandidateQueue(candidates, MAX_SIGNED_RESERVATION_CANDIDATES)
  const outcomes: WalletCallReconciliationOutcome[] = []
  for (const candidate of queue) {
    try {
      outcomes.push(await reconcileWalletCallReservation(candidate, dependencies))
    } catch (error) {
      outcomes.push({ status: 'error', reason: walletCallDiagnostic(error, 'Reconciliation failed') })
    }
  }
  return outcomes
}
