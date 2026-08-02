import { ipcMain } from 'electron'
import log from 'electron-log'

import { BridgeMethod, RendererRole, hasRendererCapability } from '../../resources/bridge/roles'
import { encodeRendererRpcValues, parseRendererRpcId, parseRendererRpcRequest } from './rpcSchemas'
import { assertRendererIpcSchema, parseRendererIpcArgs } from './schemas'

import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'

const roles = new WeakMap<WebContents, RendererRole>()
type RendererListener = Parameters<typeof ipcMain.on>[1]
type RendererHandler = Parameters<typeof ipcMain.handle>[1]

export const registerRendererRole = (webContents: WebContents, role: RendererRole) => {
  roles.set(webContents, role)
}

const authorize = (
  event: IpcMainEvent | IpcMainInvokeEvent,
  method: BridgeMethod,
  channel: string,
  args: unknown[]
) => {
  const role = roles.get(event.sender)
  if (hasRendererCapability(role, method, [channel, ...args])) return true

  log.warn('Rejected unauthorized renderer IPC', { channel, method, role: role || 'unregistered' })
  return false
}

export const onRenderer = (channel: string, listener: RendererListener) => {
  assertRendererIpcSchema('event', channel)
  ipcMain.on(channel, (event, ...args) => {
    if (!authorize(event, 'event', channel, args)) return
    const parsed = parseRendererIpcArgs('event', channel, args)
    if (parsed.success) return listener(event, ...(parsed.data as unknown[]))
    log.warn('Rejected invalid renderer IPC payload', { channel, issues: parsed.error.issues })
  })
}

export const onceRenderer = (channel: string, listener: RendererListener) => {
  assertRendererIpcSchema('event', channel)
  const wrapped = (event: IpcMainEvent, ...args: unknown[]) => {
    if (!authorize(event, 'event', channel, args)) return
    const parsed = parseRendererIpcArgs('event', channel, args)
    if (!parsed.success) {
      log.warn('Rejected invalid renderer IPC payload', { channel, issues: parsed.error.issues })
      return
    }
    ipcMain.removeListener(channel, wrapped)
    listener(event, ...(parsed.data as unknown[]))
  }
  ipcMain.on(channel, wrapped)
  return () => ipcMain.removeListener(channel, wrapped)
}

export const handleRenderer = (channel: string, listener: RendererHandler) => {
  assertRendererIpcSchema('invoke', channel)
  ipcMain.handle(channel, (event, ...args) => {
    if (!authorize(event, 'invoke', channel, args)) throw new Error('Unauthorized renderer IPC')
    const parsed = parseRendererIpcArgs('invoke', channel, args)
    if (!parsed.success) throw new Error('Invalid renderer IPC payload')
    return listener(event, ...(parsed.data as unknown[]))
  })
}

export const onRendererRpc = (listener: RendererListener) => {
  ipcMain.on('main:rpc', (event, ...args) => {
    const parsed = parseRendererRpcRequest(args)
    if (!parsed.success) {
      const id = parsed.id || parseRendererRpcId(args[0])
      log.warn('Rejected invalid renderer RPC payload')
      if (id) event.sender.send('main:rpc', id, ...encodeRendererRpcValues(['Invalid renderer RPC payload']))
      return
    }
    const { id, method, args: methodArgs } = parsed.data
    if (!authorize(event, 'rpc', method, [])) {
      event.sender.send('main:rpc', id, ...encodeRendererRpcValues(['Unauthorized renderer RPC']))
      return
    }
    listener(event, id, method, ...methodArgs)
  })
}
