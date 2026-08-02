import http, { IncomingMessage, ServerResponse } from 'http'
import log from 'electron-log'

import provider from '../provider'
import accounts from '../accounts'

import { updateOrigin, isTrusted, parseOrigin } from './origins'
import parsePayload, { JsonRpcError, MAX_REQUEST_BYTES } from './validPayload'
import protectedMethods from './protectedMethods'
import { parseChainId } from '../provider/chainRequests'
import originSessions from './originSessions'
import { FixedWindowRateLimiter, RateLimitOptions } from './requestLimiter'

const logTraffic = process.env['LOG_TRAFFIC']

interface PendingRequest {
  send: () => void
  timer: NodeJS.Timeout
}

interface Subscription {
  id: string
  origin: string
}

interface HTTPPollingPayload extends JSONRPCRequestPayload {
  pollId?: string
}

const polls: Record<string, string[]> = {}
const pollSubs: Record<string, Subscription> = {}
const pending: Record<string, PendingRequest> = {}
const cleanupTimers: Record<string, NodeJS.Timeout> = {}

export const HTTP_MAX_CONNECTIONS = 128
export const HTTP_HEADERS_TIMEOUT_MS = 10 * 1000
export const HTTP_REQUEST_TIMEOUT_MS = 30 * 1000
export const HTTP_KEEP_ALIVE_TIMEOUT_MS = 5 * 1000
export const HTTP_MAX_REQUESTS_PER_SOCKET = 1000
export const HTTP_REQUEST_RATE_LIMIT: RateLimitOptions = { maxRequests: 3000, windowMs: 10 * 1000 }
export const HTTP_SOCKET_RATE_LIMIT: RateLimitOptions = { maxRequests: 300, windowMs: 10 * 1000 }

interface HTTPServerOptions {
  requestRateLimit?: RateLimitOptions
  socketRateLimit?: RateLimitOptions
}

const sendJson = (
  res: ServerResponse,
  status: number,
  payload: { id: string | number | null; jsonrpc: '2.0'; error: JsonRpcError } | RPCResponsePayload
) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const sendTransportError = (
  res: ServerResponse,
  status: number,
  id: string | number | null,
  error: JsonRpcError
) => sendJson(res, status, { id, jsonrpc: '2.0', error })

const rejectOversizedRequest = (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Connection', 'close')
  res.once('finish', () => req.destroy())
  sendTransportError(res, 413, null, {
    code: -32600,
    message: `Request exceeds ${MAX_REQUEST_BYTES} byte limit`
  })
}

const rejectRateLimitedRequest = (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Connection', 'close')
  res.once('finish', () => req.destroy())
  sendTransportError(res, 429, null, { code: -32005, message: 'Request rate limit exceeded' })
}

const cleanup = (id: string) => {
  delete polls[id]
  delete pending[id]
  Object.keys(pollSubs).forEach((sub) => {
    const subscription = pollSubs[sub]
    if (subscription?.id === id) {
      provider.send({ jsonrpc: '2.0', id: 1, method: 'eth_unsubscribe', params: [sub], _origin: '' })
      delete pollSubs[sub]
    }
  })
}

const handler = (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept'
  )
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
  } else if (req.method === 'POST') {
    const contentLength = Number(req.headers['content-length'])
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return rejectOversizedRequest(req, res)
    }

    const body: Buffer[] = []
    let bodySize = 0
    let rejected = false

    req
      .on('data', (chunk: Buffer) => {
        if (rejected) return

        bodySize += chunk.length
        if (bodySize > MAX_REQUEST_BYTES) {
          rejected = true
          body.length = 0
          rejectOversizedRequest(req, res)
          return
        }

        body.push(chunk)
      })
      .on('end', async () => {
        if (rejected) return

        res.on('error', (err) => console.error('res err', err))
        const data = Buffer.concat(body).toString()
        const parsedPayload = parsePayload<HTTPPollingPayload>(data)
        if (!parsedPayload.success) {
          return sendTransportError(res, 400, parsedPayload.id, parsedPayload.error)
        }
        const rawPayload = parsedPayload.payload

        if (logTraffic)
          log.info(
            `req -> | http | ${req.headers.origin} | ${rawPayload.method} | -> | ${JSON.stringify(
              rawPayload.params
            )}`
          )

        if (rawPayload.chainId !== undefined) {
          try {
            parseChainId(rawPayload.chainId)
          } catch {
            return sendTransportError(res, 200, rawPayload.id, {
              message: `Invalid chain id (${rawPayload.chainId}), chain id must be a canonical hex quantity`,
              code: -32602
            })
          }
        }

        const origin = parseOrigin(req.headers.origin)
        const { payload, chainId } = updateOrigin(rawPayload, origin)

        try {
          parseChainId(chainId)
        } catch {
          return sendTransportError(res, 200, payload.id, {
            message: `Invalid chain id (${rawPayload.chainId}), chain id must be a canonical hex quantity`,
            code: -32602
          })
        }

        originSessions.extend(payload._origin)

        if (protectedMethods.indexOf(payload.method) > -1 && !(await isTrusted(payload))) {
          let error = { message: `Permission denied, approve ${origin} in Frame to continue`, code: 4100 }
          if (!accounts.getSelectedAddresses()[0])
            error = { message: 'No Frame account selected', code: 4100 }
          sendJson(res, 200, { id: payload.id, jsonrpc: payload.jsonrpc, error })
        } else {
          if (payload.method === 'eth_pollSubscriptions') {
            const params = Array.isArray(payload.params) ? payload.params : []
            const id = params[0]
            if (typeof id !== 'string') {
              return sendTransportError(res, 200, payload.id, {
                code: -32602,
                message: 'Invalid Client ID'
              })
            }
            const immediate = params[1] === 'immediate'
            const send = (force: boolean) => {
              const result = polls[id] || []
              if (result.length || immediate || force) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                const response = { id: payload.id, jsonrpc: payload.jsonrpc, result }
                if (logTraffic)
                  log.info(`<- res | http | ${origin} | ${payload.method} | <- | ${JSON.stringify(response)}`)
                res.end(JSON.stringify(response))
                delete polls[id]
                clearTimeout(cleanupTimers[id])
                cleanupTimers[id] = setTimeout(cleanup.bind(null, id), 20 * 1000)
              } else {
                const sendResponse = () => {
                  const pendingRequest = pending[id]
                  if (pendingRequest && pendingRequest.timer) {
                    clearTimeout(pendingRequest.timer)
                  }

                  delete pending[id]

                  send(true)
                }

                pending[id] = {
                  send: sendResponse,
                  timer: setTimeout(sendResponse, 15 * 1000)
                }
              }
            }
            return send(false)
          }

          provider.send(payload, (response) => {
            if (response && response.result) {
              if (payload.method === 'eth_subscribe') {
                if (typeof response.result === 'string') {
                  pollSubs[response.result] = { id: rawPayload.pollId || '', origin: payload._origin } // Refactor this so you don't need to send a pollId and use the existing subscription id
                }
              } else if (payload.method === 'eth_unsubscribe') {
                const params = Array.isArray(payload.params) ? payload.params : []
                params.forEach((sub) => {
                  if (typeof sub === 'string' && pollSubs[sub]) delete pollSubs[sub]
                })
              }
            }

            if (logTraffic)
              log.info(
                `<- res | http | ${req.headers.origin} | ${payload.method} | <- | ${JSON.stringify(response)}`
              )
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response))
          })
        }
      })
      .on('error', (error) => {
        log.warn('HTTP request stream failed', error)
        if (!res.headersSent) {
          sendTransportError(res, 400, null, { code: -32603, message: 'Internal error' })
        }
      })
  } else {
    res.setHeader('Allow', 'POST, OPTIONS')
    sendTransportError(res, 405, null, { code: -32600, message: 'Method Not Allowed' })
  }
}

const withRateLimits = (
  requestHandler: typeof handler,
  requestRateLimit: RateLimitOptions,
  socketRateLimit: RateLimitOptions
) => {
  const requests = new FixedWindowRateLimiter(requestRateLimit)
  const socketRequests = new WeakMap<IncomingMessage['socket'], FixedWindowRateLimiter>()

  return (req: IncomingMessage, res: ServerResponse) => {
    let socketLimiter = socketRequests.get(req.socket)
    if (!socketLimiter) {
      socketLimiter = new FixedWindowRateLimiter(socketRateLimit)
      socketRequests.set(req.socket, socketLimiter)
    }

    if (!requests.allow() || !socketLimiter.allow()) {
      return rejectRateLimitedRequest(req, res)
    }
    return requestHandler(req, res)
  }
}

provider.on('data:subscription', (payload: RPC.Susbcription.Response) => {
  const subscription = pollSubs[payload.params.subscription]
  if (subscription) {
    const { id } = subscription

    polls[id] = polls[id] || []

    polls[id].push(JSON.stringify(payload))
    pending[id]?.send()
  }
})

export default function (options: HTTPServerOptions = {}) {
  const server = http.createServer(
    withRateLimits(
      handler,
      options.requestRateLimit ?? HTTP_REQUEST_RATE_LIMIT,
      options.socketRateLimit ?? HTTP_SOCKET_RATE_LIMIT
    )
  )
  server.maxConnections = HTTP_MAX_CONNECTIONS
  server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS
  server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS
  server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS
  server.maxRequestsPerSocket = HTTP_MAX_REQUESTS_PER_SOCKET
  return server
}
