import {
  buildEthCall,
  buildSimulationCall,
  parseSimulateResult,
  simulateTransaction
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

function rpcError(code, message) {
  return { id: 1, jsonrpc: '2.0', error: { code, message } }
}

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

  await expect(simulateTransaction(transaction, { send })).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208'
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

it.each([-32601, -32004])('falls back to eth_call for unsupported-method code %s', async (code) => {
  const send = jest
    .fn()
    .mockImplementationOnce((_payload, callback) => callback(rpcError(code, 'Method unsupported')))
    .mockImplementationOnce((_payload, callback) => callback({ id: 1, jsonrpc: '2.0', result: '0x' }))

  await expect(simulateTransaction(transaction, { send })).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_call'
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

  await expect(simulateTransaction(transaction, { send })).resolves.toEqual({
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

  await expect(simulateTransaction(transaction, { send })).resolves.toEqual({
    status: 'reverted',
    source: 'eth_call',
    reason: 'execution reverted: denied'
  })
})

it('reports unsupported fallback as unavailable', async () => {
  const send = jest.fn((_payload, callback) => callback(rpcError(-32601, 'Method not found')))

  await expect(simulateTransaction(transaction, { send })).resolves.toEqual({
    status: 'unavailable',
    source: 'eth_call',
    reason: 'RPC execution check is unsupported'
  })
  expect(send).toHaveBeenCalledTimes(2)
})

it('fails closed on malformed simulation output', async () => {
  const send = jest.fn((_payload, callback) => callback({ id: 1, jsonrpc: '2.0', result: [{ calls: [] }] }))

  await expect(simulateTransaction(transaction, { send })).resolves.toEqual({
    status: 'failed',
    source: 'eth_simulateV1',
    reason: 'RPC returned an invalid simulation result'
  })
  expect(send).toHaveBeenCalledTimes(1)
})

it('fails closed on malformed provider callbacks and chain IDs', async () => {
  const send = jest.fn((_payload, callback) => callback(undefined))

  await expect(simulateTransaction(transaction, { send })).resolves.toEqual({
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
  const pending = simulateTransaction(transaction, { send: jest.fn(), timeoutMs: 25 })

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
  const pending = simulateTransaction(transaction, { send, timeoutMs: 25 })

  jest.advanceTimersByTime(20)
  await Promise.resolve()
  jest.advanceTimersByTime(5)

  await expect(pending).resolves.toEqual({
    status: 'failed',
    source: 'eth_call',
    reason: 'RPC execution check timed out'
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

  await expect(simulateTransaction(approvalTransaction, { send })).resolves.toEqual({
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
    }
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

  await expect(simulateTransaction(approvalTransaction, { send })).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208'
  })
})

it('bounds a missing allowance response without changing a successful execution result', async () => {
  const send = jest.fn((payload, callback) => {
    if (payload.method === 'eth_simulateV1') {
      callback({ id: payload.id, jsonrpc: '2.0', result: simulateSuccess })
    }
  })
  const pending = simulateTransaction(approvalTransaction, { send, timeoutMs: 25 })

  jest.advanceTimersByTime(25)

  await expect(pending).resolves.toEqual({
    status: 'succeeded',
    source: 'eth_simulateV1',
    gasUsed: '0x5208'
  })
})
