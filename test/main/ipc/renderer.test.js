const mockListeners = new Map()
const mockHandlers = new Map()
const mockIpcMain = {
  handle: jest.fn((channel, listener) => mockHandlers.set(channel, listener)),
  on: jest.fn((channel, listener) => mockListeners.set(channel, listener)),
  removeListener: jest.fn((channel, listener) => {
    if (mockListeners.get(channel) === listener) mockListeners.delete(channel)
  })
}
const mockLog = { warn: jest.fn() }

jest.mock('electron', () => ({ ipcMain: mockIpcMain }))
jest.mock('electron-log', () => mockLog)

const { handleRenderer, onRenderer, onRendererRpc, onceRenderer, registerRendererRole } = jest.requireActual(
  '../../../main/ipc/renderer'
)

const sender = (role) => {
  const webContents = {}
  registerRendererRole(webContents, role)
  return { sender: webContents }
}

beforeEach(() => {
  mockListeners.clear()
  mockHandlers.clear()
  mockIpcMain.handle.mockClear()
  mockIpcMain.on.mockClear()
  mockIpcMain.removeListener.mockClear()
  mockLog.warn.mockClear()
})

test('authorizes event channels against the registered main-owned role', () => {
  const listener = jest.fn()
  onRenderer('tray:openExternal', listener)
  const dispatch = mockListeners.get('tray:openExternal')

  dispatch(sender('notify'), 'https://frame.sh')
  dispatch({ sender: {} }, 'https://frame.sh')
  dispatch(sender('onboard'), 'https://frame.sh')

  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenCalledWith(expect.any(Object), 'https://frame.sh')
  expect(mockLog.warn).toHaveBeenCalledTimes(2)
})

test('enforces limited store actions in the main process', () => {
  const listener = jest.fn()
  onRenderer('tray:action', listener)
  const dispatch = mockListeners.get('tray:action')
  const notify = sender('notify')

  dispatch(notify, 'navDash')
  dispatch(notify, 'mutePylonMigrationNotice')

  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenCalledWith(notify, 'mutePylonMigrationNotice')
})

test('rejects unauthorized invokes and permits privileged invokes', async () => {
  const handler = jest.fn().mockResolvedValue({ success: true })
  handleRenderer('tray:addChain', handler)
  const invoke = mockHandlers.get('tray:addChain')

  expect(() => invoke(sender('dapp'), {})).toThrow('Unauthorized renderer IPC')
  await expect(invoke(sender('dash'), {})).resolves.toEqual({ success: true })
  expect(handler).toHaveBeenCalledTimes(1)
})

test('does not consume once-only listeners on unauthorized events', () => {
  const listener = jest.fn()
  onceRenderer('tray:ready', listener)
  const dispatch = mockListeners.get('tray:ready')

  dispatch(sender('dapp'))
  expect(mockIpcMain.removeListener).not.toHaveBeenCalled()
  expect(listener).not.toHaveBeenCalled()

  const trayEvent = sender('tray')
  dispatch(trayEvent)
  expect(mockIpcMain.removeListener).toHaveBeenCalledWith('tray:ready', dispatch)
  expect(listener).toHaveBeenCalledWith(trayEvent)
})

test('authorizes decoded RPC methods and ignores malformed method values', () => {
  const listener = jest.fn()
  onRendererRpc(listener)
  const dispatch = mockListeners.get('main:rpc')
  const notify = sender('notify')

  expect(() => dispatch(notify, '1', '{')).not.toThrow()
  dispatch(notify, '1', '"signTransaction"')
  dispatch(notify, '1', '"getState"')

  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenCalledWith(notify, '1', '"getState"')
})
