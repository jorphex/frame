export const BRIDGE_SOURCE = 'bridge:link'
export const LINK_SOURCE = 'tray:link'
export const RENDERER_ROLE_ARGUMENT = '--frame-renderer-role='

export const MAX_MESSAGE_LENGTH = 16 * 1024 * 1024
const MAX_ARGUMENTS = 64
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const requestEventChannels = new Set([
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
  'tray:clearOrigins',
  'tray:clearRequestsByOrigin',
  'tray:clipboardData',
  'tray:copyTxHash',
  'tray:dismissUpdate',
  'tray:flex:event',
  'tray:flex:res',
  'tray:giveAccess',
  'tray:installAvailableUpdate',
  'tray:mouseout',
  'tray:openExplorer',
  'tray:openExternal',
  'tray:quit',
  'tray:ready',
  'tray:rejectRequest',
  'tray:removeAccount',
  'tray:removeOrigin',
  'tray:removeToken',
  'tray:renameAccount',
  'tray:replaceTx',
  'tray:resetAllSettings',
  'tray:resetNonce',
  'tray:resolveRequest',
  'tray:syncPath',
  'tray:updateRestart',
  'unsetCurrentView'
])

const requestInvokeChannels = new Set(['tray:addChain', 'tray:getTokenDetails'])
const responseEventChannels = new Set(['action', 'dapp', 'flex'])
const methods = new Set(['event', 'invoke', 'rpc'])
const privilegedRoles = new Set(['dash', 'tray'])
const rendererRoles = new Set(['dash', 'dapp', 'notify', 'onboard', 'tray'])
const limitedCapabilities = {
  dapp: {
    actions: new Set(['navDash']),
    events: new Set(['*:contextmenu', 'frame:close', 'frame:max', 'frame:min', 'frame:unmax', 'tray:action']),
    rpc: new Set(['getFrameId', 'getState'])
  },
  notify: {
    actions: new Set(['mutePylonMigrationNotice']),
    events: new Set(['*:contextmenu', 'frame:close', 'frame:max', 'frame:min', 'frame:unmax', 'tray:action']),
    rpc: new Set(['getState'])
  },
  onboard: {
    actions: new Set(['navDash', 'navReplace', 'setKeyboardLayout']),
    events: new Set([
      '*:contextmenu',
      'frame:close',
      'frame:max',
      'frame:min',
      'frame:unmax',
      'tray:action',
      'tray:openExternal'
    ]),
    rpc: new Set(['getState'])
  }
}

const isRecord = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

const hasValidId = (message) => typeof message.id === 'string' && UUID_PATTERN.test(message.id)
const hasValidArgs = (message) => Array.isArray(message.args) && message.args.length <= MAX_ARGUMENTS
const hasOnlyKeys = (message, allowedKeys) => Object.keys(message).every((key) => allowedKeys.has(key))

const hasRoleCapability = (message, rendererRole) => {
  if (privilegedRoles.has(rendererRole)) return true

  const capabilities = limitedCapabilities[rendererRole]
  if (!capabilities) return false
  if (message.method === 'rpc') return capabilities.rpc.has(message.args[0])
  if (message.method === 'invoke') return false

  const channel = message.args[0]
  if (!capabilities.events.has(channel)) return false
  return channel !== 'tray:action' || capabilities.actions.has(message.args[1])
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
  return rendererRoles.has(role) ? role : null
}

export const isTrustedBridgeEvent = (event, currentWindow, safeOrigins) =>
  event.source === currentWindow && safeOrigins.includes(event.origin)

export const getRendererTargetOrigin = (location) => (location.protocol === 'file:' ? '*' : location.origin)
