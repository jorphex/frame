import {
  MAX_CAPABILITY_CHAINS,
  MAX_WALLET_CALLS,
  MAX_WALLET_CALL_DATA_BYTES,
  MAX_WALLET_CALL_ID_BYTES,
  parseCallsStatus,
  parseGetCapabilities,
  parseSendCalls,
  parseShowCallsStatus
} from '../../../main/provider/walletCalls'

const account = '0x1111111111111111111111111111111111111111'
const target = '0x2222222222222222222222222222222222222222'

const request = (overrides = {}) => [
  {
    version: '2.0.0',
    from: account,
    chainId: '0x1',
    atomicRequired: false,
    calls: [{ to: target }],
    ...overrides
  }
]

function expectRpcError(fn, code, message) {
  expect(fn).toThrow(expect.objectContaining({ code, message: expect.stringMatching(message) }))
}

it('normalizes a non-atomic batch and makes call defaults explicit', () => {
  expect(
    parseSendCalls(
      request({
        id: 'app-owned-id',
        from: account.toUpperCase().replace('0X', '0x'),
        chainId: '0xA',
        calls: [{ to: target.toUpperCase().replace('0X', '0x') }, { data: '0xABCD', value: '0xF' }]
      })
    )
  ).toEqual({
    version: '2.0.0',
    id: 'app-owned-id',
    from: account,
    chainId: '0xa',
    atomicRequired: false,
    calls: [
      { to: target, data: '0x', value: '0x0' },
      { data: '0xabcd', value: '0xf' }
    ]
  })
})

it('accepts an omitted sender for later wallet selection', () => {
  expect(parseSendCalls(request({ from: undefined })).from).toBeUndefined()
})

it.each([
  [undefined, /Required/],
  [[], /at least 1/],
  [[request()[0], request()[0]], /at most 1/],
  [request({ version: '1.0.0' }), /Invalid literal value/],
  [request({ atomicRequired: 'false' }), /Expected boolean/],
  [request({ calls: [] }), /at least one call/],
  [request({ extra: true }), /Unrecognized key/]
])('rejects invalid sendCalls params %#', (params, message) => {
  expectRpcError(() => parseSendCalls(params), -32602, message)
})

it.each(['0x01', '1', '0x', '0xzz'])('rejects malformed chain quantity %s', (chainId) => {
  expectRpcError(() => parseSendCalls(request({ chainId })), -32602, /chainId/)
})

it('bounds chain identifiers before implementation support checks', () => {
  expectRpcError(() => parseSendCalls(request({ chainId: `0x1${'0'.repeat(64)}` })), -32602, /256 bits/)
})

it.each(['0x0', `0x${Number.MAX_SAFE_INTEGER.toString(16)}0`])(
  'rejects unsupported implementation chain %s',
  (chainId) => {
    expectRpcError(() => parseSendCalls(request({ chainId })), 5710, /Unsupported chain id/)
  }
)

it.each([
  [{ to: '0x1' }, /address/],
  [{ data: '0x0' }, /even-length/],
  [{ data: '0xzz' }, /byte string/],
  [{ value: '0x00' }, /canonical/],
  [{ value: '1' }, /canonical/],
  [{ value: `0x1${'0'.repeat(64)}` }, /uint256/],
  [{ gas: '0x1' }, /Unrecognized key/]
])('rejects malformed call %#', (call, message) => {
  expectRpcError(() => parseSendCalls(request({ calls: [call] })), -32602, message)
})

it('rejects atomic execution with the EIP-5792 policy code', () => {
  expectRpcError(() => parseSendCalls(request({ atomicRequired: true })), 5760, /Atomicity not supported/)
})

it('rejects too many calls and too much calldata with the bundle-size code', () => {
  expectRpcError(
    () => parseSendCalls(request({ calls: Array.from({ length: MAX_WALLET_CALLS + 1 }, () => ({})) })),
    5740,
    /at most/
  )
  expectRpcError(
    () => parseSendCalls(request({ calls: [{ data: `0x${'00'.repeat(MAX_WALLET_CALL_DATA_BYTES + 1)}` }] })),
    5740,
    /calldata/
  )
})

it('accepts exact call-count, calldata, and identifier limits', () => {
  const calls = Array.from({ length: MAX_WALLET_CALLS }, (_, index) =>
    index === 0 ? { data: `0x${'00'.repeat(MAX_WALLET_CALL_DATA_BYTES)}` } : {}
  )
  const parsed = parseSendCalls(request({ id: 'x'.repeat(MAX_WALLET_CALL_ID_BYTES), calls }))

  expect(parsed.id).toHaveLength(MAX_WALLET_CALL_ID_BYTES)
  expect(parsed.calls).toHaveLength(MAX_WALLET_CALLS)
})

it('rejects invalid send-call identifiers', () => {
  expectRpcError(() => parseSendCalls(request({ id: '' })), -32602, /must not be empty/)
  expectRpcError(
    () => parseSendCalls(request({ id: 'x'.repeat(MAX_WALLET_CALL_ID_BYTES + 1) })),
    -32602,
    /exceeds/
  )
})

it('ignores optional capabilities and rejects unsupported required capabilities at either level', () => {
  expect(
    parseSendCalls(
      request({
        capabilities: { paymasterService: { optional: true, url: 'https://example.test' } },
        calls: [{ to: target, capabilities: { flowControl: { optional: true } } }]
      })
    )
  ).toEqual({
    version: '2.0.0',
    from: account,
    chainId: '0x1',
    atomicRequired: false,
    calls: [{ to: target, data: '0x', value: '0x0' }]
  })

  expectRpcError(
    () => parseSendCalls(request({ capabilities: { paymasterService: { url: 'https://example.test' } } })),
    5700,
    /paymasterService/
  )
  expectRpcError(
    () => parseSendCalls(request({ calls: [{ capabilities: { flowControl: {} } }] })),
    5700,
    /flowControl/
  )
})

it.each([parseCallsStatus, parseShowCallsStatus])('parses one bounded batch identifier', (parse) => {
  expect(parse(['batch-id'])).toBe('batch-id')
  expectRpcError(() => parse([]), -32602, /at least 1/)
  expectRpcError(() => parse(['']), -32602, /must not be empty/)
  expectRpcError(() => parse(['x'.repeat(MAX_WALLET_CALL_ID_BYTES + 1)]), -32602, /exceeds/)
  expectRpcError(() => parse(['one', 'two']), -32602, /at most 1/)
})

it('counts identifier limits in UTF-8 bytes', () => {
  const twoByteCharacter = String.fromCodePoint(0xa2)
  expect(parseCallsStatus([twoByteCharacter.repeat(MAX_WALLET_CALL_ID_BYTES / 2)])).toHaveLength(
    MAX_WALLET_CALL_ID_BYTES / 2
  )
  expectRpcError(
    () => parseCallsStatus([twoByteCharacter.repeat(MAX_WALLET_CALL_ID_BYTES / 2 + 1)]),
    -32602,
    /UTF-8 bytes/
  )
})

it('normalizes and deduplicates a bounded capability query', () => {
  expect(parseGetCapabilities([account.toUpperCase().replace('0X', '0x'), ['0x1', '0xA', '0xa']])).toEqual({
    address: account,
    chainIds: ['0x1', '0xa']
  })
  expect(parseGetCapabilities([account])).toEqual({ address: account })
})

it('rejects malformed and oversized capability queries', () => {
  expectRpcError(() => parseGetCapabilities([]), -32602, /requires/)
  expectRpcError(() => parseGetCapabilities([account, [], 'extra']), -32602, /requires/)
  expectRpcError(() => parseGetCapabilities(['0x1']), -32602, /address/)
  expectRpcError(() => parseGetCapabilities([account, ['0x01']]), -32602, /chainId/)
  expect(parseGetCapabilities([account, ['0x0', '0x20000000000000']])).toEqual({
    address: account,
    chainIds: ['0x0', '0x20000000000000']
  })
  expectRpcError(
    () => parseGetCapabilities([account, Array.from({ length: MAX_CAPABILITY_CHAINS + 1 }, () => '0x1')]),
    -32602,
    /chain list exceeds/
  )
})
