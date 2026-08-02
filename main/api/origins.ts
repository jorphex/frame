import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { IncomingMessage } from 'http'
import queryString from 'query-string'

import accounts, { AccessRequest } from '../accounts'
import store from '../store'
import { requireStoreAction } from '../store/action'

import type { Permission } from '../store/state'

const dev = process.env.NODE_ENV === 'development'

const activeExtensionChecks: Record<string, Promise<boolean>> = {}
interface ActivePermissionCheck {
  promise: Promise<Permission | undefined>
  request: AccessRequest
  settle(permission?: Permission): void
  waiters: number
}

const activePermissionChecks: Record<string, ActivePermissionCheck> = {}
const extensionPrefixes = {
  chrome: 'chrome-extension',
  firefox: 'moz-extension',
  safari: 'safari-web-extension'
}

const sessionOriginPrefix = 'Unknown/'
const MAX_ORIGIN_LENGTH = 2048
const internalOrigins = new Set(['frame-extension', 'frame-internal'])
const webProtocols = new Set(['http:', 'https:', 'ws:', 'wss:'])
const webOrigin = /^(?:https?|wss?):\/\/[^/?#\\]+\/?$/i
const extensionOrigin = /^(?:chrome-extension|moz-extension|safari-web-extension):\/\/[0-9a-z.-]+$/i

interface OriginUpdateResult {
  payload: RPCRequestPayload
  chainId: string
}

export interface OriginAccess {
  address: Address
  origin: string
  permission?: Permission
}

type Browser = 'chrome' | 'firefox' | 'safari'

export interface FrameExtension {
  browser: Browser
  id: string
}

// allows the Frame extension to request specific methods
const trustedInternalMethods = ['wallet_getEthereumChains']

const isTrustedOrigin = (origin: string) => origin === 'frame-extension' || origin === 'frame-internal'
const isInternalMethod = (method: string) => trustedInternalMethods.includes(method)

const storeApi = {
  getPermission: (address: Address, origin: string) => {
    const permissions: Record<string, Permission> = store('main.permissions', address) || {}
    return Object.values(permissions).find((p) => p.origin === origin)
  },
  getKnownExtension: (id: string) => store('main.knownExtensions', id) as boolean
}

const currentAccountAddress = () => {
  const currentAccount = accounts.current()
  return currentAccount?.address || currentAccount?.id
}

const accountIsCurrent = (address: Address) =>
  currentAccountAddress()?.toLowerCase() === address.toLowerCase()

function canonicalOrigin(origin: string | undefined) {
  if (!origin || origin.length > MAX_ORIGIN_LENGTH || origin !== origin.trim()) return
  if (internalOrigins.has(origin)) return origin
  if (extensionOrigin.test(origin)) return origin.toLowerCase()
  if (!webOrigin.test(origin)) return

  try {
    const parsed = new URL(origin)
    if (
      !webProtocols.has(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return
    }

    return parsed.origin
  } catch {
    return
  }
}

export function isSessionOnlyOrigin(origin: string) {
  return origin === 'Unknown' || origin.startsWith(sessionOriginPrefix)
}

export function requiresSessionOrigin(origin?: string) {
  return !origin || origin === 'null' || isSessionOnlyOrigin(origin) || !canonicalOrigin(origin)
}

export function createSessionOrigin() {
  return `${sessionOriginPrefix}${uuidv4()}`
}

export function parseOrigin(origin?: string, sessionOrigin = 'Unknown') {
  if (!origin || requiresSessionOrigin(origin)) return sessionOrigin

  return canonicalOrigin(origin) || sessionOrigin
}

function invalidOrigin(origin: string) {
  return origin !== origin.replace(/[^0-9a-z/:.[\]-]/gi, '')
}

async function requestExtensionPermission(extension: FrameExtension) {
  if (extension.id in activeExtensionChecks) {
    return activeExtensionChecks[extension.id]
  }

  const result = new Promise<boolean>((resolve) => {
    const obs = store.observer(() => {
      const isActive = extension.id in activeExtensionChecks
      const isAllowed = store('main.knownExtensions', extension.id)

      // wait for a response
      if (isActive && typeof isAllowed !== 'undefined') {
        delete activeExtensionChecks[extension.id]
        obs.remove()
        resolve(isAllowed)
      }
    }, 'origins:requestExtension')
  })

  activeExtensionChecks[extension.id] = result
  requireStoreAction('notify')('extensionConnect', extension)

  return result
}

function waitForPermission(permissionCheckId: string, check: ActivePermissionCheck, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve(undefined)

  check.waiters += 1
  return new Promise<Permission | undefined>((resolve) => {
    let waiting = true
    const finish = (permission?: Permission) => {
      if (!waiting) return
      waiting = false
      check.waiters -= 1
      signal?.removeEventListener('abort', abort)
      resolve(permission)
    }
    const abort = () => {
      finish()
      if (check.waiters > 0 || activePermissionChecks[permissionCheckId] !== check) return

      try {
        accounts.cancelUnapprovedRequestForAccount(check.request.account, check.request.handlerId, {
          code: 4900,
          message: 'Requesting client disconnected'
        })
      } finally {
        check.settle()
      }
    }

    signal?.addEventListener('abort', abort, { once: true })
    check.promise.then(finish)
  })
}

async function requestPermission(address: Address, fullPayload: RPCRequestPayload, signal?: AbortSignal) {
  const { _origin: originId, ...payload } = fullPayload
  const permissionCheckId = `${address.toLowerCase()}:${originId}`

  if (permissionCheckId in activePermissionChecks) {
    const check = activePermissionChecks[permissionCheckId]
    if (check) return waitForPermission(permissionCheckId, check, signal)
  }

  let resolveCheck: (permission?: Permission) => void = () => {}
  const promise = new Promise<Permission | undefined>((resolve) => {
    resolveCheck = resolve
  })

  const request: AccessRequest = {
    payload,
    handlerId: originId,
    type: 'access',
    origin: originId,
    account: address
  }
  const check: ActivePermissionCheck = {
    promise,
    request,
    waiters: 0,
    settle(permission) {
      if (activePermissionChecks[permissionCheckId] !== check) return
      delete activePermissionChecks[permissionCheckId]
      resolveCheck(permission)
    }
  }
  activePermissionChecks[permissionCheckId] = check

  if (!accountIsCurrent(address)) {
    check.settle()
    return waitForPermission(permissionCheckId, check, signal)
  }

  try {
    accounts.addRequest(request, () => {
      const origin = store('main.origins', originId)
      const permission = origin ? storeApi.getPermission(address, origin.name) : undefined

      check.settle(permission)
    })
  } catch {
    check.settle()
  }

  return waitForPermission(permissionCheckId, check, signal)
}

export function getOriginAccess(payload: RPCRequestPayload): OriginAccess | undefined {
  const origin = store('main.origins', payload._origin)
  const address = currentAccountAddress()

  if (!origin || typeof origin.name !== 'string' || invalidOrigin(origin.name) || !address) return

  const permission = storeApi.getPermission(address, origin.name)
  return { address, origin: origin.name, ...(permission !== undefined && { permission }) }
}

export async function requestOriginAccess(
  payload: RPCRequestPayload,
  expectedAddress?: Address,
  signal?: AbortSignal
) {
  const access = getOriginAccess(payload)
  if (!access) return false
  if (expectedAddress && access.address.toLowerCase() !== expectedAddress.toLowerCase()) return false
  if (access.permission?.provider) return true

  const permission = await requestPermission(access.address, payload, signal)
  if (signal?.aborted) return false
  return accountIsCurrent(access.address) && !!permission?.provider
}

export function updateOrigin(
  requestPayload: JSONRPCRequestPayload,
  origin: string,
  connectionMessage = false
): OriginUpdateResult {
  const originId = uuidv5(origin, uuidv5.DNS)
  const existingOrigin = store('main.origins', originId)

  if (!connectionMessage) {
    // the extension will attempt to send messages (eth_chainId and net_version) in order
    // to connect. we don't want to store these origins as they'll come from every site
    // the user visits in their browser

    if (existingOrigin) {
      requireStoreAction('addOriginRequest')(originId)
    } else {
      requireStoreAction('initOrigin')(originId, {
        name: origin,
        ...(isSessionOnlyOrigin(origin) && { sessionOnly: true }),
        chain: {
          id: 1,
          type: 'ethereum'
        }
      })
    }
  }

  const chainId = requestPayload.chainId || `0x${(existingOrigin?.chain.id || 1).toString(16)}`

  const payload = {
    ...requestPayload,
    _origin: originId
  }

  if (connectionMessage) {
    payload.chainId = chainId
  }

  return {
    payload,
    chainId
  }
}

export function parseFrameExtension(req: IncomingMessage): FrameExtension | undefined {
  const origin = req.headers.origin || ''

  const query = queryString.parse((req.url || '').replace('/', ''))
  const hasExtensionIdentity = query['identity'] === 'frame-extension'

  if (origin === 'chrome-extension://ldcoohedfbjoobcadoglnnmmfbdlmmhf' && hasExtensionIdentity) {
    // Match production chrome
    return { browser: 'chrome', id: 'ldcoohedfbjoobcadoglnnmmfbdlmmhf' }
  } else if (origin.startsWith(`${extensionPrefixes.chrome}://`) && dev && hasExtensionIdentity) {
    // Match Chrome in dev
    const extensionId = origin.substring(extensionPrefixes.chrome.length + 3)
    return { browser: 'chrome', id: extensionId }
  } else if (origin.startsWith(`${extensionPrefixes.firefox}://`) && hasExtensionIdentity) {
    // Match production Firefox
    const extensionId = origin.substring(extensionPrefixes.firefox.length + 3)
    return { browser: 'firefox', id: extensionId }
  } else if (origin.startsWith(`${extensionPrefixes.safari}://`) && dev && hasExtensionIdentity) {
    // Match Safari in dev only
    return { browser: 'safari', id: 'frame-dev' }
  }

  return undefined
}

export async function isKnownExtension(extension: FrameExtension) {
  const extensionPermission = storeApi.getKnownExtension(extension.id)

  return extensionPermission ?? requestExtensionPermission(extension)
}

export async function isTrusted(payload: RPCRequestPayload, signal?: AbortSignal) {
  // Permission granted to unknown origins only persist until the Frame is closed, they are not permanent
  const origin = store('main.origins', payload._origin)
  if (!origin) return false

  const originName = origin.name

  if (isTrustedOrigin(originName) && isInternalMethod(payload.method)) {
    return true
  }

  const access = getOriginAccess(payload)
  if (!access) return false

  const permission = access.permission || (await requestPermission(access.address, payload, signal))

  return !signal?.aborted && accountIsCurrent(access.address) && !!permission?.provider
}
