import { IncomingMessage, Server } from 'http'
import WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import log from 'electron-log'

import provider from '../provider'
import accounts from '../accounts'
import windows from '../windows'

import {
  updateOrigin,
  isTrusted,
  parseOrigin,
  isKnownExtension,
  FrameExtension,
  parseFrameExtension
} from './origins'
import parsePayload, { MAX_REQUEST_BYTES } from './validPayload'
import protectedMethods from './protectedMethods'
import { parseChainId } from '../provider/chainRequests'
import originSessions from './originSessions'
import { FixedWindowRateLimiter, RateLimitOptions } from './requestLimiter'

const logTraffic = (origin: string) =>
  process.env.LOG_TRAFFIC === 'true' || process.env.LOG_TRAFFIC === origin

const subs: Record<string, Subscription> = {}

export const WS_MAX_CLIENTS = 64
export const WS_MESSAGE_RATE_LIMIT: RateLimitOptions = { maxRequests: 300, windowMs: 10 * 1000 }

interface WebSocketServerOptions {
  maxClients?: number
  messageRateLimit?: RateLimitOptions
}

interface Subscription {
  originId: string
  socket: FrameWebSocket
}

interface FrameWebSocket extends WebSocket {
  id: string
  origin?: string
  frameExtension?: FrameExtension
}

interface ExtensionPayload extends JSONRPCRequestPayload {
  __frameOrigin?: string
  __extensionConnecting?: boolean
}

type TransportResponse =
  | RPCResponsePayload
  | {
      id: string | number | null
      jsonrpc: '2.0'
      error: { code: number; message: string }
    }

const handler = (socket: FrameWebSocket, req: IncomingMessage, rateLimit: RateLimitOptions) => {
  socket.id = uuid()
  socket.origin = req.headers.origin
  socket.frameExtension = parseFrameExtension(req)
  const requests = new FixedWindowRateLimiter(rateLimit)

  const res = (payload: TransportResponse) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload), (err) => {
        if (err) log.info(err)
      })
    }
  }

  socket.on('message', async (data) => {
    if (!requests.allow()) {
      socket.close(1013, 'Request rate limit exceeded')
      return
    }

    const parsedPayload = parsePayload<ExtensionPayload>(data.toString())
    if (!parsedPayload.success) {
      return res({ id: parsedPayload.id, jsonrpc: '2.0', error: parsedPayload.error })
    }
    const rawPayload = parsedPayload.payload

    let requestOrigin = socket.origin
    if (socket.frameExtension) {
      if (!(await isKnownExtension(socket.frameExtension))) {
        const error = {
          message: `Permission denied, approve connection from Frame Companion with id ${socket.frameExtension.id} in Frame to continue`,
          code: 4001
        }

        return res({ id: rawPayload.id, jsonrpc: rawPayload.jsonrpc, error })
      }

      // Request from extension, swap origin
      if (rawPayload.__frameOrigin) {
        requestOrigin = rawPayload.__frameOrigin
        delete rawPayload.__frameOrigin
      } else {
        requestOrigin = 'frame-extension'
      }
    }

    const origin = parseOrigin(requestOrigin)

    if (logTraffic(origin))
      log.info(
        `req -> | ${socket.frameExtension ? 'ext' : 'ws'} | ${origin} | ${rawPayload.method} | -> | ${
          rawPayload.params
        }`
      )

    if (rawPayload.chainId !== undefined) {
      try {
        parseChainId(rawPayload.chainId)
      } catch {
        const error = {
          message: `Invalid chain id (${rawPayload.chainId}), chain id must be a canonical hex quantity`,
          code: -32602
        }
        return res({ id: rawPayload.id, jsonrpc: rawPayload.jsonrpc, error })
      }
    }

    const { payload, chainId } = updateOrigin(rawPayload, origin, rawPayload.__extensionConnecting)

    try {
      parseChainId(chainId)
    } catch {
      const error = {
        message: `Invalid chain id (${rawPayload.chainId}), chain id must be a canonical hex quantity`,
        code: -32602
      }
      return res({ id: rawPayload.id, jsonrpc: rawPayload.jsonrpc, error })
    }

    if (!rawPayload.__extensionConnecting) {
      originSessions.extend(payload._origin)
    }

    if (origin === 'frame-extension') {
      // custom extension action for summoning Frame
      if (rawPayload.method === 'frame_summon') return windows.toggleTray()

      const { id, jsonrpc } = rawPayload
      if (rawPayload.method === 'eth_chainId') return res({ id, jsonrpc, result: chainId })
      if (rawPayload.method === 'net_version')
        return res({ id, jsonrpc, result: BigInt(chainId).toString(10) })
    }

    if (protectedMethods.indexOf(payload.method) > -1 && !(await isTrusted(payload))) {
      let error = { message: 'Permission denied, approve ' + origin + ' in Frame to continue', code: 4100 }
      if (!accounts.getSelectedAddresses()[0]) error = { message: 'No Frame account selected', code: 4100 }
      res({ id: payload.id, jsonrpc: payload.jsonrpc, error })
    } else {
      provider.send(payload, (response) => {
        if (response && response.result) {
          if (payload.method === 'eth_subscribe') {
            subs[response.result] = { socket, originId: payload._origin }
          } else if (payload.method === 'eth_unsubscribe') {
            payload.params.forEach((sub) => {
              if (subs[sub]) delete subs[sub]
            })
          }
        }

        if (logTraffic(origin))
          log.info(
            `<- res | ${socket.frameExtension ? 'ext' : 'ws'} | ${origin} | ${
              payload.method
            } | <- | ${JSON.stringify(response.result || response.error)}`
          )

        res(response)
      })
    }
  })
  socket.on('error', (err) => log.error(err))
  socket.on('close', () => {
    Object.keys(subs).forEach((sub) => {
      if (subs[sub].socket.id === socket.id) {
        provider.send({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_unsubscribe',
          _origin: subs[sub].originId,
          params: [sub]
        })
        delete subs[sub]
      }
    })
  })
}

export default function (server: Server, options: WebSocketServerOptions = {}) {
  const clients = new Set<FrameWebSocket>()
  const maxClients = options.maxClients ?? WS_MAX_CLIENTS
  const messageRateLimit = options.messageRateLimit ?? WS_MESSAGE_RATE_LIMIT
  const ws = new WebSocket.Server({ server, maxPayload: MAX_REQUEST_BYTES, perMessageDeflate: false })
  ws.on('connection', (socket: FrameWebSocket, req: IncomingMessage) => {
    if (clients.size >= maxClients) {
      socket.on('error', (err) => log.error(err))
      socket.close(1013, 'Server capacity exceeded')
      return
    }

    clients.add(socket)
    socket.once('close', () => clients.delete(socket))
    handler(socket, req, messageRateLimit)
  })

  provider.on('data:subscription', (payload: RPC.Susbcription.Response) => {
    const subscription = subs[payload.params.subscription]

    if (subscription && subscription.socket.readyState === WebSocket.OPEN) {
      subscription.socket.send(JSON.stringify(payload))
    }
  })

  return server
}
