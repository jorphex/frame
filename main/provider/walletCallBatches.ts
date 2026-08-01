import crypto from 'crypto'

import {
  WalletCallBatch,
  WalletCallBatchSchema,
  WalletCallBatches,
  WalletCallReceipt,
  WalletCallReceiptSchema,
  PERSISTED_WALLET_CALL_BATCH_TTL_MS
} from '../store/state/types/walletCallBatch'
import { MAX_WALLET_CALL_ID_BYTES } from './walletCalls'

export const WALLET_CALL_BATCH_TTL_MS = PERSISTED_WALLET_CALL_BATCH_TTL_MS
export const MAX_RETAINED_WALLET_CALL_BATCHES = 256
export const MAX_RETAINED_WALLET_CALL_BATCHES_PER_ORIGIN = 64
export const MAX_PERSISTED_WALLET_CALL_RECEIPT_BYTES = 256 * 1024
export const MAX_PERSISTED_WALLET_CALL_BATCH_BYTES = 1024 * 1024
export const MAX_PERSISTED_WALLET_CALL_LEDGER_BYTES = 32 * 1024 * 1024

const INTERNAL_KEY = /^0x[0-9a-f]{64}$/

export interface WalletCallBatchStorage {
  load(): unknown
  save(batches: WalletCallBatches): void
}

export interface CreateWalletCallBatch {
  id?: string
  origin: string
  account: string
  chainId: string
  callCount: number
}

export interface WalletCallsStatus {
  version: '2.0.0'
  id: string
  chainId: string
  status: 100 | 200 | 400 | 500 | 600
  atomic: false
  receipts?: WalletCallReceipt[]
}

function rpcError(code: number, message: string): EVMError {
  return { code, message }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function randomIdentifier() {
  return `0x${crypto.randomBytes(32).toString('hex')}`
}

function persistedBytes(value: unknown) {
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? Number.POSITIVE_INFINITY : Buffer.byteLength(serialized, 'utf8')
  } catch (_error) {
    return Number.POSITIVE_INFINITY
  }
}

function normalizeLoadedBatches(value: unknown): WalletCallBatches {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  let totalBytes = 2
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<WalletCallBatches>((batches, [key, candidate]) => {
      if (!INTERNAL_KEY.test(key)) return batches
      if (persistedBytes(candidate) > MAX_PERSISTED_WALLET_CALL_BATCH_BYTES) return batches
      const parsed = WalletCallBatchSchema.safeParse(candidate)
      if (!parsed.success) return batches

      const candidateBytes = persistedBytes({ [key]: parsed.data })
      if (
        persistedBytes(parsed.data) > MAX_PERSISTED_WALLET_CALL_BATCH_BYTES ||
        totalBytes + candidateBytes > MAX_PERSISTED_WALLET_CALL_LEDGER_BYTES
      ) {
        return batches
      }

      batches[key] = parsed.data
      totalBytes += candidateBytes
      return batches
    }, {})
}

function deriveStatus(batch: WalletCallBatch): WalletCallsStatus {
  const receipts = batch.transactions.flatMap((transaction) =>
    transaction.receipt ? [transaction.receipt] : []
  )
  let status: WalletCallsStatus['status'] = 100

  if (batch.execution === 'failed' && batch.transactions.length === 0) {
    status = 400
  } else if (batch.execution !== 'pending' && receipts.length === batch.transactions.length) {
    if (batch.transactions.length < batch.callCount) {
      status = 600
    } else if (receipts.every((receipt) => receipt.status === '0x1')) {
      status = 200
    } else if (receipts.every((receipt) => receipt.status === '0x0')) {
      status = 500
    } else {
      status = 600
    }
  }

  return {
    version: '2.0.0',
    id: batch.id,
    chainId: batch.chainId,
    status,
    atomic: false,
    ...(receipts.length > 0 ? { receipts: clone(receipts) } : {})
  }
}

export class WalletCallBatchLedger {
  constructor(private storage: WalletCallBatchStorage) {}

  private read(now: number) {
    const loaded = this.storage.load()
    const batches = normalizeLoadedBatches(loaded)
    const loadedCount =
      loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? Object.keys(loaded).length : 0
    let changed = Object.keys(batches).length !== loadedCount

    Object.entries(batches).forEach(([key, batch]) => {
      if (batch.expiresAt <= now) {
        delete batches[key]
        changed = true
      }
    })

    if (changed) this.storage.save(clone(batches))
    return batches
  }

  private write(batches: WalletCallBatches) {
    this.storage.save(clone(batches))
  }

  private find(batches: WalletCallBatches, origin: string, account: string, id: string) {
    const normalizedAccount = account.toLowerCase()
    return Object.entries(batches).find(
      ([_key, batch]) => batch.origin === origin && batch.account === normalizedAccount && batch.id === id
    )
  }

  private require(batches: WalletCallBatches, origin: string, account: string, id: string) {
    const found = this.find(batches, origin, account, id)
    if (!found) throw rpcError(5730, 'Unknown bundle id')
    return found
  }

  create(input: CreateWalletCallBatch, now = Date.now()) {
    const batches = this.read(now)
    if (input.id !== undefined && Buffer.byteLength(input.id, 'utf8') > MAX_WALLET_CALL_ID_BYTES) {
      throw rpcError(-32602, 'Invalid params: batch id exceeds 4096 UTF-8 bytes')
    }
    const candidate = WalletCallBatchSchema.safeParse({
      id: input.id ?? 'pending-generated-id',
      origin: input.origin,
      account: input.account,
      chainId: input.chainId,
      atomic: false,
      callCount: input.callCount,
      execution: 'pending',
      transactions: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: now + WALLET_CALL_BATCH_TTL_MS
    })

    if (!candidate.success) throw rpcError(-32602, 'Invalid wallet call batch metadata')
    if (input.id !== undefined && this.find(batches, input.origin, candidate.data.account, input.id)) {
      throw rpcError(5720, 'Duplicate ID')
    }

    const originCount = Object.values(batches).filter((batch) => batch.origin === input.origin).length
    if (
      Object.keys(batches).length >= MAX_RETAINED_WALLET_CALL_BATCHES ||
      originCount >= MAX_RETAINED_WALLET_CALL_BATCHES_PER_ORIGIN
    ) {
      throw rpcError(5740, 'Bundle too large: retained batch limit reached')
    }

    let key = randomIdentifier()
    while (batches[key]) key = randomIdentifier()

    let id = input.id
    if (!id) {
      do id = randomIdentifier()
      while (Object.values(batches).some((batch) => batch.id === id))
    }

    const batch = { ...candidate.data, id }
    batches[key] = batch
    this.write(batches)
    return { key, batch: clone(batch) }
  }

  get(origin: string, account: string, id: string, now = Date.now()) {
    const [_key, batch] = this.require(this.read(now), origin, account, id)
    return clone(batch)
  }

  getStatus(origin: string, account: string, id: string, now = Date.now()) {
    return deriveStatus(this.get(origin, account, id, now))
  }

  recordTransaction(origin: string, account: string, id: string, hash: string, now = Date.now()) {
    const batches = this.read(now)
    const [key, batch] = this.require(batches, origin, account, id)
    const normalizedHash = hash.toLowerCase()

    if (!INTERNAL_KEY.test(normalizedHash)) throw new Error('Invalid transaction hash')
    if (batch.execution !== 'pending') throw new Error('Batch execution is already closed')
    if (batch.transactions.some((transaction) => transaction.hash === normalizedHash)) {
      throw new Error('Transaction hash is already recorded')
    }
    if (batch.transactions.length >= batch.callCount) throw new Error('Batch transaction limit reached')

    batches[key] = {
      ...batch,
      transactions: [...batch.transactions, { hash: normalizedHash }],
      updatedAt: Math.max(now, batch.updatedAt)
    }
    this.write(batches)
  }

  recordReceipt(origin: string, account: string, id: string, receipt: WalletCallReceipt, now = Date.now()) {
    if (persistedBytes(receipt) > MAX_PERSISTED_WALLET_CALL_RECEIPT_BYTES) {
      throw new Error('Wallet call receipt exceeds persistence limit')
    }
    const parsed = WalletCallReceiptSchema.safeParse(receipt)
    if (!parsed.success) throw new Error('Invalid wallet call receipt')

    const batches = this.read(now)
    const [key, batch] = this.require(batches, origin, account, id)
    const index = batch.transactions.findIndex(
      (transaction) => transaction.hash === parsed.data.transactionHash
    )
    if (index < 0) throw new Error('Receipt transaction is not part of this batch')
    const existingReceipt = batch.transactions[index].receipt
    if (existingReceipt) {
      if (JSON.stringify(existingReceipt) !== JSON.stringify(parsed.data)) {
        throw new Error('Transaction receipt is already recorded')
      }
      return
    }

    const transactions = [...batch.transactions]
    transactions[index] = { ...transactions[index], receipt: parsed.data }
    const updatedBatch = { ...batch, transactions, updatedAt: Math.max(now, batch.updatedAt) }
    if (persistedBytes(updatedBatch) > MAX_PERSISTED_WALLET_CALL_BATCH_BYTES) {
      throw new Error('Wallet call batch exceeds persistence limit')
    }
    const updatedBatches = { ...batches, [key]: updatedBatch }
    if (persistedBytes(updatedBatches) > MAX_PERSISTED_WALLET_CALL_LEDGER_BYTES) {
      throw new Error('Wallet call ledger exceeds persistence limit')
    }

    batches[key] = updatedBatch
    this.write(batches)
  }

  complete(origin: string, account: string, id: string, now = Date.now()) {
    const batches = this.read(now)
    const [key, batch] = this.require(batches, origin, account, id)
    if (batch.execution !== 'pending') throw new Error('Batch execution is already closed')
    if (batch.transactions.length !== batch.callCount) throw new Error('Batch is missing transactions')

    batches[key] = { ...batch, execution: 'complete', updatedAt: Math.max(now, batch.updatedAt) }
    this.write(batches)
  }

  fail(origin: string, account: string, id: string, now = Date.now()) {
    const batches = this.read(now)
    const [key, batch] = this.require(batches, origin, account, id)
    if (batch.execution !== 'pending') throw new Error('Batch execution is already closed')

    batches[key] = { ...batch, execution: 'failed', updatedAt: Math.max(now, batch.updatedAt) }
    this.write(batches)
  }
}
