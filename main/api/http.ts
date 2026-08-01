import http, { IncomingMessage, ServerResponse } from 'http'
import log from 'electron-log'

import provider from '../provider'
import accounts from '../accounts'
import store from '../store'

import { updateOrigin, isTrusted, parseOrigin } from './origins'
import parsePayload, { JsonRpcError, MAX_REQUEST_BYTES } from './validPayload'
import protectedMethods from './protectedMethods'
import { parseChainId } from '../provider/chainRequests'

const logTraffic = process.env.LOG_TRAFFIC

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
const connectionMonitors: Record<string, NodeJS.Timeout> = {}

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

function extendSession(originId: string) {
  if (originId) {
    clearTimeout(connectionMonitors[originId])

    const timer = setTimeout(() => {
      store.endOriginSession(originId)
    }, 60 * 1000)
    timer.unref()
    connectionMonitors[originId] = timer
  }
}

const cleanup = (id: string) => {
  delete polls[id]
  delete pending[id]
  Object.keys(pollSubs).forEach((sub) => {
    if (pollSubs[sub].id === id) {
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

        extendSession(payload._origin)

        if (protectedMethods.indexOf(payload.method) > -1 && !(await isTrusted(payload))) {
          let error = { message: `Permission denied, approve ${origin} in Frame to continue`, code: 4100 }
          if (!accounts.getSelectedAddresses()[0])
            error = { message: 'No Frame account selected', code: 4100 }
          sendJson(res, 200, { id: payload.id, jsonrpc: payload.jsonrpc, error })
        } else {
          if (payload.method === 'eth_pollSubscriptions') {
            const id = payload.params[0]
            const send = (force: boolean) => {
              const result = polls[id] || []
              if (result.length || payload.params[1] === 'immediate' || force) {
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
            if (typeof id === 'string') return send(false)
            return sendTransportError(res, 200, payload.id, {
              code: -32602,
              message: 'Invalid Client ID'
            })
          }

          provider.send(payload, (response) => {
            if (response && response.result) {
              if (payload.method === 'eth_subscribe') {
                pollSubs[response.result] = { id: rawPayload.pollId || '', origin: payload._origin } // Refactor this so you don't need to send a pollId and use the existing subscription id
              } else if (payload.method === 'eth_unsubscribe') {
                payload.params.forEach((sub) => {
                  if (pollSubs[sub]) delete pollSubs[sub]
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

provider.on('data:subscription', (payload: RPC.Susbcription.Response) => {
  const subscription = pollSubs[payload.params.subscription]
  if (subscription) {
    const { id } = subscription

    polls[id] = polls[id] || []

    polls[id].push(JSON.stringify(payload))
    pending[id]?.send()
  }
})

export default function () {
  return http.createServer(handler)
}
