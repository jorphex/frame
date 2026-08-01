import WebSocket from 'ws'
import { EventEmitter } from 'stream'

import store from '../../../main/store'
import provider from '../../../main/provider'
import ws from '../../../main/api/ws'
import { MAX_REQUEST_BYTES } from '../../../main/api/validPayload'

let socketConnection, mockSocket

const extensionRequest = {
  headers: {
    origin: 'chrome-extension://ldcoohedfbjoobcadoglnnmmfbdlmmhf'
  }
}

jest.mock('ws')
jest.mock('../../../main/store')
jest.mock('../../../main/provider', () => ({ on: jest.fn(), send: jest.fn() }))
jest.mock('../../../main/accounts', () => {})
jest.mock('../../../main/windows', () => {})

beforeEach(() => {
  store.initOrigin = jest.fn()

  socketConnection = new EventEmitter()
  mockSocket = new EventEmitter()
  mockSocket.readyState = WebSocket.OPEN
  mockSocket.close = jest.fn()

  WebSocket.Server.mockReturnValueOnce(socketConnection)

  ws()
  socketConnection.emit('connection', mockSocket, extensionRequest)
})

it('configures the shared request size limit', () => {
  expect(WebSocket.Server).toHaveBeenCalledWith({
    server: undefined,
    maxPayload: MAX_REQUEST_BYTES,
    perMessageDeflate: false
  })
})

it('closes a client that exceeds its message rate without processing the excess request', () => {
  const limitedServer = new EventEmitter()
  const limitedSocket = new EventEmitter()
  limitedSocket.readyState = WebSocket.OPEN
  limitedSocket.close = jest.fn()
  limitedSocket.send = jest.fn()
  WebSocket.Server.mockReturnValueOnce(limitedServer)
  ws(undefined, { messageRateLimit: { maxRequests: 1, windowMs: 1000 } })
  limitedServer.emit('connection', limitedSocket, extensionRequest)

  limitedSocket.emit('message', '{')
  limitedSocket.emit('message', '{')

  expect(limitedSocket.send).toHaveBeenCalledTimes(1)
  expect(limitedSocket.close).toHaveBeenCalledWith(1013, 'Request rate limit exceeded')
})

it('closes clients beyond the configured connection limit', () => {
  const limitedServer = new EventEmitter()
  const firstSocket = new EventEmitter()
  const secondSocket = new EventEmitter()
  const replacementSocket = new EventEmitter()
  firstSocket.close = jest.fn()
  secondSocket.close = jest.fn()
  replacementSocket.close = jest.fn()
  WebSocket.Server.mockReturnValueOnce(limitedServer)
  ws(undefined, { maxClients: 1 })

  limitedServer.emit('connection', firstSocket, extensionRequest)
  limitedServer.emit('connection', secondSocket, extensionRequest)

  expect(firstSocket.close).not.toHaveBeenCalled()
  expect(secondSocket.close).toHaveBeenCalledWith(1013, 'Server capacity exceeded')

  firstSocket.emit('close')
  limitedServer.emit('connection', replacementSocket, extensionRequest)
  expect(replacementSocket.close).not.toHaveBeenCalled()
})

it('does not deliver subscriptions to a closing socket', () => {
  const subscriptionId = 'subscription-closing-socket'
  provider.send.mockImplementationOnce((payload, callback) =>
    callback({ id: payload.id, jsonrpc: payload.jsonrpc, result: subscriptionId })
  )
  const regularSocket = new EventEmitter()
  regularSocket.readyState = WebSocket.OPEN
  regularSocket.close = jest.fn()
  regularSocket.send = jest.fn()
  socketConnection.emit('connection', regularSocket, { headers: { origin: 'https://example.com' } })
  regularSocket.emit(
    'message',
    JSON.stringify({ id: 9, jsonrpc: '2.0', method: 'eth_subscribe', params: ['newHeads'] })
  )
  regularSocket.send.mockClear()
  regularSocket.readyState = WebSocket.CLOSING

  const subscriptionListener = provider.on.mock.calls.at(-1)[1]
  subscriptionListener({
    jsonrpc: '2.0',
    method: 'eth_subscription',
    params: { subscription: subscriptionId, result: {} }
  })

  expect(regularSocket.send).not.toHaveBeenCalled()
})

it('responds to malformed JSON with a parse error', (done) => {
  mockSocket.send = (response) => {
    expect(JSON.parse(response)).toEqual({
      id: null,
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' }
    })
    done()
  }

  mockSocket.emit('message', '{')
})

it('responds to an invalid request with its valid id', (done) => {
  mockSocket.send = (response) => {
    expect(JSON.parse(response)).toEqual({
      id: 'request-9',
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' }
    })
    done()
  }

  mockSocket.emit('message', JSON.stringify({ id: 'request-9', jsonrpc: '1.0', method: 'eth_chainId' }))
})

it('rejects a non-canonical target chain id', (done) => {
  mockSocket.send = (response) => {
    const payload = JSON.parse(response)
    expect(payload.id).toBe(9)
    expect(payload.error.code).toBe(-32602)
    expect(store.initOrigin).not.toHaveBeenCalled()
    done()
  }

  mockSocket.emit(
    'message',
    JSON.stringify({ id: 9, jsonrpc: '2.0', method: 'eth_chainId', params: [], chainId: '1' })
  )
})

it('always responds to an extension request for chain id with the requested chain id', (done) => {
  const rpcRequest = { id: 9, jsonrpc: '2.0', method: 'eth_chainId', params: [] }

  mockSocket.send = (response) => {
    const responsePayload = JSON.parse(response)
    expect(responsePayload.id).toBe(rpcRequest.id)
    expect(responsePayload.jsonrpc).toBe(rpcRequest.jsonrpc)
    expect(responsePayload.result).toBe('0x1')

    done()
  }

  mockSocket.emit('message', JSON.stringify(rpcRequest))
})

it('always responds to an extension request for net version with the requested chain', (done) => {
  const rpcRequest = { id: 9, jsonrpc: '2.0', method: 'net_version', params: [] }

  mockSocket.send = (response) => {
    const responsePayload = JSON.parse(response)
    expect(responsePayload.id).toBe(rpcRequest.id)
    expect(responsePayload.jsonrpc).toBe(rpcRequest.jsonrpc)
    expect(responsePayload.result).toBe('1')

    done()
  }

  mockSocket.emit('message', JSON.stringify(rpcRequest))
})
