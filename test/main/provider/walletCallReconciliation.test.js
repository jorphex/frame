import {
  reconcileWalletCallReservation,
  reconcileWalletCallReservations
} from '../../../main/provider/walletCallReconciliation'

const account = '0x1111111111111111111111111111111111111111'
const hash = (value) => `0x${value.repeat(64)}`

function candidate(overrides = {}) {
  return {
    origin: 'example.test',
    account,
    id: 'batch-id',
    chainId: '0x1',
    hash: hash('1'),
    ...overrides
  }
}

function receipt(overrides = {}) {
  return {
    logs: [],
    status: '0x1',
    blockHash: hash('b'),
    blockNumber: '0x1',
    gasUsed: '0x5208',
    transactionHash: hash('1'),
    ...overrides
  }
}

function dependencies() {
  return {
    ledger: {
      markTransactionSubmitted: jest.fn(),
      recordReceipt: jest.fn()
    },
    getTransactionReceipt: jest.fn().mockResolvedValue(null),
    getTransaction: jest.fn().mockResolvedValue(null)
  }
}

it('records an exact receipt without querying the transaction', async () => {
  const deps = dependencies()
  const transactionReceipt = receipt()
  deps.getTransactionReceipt.mockResolvedValueOnce(transactionReceipt)

  await expect(reconcileWalletCallReservation(candidate(), deps)).resolves.toEqual({
    status: 'receipt-recorded'
  })
  expect(deps.ledger.recordReceipt).toHaveBeenCalledWith(
    'example.test',
    account,
    'batch-id',
    transactionReceipt
  )
  expect(deps.getTransaction).not.toHaveBeenCalled()
  expect(deps.ledger.markTransactionSubmitted).not.toHaveBeenCalled()
})

it('promotes a reservation only from an exact own transaction hash', async () => {
  const deps = dependencies()
  deps.getTransaction.mockResolvedValueOnce({ hash: hash('1'), from: account })

  await expect(reconcileWalletCallReservation(candidate(), deps)).resolves.toEqual({
    status: 'transaction-submitted'
  })
  expect(deps.ledger.markTransactionSubmitted).toHaveBeenCalledWith(
    'example.test',
    account,
    'batch-id',
    hash('1')
  )
})

it('uses one immutable candidate snapshot across asynchronous lookups', async () => {
  const deps = dependencies()
  const mutableCandidate = candidate()
  deps.getTransactionReceipt.mockImplementationOnce(async () => {
    mutableCandidate.account = '0x2222222222222222222222222222222222222222'
    mutableCandidate.id = 'redirected-batch'
    mutableCandidate.hash = hash('2')
    return null
  })
  deps.getTransaction.mockResolvedValueOnce({ hash: hash('1') })

  await expect(reconcileWalletCallReservation(mutableCandidate, deps)).resolves.toEqual({
    status: 'transaction-submitted'
  })
  expect(deps.getTransaction).toHaveBeenCalledWith('0x1', hash('1'))
  expect(deps.ledger.markTransactionSubmitted).toHaveBeenCalledWith(
    'example.test',
    account,
    'batch-id',
    hash('1')
  )
})

it.each([{ hash: hash('2') }, Object.create({ hash: hash('1') }), { hash: hash('A') }, [], 'transaction'])(
  'leaves mismatched or malformed transaction evidence unresolved: %#',
  async (transaction) => {
    const deps = dependencies()
    deps.getTransaction.mockResolvedValueOnce(transaction)

    const outcome = await reconcileWalletCallReservation(candidate(), deps)
    expect(outcome).toMatchObject({ status: 'unresolved' })
    expect(outcome.reason).toMatch(/mismatched|malformed/)
    expect(deps.ledger.markTransactionSubmitted).not.toHaveBeenCalled()
  }
)

it('does not treat two absent lookup results as proof of failure', async () => {
  const deps = dependencies()

  await expect(reconcileWalletCallReservation(candidate(), deps)).resolves.toEqual({
    status: 'unresolved'
  })
  expect(deps.ledger.recordReceipt).not.toHaveBeenCalled()
  expect(deps.ledger.markTransactionSubmitted).not.toHaveBeenCalled()
})

it('falls back to exact transaction evidence after a receipt lookup or validation failure', async () => {
  const lookupFailure = dependencies()
  lookupFailure.getTransactionReceipt.mockRejectedValueOnce(new Error('receipt endpoint unavailable'))
  lookupFailure.getTransaction.mockResolvedValueOnce({ hash: hash('1') })

  await expect(reconcileWalletCallReservation(candidate(), lookupFailure)).resolves.toEqual({
    status: 'transaction-submitted',
    reason: 'receipt endpoint unavailable'
  })

  const invalidReceipt = dependencies()
  invalidReceipt.getTransactionReceipt.mockResolvedValueOnce(receipt({ transactionHash: hash('2') }))
  invalidReceipt.getTransaction.mockResolvedValueOnce({ hash: hash('1') })

  await expect(reconcileWalletCallReservation(candidate(), invalidReceipt)).resolves.toEqual({
    status: 'transaction-submitted',
    reason: 'Transaction receipt is malformed or does not match the reserved hash'
  })
  expect(invalidReceipt.ledger.recordReceipt).not.toHaveBeenCalled()
})

it('leaves malformed receipt evidence unchanged when no exact transaction exists', async () => {
  const deps = dependencies()
  deps.getTransactionReceipt.mockResolvedValueOnce(receipt({ transactionHash: hash('2') }))

  await expect(reconcileWalletCallReservation(candidate(), deps)).resolves.toEqual({
    status: 'unresolved',
    reason: 'Transaction receipt is malformed or does not match the reserved hash'
  })
  expect(deps.ledger.recordReceipt).not.toHaveBeenCalled()
  expect(deps.ledger.markTransactionSubmitted).not.toHaveBeenCalled()
})

it('does not discard a valid receipt when its persistence attempt fails', async () => {
  const deps = dependencies()
  deps.getTransactionReceipt.mockResolvedValueOnce(receipt())
  deps.ledger.recordReceipt.mockImplementationOnce(() => {
    throw new Error('receipt storage unavailable')
  })
  deps.getTransaction.mockResolvedValueOnce({ hash: hash('1') })

  await expect(reconcileWalletCallReservation(candidate(), deps)).resolves.toEqual({
    status: 'error',
    reason: 'receipt storage unavailable'
  })
  expect(deps.getTransaction).not.toHaveBeenCalled()
  expect(deps.ledger.markTransactionSubmitted).not.toHaveBeenCalled()
})

it('returns bounded errors when lookup or persistence fails', async () => {
  const lookupFailure = dependencies()
  lookupFailure.getTransaction.mockRejectedValueOnce(new Error('x'.repeat(500)))
  const lookupOutcome = await reconcileWalletCallReservation(candidate(), lookupFailure)
  expect(lookupOutcome.status).toBe('error')
  expect(lookupOutcome.reason).toHaveLength(240)

  const persistenceFailure = dependencies()
  persistenceFailure.getTransaction.mockResolvedValueOnce({ hash: hash('1') })
  persistenceFailure.ledger.markTransactionSubmitted.mockImplementationOnce(() => {
    throw new Error('storage unavailable')
  })
  await expect(reconcileWalletCallReservation(candidate(), persistenceFailure)).resolves.toEqual({
    status: 'error',
    reason: 'storage unavailable'
  })
})

it.each([
  { origin: '' },
  { account: '0x1' },
  { id: String.fromCodePoint(0xa2).repeat(2049) },
  { chainId: '0x01' },
  { hash: hash('A') }
])('rejects malformed candidates before any RPC lookup: %#', async (overrides) => {
  const deps = dependencies()

  const outcome = await reconcileWalletCallReservation(candidate(overrides), deps)
  expect(outcome).toMatchObject({ status: 'error', reason: 'Invalid wallet call evidence candidate' })
  expect(deps.getTransactionReceipt).not.toHaveBeenCalled()
  expect(deps.getTransaction).not.toHaveBeenCalled()
})

it('processes candidates sequentially and isolates one provider failure from the next', async () => {
  const events = []
  const deps = dependencies()
  deps.getTransactionReceipt.mockImplementation(async (_chainId, transactionHash) => {
    events.push(`receipt:${transactionHash}`)
    if (transactionHash === hash('1')) throw new Error('first endpoint failed')
    return receipt({ transactionHash })
  })
  deps.getTransaction.mockImplementation(async (_chainId, transactionHash) => {
    events.push(`transaction:${transactionHash}`)
    if (transactionHash === hash('1')) throw new Error('first endpoint failed')
    return null
  })
  deps.ledger.recordReceipt.mockImplementation((_origin, _account, id) => events.push(`record:${id}`))

  await expect(
    reconcileWalletCallReservations([candidate(), candidate({ id: 'batch-two', hash: hash('2') })], deps)
  ).resolves.toEqual([{ status: 'error', reason: 'first endpoint failed' }, { status: 'receipt-recorded' }])
  expect(events).toEqual([
    `receipt:${hash('1')}`,
    `transaction:${hash('1')}`,
    `receipt:${hash('2')}`,
    'record:batch-two'
  ])
})

it('rejects an oversized candidate queue before any RPC lookup', async () => {
  const deps = dependencies()
  const candidates = Array.from({ length: 257 }, (_, index) => candidate({ id: `batch-${index}` }))

  await expect(reconcileWalletCallReservations(candidates, deps)).rejects.toThrow(/limit exceeded/)
  expect(deps.getTransactionReceipt).not.toHaveBeenCalled()
  expect(deps.getTransaction).not.toHaveBeenCalled()
})
