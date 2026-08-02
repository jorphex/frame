import { IncomingMessage, Server } from 'http'
import WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import log from 'electron-log'

import provider from '../provider'
import accounts from '../accounts'
import windows from '../windows'
import type { Chain } from '../chains'

import {
  updateOrigin,
  isTrusted,
  parseOrigin,
  createSessionOrigin,
  isKnownExtension,
  FrameExtension,
  parseFrameExtension
} from './origins'
import parsePayload, { MAX_REQUEST_BYTES } from './validPayload'
import protectedMethods from './protectedMethods'
import { parseChainId } from '../provider/chainRequests'
import originSessions from './originSessions'
import { FixedWindowRateLimiter, RateLimitOptions } from './requestLimiter'
import { bindRequestSignal } from '../provider/requestSignal'
import { isFrameSubscriptionType } from '../provider/subscriptions'
import { toRpcQuantity } from '../../resources/domain/transaction/quantity'
import { isValidUpstreamSubscriptionId, TransportSubscriptionRegistry } from './subscriptionRegistry'

const logTraffic = (origin: string) =>
  process.env['LOG_TRAFFIC'] === 'true' || process.env['LOG_TRAFFIC'] === origin

const subscriptions = new TransportSubscriptionRegistry<FrameWebSocket>()

export const WS_MAX_CLIENTS = 64
export const WS_MESSAGE_RATE_LIMIT: RateLimitOptions = { maxRequests: 300, windowMs: 10 * 1000 }
export const WS_MAX_SUBSCRIPTIONS_PER_CLIENT = 256
export const WS_MAX_BUFFERED_SUBSCRIPTION_BYTES = 4 * 1024 * 1024

interface WebSocketServerOptions {
  maxClients?: number
  messageRateLimit?: RateLimitOptions
}

interface FrameWebSocket extends WebSocket {
  id: string
  origin: string | undefined
  frameExtension: FrameExtension | undefined
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

export const handleWebSocketSubscription = (payload: RPC.Susbcription.Response, chain?: Chain) => {
  const chainId = chain ? toRpcQuantity(BigInt(chain.id)) : undefined
  subscriptions.forEvent(payload.params.subscription, chainId).forEach((subscription) => {
    if (subscription.owner.readyState === WebSocket.OPEN) {
      const event = JSON.stringify({
        ...payload,
        params: { ...payload.params, subscription: subscription.id }
      })
      if (
        Buffer.byteLength(event, 'utf8') > MAX_REQUEST_BYTES ||
        subscription.owner.bufferedAmount + Buffer.byteLength(event, 'utf8') >
          WS_MAX_BUFFERED_SUBSCRIPTION_BYTES
      ) {
        subscription.owner.close(1013, 'Subscription delivery limit exceeded')
        return
      }
      subscription.owner.send(event)
    }
  })
}

const handler = (socket: FrameWebSocket, req: IncomingMessage, rateLimit: RateLimitOptions) => {
  socket.id = uuid()
  socket.origin = req.headers.origin
  socket.frameExtension = parseFrameExtension(req)
  const sessionOrigin = createSessionOrigin()
  const requests = new FixedWindowRateLimiter(rateLimit)
  const pendingRequests = new Set<AbortController>()

  const sendResponse = (payload: TransportResponse) => {
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
      return sendResponse({ id: parsedPayload.id, jsonrpc: '2.0', error: parsedPayload.error })
    }
    const rawPayload = parsedPayload.payload
    const controller = new AbortController()
    pendingRequests.add(controller)
    const res = bindRequestSignal((payload: TransportResponse) => {
      pendingRequests.delete(controller)
      if (!controller.signal.aborted) sendResponse(payload)
    }, controller.signal)

    let requestOrigin = socket.origin
    if (socket.frameExtension) {
      if (!(await isKnownExtension(socket.frameExtension))) {
        const error = {
          message: `Permission denied, approve connection from Frame Companion with id ${socket.frameExtension.id} in Frame to continue`,
          code: 4001
        }

        return res({ id: rawPayload.id, jsonrpc: rawPayload.jsonrpc, error })
      }
      if (controller.signal.aborted) return

      // Request from extension, swap origin
      if (rawPayload.__frameOrigin) {
        requestOrigin = rawPayload.__frameOrigin
        delete rawPayload.__frameOrigin
      } else {
        requestOrigin = 'frame-extension'
      }
    }

    const origin = parseOrigin(requestOrigin, sessionOrigin)

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
      if (rawPayload.method === 'frame_summon') {
        pendingRequests.delete(controller)
        return windows.toggleTray()
      }

      const { id, jsonrpc } = rawPayload
      if (rawPayload.method === 'eth_chainId') return res({ id, jsonrpc, result: chainId })
      if (rawPayload.method === 'net_version')
        return res({ id, jsonrpc, result: BigInt(chainId).toString(10) })
    }

    const trusted =
      protectedMethods.indexOf(payload.method) === -1 || (await isTrusted(payload, controller.signal))
    if (controller.signal.aborted) return

    if (!trusted) {
      let error = { message: 'Permission denied, approve ' + origin + ' in Frame to continue', code: 4100 }
      if (!accounts.getSelectedAddresses()[0]) error = { message: 'No Frame account selected', code: 4100 }
      res({ id: payload.id, jsonrpc: payload.jsonrpc, error })
    } else {
      const params = Array.isArray(payload.params) ? payload.params : []
      const requestedSubscriptionId = params[0]
      const ownedSubscription =
        payload.method === 'eth_unsubscribe' && typeof requestedSubscriptionId === 'string'
          ? subscriptions.getOwned(
              requestedSubscriptionId,
              (subscription) => subscription.owner === socket && subscription.chainId === chainId
            )
          : undefined
      if (payload.method === 'eth_unsubscribe' && !ownedSubscription) {
        return res({ id: payload.id, jsonrpc: payload.jsonrpc, result: false })
      }

      const forwardedPayload = ownedSubscription
        ? {
            ...payload,
            chainId: ownedSubscription.chainId,
            params: [ownedSubscription.upstreamId]
          }
        : payload
      provider.send(
        forwardedPayload,
        bindRequestSignal((response) => {
          let transportResponse = response
          if (payload.method === 'eth_subscribe') {
            if (response.error) {
              transportResponse = response
            } else if (!isValidUpstreamSubscriptionId(response.result)) {
              transportResponse = {
                id: payload.id,
                jsonrpc: payload.jsonrpc,
                error: { code: -32603, message: 'Invalid subscription response' }
              }
            } else if (controller.signal.aborted) {
              provider.send({
                id: 1,
                jsonrpc: '2.0',
                method: 'eth_unsubscribe',
                params: [response.result],
                chainId,
                _origin: payload._origin
              })
              return
            } else {
              const subscription =
                subscriptions.forOwner(socket).length < WS_MAX_SUBSCRIPTIONS_PER_CLIENT
                  ? subscriptions.register({
                      upstreamId: response.result,
                      originId: payload._origin,
                      chainId,
                      internal: isFrameSubscriptionType(params[0]),
                      owner: socket
                    })
                  : undefined
              if (!subscription) {
                provider.send({
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'eth_unsubscribe',
                  params: [response.result],
                  chainId,
                  _origin: payload._origin
                })
                transportResponse = {
                  id: payload.id,
                  jsonrpc: payload.jsonrpc,
                  error: { code: -32005, message: 'Subscription client limit exceeded' }
                }
              } else {
                transportResponse = { ...response, result: subscription.id }
              }
            }
          } else if (response && response.result && payload.method === 'eth_unsubscribe') {
            if (ownedSubscription) subscriptions.remove(ownedSubscription.id)
          }

          if (logTraffic(origin))
            log.info(
              `<- res | ${socket.frameExtension ? 'ext' : 'ws'} | ${origin} | ${
                payload.method
              } | <- | ${JSON.stringify(response.result || response.error)}`
            )

          res(transportResponse)
        }, controller.signal)
      )
    }
  })
  socket.on('error', (err) => log.error(err))
  socket.on('close', () => {
    pendingRequests.forEach((controller) => controller.abort())
    pendingRequests.clear()
    subscriptions.forOwner(socket).forEach((subscription) => {
      provider.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_unsubscribe',
        _origin: subscription.originId,
        chainId: subscription.chainId,
        params: [subscription.upstreamId]
      })
      subscriptions.remove(subscription.id)
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

  provider.on('data:subscription', handleWebSocketSubscription)

  return server
}
