import {
  MAX_PERSISTED_WALLET_CALL_RECEIPT_BYTES,
  MAX_RETAINED_WALLET_CALL_BATCHES_PER_ORIGIN,
  WALLET_CALL_BATCH_TTL_MS,
  WalletCallBatchLedger
} from '../../../main/provider/walletCallBatches'

const account = '0x1111111111111111111111111111111111111111'
const otherAccount = '0x2222222222222222222222222222222222222222'
const origin = 'origin-one'
const hash = (value) => `0x${value.repeat(64)}`

function memoryStorage(initial = {}) {
  let batches = JSON.parse(JSON.stringify(initial))
  return {
    load: jest.fn(() => JSON.parse(JSON.stringify(batches))),
    save: jest.fn((value) => {
      batches = JSON.parse(JSON.stringify(value))
    }),
    value: () => JSON.parse(JSON.stringify(batches))
  }
}

function createLedger(initial) {
  const storage = memoryStorage(initial)
  return { ledger: new WalletCallBatchLedger(storage), storage }
}

function batch(overrides = {}) {
  return {
    id: 'app-id',
    origin,
    account,
    chainId: '0x1',
    callCount: 1,
    ...overrides
  }
}

function receipt(transactionHash, status = '0x1', overrides = {}) {
  return {
    logs: [],
    status,
    blockHash: hash('b'),
    blockNumber: '0x1',
    gasUsed: '0x5208',
    transactionHash,
    ...overrides
  }
}

function expectRpcError(fn, code, message) {
  expect(fn).toThrow(expect.objectContaining({ code, message: expect.stringMatching(message) }))
}

it('creates unpredictable public and internal identifiers without using app ids as keys', () => {
  const { ledger, storage } = createLedger()
  const generated = ledger.create(batch({ id: undefined }), 1000)
  const supplied = ledger.create(batch({ id: '__proto__', account: otherAccount }), 1001)

  expect(generated.key).toMatch(/^0x[0-9a-f]{64}$/)
  expect(generated.batch.id).toMatch(/^0x[0-9a-f]{64}$/)
  expect(generated.key).not.toBe(generated.batch.id)
  expect(supplied.batch.id).toBe('__proto__')
  expect(Object.keys(storage.value())).toEqual([generated.key, supplied.key])
  expect(JSON.stringify(storage.value())).not.toContain('calls')
})

it('normalizes account metadata and returns defensive copies', () => {
  const { ledger, storage } = createLedger()
  const created = ledger.create(batch({ account: account.toUpperCase().replace('0X', '0x') }), 1000)

  created.batch.origin = 'mutated'
  const loaded = ledger.get(origin, account, 'app-id', 1001)
  loaded.origin = 'mutated-again'

  expect(storage.value()[created.key].origin).toBe(origin)
  expect(storage.value()[created.key].account).toBe(account)
})

it('scopes identifiers by origin and account and rejects duplicate ids', () => {
  const { ledger } = createLedger()
  ledger.create(batch(), 1000)

  expectRpcError(() => ledger.create(batch(), 1001), 5720, /Duplicate ID/)
  expect(() => ledger.create(batch({ account: otherAccount }), 1001)).not.toThrow()
  expect(() => ledger.create(batch({ origin: 'origin-two' }), 1001)).not.toThrow()
  expectRpcError(() => ledger.get('origin-three', account, 'app-id', 1002), 5730, /Unknown bundle/)
  expectRpcError(() => ledger.get(origin, otherAccount, 'missing', 1002), 5730, /Unknown bundle/)
})

it('rejects malformed metadata and UTF-8 oversized ids', () => {
  const { ledger } = createLedger()
  const twoByteCharacter = String.fromCodePoint(0xa2)

  expectRpcError(() => ledger.create(batch({ id: '' }), 1000), -32602, /metadata/)
  expectRpcError(() => ledger.create(batch({ account: '0x1' }), 1000), -32602, /metadata/)
  expectRpcError(() => ledger.create(batch({ chainId: '0x01' }), 1000), -32602, /metadata/)
  expectRpcError(() => ledger.create(batch({ callCount: 17 }), 1000), -32602, /metadata/)
  expectRpcError(
    () => ledger.create(batch({ id: twoByteCharacter.repeat(2049) }), 1000),
    -32602,
    /4096 UTF-8 bytes/
  )
})

it('prunes records at the 24-hour boundary before duplicate and capacity checks', () => {
  const { ledger, storage } = createLedger()
  const first = ledger.create(batch(), 1000)

  expect(ledger.get(origin, account, 'app-id', 1000 + WALLET_CALL_BATCH_TTL_MS - 1).id).toBe('app-id')
  expectRpcError(
    () => ledger.get(origin, account, 'app-id', 1000 + WALLET_CALL_BATCH_TTL_MS),
    5730,
    /Unknown bundle/
  )
  expect(storage.value()[first.key]).toBeUndefined()
  expect(() => ledger.create(batch(), 1000 + WALLET_CALL_BATCH_TTL_MS)).not.toThrow()
})

it('drops malformed persisted entries instead of returning them', () => {
  const { ledger, storage } = createLedger({
    unsafe: { id: 'leak' },
    [hash('a')]: { id: 'also-invalid' }
  })

  expectRpcError(() => ledger.get(origin, account, 'leak', 1000), 5730, /Unknown bundle/)
  expect(storage.value()).toEqual({})
})

it('bounds retained batches per origin without evicting live records', () => {
  const { ledger } = createLedger()
  for (let index = 0; index < MAX_RETAINED_WALLET_CALL_BATCHES_PER_ORIGIN; index += 1) {
    ledger.create(batch({ id: `batch-${index}` }), 1000 + index)
  }

  expectRpcError(() => ledger.create(batch({ id: 'one-too-many' }), 2000), 5740, /retained batch limit/)
  expect(() => ledger.create(batch({ id: 'different-origin', origin: 'origin-two' }), 2000)).not.toThrow()
})

it('derives pending then successful status from ordered hashes and receipts', () => {
  const { ledger } = createLedger()
  const firstHash = hash('1')
  const secondHash = hash('2')
  ledger.create(batch({ callCount: 2 }), 1000)

  expect(ledger.getStatus(origin, account, 'app-id', 1001)).toMatchObject({ status: 100, atomic: false })
  ledger.recordTransaction(origin, account, 'app-id', firstHash, 1002)
  ledger.recordTransaction(origin, account, 'app-id', secondHash, 1003)
  ledger.complete(origin, account, 'app-id', 1004)
  ledger.recordReceipt(origin, account, 'app-id', receipt(secondHash), 1005)
  expect(ledger.getStatus(origin, account, 'app-id', 1006).status).toBe(100)
  ledger.recordReceipt(origin, account, 'app-id', receipt(firstHash), 1007)

  const status = ledger.getStatus(origin, account, 'app-id', 1008)
  expect(status.status).toBe(200)
  expect(status.receipts.map((entry) => entry.transactionHash)).toEqual([firstHash, secondHash])
})

it('distinguishes signed reservations from submitted transactions', () => {
  const { ledger } = createLedger()
  const transactionHash = hash('1')
  ledger.create(batch({ callCount: 2 }), 1000)

  ledger.reserveTransaction(origin, account, 'app-id', transactionHash, 1001)
  expect(ledger.get(origin, account, 'app-id', 1002).transactions).toEqual([
    { hash: transactionHash, state: 'signed' }
  ])
  expect(() => ledger.reserveTransaction(origin, account, 'app-id', transactionHash, 1002)).toThrow(
    /already recorded/
  )
  expect(() => ledger.reserveTransaction(origin, account, 'app-id', hash('2'), 1002)).toThrow(/not submitted/)
  expect(() => ledger.complete(origin, account, 'app-id', 1002)).toThrow(/unsubmitted reservations/)

  ledger.fail(origin, account, 'app-id', 1003)
  expect(ledger.getStatus(origin, account, 'app-id', 1004).status).toBe(400)
})

it('lists only live final signed reservations as immutable reconciliation candidates', () => {
  const { ledger } = createLedger()
  const firstHash = hash('1')
  const secondHash = hash('2')
  ledger.create(batch({ id: 'submitted', callCount: 2 }), 1000)
  ledger.recordTransaction(origin, account, 'submitted', firstHash, 1001)
  ledger.reserveTransaction(origin, account, 'submitted', secondHash, 1002)
  ledger.create(batch({ id: 'failed', account: otherAccount }), 1003)
  ledger.reserveTransaction(origin, otherAccount, 'failed', hash('3'), 1004)
  ledger.fail(origin, otherAccount, 'failed', 1005)
  ledger.create(batch({ id: 'complete', account: hash('4').slice(0, 42) }), 1006)
  ledger.recordTransaction(origin, hash('4').slice(0, 42), 'complete', hash('5'), 1007)
  ledger.complete(origin, hash('4').slice(0, 42), 'complete', 1008)

  const candidates = ledger.listReconciliationCandidates(1009)
  expect(candidates).toEqual([
    { origin, account, id: 'submitted', chainId: '0x1', hash: secondHash },
    { origin, account: otherAccount, id: 'failed', chainId: '0x1', hash: hash('3') }
  ])
  expect(Object.isFrozen(candidates)).toBe(true)
  expect(candidates.every(Object.isFrozen)).toBe(true)
  expect(() => {
    candidates[0].hash = hash('9')
  }).toThrow()
  expect(ledger.listReconciliationCandidates(1009)[0].hash).toBe(secondHash)
  expect(ledger.listReconciliationCandidates(1003 + WALLET_CALL_BATCH_TTL_MS)).toEqual([])
})

it('lists submitted transactions without receipts in immutable batch and call order', () => {
  const { ledger } = createLedger()
  const firstHash = hash('1')
  const secondHash = hash('2')
  const thirdHash = hash('3')
  ledger.create(batch({ id: 'first', callCount: 3 }), 1000)
  ledger.recordTransaction(origin, account, 'first', firstHash, 1001)
  ledger.recordTransaction(origin, account, 'first', secondHash, 1002)
  ledger.recordReceipt(origin, account, 'first', receipt(secondHash), 1003)
  ledger.reserveTransaction(origin, account, 'first', thirdHash, 1004)
  ledger.create(batch({ id: 'second', account: otherAccount }), 1005)
  ledger.recordTransaction(origin, otherAccount, 'second', hash('4'), 1006)
  ledger.fail(origin, otherAccount, 'second', 1007)

  const candidates = ledger.listReceiptCandidates(1008)
  expect(candidates).toEqual([
    { origin, account, id: 'first', chainId: '0x1', hash: firstHash },
    { origin, account: otherAccount, id: 'second', chainId: '0x1', hash: hash('4') }
  ])
  expect(Object.isFrozen(candidates)).toBe(true)
  expect(candidates.every(Object.isFrozen)).toBe(true)
  expect(() => {
    candidates[0].id = 'redirected'
  }).toThrow()
  expect(ledger.listReceiptCandidates(1005 + WALLET_CALL_BATCH_TTL_MS)).toEqual([])
})

it('recovers a signed reservation when broadcast acceptance is confirmed after failure', () => {
  const { ledger } = createLedger()
  const transactionHash = hash('1')
  ledger.create(batch(), 1000)
  ledger.reserveTransaction(origin, account, 'app-id', transactionHash, 1001)
  ledger.fail(origin, account, 'app-id', 1002)

  ledger.markTransactionSubmitted(origin, account, 'app-id', transactionHash, 1003)
  expect(ledger.get(origin, account, 'app-id', 1004).transactions[0].state).toBe('submitted')
  expect(() =>
    ledger.markTransactionSubmitted(origin, account, 'app-id', transactionHash, 1004)
  ).not.toThrow()
  expect(ledger.getStatus(origin, account, 'app-id', 1004).status).toBe(100)

  ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash), 1005)
  expect(ledger.getStatus(origin, account, 'app-id', 1006).status).toBe(200)
})

it('uses a receipt as definitive submission evidence for a signed reservation', () => {
  const { ledger } = createLedger()
  const transactionHash = hash('1')
  ledger.create(batch(), 1000)
  ledger.reserveTransaction(origin, account, 'app-id', transactionHash, 1001)
  ledger.fail(origin, account, 'app-id', 1002)

  ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash), 1003)

  expect(ledger.get(origin, account, 'app-id', 1004).transactions[0]).toMatchObject({
    hash: transactionHash,
    state: 'submitted',
    receipt: { transactionHash }
  })
  expect(ledger.getStatus(origin, account, 'app-id', 1004).status).toBe(200)
})

it('rejects submission or receipt evidence for an unreserved hash', () => {
  const { ledger } = createLedger()
  const transactionHash = hash('1')
  ledger.create(batch(), 1000)

  expect(() => ledger.markTransactionSubmitted(origin, account, 'app-id', transactionHash, 1001)).toThrow(
    /not reserved/
  )
  expect(() => ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash), 1001)).toThrow(
    /not part/
  )
})

it.each([
  [['0x0'], 500],
  [['0x1', '0x0'], 600]
])('derives chain failure status from receipts %#', (receiptStatuses, expectedStatus) => {
  const { ledger } = createLedger()
  ledger.create(batch({ callCount: receiptStatuses.length }), 1000)
  receiptStatuses.forEach((_status, index) =>
    ledger.recordTransaction(origin, account, 'app-id', hash(String(index + 1)), 1001 + index)
  )
  ledger.complete(origin, account, 'app-id', 1010)
  receiptStatuses.forEach((status, index) =>
    ledger.recordReceipt(origin, account, 'app-id', receipt(hash(String(index + 1)), status), 1020 + index)
  )

  expect(ledger.getStatus(origin, account, 'app-id', 1030).status).toBe(expectedStatus)
})

it('distinguishes offchain failure from partial execution failure', () => {
  const noSend = createLedger().ledger
  noSend.create(batch(), 1000)
  noSend.fail(origin, account, 'app-id', 1001)
  expect(noSend.getStatus(origin, account, 'app-id', 1002).status).toBe(400)

  const partial = createLedger().ledger
  const transactionHash = hash('1')
  partial.create(batch({ callCount: 2 }), 1000)
  partial.recordTransaction(origin, account, 'app-id', transactionHash, 1001)
  partial.fail(origin, account, 'app-id', 1002)
  expect(partial.getStatus(origin, account, 'app-id', 1003).status).toBe(100)
  partial.recordReceipt(origin, account, 'app-id', receipt(transactionHash), 1004)
  expect(partial.getStatus(origin, account, 'app-id', 1005).status).toBe(600)

  const fullySubmitted = createLedger().ledger
  fullySubmitted.create(batch(), 1000)
  fullySubmitted.recordTransaction(origin, account, 'app-id', transactionHash, 1001)
  fullySubmitted.fail(origin, account, 'app-id', 1002)
  fullySubmitted.recordReceipt(origin, account, 'app-id', receipt(transactionHash), 1003)
  expect(fullySubmitted.getStatus(origin, account, 'app-id', 1004).status).toBe(200)
})

it('enforces append-only transactions, immutable receipts, and terminal execution', () => {
  const { ledger } = createLedger()
  const transactionHash = hash('1')
  ledger.create(batch(), 1000)

  expect(() => ledger.complete(origin, account, 'app-id', 1001)).toThrow(/missing transactions/)
  ledger.recordTransaction(origin, account, 'app-id', transactionHash, 1002)
  expect(() => ledger.recordTransaction(origin, account, 'app-id', transactionHash, 1003)).toThrow(
    /already recorded/
  )
  expect(() => ledger.recordReceipt(origin, account, 'app-id', receipt(hash('2')), 1003)).toThrow(/not part/)
  ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash), 1004)
  expect(() => ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash), 1005)).not.toThrow()
  expect(() =>
    ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash, '0x0'), 1005)
  ).toThrow(/already recorded/)
  ledger.complete(origin, account, 'app-id', 1006)
  expect(() => ledger.fail(origin, account, 'app-id', 1007)).toThrow(/already closed/)
  expect(() => ledger.recordTransaction(origin, account, 'app-id', hash('2'), 1007)).toThrow(/already closed/)
})

it('strictly validates and bounds persisted receipt subsets', () => {
  const { ledger } = createLedger()
  const transactionHash = hash('1')
  ledger.create(batch(), 1000)
  ledger.recordTransaction(origin, account, 'app-id', transactionHash, 1001)

  expect(() =>
    ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash, '0x2'), 1002)
  ).toThrow(/Invalid wallet call receipt/)
  expect(() =>
    ledger.recordReceipt(origin, account, 'app-id', receipt(transactionHash, '0x1', { extra: true }), 1002)
  ).toThrow(/Invalid wallet call receipt/)
  expect(() =>
    ledger.recordReceipt(
      origin,
      account,
      'app-id',
      receipt(transactionHash, '0x1', {
        logs: [
          {
            address: account,
            topics: [],
            data: `0x${'00'.repeat(MAX_PERSISTED_WALLET_CALL_RECEIPT_BYTES)}`
          }
        ]
      }),
      1002
    )
  ).toThrow(/persistence limit/)
})

it('bounds aggregate persisted receipt data per batch', () => {
  const { ledger } = createLedger()
  const hashes = Array.from({ length: 6 }, (_, index) => hash(String(index + 1)))
  const largeLog = {
    address: account,
    topics: [],
    data: `0x${'00'.repeat(100 * 1024)}`
  }
  ledger.create(batch({ callCount: hashes.length }), 1000)
  hashes.forEach((transactionHash, index) =>
    ledger.recordTransaction(origin, account, 'app-id', transactionHash, 1001 + index)
  )
  hashes
    .slice(0, 5)
    .forEach((transactionHash, index) =>
      ledger.recordReceipt(
        origin,
        account,
        'app-id',
        receipt(transactionHash, '0x1', { logs: [largeLog] }),
        1010 + index
      )
    )

  expect(() =>
    ledger.recordReceipt(origin, account, 'app-id', receipt(hashes[5], '0x1', { logs: [largeLog] }), 1020)
  ).toThrow(/batch exceeds persistence limit/)
})
