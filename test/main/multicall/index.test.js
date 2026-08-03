import ethProvider from 'eth-provider'
import log from 'electron-log'

import multicall from '../../../main/multicall'
import { Interface, toBeHex } from 'ethers'

jest.mock('eth-provider', () => () => ({ request: jest.fn() }))

let eth

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach(() => {
  eth = ethProvider()
  eth.request = jest.fn()
})

it('rejects unsupported chains before making a request', () => {
  expect(() => multicall(999999, eth)).toThrow(/not supported on chain 999999/)
  expect(eth.request).not.toHaveBeenCalled()
})

it('rejects calls without a function signature', async () => {
  const caller = multicall(1, eth)

  await expect(caller.call([{ target: '0x1', call: [], returns: [] }])).rejects.toThrow(
    /function signature is required/
  )
  expect(eth.request).not.toHaveBeenCalled()
})

it.each([
  {
    chainId: 137,
    method: 'aggregate',
    abi: 'function aggregate(tuple(address target, bytes callData)[] calls) returns (uint256 blockNumber, bytes[] returndata)',
    result: [1n, ['0x']]
  },
  {
    chainId: 1,
    method: 'tryAggregate',
    abi: 'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) returns (tuple(bool success, bytes returndata)[] result)',
    result: [[[true, '0x']]]
  }
])('rejects a $method response that omits a requested result', async ({ chainId, method, abi, result }) => {
  const responseInterface = new Interface([abi])
  eth.request.mockResolvedValue(responseInterface.encodeFunctionResult(method, result))
  const calls = Array.from({ length: 2 }, (_, index) => ({
    target: `0x${String(index + 1).padStart(40, '0')}`,
    call: ['function value() returns (uint256 result)'],
    returns: [(value) => value]
  }))

  await expect(multicall(chainId, eth).call(calls)).rejects.toThrow(/returned 1 results for 2 calls/)
})

it('encodes aggregated calls correctly', async () => {
  eth.request.mockImplementationOnce(async (payload) => {
    expect(payload.method).toBe('eth_call')
    expect(payload.chainId).toBe('0x89')
    expect(payload.params[0].to).toBe('0x11ce4b23bd875d7f5c6a31084f55fde1e9a87507')
    expect(payload.params[0].data).toBe(
      '0x252dba4200000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000b3f868e0be5597d5db7feb59e1cadbb0fdda50a0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002470a082310000000000000000000000001ad91ee08f21be3de0ba2ba6918e714da6b4583600000000000000000000000000000000000000000000000000000000000000000000000000000000e94d89243a7aeaf88857461ce555caeb344765fc0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002470a082310000000000000000000000001ad91ee08f21be3de0ba2ba6918e714da6b4583600000000000000000000000000000000000000000000000000000000'
    )

    return '0x000000000000000000000000000000000000000000000000000000000181013800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000017c7aa0a3000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000feca4525'
  })

  // Polygon uses Multicall1 and aggregate
  const caller = multicall(137, eth)

  const calls = [
    {
      target: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',
      call: [
        'function balanceOf(address owner) returns (uint256 value)',
        '0x1ad91ee08f21be3de0ba2ba6918e714da6b45836'
      ],
      returns: [(bn) => toBeHex(bn)]
    },
    {
      target: '0xe94D89243a7Aeaf88857461ce555caEB344765Fc',
      call: [
        'function balanceOf(address owner) returns (uint256 value)',
        '0x1ad91ee08f21be3de0ba2ba6918e714da6b45836'
      ],
      returns: [(bn) => toBeHex(bn)]
    }
  ]

  const result = await caller.batchCall(calls)

  expect(result).toEqual([
    { success: true, returnValues: ['0x017c7aa0a3'] },
    { success: true, returnValues: ['0xfeca4525'] }
  ])
})

it('handles an error when using tryAggregate', async () => {
  eth.request.mockImplementationOnce(async (payload) => {
    expect(payload.method).toBe('eth_call')
    expect(payload.chainId).toBe('0x1')
    expect(payload.params[0].to).toBe('0x5ba1e12693dc8f9c48aad8770482f4739beed696')
    expect(payload.params[0].data).toBe(
      '0xbce38bd7000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000bcca60bb61934080951369a648fb03df4f96263c0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002470a082310000000000000000000000001ad91ee08f21be3de0ba2ba6918e714da6b4583600000000000000000000000000000000000000000000000000000000000000000000000000000000089a502032166e07ae83eb434c16790ca2fa46610000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002470a082310000000000000000000000001ad91ee08f21be3de0ba2ba6918e714da6b4583600000000000000000000000000000000000000000000000000000000'
    )

    return '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000017c7aa4bb000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000'
  })

  // mainnet uses Multicall2 and tryAggregate
  const caller = multicall(1, eth)

  const calls = [
    {
      target: '0xBcca60bB61934080951369a648Fb03DF4F96263C',
      call: [
        'function balanceOf(address owner) returns (uint256 value)',
        '0x1aD91ee08f21bE3dE0BA2ba6918E714dA6B45836'
      ],
      returns: [(bn) => toBeHex(bn)]
    },
    {
      target: '0x089a502032166e07ae83eb434c16790ca2fa4661',
      call: [
        'function balanceOf(address owner) returns (uint256 value)',
        '0x1aD91ee08f21bE3dE0BA2ba6918E714dA6B45836'
      ],
      returns: [(bn) => toBeHex(bn)]
    }
  ]

  const result = await caller.batchCall(calls)

  expect(result).toEqual([
    { success: true, returnValues: ['0x017c7aa4bb'] },
    { success: false, returnValues: [] }
  ])
})

it.each([
  {
    chainId: 137,
    method: 'aggregate',
    abi: 'function aggregate(tuple(address target, bytes callData)[] calls) returns (uint256 blockNumber, bytes[] returndata)',
    result: [1n, ['0x']]
  },
  {
    chainId: 1,
    method: 'tryAggregate',
    abi: 'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) returns (tuple(bool success, bytes returndata)[] result)',
    result: [[[true, '0x']]]
  }
])(
  'isolates malformed returndata from a successful $method call',
  async ({ chainId, method, abi, result }) => {
    const responseInterface = new Interface([abi])
    eth.request.mockResolvedValue(responseInterface.encodeFunctionResult(method, result))
    const postProcess = jest.fn((value) => toBeHex(value))

    const results = await multicall(chainId, eth).call([
      {
        target: '0x0000000000000000000000000000000000000001',
        call: [
          'function balanceOf(address owner) returns (uint256 value)',
          '0x1ad91ee08f21be3de0ba2ba6918e714da6b45836'
        ],
        returns: [postProcess]
      }
    ])

    expect(results).toEqual([{ success: false, returnValues: [] }])
    expect(postProcess).not.toHaveBeenCalled()
  }
)

it('returns one batch if another errors', async () => {
  eth.request
    .mockRejectedValueOnce('multicall failed!')
    .mockResolvedValueOnce(
      '0x00000000000000000000000000000000000000000000000000000000018100e8000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000feca4525'
    )

  // Polygon uses Multicall1 and aggregate
  const caller = multicall(137, eth)

  const calls = [
    {
      target: '0xBcca60bB61934080951369a648Fb03DF4F96263C',
      call: [
        'function balanceOf(address owner) returns (uint256 value)',
        '0x1aD91ee08f21bE3dE0BA2ba6918E714dA6B45836'
      ],
      returns: [(bn) => toBeHex(bn)]
    },
    {
      target: '0xe94D89243a7Aeaf88857461ce555caEB344765Fc',
      call: [
        'function balanceOf(address owner) returns (uint256 value)',
        '0x1aD91ee08f21bE3dE0BA2ba6918E714dA6B45836'
      ],
      returns: [(bn) => toBeHex(bn)]
    }
  ]

  const result = await caller.batchCall(calls, 1)

  expect(result).toEqual([
    { success: false, returnValues: [] },
    { success: true, returnValues: ['0xfeca4525'] }
  ])
})
