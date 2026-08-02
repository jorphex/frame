import { v5 as uuidv5 } from 'uuid'
import { IncomingMessage } from 'http'
import queryString from 'query-string'

import accounts, { AccessRequest } from '../accounts'
import store from '../store'

import type { Permission } from '../store/state'

const dev = process.env.NODE_ENV === 'development'

const activeExtensionChecks: Record<string, Promise<boolean>> = {}
const activePermissionChecks: Record<string, Promise<Permission | undefined>> = {}
const extensionPrefixes = {
  chrome: 'chrome-extension',
  firefox: 'moz-extension',
  safari: 'safari-web-extension'
}

const protocolRegex = /^(?:ws|http)s?:\/\//

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

export function parseOrigin(origin?: string) {
  if (!origin) return 'Unknown'

  return origin.replace(protocolRegex, '')
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
  store.notify('extensionConnect', extension)

  return result
}

async function requestPermission(address: Address, fullPayload: RPCRequestPayload) {
  const { _origin: originId, ...payload } = fullPayload
  const permissionCheckId = `${address.toLowerCase()}:${originId}`

  if (permissionCheckId in activePermissionChecks) {
    return activePermissionChecks[permissionCheckId]
  }

  let settle: (permission?: Permission) => void = () => {}
  const result = new Promise<Permission | undefined>((resolve) => {
    settle = resolve
  })
  activePermissionChecks[permissionCheckId] = result

  const request: AccessRequest = {
    payload,
    handlerId: originId,
    type: 'access',
    origin: originId,
    account: address
  }

  if (!accountIsCurrent(address)) {
    delete activePermissionChecks[permissionCheckId]
    settle()
    return result
  }

  try {
    accounts.addRequest(request, () => {
      const origin = store('main.origins', originId)
      const permission = origin ? storeApi.getPermission(address, origin.name) : undefined

      delete activePermissionChecks[permissionCheckId]
      settle(permission)
    })
  } catch {
    delete activePermissionChecks[permissionCheckId]
    settle()
  }

  return result
}

export function getOriginAccess(payload: RPCRequestPayload): OriginAccess | undefined {
  const origin = store('main.origins', payload._origin)
  const address = currentAccountAddress()

  if (!origin || typeof origin.name !== 'string' || invalidOrigin(origin.name) || !address) return

  const permission = storeApi.getPermission(address, origin.name)
  return { address, origin: origin.name, ...(permission !== undefined && { permission }) }
}

export async function requestOriginAccess(payload: RPCRequestPayload, expectedAddress?: Address) {
  const access = getOriginAccess(payload)
  if (!access) return false
  if (expectedAddress && access.address.toLowerCase() !== expectedAddress.toLowerCase()) return false
  if (access.permission?.provider) return true

  const permission = await requestPermission(access.address, payload)
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
      store.addOriginRequest(originId)
    } else {
      store.initOrigin(originId, {
        name: origin,
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
  const hasExtensionIdentity = query.identity === 'frame-extension'

  if (origin === 'chrome-extension://ldcoohedfbjoobcadoglnnmmfbdlmmhf') {
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
  if (extension.browser === 'chrome' || extension.browser === 'safari') return true

  const extensionPermission = storeApi.getKnownExtension(extension.id)

  return extensionPermission ?? requestExtensionPermission(extension)
}

export async function isTrusted(payload: RPCRequestPayload) {
  // Permission granted to unknown origins only persist until the Frame is closed, they are not permanent
  const origin = store('main.origins', payload._origin)
  if (!origin) return false

  const originName = origin.name

  if (isTrustedOrigin(originName) && isInternalMethod(payload.method)) {
    return true
  }

  const access = getOriginAccess(payload)
  if (!access) return false

  const permission = access.permission || (await requestPermission(access.address, payload))

  return accountIsCurrent(access.address) && !!permission?.provider
}
