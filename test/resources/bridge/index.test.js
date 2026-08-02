const mockIpcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  send: jest.fn()
}
const mockRpc = jest.fn()

jest.mock('electron', () => ({ ipcRenderer: mockIpcRenderer }))
jest.mock('../../../resources/bridge/rpc', () => mockRpc)

const id = '74b6f0b5-0396-4d91-b505-0fb66f00786a'
const LINK_SOURCE = 'tray:link'

describe('preload renderer bridge', () => {
  let listeners
  let rendererWindow

  beforeEach(() => {
    jest.resetModules()
    mockIpcRenderer.invoke.mockReset()
    mockIpcRenderer.on.mockReset()
    mockIpcRenderer.send.mockReset()
    mockRpc.mockReset()

    listeners = {}
    rendererWindow = {
      addEventListener: jest.fn((name, listener) => {
        listeners[name] = listener
      }),
      location: { protocol: 'file:', origin: 'null' },
      postMessage: jest.fn()
    }
    globalThis.window = rendererWindow

    jest.isolateModules(() => jest.requireActual('../../../resources/bridge'))
  })

  afterEach(() => {
    delete globalThis.window
  })

  const dispatch = (data, overrides = {}) =>
    listeners.message({ data, source: rendererWindow, origin: 'file://', ...overrides })

  test('ignores malformed, cross-window, and wrong-origin messages without throwing', () => {
    expect(() => dispatch('{')).not.toThrow()
    expect(() =>
      dispatch(JSON.stringify({ source: LINK_SOURCE, method: 'event', args: ['tray:ready'] }), { source: {} })
    ).not.toThrow()
    expect(() =>
      dispatch(JSON.stringify({ source: LINK_SOURCE, method: 'event', args: ['tray:ready'] }), {
        origin: 'https://example.com'
      })
    ).not.toThrow()

    expect(mockIpcRenderer.send).not.toHaveBeenCalled()
  })

  test('forwards only a valid registered one-way channel', () => {
    dispatch(JSON.stringify({ source: LINK_SOURCE, method: 'event', args: ['shell:execute', 'calc'] }))
    dispatch(JSON.stringify({ source: LINK_SOURCE, method: 'event', args: ['tray:ready'] }))

    expect(mockIpcRenderer.send).toHaveBeenCalledTimes(1)
    expect(mockIpcRenderer.send).toHaveBeenCalledWith('tray:ready')
  })

  test('returns main RPC callbacks through a bounded bridge response', () => {
    dispatch(JSON.stringify({ source: LINK_SOURCE, method: 'rpc', id, args: ['getState'] }))

    expect(mockRpc).toHaveBeenCalledWith('getState', expect.any(Function))
    mockRpc.mock.calls[0][1](null, { ready: true })

    expect(rendererWindow.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ method: 'rpc', id, args: [null, { ready: true }], source: 'bridge:link' }),
      '*'
    )
  })

  test('returns invoke results through the same request id', async () => {
    mockIpcRenderer.invoke.mockResolvedValue({ success: true })
    dispatch(JSON.stringify({ source: LINK_SOURCE, method: 'invoke', id, args: ['tray:addChain', {}] }))
    await Promise.resolve()

    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('tray:addChain', {})
    expect(rendererWindow.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ method: 'invoke', id, args: { success: true }, source: 'bridge:link' }),
      '*'
    )
  })
})
