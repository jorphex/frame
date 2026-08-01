import { request } from 'http'

import createHttpServer from '../../../main/api/http'
import { MAX_REQUEST_BYTES } from '../../../main/api/validPayload'
import provider from '../../../main/provider'
import accounts from '../../../main/accounts'
import { isTrusted, updateOrigin } from '../../../main/api/origins'

jest.mock('../../../main/provider', () => ({ send: jest.fn(), on: jest.fn() }))
jest.mock('../../../main/accounts', () => ({ getSelectedAddresses: jest.fn(() => []) }))
jest.mock('../../../main/store')
jest.mock('../../../main/api/origins', () => ({
  parseOrigin: jest.fn((origin) => origin || 'Unknown'),
  updateOrigin: jest.fn((payload) => ({
    payload: { ...payload, _origin: 'test-origin' },
    chainId: payload.chainId || '0x1'
  })),
  isTrusted: jest.fn()
}))

jest.setTimeout(2000)

let server
let port

beforeEach((done) => {
  provider.send.mockImplementation((payload, callback) =>
    callback({ id: payload.id, jsonrpc: payload.jsonrpc, result: 'forwarded' })
  )
  accounts.getSelectedAddresses.mockReturnValue([])
  isTrusted.mockResolvedValue(false)

  server = createHttpServer()
  server.listen(0, '127.0.0.1', () => {
    port = server.address().port
    done()
  })
})

beforeAll(() => {
  jest.useRealTimers()
})

afterEach((done) => {
  server.close(done)
})

const send = ({ body = '', method = 'POST', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method,
        headers
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) })
        })
      }
    )
    req.on('error', reject)
    req.end(body)
  })

const sendChunked = (chunks) =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST'
      },
      (res) => {
        const responseChunks = []
        res.on('data', (chunk) => responseChunks.push(chunk))
        res.on('end', () => {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(responseChunks)) })
        })
      }
    )
    req.on('error', reject)
    chunks.forEach((chunk) => req.write(chunk))
    req.end()
  })

it('returns a JSON-RPC parse error for malformed JSON', async () => {
  await expect(send({ body: '{' })).resolves.toMatchObject({
    status: 400,
    body: { id: null, jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }
  })
})

it('returns an invalid-request error with a valid correlation id', async () => {
  const body = JSON.stringify({ id: 'request-7', jsonrpc: '1.0', method: 'eth_chainId' })

  await expect(send({ body })).resolves.toMatchObject({
    status: 400,
    body: { id: 'request-7', jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' } }
  })
})

it('rejects an oversized declared body before buffering it', async () => {
  await expect(
    send({ body: Buffer.alloc(MAX_REQUEST_BYTES + 1), headers: { 'content-length': MAX_REQUEST_BYTES + 1 } })
  ).resolves.toMatchObject({
    status: 413,
    body: {
      id: null,
      jsonrpc: '2.0',
      error: { code: -32600, message: `Request exceeds ${MAX_REQUEST_BYTES} byte limit` }
    }
  })
})

it('stops buffering an oversized chunked body', async () => {
  await expect(sendChunked([Buffer.alloc(MAX_REQUEST_BYTES), Buffer.alloc(1)])).resolves.toMatchObject({
    status: 413,
    body: {
      id: null,
      jsonrpc: '2.0',
      error: { code: -32600, message: `Request exceeds ${MAX_REQUEST_BYTES} byte limit` }
    }
  })
})

it('returns method-not-allowed for non-JSON-RPC HTTP methods', async () => {
  await expect(send({ method: 'GET' })).resolves.toMatchObject({
    status: 405,
    headers: { allow: 'POST, OPTIONS' },
    body: { id: null, jsonrpc: '2.0', error: { code: -32600, message: 'Method Not Allowed' } }
  })
})

it('forwards a valid request and returns the provider response', async () => {
  const payload = { id: 7, jsonrpc: '2.0', method: 'eth_chainId', params: [] }

  await expect(send({ body: JSON.stringify(payload) })).resolves.toMatchObject({
    status: 200,
    body: { id: 7, jsonrpc: '2.0', result: 'forwarded' }
  })
  expect(provider.send).toHaveBeenCalledWith({ ...payload, _origin: 'test-origin' }, expect.any(Function))
})

it('rejects a non-canonical target chain before provider forwarding', async () => {
  const payload = { id: 7, jsonrpc: '2.0', method: 'eth_chainId', params: [], chainId: '0x01' }

  await expect(send({ body: JSON.stringify(payload) })).resolves.toMatchObject({
    status: 200,
    body: { id: 7, jsonrpc: '2.0', error: { code: -32602 } }
  })
  expect(provider.send).not.toHaveBeenCalled()
  expect(updateOrigin).not.toHaveBeenCalled()
})

it('uses unauthorized rather than user-rejected for permission denial', async () => {
  accounts.getSelectedAddresses.mockReturnValue(['0xc93452A74e596e81E4f73Ca1AcFF532089AD4c62'])
  const payload = { id: 7, jsonrpc: '2.0', method: 'eth_accounts', params: [] }

  await expect(send({ body: JSON.stringify(payload) })).resolves.toMatchObject({
    status: 200,
    body: { id: 7, jsonrpc: '2.0', error: { code: 4100 } }
  })
  expect(provider.send).not.toHaveBeenCalled()
})

it('returns after rejecting an invalid polling client id', async () => {
  const payload = { id: 7, jsonrpc: '2.0', method: 'eth_pollSubscriptions', params: [7] }

  await expect(send({ body: JSON.stringify(payload) })).resolves.toMatchObject({
    status: 200,
    body: { id: 7, jsonrpc: '2.0', error: { code: -32602, message: 'Invalid Client ID' } }
  })
  expect(provider.send).not.toHaveBeenCalled()
})
