export const BRIDGE_SOURCE = 'bridge:link'
export const LINK_SOURCE = 'tray:link'
import { RENDERER_ROLE_ARGUMENT, hasRendererCapability, isRendererRole } from './roles'

export const MAX_MESSAGE_LENGTH = 16 * 1024 * 1024
const MAX_ARGUMENTS = 64
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const requestEventChannels = new Set([
  '*:addFrame',
  '*:contextmenu',
  'dash:reloadSigner',
  'dash:removeSigner',
  'frame:close',
  'frame:max',
  'frame:min',
  'frame:unmax',
  'nav:back',
  'nav:forward',
  'nav:update',
  'tray:action',
  'tray:addToken',
  'tray:adjustNonce',
  'tray:clearRequestsByOrigin',
  'tray:clipboardData',
  'tray:copyTxHash',
  'tray:dismissUpdate',
  'tray:giveAccess',
  'tray:installAvailableUpdate',
  'tray:mouseout',
  'tray:openExplorer',
  'tray:openExternal',
  'tray:quit',
  'tray:ready',
  'tray:rejectRequest',
  'tray:removeToken',
  'tray:renameAccount',
  'tray:replaceTx',
  'tray:resetAllSettings',
  'tray:resetNonce',
  'tray:resolveRequest',
  'tray:updateRestart'
])

export const requestInvokeChannels = new Set(['tray:addChain', 'tray:getTokenDetails'])
const responseEventChannels = new Set(['action', 'dapp', 'flex'])
const methods = new Set(['event', 'invoke', 'rpc'])

const isRecord = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

const hasValidId = (message) => typeof message.id === 'string' && UUID_PATTERN.test(message.id)
const hasValidArgs = (message) => Array.isArray(message.args) && message.args.length <= MAX_ARGUMENTS
const hasOnlyKeys = (message, allowedKeys) => Object.keys(message).every((key) => allowedKeys.has(key))

const hasRoleCapability = (message, rendererRole) => {
  return hasRendererCapability(rendererRole, message.method, message.args)
}

const isValidRequest = (message, rendererRole) => {
  if (!hasValidArgs(message)) return false

  if (message.method === 'event') {
    return (
      !('id' in message) &&
      hasOnlyKeys(message, new Set(['args', 'method', 'source'])) &&
      requestEventChannels.has(message.args[0]) &&
      hasRoleCapability(message, rendererRole)
    )
  }

  if (!hasValidId(message) || !hasOnlyKeys(message, new Set(['args', 'id', 'method', 'source']))) return false
  if (message.method === 'invoke') {
    return requestInvokeChannels.has(message.args[0]) && hasRoleCapability(message, rendererRole)
  }

  return (
    typeof message.args[0] === 'string' &&
    message.args[0].length > 0 &&
    message.args[0].length <= 128 &&
    hasRoleCapability(message, rendererRole)
  )
}

const isValidResponse = (message) => {
  if (message.method === 'event') {
    return (
      hasValidArgs(message) &&
      !('id' in message) &&
      hasOnlyKeys(message, new Set(['args', 'channel', 'method', 'source'])) &&
      responseEventChannels.has(message.channel)
    )
  }

  if (!hasValidId(message) || !hasOnlyKeys(message, new Set(['args', 'id', 'method', 'source']))) return false
  if (message.method === 'invoke') return 'args' in message

  return hasValidArgs(message)
}

export const encodeBridgeMessage = (message) => JSON.stringify(message)

export const decodeBridgeMessage = (value, expectedSource, rendererRole) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MESSAGE_LENGTH) return null

  let message
  try {
    message = JSON.parse(value)
  } catch {
    return null
  }

  if (!isRecord(message) || message.source !== expectedSource || !methods.has(message.method)) return null

  const valid =
    expectedSource === LINK_SOURCE ? isValidRequest(message, rendererRole) : isValidResponse(message)
  return valid ? message : null
}

export const getRendererRole = (args) => {
  if (!Array.isArray(args)) return null

  const roleArguments = args.filter(
    (arg) => typeof arg === 'string' && arg.startsWith(RENDERER_ROLE_ARGUMENT)
  )
  if (roleArguments.length !== 1) return null

  const role = roleArguments[0].slice(RENDERER_ROLE_ARGUMENT.length)
  return isRendererRole(role) ? role : null
}

export const isTrustedBridgeEvent = (event, currentWindow, safeOrigins) =>
  event.source === currentWindow && safeOrigins.includes(event.origin)

export const getRendererTargetOrigin = (location) => (location.protocol === 'file:' ? '*' : location.origin)
