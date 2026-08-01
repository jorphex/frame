import { WalletCallReceiptSchema, type WalletCallReceipt } from '../store/state/types/walletCallBatch'
import type { WalletCallReconciliationCandidate } from './walletCallBatches'

const ADDRESS = /^0x[0-9a-f]{40}$/
const HASH = /^0x[0-9a-f]{64}$/
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/
const MAX_ERROR_MESSAGE_LENGTH = 240

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

function diagnostic(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
  return (message.trim() || fallback).slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

function combineDiagnostics(first: string, second: string) {
  return [...new Set([first, second].filter(Boolean))].join('; ').slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

function validateCandidate(candidate: WalletCallReconciliationCandidate) {
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate) ||
    typeof candidate.origin !== 'string' ||
    candidate.origin.length < 1 ||
    candidate.origin.length > 256 ||
    typeof candidate.id !== 'string' ||
    candidate.id.length < 1 ||
    candidate.id.length > 4096 ||
    Buffer.byteLength(candidate.id, 'utf8') > 4096 ||
    typeof candidate.account !== 'string' ||
    !ADDRESS.test(candidate.account) ||
    typeof candidate.chainId !== 'string' ||
    candidate.chainId.length > 66 ||
    !QUANTITY.test(candidate.chainId) ||
    typeof candidate.hash !== 'string' ||
    !HASH.test(candidate.hash)
  ) {
    throw new Error('Invalid wallet call reconciliation candidate')
  }
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
  candidate: WalletCallReconciliationCandidate,
  dependencies: WalletCallReconciliationDependencies
): Promise<WalletCallReconciliationOutcome> {
  let target: Readonly<WalletCallReconciliationCandidate>
  try {
    target = Object.freeze({
      origin: candidate.origin,
      account: candidate.account,
      id: candidate.id,
      chainId: candidate.chainId,
      hash: candidate.hash
    })
    validateCandidate(target)
  } catch (error) {
    return { status: 'error', reason: diagnostic(error, 'Invalid reconciliation candidate') }
  }

  let receiptError = ''
  let receipt: unknown
  try {
    receipt = await dependencies.getTransactionReceipt(target.chainId, target.hash)
  } catch (error) {
    receiptError = diagnostic(error, 'Transaction receipt lookup failed')
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
        return { status: 'error', reason: diagnostic(error, 'Transaction receipt persistence failed') }
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
    const transactionError = diagnostic(error, 'Transaction lookup failed')
    return {
      status: 'error',
      reason: combineDiagnostics(receiptError, transactionError)
    }
  }
}

export async function reconcileWalletCallReservations(
  candidates: readonly WalletCallReconciliationCandidate[],
  dependencies: WalletCallReconciliationDependencies
) {
  const outcomes: WalletCallReconciliationOutcome[] = []
  for (const candidate of candidates) {
    try {
      outcomes.push(await reconcileWalletCallReservation(candidate, dependencies))
    } catch (error) {
      outcomes.push({ status: 'error', reason: diagnostic(error, 'Reconciliation failed') })
    }
  }
  return outcomes
}
