import type { WalletCallTransactionCandidate } from './walletCallBatches'
import type { WalletCallReceipt } from '../store/state/types/walletCallBatch'
import { collectWalletCallReceipts, type WalletCallReceiptOutcome } from './walletCallReceipts'
import {
  reconcileWalletCallReservations,
  type WalletCallReconciliationOutcome
} from './walletCallReconciliation'

interface WalletCallEvidenceLedger {
  listReconciliationCandidates(): readonly Readonly<WalletCallTransactionCandidate>[]
  listReceiptCandidates(): readonly Readonly<WalletCallTransactionCandidate>[]
  markTransactionSubmitted(origin: string, account: string, id: string, hash: string): void
  recordReceipt(origin: string, account: string, id: string, receipt: WalletCallReceipt): void
}

interface WalletCallEvidencePollDependencies {
  ledger: WalletCallEvidenceLedger
  getTransactionReceipt(chainId: string, hash: string): Promise<unknown>
  getTransaction(chainId: string, hash: string): Promise<unknown>
}

export interface WalletCallEvidencePollResult {
  reconciliation: WalletCallReconciliationOutcome[]
  receipts: WalletCallReceiptOutcome[]
  continuePolling: boolean
}

export async function pollWalletCallEvidence(
  dependencies: WalletCallEvidencePollDependencies
): Promise<WalletCallEvidencePollResult> {
  const reconciliationCandidates = dependencies.ledger.listReconciliationCandidates()
  const reconciliation = reconciliationCandidates.length
    ? await reconcileWalletCallReservations(reconciliationCandidates, dependencies)
    : []

  // Reconciliation can promote a signed reservation, making it eligible for a
  // receipt lookup in this same pass.
  const receiptCandidates = dependencies.ledger.listReceiptCandidates()
  const receipts = receiptCandidates.length
    ? await collectWalletCallReceipts(receiptCandidates, dependencies)
    : []
  const continuePolling =
    dependencies.ledger.listReconciliationCandidates().length > 0 ||
    dependencies.ledger.listReceiptCandidates().length > 0

  return { reconciliation, receipts, continuePolling }
}

interface WalletCallEvidenceControllerDependencies {
  poll(): Promise<WalletCallEvidencePollResult>
  reportError?(error: Error): void
  intervalMs?: number
  schedule?: typeof setTimeout
  cancel?: typeof clearTimeout
}

const DEFAULT_POLL_INTERVAL_MS = 15_000
const MAX_REPORTED_REASONS = 5

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

function resultDiagnostic(result: WalletCallEvidencePollResult) {
  const reasons = [...result.reconciliation, ...result.receipts]
    .map((outcome) => outcome.reason)
    .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
  if (!reasons.length) return ''

  const unique = [...new Set(reasons)]
  const shown = unique.slice(0, MAX_REPORTED_REASONS)
  const omitted = unique.length - shown.length
  return `${reasons.length} wallet-call evidence diagnostic(s): ${shown.join('; ')}${
    omitted ? `; ${omitted} more distinct diagnostic(s)` : ''
  }`
}

export class WalletCallEvidenceController {
  private readonly poll: WalletCallEvidenceControllerDependencies['poll']
  private readonly reportError: (error: Error) => void
  private readonly intervalMs: number
  private readonly scheduleTimer: typeof setTimeout
  private readonly cancelTimer: typeof clearTimeout
  private active = false
  private rerun = false
  private timer?: ReturnType<typeof setTimeout>
  private inFlight?: Promise<void>
  private lastDiagnostic = ''

  constructor(dependencies: WalletCallEvidenceControllerDependencies) {
    if (
      !dependencies ||
      typeof dependencies !== 'object' ||
      typeof dependencies.poll !== 'function' ||
      (dependencies.reportError !== undefined && typeof dependencies.reportError !== 'function') ||
      (dependencies.intervalMs !== undefined &&
        (!Number.isSafeInteger(dependencies.intervalMs) || dependencies.intervalMs < 1)) ||
      (dependencies.schedule !== undefined && typeof dependencies.schedule !== 'function') ||
      (dependencies.cancel !== undefined && typeof dependencies.cancel !== 'function')
    ) {
      throw new Error('Invalid wallet-call evidence controller dependencies')
    }

    this.poll = dependencies.poll.bind(dependencies)
    this.reportError = dependencies.reportError?.bind(dependencies) || (() => {})
    this.intervalMs = dependencies.intervalMs || DEFAULT_POLL_INTERVAL_MS
    this.scheduleTimer = dependencies.schedule || setTimeout
    this.cancelTimer = dependencies.cancel || clearTimeout
  }

  start() {
    if (this.active) return
    this.active = true
    this.wake()
  }

  stop() {
    this.active = false
    this.rerun = false
    if (this.timer !== undefined) {
      this.cancelTimer(this.timer)
      this.timer = undefined
    }
  }

  wake() {
    if (!this.active) return
    if (this.inFlight) {
      this.rerun = true
      return
    }
    if (this.timer !== undefined) {
      this.cancelTimer(this.timer)
      this.timer = undefined
    }
    this.schedule(0)
  }

  private schedule(delay: number) {
    if (!this.active || this.timer !== undefined) return
    this.timer = this.scheduleTimer(() => {
      this.timer = undefined
      this.run()
    }, delay)
    this.timer.unref?.()
  }

  private run() {
    if (!this.active || this.inFlight) return

    let continuePolling = true
    this.inFlight = Promise.resolve()
      .then(() => this.poll())
      .then((result) => {
        continuePolling = result.continuePolling
        this.publishDiagnostic(resultDiagnostic(result))
      })
      .catch((error) => {
        this.publishDiagnostic(errorMessage(error, 'Wallet-call evidence polling failed'))
      })
      .finally(() => {
        this.inFlight = undefined
        if (!this.active) return

        const rerun = this.rerun
        this.rerun = false
        if (rerun || continuePolling) this.schedule(rerun ? 0 : this.intervalMs)
      })
  }

  private publishDiagnostic(message: string) {
    if (message === this.lastDiagnostic) return
    this.lastDiagnostic = message
    if (!message) return

    try {
      this.reportError(new Error(message))
    } catch (_) {
      return
    }
  }
}
