import { ipcMain } from 'electron'
import log from 'electron-log'

import { BridgeMethod, RendererRole, hasRendererCapability } from '../../resources/bridge/roles'

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
  ipcMain.on(channel, (event, ...args) => {
    if (authorize(event, 'event', channel, args)) listener(event, ...args)
  })
}

export const onceRenderer = (channel: string, listener: RendererListener) => {
  const wrapped = (event: IpcMainEvent, ...args: unknown[]) => {
    if (!authorize(event, 'event', channel, args)) return
    ipcMain.removeListener(channel, wrapped)
    listener(event, ...args)
  }
  ipcMain.on(channel, wrapped)
  return () => ipcMain.removeListener(channel, wrapped)
}

export const handleRenderer = (channel: string, listener: RendererHandler) => {
  ipcMain.handle(channel, (event, ...args) => {
    if (!authorize(event, 'invoke', channel, args)) throw new Error('Unauthorized renderer IPC')
    return listener(event, ...args)
  })
}

export const onRendererRpc = (listener: RendererListener) => {
  ipcMain.on('main:rpc', (event, ...args) => {
    let method
    try {
      method = typeof args[1] === 'string' ? JSON.parse(args[1]) : undefined
    } catch {
      return
    }
    if (typeof method !== 'string' || !authorize(event, 'rpc', method, [])) return
    listener(event, ...args)
  })
}
