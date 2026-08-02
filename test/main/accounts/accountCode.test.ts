import { createAccountCodeReader } from '../../../main/accounts/accountCode'

const account = '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990'
const normalizedAccount = account.toLowerCase()
const delegate = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

function respondingConnection(result: unknown) {
  return {
    send: jest.fn((payload, callback) => callback({ id: payload.id, jsonrpc: payload.jsonrpc, result }))
  }
}

it.each([
  ['no code', '0x', { status: 'no-code' }],
  ['contract', '0x6000', { status: 'contract' }],
  ['delegated', `0xef0100${delegate.slice(2)}`, { status: 'delegated', delegate }]
])('classifies configured-RPC %s code without returning bytecode', async (_label, code, expected) => {
  const connection = respondingConnection(code)
  const reader = createAccountCodeReader(connection)

  const result = await reader.read(account, 10)

  expect(result).toMatchObject({
    ...expected,
    source: 'eth_getCode',
    account: normalizedAccount,
    chainId: 10
  })
  expect(result).not.toHaveProperty('code')
  expect(Object.isFrozen(result)).toBe(true)
  expect(connection.send).toHaveBeenCalledWith(
    {
      id: 8_000_000_000_000_001,
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [normalizedAccount, 'latest']
    },
    expect.any(Function),
    { type: 'ethereum', id: 10 }
  )
})

it.each([
  ['malformed envelope', (payload) => ({ id: payload.id + 1, jsonrpc: '2.0', result: '0x' }), /malformed/],
  ['invalid code', (payload) => ({ id: payload.id, jsonrpc: '2.0', result: '0x0' }), /invalid/],
  [
    'RPC error',
    (payload) => ({ id: payload.id, jsonrpc: '2.0', error: { code: -32000, message: 'node unavailable' } }),
    /node unavailable/
  ]
])('qualifies %s as unavailable', async (_label, response, reason) => {
  const connection = { send: jest.fn((payload, callback) => callback(response(payload))) }
  const reader = createAccountCodeReader(connection)

  await expect(reader.read(account, 1)).resolves.toMatchObject({
    status: 'unavailable',
    source: 'eth_getCode',
    account: normalizedAccount,
    chainId: 1,
    reason: expect.stringMatching(reason)
  })
})

it('bounds nonresponsive configured RPCs and ignores late callbacks', async () => {
  let respond
  const connection = { send: jest.fn((_payload, callback) => (respond = callback)) }
  const reader = createAccountCodeReader(connection, { timeoutMs: 25 })
  const pending = reader.read(account, 1)

  jest.advanceTimersByTime(25)
  await expect(pending).resolves.toMatchObject({
    status: 'unavailable',
    reason: 'Account code lookup timed out'
  })

  respond({ id: 8_000_000_000_000_001, jsonrpc: '2.0', result: '0x6000' })
  await expect(pending).resolves.toMatchObject({ status: 'unavailable' })
})

it('bounds RPC error text', async () => {
  const connection = {
    send: jest.fn((payload, callback) =>
      callback({ id: payload.id, jsonrpc: '2.0', error: { message: `  ${'x'.repeat(500)}  ` } })
    )
  }
  const reader = createAccountCodeReader(connection)

  const result = await reader.read(account, 1)

  expect(result.reason).toHaveLength(240)
  expect(result.reason).toBe('x'.repeat(240))
})

it.each([
  ['invalid address', 'not-address', 1, /address/],
  ['zero chain', account, 0, /chain id/],
  ['fractional chain', account, 1.5, /chain id/],
  ['string chain', account, '1', /chain id/]
])('rejects %s before the configured connection', async (_label, address, chainId, error) => {
  const connection = { send: jest.fn() }
  const reader = createAccountCodeReader(connection)

  await expect(reader.read(address, chainId)).rejects.toThrow(error)
  expect(connection.send).not.toHaveBeenCalled()
})

it('converts synchronous connection failures into qualified unavailability', async () => {
  const reader = createAccountCodeReader({
    send: jest.fn(() => {
      throw new Error('connection closed')
    })
  })

  await expect(reader.read(account, 1)).resolves.toMatchObject({
    status: 'unavailable',
    reason: 'connection closed'
  })
})

it.each([
  [undefined, {}],
  [{ send: undefined }, {}],
  [{ send: jest.fn() }, { timeoutMs: 0 }]
])('rejects invalid reader dependencies', (connection, options) => {
  expect(() => createAccountCodeReader(connection, options)).toThrow(/dependencies/)
})
