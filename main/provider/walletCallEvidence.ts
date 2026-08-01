import type { WalletCallTransactionCandidate } from './walletCallBatches'

const ADDRESS = /^0x[0-9a-f]{40}$/
const HASH = /^0x[0-9a-f]{64}$/
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/
const MAX_ERROR_MESSAGE_LENGTH = 240

export const MAX_SIGNED_RESERVATION_CANDIDATES = 256
export const MAX_SUBMITTED_TRANSACTION_CANDIDATES = 256 * 16

const INVALID_CANDIDATE = Object.freeze({
  origin: undefined,
  account: undefined,
  id: undefined,
  chainId: undefined,
  hash: undefined
}) as unknown as Readonly<WalletCallTransactionCandidate>

export function walletCallDiagnostic(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
  return (message.trim() || fallback).slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

function copyWalletCallCandidate(candidate: WalletCallTransactionCandidate) {
  try {
    return Object.freeze({
      origin: candidate.origin,
      account: candidate.account,
      id: candidate.id,
      chainId: candidate.chainId,
      hash: candidate.hash
    })
  } catch (_error) {
    return INVALID_CANDIDATE
  }
}

export function snapshotWalletCallCandidate(candidate: WalletCallTransactionCandidate) {
  const snapshot = copyWalletCallCandidate(candidate)

  if (
    typeof snapshot.origin !== 'string' ||
    snapshot.origin.length < 1 ||
    snapshot.origin.length > 256 ||
    typeof snapshot.id !== 'string' ||
    snapshot.id.length < 1 ||
    snapshot.id.length > 4096 ||
    Buffer.byteLength(snapshot.id, 'utf8') > 4096 ||
    typeof snapshot.account !== 'string' ||
    !ADDRESS.test(snapshot.account) ||
    typeof snapshot.chainId !== 'string' ||
    snapshot.chainId.length > 66 ||
    !QUANTITY.test(snapshot.chainId) ||
    typeof snapshot.hash !== 'string' ||
    !HASH.test(snapshot.hash)
  ) {
    throw new Error('Invalid wallet call evidence candidate')
  }

  return snapshot
}

export function snapshotWalletCallCandidateQueue(
  candidates: readonly WalletCallTransactionCandidate[],
  maximum: number
) {
  if (!Array.isArray(candidates) || candidates.length > maximum) {
    throw new Error('Wallet call evidence candidate limit exceeded')
  }
  return Object.freeze(candidates.map(copyWalletCallCandidate))
}
