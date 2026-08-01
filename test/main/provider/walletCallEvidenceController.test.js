import {
  pollWalletCallEvidence,
  WalletCallEvidenceController
} from '../../../main/provider/walletCallEvidenceController'

const account = '0x1111111111111111111111111111111111111111'
const hash = (value) => `0x${value.repeat(64)}`

const candidate = {
  origin: 'example.test',
  account,
  id: 'batch-id',
  chainId: '0x1',
  hash: hash('1')
}

const receipt = {
  logs: [],
  status: '0x1',
  blockHash: hash('b'),
  blockNumber: '0x1',
  gasUsed: '0x5208',
  transactionHash: hash('1')
}

function manualTimers() {
  const pending = []
  const schedule = jest.fn((callback, delay) => {
    const timer = { callback, delay, unref: jest.fn() }
    pending.push(timer)
    return timer
  })
  const cancel = jest.fn((timer) => {
    const index = pending.indexOf(timer)
    if (index >= 0) pending.splice(index, 1)
  })
  const runNext = () => {
    const timer = pending.shift()
    if (!timer) throw new Error('No timer is pending')
    timer.callback()
    return timer
  }

  return { pending, schedule, cancel, runNext }
}

const flushPromises = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve()
}

const emptyResult = (continuePolling = false) => ({
  reconciliation: [],
  receipts: [],
  continuePolling
})

it('reconciles reservations before collecting newly eligible receipts', async () => {
  let state = 'signed'
  const events = []
  const ledger = {
    listReconciliationCandidates: jest.fn(() => (state === 'signed' ? [candidate] : [])),
    listReceiptCandidates: jest.fn(() => (state === 'submitted' ? [candidate] : [])),
    markTransactionSubmitted: jest.fn(() => {
      events.push('submitted')
      state = 'submitted'
    }),
    recordReceipt: jest.fn(() => {
      events.push('receipt')
      state = 'recorded'
    })
  }
  const getTransactionReceipt = jest
    .fn()
    .mockImplementationOnce(async () => {
      events.push('reconcile-receipt')
      return null
    })
    .mockImplementationOnce(async () => {
      events.push('collect-receipt')
      return receipt
    })
  const getTransaction = jest.fn(async () => {
    events.push('transaction')
    return { hash: hash('1') }
  })

  await expect(pollWalletCallEvidence({ ledger, getTransactionReceipt, getTransaction })).resolves.toEqual({
    reconciliation: [{ status: 'transaction-submitted' }],
    receipts: [{ status: 'receipt-recorded' }],
    continuePolling: false
  })
  expect(events).toEqual(['reconcile-receipt', 'transaction', 'submitted', 'collect-receipt', 'receipt'])
})

it('does no RPC work and requests no continuation when there is no evidence', async () => {
  const ledger = {
    listReconciliationCandidates: jest.fn(() => []),
    listReceiptCandidates: jest.fn(() => []),
    markTransactionSubmitted: jest.fn(),
    recordReceipt: jest.fn()
  }
  const getTransactionReceipt = jest.fn()
  const getTransaction = jest.fn()

  await expect(pollWalletCallEvidence({ ledger, getTransactionReceipt, getTransaction })).resolves.toEqual(
    emptyResult()
  )
  expect(getTransactionReceipt).not.toHaveBeenCalled()
  expect(getTransaction).not.toHaveBeenCalled()
})

it('never overlaps passes and coalesces wakeups during an in-flight pass', async () => {
  const timers = manualTimers()
  let resolveFirst
  const poll = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    .mockResolvedValueOnce(emptyResult())
  const controller = new WalletCallEvidenceController({
    poll,
    intervalMs: 100,
    schedule: timers.schedule,
    cancel: timers.cancel
  })

  controller.start()
  controller.start()
  expect(timers.pending).toHaveLength(1)
  expect(timers.runNext().delay).toBe(0)
  await flushPromises()
  expect(poll).toHaveBeenCalledTimes(1)

  controller.wake()
  controller.wake()
  expect(poll).toHaveBeenCalledTimes(1)
  expect(timers.pending).toHaveLength(0)

  resolveFirst(emptyResult(true))
  await flushPromises()
  expect(timers.pending).toHaveLength(1)
  expect(timers.runNext().delay).toBe(0)
  await flushPromises()
  expect(poll).toHaveBeenCalledTimes(2)
  expect(timers.pending).toHaveLength(0)

  controller.wake()
  expect(timers.pending).toHaveLength(1)
  controller.stop()
  expect(timers.pending).toHaveLength(0)
})

it('polls only while evidence remains and de-duplicates repeated diagnostics', async () => {
  const timers = manualTimers()
  const reportError = jest.fn()
  const failed = {
    reconciliation: [{ status: 'unresolved', reason: 'endpoint unavailable' }],
    receipts: [],
    continuePolling: true
  }
  const poll = jest
    .fn()
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(emptyResult(true))
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(emptyResult())
  const controller = new WalletCallEvidenceController({
    poll,
    reportError,
    intervalMs: 100,
    schedule: timers.schedule,
    cancel: timers.cancel
  })

  controller.start()
  for (let pass = 0; pass < 5; pass += 1) {
    expect(timers.runNext().delay).toBe(pass === 0 ? 0 : 100)
    await flushPromises()
  }

  expect(reportError).toHaveBeenCalledTimes(2)
  expect(reportError.mock.calls[0][0].message).toContain('endpoint unavailable')
  expect(timers.pending).toHaveLength(0)
})

it('stops cleanly during a pass and schedules one immediate pass after restart', async () => {
  const timers = manualTimers()
  let resolveFirst
  const poll = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    .mockResolvedValueOnce(emptyResult())
  const controller = new WalletCallEvidenceController({
    poll,
    schedule: timers.schedule,
    cancel: timers.cancel
  })

  controller.start()
  timers.runNext()
  await flushPromises()
  controller.stop()
  controller.start()
  expect(timers.pending).toHaveLength(0)

  resolveFirst(emptyResult(true))
  await flushPromises()
  expect(timers.pending).toHaveLength(1)
  expect(timers.runNext().delay).toBe(0)
  await flushPromises()
  expect(poll).toHaveBeenCalledTimes(2)
  expect(timers.pending).toHaveLength(0)
})

it('remains retryable when poll throws before returning a promise', async () => {
  const timers = manualTimers()
  const reportError = jest.fn()
  const poll = jest
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('synchronous poll failure')
    })
    .mockResolvedValueOnce(emptyResult())
  const controller = new WalletCallEvidenceController({
    poll,
    reportError,
    intervalMs: 100,
    schedule: timers.schedule,
    cancel: timers.cancel
  })

  controller.start()
  timers.runNext()
  await flushPromises()
  expect(reportError.mock.calls[0][0].message).toBe('synchronous poll failure')
  expect(timers.pending[0].delay).toBe(100)

  timers.runNext()
  await flushPromises()
  expect(poll).toHaveBeenCalledTimes(2)
  expect(timers.pending).toHaveLength(0)
})
