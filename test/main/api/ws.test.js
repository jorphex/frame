import WebSocket from 'ws'
import { EventEmitter } from 'stream'

import store from '../../../main/store'
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
jest.mock('../../../main/provider', () => ({ on: jest.fn() }))
jest.mock('../../../main/accounts', () => {})
jest.mock('../../../main/windows', () => {})

beforeEach(() => {
  store.initOrigin = jest.fn()

  socketConnection = new EventEmitter()
  mockSocket = new EventEmitter()
  mockSocket.readyState = WebSocket.OPEN

  WebSocket.Server.mockReturnValueOnce(socketConnection)

  ws()
  socketConnection.emit('connection', mockSocket, extensionRequest)
})

it('configures the shared request size limit', () => {
  expect(WebSocket.Server).toHaveBeenCalledWith({ server: undefined, maxPayload: MAX_REQUEST_BYTES })
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
    expect(responsePayload.result).toBe(1)

    done()
  }

  mockSocket.emit('message', JSON.stringify(rpcRequest))
})
