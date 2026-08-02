import {
  buildEthCall,
  buildSimulationCall,
  parseDelegationIndicator,
  parseNativeBalanceChanges,
  parseSimulateCallsResult,
  parseSimulateResult,
  simulateTransaction,
  simulateWalletCalls
} from '../../../main/transaction/simulation'

const transaction = {
  chainId: '0x1',
  type: '0x2',
  nonce: '0x7',
  from: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  gasLimit: '0x5208',
  value: '0x1',
  data: '0x1234',
  maxFeePerGas: '0x64',
  maxPriorityFeePerGas: '0x2',
  gasFeesSource: 'Frame'
}

const approvalSpender = '0x3333333333333333333333333333333333333333'
const approvalAmount = 42n
const approvalData = `0x095ea7b3${'0'.repeat(24)}${approvalSpender.slice(2)}${approvalAmount
  .toString(16)
  .padStart(64, '0')}`
const approvalTransaction = { ...transaction, data: approvalData }

const simulateSuccess = [
  {
    calls: [{ status: '0x1', gasUsed: '0x5208', returnData: '0x', logs: [] }]
  }
]

const unsupportedNativeBalanceChanges = {
  status: 'unavailable',
  source: 'debug_traceCall',
  reason: 'Configured RPC does not support native balance-change tracing'
}

function rpcError(code, message) {
  return { id: 1, jsonrpc: '2.0', error: { code, message } }
}

const withAccountCode =
  (send, response = { result: '0x' }, traceResponse = rpcError(-32601, 'Method not found')) =>
  (payload, callback, targetChain) => {
    if (payload.method === 'eth_getCode') {
      callback({ id: payload.id, jsonrpc: '2.0', ...response })
      return
    }
    if (payload.method === 'debug_traceCall') {
      callback(traceResponse)
      return
    }

    send(payload, callback, targetChain)
  }

it('strictly parses only an exact EIP-7702 delegation indicator', () => {
  const delegate = 'aA'.repeat(20)

  expect(parseDelegationIndicator(`0xef0100${delegate}`)).toBe(`0x${delegate.toLowerCase()}`)
  expect(parseDelegationIndicator(`0xEF0100${delegate}`)).toBe(`0x${delegate.toLowerCase()}`)
  expect(parseDelegationIndicator(`0xef0100${delegate}00`)).toBeUndefined()
  expect(parseDelegationIndicator(`0x6000${delegate}`)).toBeUndefined()
  expect(parseDelegationIndicator('0xef0100zz')).toBeUndefined()
})

it('builds bounded single-call RPC inputs from transaction data', () => {
  expect(buildSimulationCall(transaction)).toEqual({
    type: '0x2',
    nonce: '0x7',
    from: transaction.from,
    to: transaction.to,
    gas: '0x5208',
    value: '0x1',
    input: '0x1234',
    maxPriorityFeePerGas: '0x2',
    maxFeePerGas: '0x64'
  })
  expect(buildEthCall(transaction)).toEqual({
    from: transaction.from,
    to: transaction.to,
    gas: '0x5208',
    value: '0x1',
    data: '0x1234',
    maxPriorityFeePerGas: '0x2',
    maxFeePerGas: '0x64'
  })
})

it('preserves an exact access list in configured-RPC simulation input', () => {
  const accessList = [
    {
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      storageKeys: [`0x${'bb'.repeat(32)}`]
    }
  ]

  expect(buildSimulationCall({ ...transaction, accessList })).toMatchObject({ accessList })
  expect(buildEthCall({ ...transaction, accessList })).toMatchObject({ accessList })
})

it('strictly parses bounded native balance changes, creations, and deletions', () => {
  const created = '0x3333333333333333333333333333333333333333'
  const deleted = '0x4444444444444444444444444444444444444444'
  const mixedCaseSender = `0x${transaction.from.slice(2).toUpperCase()}`

  expect(
    parseNativeBalanceChanges({
      pre: {
        [mixedCaseSender]: { balance: '0xa', nonce: 1 },
        [transaction.to]: { balance: '0x5' },
        [deleted]: { balance: '0x2' }
      },
      post: {
        [mixedCaseSender]: { balance: '0x7' },
        [transaction.to]: { nonce: 2 },
        [created]: { balance: '0x5' }
      }
    })
  ).toEqual({
    changes: [
      { account: transaction.from, before: '10', after: '7', change: '-3' },
      { account: created, before: '0', after: '5', change: '5' },
      { account: deleted, before: '2', after: '0', change: '-2' }
    ],
    truncated: false
  })
})

it('fails closed on malformed native balance changes and bounds account output', () => {
  expect(parseNativeBalanceChanges({ pre: [], post: {} })).toBeUndefined()
  expect(parseNativeBalanceChanges({ pre: { invalid: { balance: '0x1' } }, post: {} })).toBeUndefined()
  expect(
    parseNativeBalanceChanges({ pre: { [transaction.from]: { balance: '0x01' } }, post: {} })
  ).toBeUndefined()
  expect(
    parseNativeBalanceChanges({
      pre: { [transaction.from]: { nonce: 1 } },
      post: { [transaction.from]: { balance: '0x1' } }
    })
  ).toBeUndefined()
  expect(
    parseNativeBalanceChanges({
      pre: {
        '0xaabbccddaabbccddaabbccddaabbccddaabbccdd': { balance: '0x1' },
        '0xAABBCCDDAABBCCDDAABBCCDDAABBCCDDAABBCCDD': { balance: '0x1' }
      },
      post: {}
    })
  ).toBeUndefined()

  const pre = {}
  const post = {}
  for (let index = 0; index < 129; index += 1) {
    const address = `0x${index.toString(16).padStart(40, '0')}`
    pre[address] = { balance: '0x0' }
    post[address] = { balance: '0x1' }
  }
  const bounded = parseNativeBalanceChanges({ pre, post })
  expect(bounded).toMatchObject({ truncated: true })
  expect(bounded.changes).toHaveLength(128)

  const oversized = {}
  for (let index = 0; index < 1025; index += 1) {
    oversized[`0x${index.toString(16).padStart(40, '0')}`] = { balance: '0x0' }
  }
  expect(parseNativeBalanceChanges({ pre: oversized, post: {} })).toBeUndefined()
})

it('strictly parses one successful simulation call', () => {
  expect(parseSimulateResult(simulateSuccess)).toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208'
  })

  expect(parseSimulateResult([{ calls: [...simulateSuccess[0].calls, simulateSuccess[0].calls[0]] }])).toBe(
    undefined
  )
  expect(parseSimulateResult([{ calls: [{ ...simulateSuccess[0].calls[0], gasUsed: '0x00' }] }])).toBe(
    undefined
  )
})

it('strictly parses an exact ordered simulation call count', () => {
  const first = simulateSuccess[0].calls[0]
  const second = { ...first, gasUsed: '0x5300' }

  expect(parseSimulateCallsResult([{ calls: [first, second] }], 2)).toEqual([
    { status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x5208' },
    { status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x5300' }
  ])
  expect(parseSimulateCallsResult([{ calls: [first] }], 2)).toBeUndefined()
  expect(parseSimulateCallsResult([{ calls: [first, { ...second, returnData: '0x0' }] }], 2)).toBeUndefined()
  expect(parseSimulateCallsResult([{ calls: [first] }], 0)).toBeUndefined()
  expect(parseSimulateCallsResult([{ calls: [first] }], 1.5)).toBeUndefined()
  expect(parseSimulateCallsResult([{ calls: Array(17).fill(first) }], 17)).toBeUndefined()
})

it('attaches normalized effects only to a successful eth_simulateV1 result', () => {
  const addressTopic = (address) => `0x${'0'.repeat(24)}${address.slice(2)}`
  const amount = 10n.toString(16).padStart(64, '0')
  const result = parseSimulateResult([
    {
      calls: [
        {
          status: '0x1',
          gasUsed: '0x5208',
          returnData: '0x',
          logs: [
            {
              address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                addressTopic(transaction.from),
                addressTopic(transaction.to)
              ],
              data: `0x${amount}`
            }
          ]
        }
      ]
    }
  ])

  expect(result).toMatchObject({
    status: 'succeeded',
    source: 'eth_simulateV1',
    effects: [
      {
        type: 'transfer',
        standard: 'erc20',
        from: transaction.from,
        to: transaction.to,
        amount: '10'
      }
    ]
  })
})

it('parses a bounded revert result', () => {
  const reason = 'execution reverted: ' + 'x'.repeat(500)
  const result = parseSimulateResult([
    {
      calls: [
        {
          status: '0x0',
          gasUsed: '0x42',
          returnData: '0x',
          error: { code: 3, message: reason }
        }
      ]
    }
  ])

  expect(result).toMatchObject({ status: 'reverted', source: 'eth_simulateV1', gasUsed: '0x42' })
  expect(result.reason).toHaveLength(240)
})

it('uses eth_simulateV1 without falling back when it succeeds', async () => {
  const send = jest.fn((payload, callback) => callback({ id: 1, jsonrpc: '2.0', result: simulateSuccess }))

  await expect(simulateTransaction(transaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208',
    nativeBalanceChanges: unsupportedNativeBalanceChanges
  })
  expect(send).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledWith(
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_simulateV1',
      params: [
        {
          blockStateCalls: [{ calls: [buildSimulationCall(transaction)] }],
          validation: false
        },
        'latest'
      ]
    },
    expect.any(Function),
    { type: 'ethereum', id: 1 }
  )
})

it('attaches exact configured-RPC native balance changes after execution succeeds', async () => {
  const send = jest.fn((payload, callback) => {
    const result =
      payload.method === 'eth_getCode'
        ? '0x'
        : payload.method === 'debug_traceCall'
          ? {
              pre: { [transaction.from]: { balance: '0xa' } },
              post: { [transaction.from]: { balance: '0x7' } }
            }
          : simulateSuccess
    callback({ id: payload.id, jsonrpc: '2.0', result })
  })

  await expect(simulateTransaction(transaction, { send })).resolves.toMatchObject({
    status: 'succeeded',
    nativeBalanceChanges: {
      status: 'succeeded',
      source: 'debug_traceCall',
      changes: [{ account: transaction.from, before: '10', after: '7', change: '-3' }]
    }
  })
  expect(send).toHaveBeenCalledWith(
    {
      id: 4,
      jsonrpc: '2.0',
      method: 'debug_traceCall',
      params: [
        buildEthCall(transaction),
        'latest',
        {
          tracer: 'prestateTracer',
          timeout: expect.stringMatching(/^[1-9][0-9]*ms$/),
          tracerConfig: { diffMode: true, disableCode: true, disableStorage: true }
        }
      ]
    },
    expect.any(Function),
    { type: 'ethereum', id: 1 }
  )
})

it('qualifies malformed and unsupported native balance traces without weakening execution evidence', async () => {
  const malformed = withAccountCode(
    jest.fn((_payload, callback) => callback({ result: simulateSuccess })),
    {
      result: '0x'
    },
    {
      id: 4,
      jsonrpc: '2.0',
      result: { pre: [], post: {} }
    }
  )
  await expect(simulateTransaction(transaction, { send: malformed })).resolves.toMatchObject({
    status: 'succeeded',
    nativeBalanceChanges: {
      status: 'failed',
      source: 'debug_traceCall',
      reason: 'RPC returned an invalid native balance-change result'
    }
  })

  const unsupported = withAccountCode(
    jest.fn((_payload, callback) => callback({ result: simulateSuccess })),
    { result: '0x' },
    rpcError(-32004, 'Trace method unavailable')
  )
  await expect(simulateTransaction(transaction, { send: unsupported })).resolves.toMatchObject({
    status: 'succeeded',
    nativeBalanceChanges: unsupportedNativeBalanceChanges
  })
})

it('shares the execution timeout budget with native balance tracing', async () => {
  const send = jest.fn((payload, callback) => {
    if (payload.method === 'eth_simulateV1') {
      setTimeout(() => callback({ id: payload.id, jsonrpc: '2.0', result: simulateSuccess }), 20)
    } else if (payload.method === 'eth_getCode') {
      callback({ id: payload.id, jsonrpc: '2.0', result: '0x' })
    }
  })
  const pending = simulateTransaction(transaction, { send, timeoutMs: 25 })

  jest.advanceTimersByTime(20)
  await Promise.resolve()
  jest.advanceTimersByTime(5)

  await expect(pending).resolves.toMatchObject({
    status: 'succeeded',
    nativeBalanceChanges: {
      status: 'unavailable',
      source: 'debug_traceCall',
      reason: 'Native balance-change trace exceeded the simulation time budget'
    }
  })
})

it('does not request native balance tracing when execution does not succeed', async () => {
  const send = jest.fn((payload, callback) => {
    const response =
      payload.method === 'eth_getCode'
        ? { id: payload.id, jsonrpc: '2.0', result: '0x' }
        : rpcError(3, 'execution reverted: denied')
    callback(response)
  })

  await expect(simulateTransaction(transaction, { send })).resolves.toMatchObject({
    status: 'reverted',
    source: 'eth_simulateV1'
  })
  expect(send.mock.calls.map(([payload]) => payload.method)).not.toContain('debug_traceCall')
})

it('attaches exact configured-RPC delegation evidence for the selected sender', async () => {
  const delegate = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const send = jest.fn((payload, callback) => {
    callback({
      id: payload.id,
      jsonrpc: '2.0',
      result: payload.method === 'eth_getCode' ? `0xef0100${delegate.slice(2)}` : simulateSuccess
    })
  })

  await expect(simulateTransaction(transaction, { send })).resolves.toMatchObject({
    status: 'succeeded',
    delegation: {
      status: 'delegated',
      source: 'eth_getCode',
      account: transaction.from,
      delegate
    }
  })
  expect(send).toHaveBeenCalledWith(
    {
      id: 3,
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [transaction.from, 'latest']
    },
    expect.any(Function),
    { type: 'ethereum', id: 1 }
  )
})

it('reports malformed configured-RPC account code as unavailable', async () => {
  const send = jest.fn((payload, callback) =>
    callback({
      id: payload.id,
      jsonrpc: '2.0',
      result: payload.method === 'eth_getCode' ? 'not-code' : simulateSuccess
    })
  )

  await expect(simulateTransaction(transaction, { send })).resolves.toMatchObject({
    status: 'succeeded',
    delegation: {
      status: 'unavailable',
      source: 'eth_getCode',
      reason: 'RPC returned invalid account code'
    }
  })
})

it('bounds a nonresponsive account delegation check without weakening execution evidence', async () => {
  const send = jest.fn((payload, callback) => {
    if (payload.method === 'eth_simulateV1') {
      callback({ id: payload.id, jsonrpc: '2.0', result: simulateSuccess })
    }
  })
  const pending = simulateTransaction(transaction, { send, timeoutMs: 25 })

  jest.advanceTimersByTime(25)

  await expect(pending).resolves.toMatchObject({
    status: 'succeeded',
    source: 'eth_simulateV1',
    delegation: {
      status: 'unavailable',
      source: 'eth_getCode',
      reason: 'Account delegation check timed out'
    }
  })
})

it.each([-32601, -32004])('falls back to eth_call for unsupported-method code %s', async (code) => {
  const send = jest
    .fn()
    .mockImplementationOnce((_payload, callback) => callback(rpcError(code, 'Method unsupported')))
    .mockImplementationOnce((_payload, callback) => callback({ id: 1, jsonrpc: '2.0', result: '0x' }))

  await expect(simulateTransaction(transaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_call',
    nativeBalanceChanges: unsupportedNativeBalanceChanges
  })
  expect(send.mock.calls[1][0]).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [buildEthCall(transaction), 'latest']
  })
})

it('does not mask invalid simulation parameters with a fallback', async () => {
  const send = jest.fn((_payload, callback) => callback(rpcError(-32602, 'Invalid parameters')))

  await expect(simulateTransaction(transaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'failed',
    source: 'eth_simulateV1',
    reason: 'Invalid parameters'
  })
  expect(send).toHaveBeenCalledTimes(1)
})

it('reports an eth_call revert after fallback', async () => {
  const send = jest
    .fn()
    .mockImplementationOnce((_payload, callback) => callback(rpcError(-32601, 'Method not found')))
    .mockImplementationOnce((_payload, callback) => callback(rpcError(3, 'execution reverted: denied')))

  await expect(simulateTransaction(transaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'reverted',
    source: 'eth_call',
    reason: 'execution reverted: denied'
  })
})

it('reports unsupported fallback as unavailable', async () => {
  const send = jest.fn((_payload, callback) => callback(rpcError(-32601, 'Method not found')))

  await expect(simulateTransaction(transaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'unavailable',
    source: 'eth_call',
    reason: 'RPC execution check is unsupported'
  })
  expect(send).toHaveBeenCalledTimes(2)
})

it('fails closed on malformed simulation output', async () => {
  const send = jest.fn((_payload, callback) => callback({ id: 1, jsonrpc: '2.0', result: [{ calls: [] }] }))

  await expect(simulateTransaction(transaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'failed',
    source: 'eth_simulateV1',
    reason: 'RPC returned an invalid simulation result'
  })
  expect(send).toHaveBeenCalledTimes(1)
})

it('fails closed on malformed provider callbacks and chain IDs', async () => {
  const send = jest.fn((_payload, callback) => callback(undefined))

  await expect(simulateTransaction(transaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'failed',
    source: 'eth_simulateV1',
    reason: 'RPC returned an invalid response'
  })
  await expect(simulateTransaction({ ...transaction, chainId: '0x01' }, { send })).resolves.toEqual({
    status: 'failed',
    reason: 'Transaction has an invalid chain ID'
  })
  expect(send).toHaveBeenCalledTimes(1)
})

it('bounds a request that never receives an RPC response', async () => {
  const pending = simulateTransaction(transaction, { send: withAccountCode(jest.fn()), timeoutMs: 25 })

  jest.advanceTimersByTime(25)

  await expect(pending).resolves.toEqual({
    status: 'failed',
    source: 'eth_simulateV1',
    reason: 'RPC execution check timed out'
  })
})

it('shares one timeout budget with the fallback call', async () => {
  const send = jest
    .fn()
    .mockImplementationOnce((_payload, callback) =>
      setTimeout(() => callback(rpcError(-32601, 'Method not found')), 20)
    )
    .mockImplementationOnce(() => {})
  const pending = simulateTransaction(transaction, { send: withAccountCode(send), timeoutMs: 25 })

  jest.advanceTimersByTime(20)
  await Promise.resolve()
  jest.advanceTimersByTime(5)

  await expect(pending).resolves.toEqual({
    status: 'failed',
    source: 'eth_call',
    reason: 'RPC execution check timed out'
  })
})

describe('wallet call batches', () => {
  const secondTransaction = {
    ...transaction,
    nonce: '0x8',
    to: '0x3333333333333333333333333333333333333333',
    value: '0x2',
    data: '0xabcd'
  }

  it('simulates all calls in one ordered evolving-state request', async () => {
    const result = [
      {
        calls: [simulateSuccess[0].calls[0], { ...simulateSuccess[0].calls[0], gasUsed: '0x5300' }]
      }
    ]
    const send = jest.fn((payload, callback) => callback({ id: 1, jsonrpc: '2.0', result }))

    await expect(
      simulateWalletCalls([transaction, secondTransaction], { send: withAccountCode(send) })
    ).resolves.toEqual({
      status: 'succeeded',
      source: 'eth_simulateV1',
      calls: [
        { status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x5208' },
        { status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x5300' }
      ]
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_simulateV1',
        params: [
          {
            blockStateCalls: [
              { calls: [buildSimulationCall(transaction), buildSimulationCall(secondTransaction)] }
            ],
            validation: false
          },
          'latest'
        ]
      },
      expect.any(Function),
      { type: 'ethereum', id: 1 }
    )
  })

  it('reports an ordered mixed batch as reverted', async () => {
    const send = jest.fn((_payload, callback) =>
      callback({
        id: 1,
        jsonrpc: '2.0',
        result: [
          {
            calls: [
              simulateSuccess[0].calls[0],
              {
                status: '0x0',
                gasUsed: '0x42',
                returnData: '0x',
                error: { code: 3, message: 'execution reverted: denied' }
              }
            ]
          }
        ]
      })
    )

    const result = await simulateWalletCalls([transaction, secondTransaction], {
      send: withAccountCode(send)
    })
    expect(result.status).toBe('reverted')
    expect(result.calls).toEqual([
      { status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x5208' },
      {
        status: 'reverted',
        source: 'eth_simulateV1',
        gasUsed: '0x42',
        reason: 'execution reverted: denied'
      }
    ])
  })

  it('attaches delegated sender evidence to a wallet-call batch', async () => {
    const delegate = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const result = [
      {
        calls: [simulateSuccess[0].calls[0], simulateSuccess[0].calls[0]]
      }
    ]
    const send = jest.fn((payload, callback) =>
      callback({
        id: payload.id,
        jsonrpc: '2.0',
        result: payload.method === 'eth_getCode' ? `0xef0100${delegate.slice(2)}` : result
      })
    )

    await expect(simulateWalletCalls([transaction, secondTransaction], { send })).resolves.toMatchObject({
      status: 'succeeded',
      delegation: { status: 'delegated', account: transaction.from, delegate }
    })
  })

  it('does not substitute independent eth_call checks when stateful simulation is unsupported', async () => {
    const send = jest.fn((_payload, callback) => callback(rpcError(-32601, 'Method not found')))

    await expect(
      simulateWalletCalls([transaction, secondTransaction], { send: withAccountCode(send) })
    ).resolves.toEqual({
      status: 'unavailable',
      source: 'eth_simulateV1',
      calls: [],
      reason: 'Configured RPC does not support stateful wallet call simulation'
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('fails closed on malformed result counts and RPC errors', async () => {
    const malformed = jest.fn((_payload, callback) =>
      callback({ id: 1, jsonrpc: '2.0', result: simulateSuccess })
    )
    await expect(
      simulateWalletCalls([transaction, secondTransaction], { send: withAccountCode(malformed) })
    ).resolves.toEqual({
      status: 'failed',
      source: 'eth_simulateV1',
      calls: [],
      reason: 'RPC returned an invalid batch simulation result'
    })

    const failed = jest.fn((_payload, callback) => callback(rpcError(-32000, 'batch failed')))
    await expect(
      simulateWalletCalls([transaction, secondTransaction], { send: withAccountCode(failed) })
    ).resolves.toEqual({
      status: 'failed',
      source: 'eth_simulateV1',
      calls: [],
      reason: 'batch failed'
    })
  })

  it('rejects bounded, sender, and chain input violations before RPC', async () => {
    const send = jest.fn()
    const tooMany = Array.from({ length: 17 }, () => transaction)

    await expect(simulateWalletCalls([], { send })).resolves.toMatchObject({ status: 'failed', calls: [] })
    await expect(simulateWalletCalls(tooMany, { send })).resolves.toMatchObject({
      status: 'failed',
      calls: []
    })
    await expect(simulateWalletCalls([{ ...transaction, chainId: '0x01' }], { send })).resolves.toMatchObject(
      { status: 'failed', calls: [] }
    )
    await expect(simulateWalletCalls([{ ...transaction, from: undefined }], { send })).resolves.toMatchObject(
      { status: 'failed', calls: [] }
    )
    await expect(
      simulateWalletCalls(
        [transaction, { ...secondTransaction, from: '0x4444444444444444444444444444444444444444' }],
        {
          send
        }
      )
    ).resolves.toMatchObject({ status: 'failed', calls: [] })
    await expect(
      simulateWalletCalls([transaction, { ...secondTransaction, chainId: '0xa' }], { send })
    ).resolves.toMatchObject({ status: 'failed', calls: [] })
    expect(send).not.toHaveBeenCalled()
  })

  it('uses one bounded timeout for a nonresponsive batch RPC', async () => {
    const pending = simulateWalletCalls([transaction, secondTransaction], {
      send: withAccountCode(jest.fn()),
      timeoutMs: 25
    })
    jest.advanceTimersByTime(25)

    await expect(pending).resolves.toEqual({
      status: 'failed',
      source: 'eth_simulateV1',
      calls: [],
      reason: 'Stateful wallet call simulation timed out'
    })
  })

  it('attaches pre-state allowance evidence only to the first call', async () => {
    const send = jest.fn((payload, callback) => {
      if (payload.method === 'eth_simulateV1') {
        return callback({
          id: 1,
          jsonrpc: '2.0',
          result: [
            {
              calls: [simulateSuccess[0].calls[0], simulateSuccess[0].calls[0]]
            }
          ]
        })
      }

      callback({ id: payload.id, jsonrpc: '2.0', result: `0x${'0'.repeat(63)}7` })
    })

    const laterApproval = { ...approvalTransaction, nonce: '0x8' }
    const result = await simulateWalletCalls([approvalTransaction, laterApproval], {
      send: withAccountCode(send)
    })
    expect(result.calls[0].allowance).toMatchObject({
      source: 'eth_call',
      token: approvalTransaction.to,
      owner: approvalTransaction.from,
      spender: approvalSpender,
      currentAmount: '7',
      requestedAmount: '42'
    })
    expect(result.calls[1].allowance).toBeUndefined()
    expect(send.mock.calls.find(([payload]) => payload.method === 'eth_call')[0].id).toBe(2)
    expect(send.mock.calls.filter(([payload]) => payload.method === 'eth_call')).toHaveLength(1)
  })
})

it('attaches an exact configured-RPC allowance read to an approval simulation', async () => {
  const currentAmount = 7n
  const send = jest.fn((payload, callback) => {
    if (payload.method === 'eth_simulateV1') {
      callback({ id: payload.id, jsonrpc: '2.0', result: simulateSuccess })
    } else {
      callback({
        id: payload.id,
        jsonrpc: '2.0',
        result: `0x${currentAmount.toString(16).padStart(64, '0')}`
      })
    }
  })

  await expect(simulateTransaction(approvalTransaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208',
    allowance: {
      source: 'eth_call',
      token: transaction.to,
      owner: transaction.from,
      spender: approvalSpender,
      currentAmount: '7',
      requestedAmount: '42'
    },
    nativeBalanceChanges: unsupportedNativeBalanceChanges
  })
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[1][0]).toEqual({
    id: 2,
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [
      {
        to: transaction.to,
        data: `0xdd62ed3e${'0'.repeat(24)}${transaction.from.slice(2)}${'0'.repeat(
          24
        )}${approvalSpender.slice(2)}`
      },
      'latest'
    ]
  })
})

it.each([
  { result: '0x1' },
  { result: `0x${'00'.repeat(33)}` },
  { error: { code: 3, message: 'execution reverted' } }
])('omits unusable allowance evidence without weakening execution status: %p', async (response) => {
  const send = jest.fn((payload, callback) =>
    callback(
      payload.method === 'eth_simulateV1'
        ? { id: payload.id, jsonrpc: '2.0', result: simulateSuccess }
        : { id: payload.id, jsonrpc: '2.0', ...response }
    )
  )

  await expect(simulateTransaction(approvalTransaction, { send: withAccountCode(send) })).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208',
    nativeBalanceChanges: unsupportedNativeBalanceChanges
  })
})

it('bounds a missing allowance response without changing a successful execution result', async () => {
  const send = jest.fn((payload, callback) => {
    if (payload.method === 'eth_simulateV1') {
      callback({ id: payload.id, jsonrpc: '2.0', result: simulateSuccess })
    }
  })
  const pending = simulateTransaction(approvalTransaction, {
    send: withAccountCode(send),
    timeoutMs: 25
  })

  jest.advanceTimersByTime(25)

  await expect(pending).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208',
    nativeBalanceChanges: {
      status: 'unavailable',
      source: 'debug_traceCall',
      reason: 'Native balance-change trace exceeded the simulation time budget'
    }
  })
})
