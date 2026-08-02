const mockIpcRenderer = {
  on: jest.fn(),
  send: jest.fn()
}

jest.mock('electron', () => ({ ipcRenderer: mockIpcRenderer }))

describe('preload main RPC serialization', () => {
  let mainResponse
  let rpc

  beforeEach(() => {
    jest.resetModules()
    mockIpcRenderer.on.mockReset()
    mockIpcRenderer.send.mockReset()

    jest.isolateModules(() => {
      rpc = jest.requireActual('../../../resources/bridge/rpc').default
    })
    mainResponse = mockIpcRenderer.on.mock.calls.find(([channel]) => channel === 'main:rpc')[1]
  })

  test('preserves null and undefined values without parsing them as JSON', () => {
    const callback = jest.fn()
    rpc('getState', callback)

    expect(mockIpcRenderer.send).toHaveBeenCalledWith('main:rpc', '1', '"getState"')

    mainResponse({}, 1, undefined, null, JSON.stringify({ ready: true }))
    expect(callback).toHaveBeenCalledWith(undefined, null, { ready: true })
  })

  test('settles and removes handlers for malformed responses without logging payloads', () => {
    const callback = jest.fn()
    const log = jest.spyOn(globalThis.console, 'log').mockImplementation(() => {})
    rpc('locateKeystore', callback)

    mainResponse({}, 1, '{')
    mainResponse({}, 1, JSON.stringify({ private: 'must not be logged' }))

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('Invalid main RPC response')
    expect(log).toHaveBeenCalledWith('Message from main RPC had no handler')
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('must not be logged'))
    log.mockRestore()
  })

  test('removes a handler before calling renderer code and rejects invalid response ids', () => {
    const log = jest.spyOn(globalThis.console, 'log').mockImplementation(() => {})
    const callback = jest.fn(() => {
      throw new Error('renderer callback failed')
    })
    rpc('getState', callback)

    expect(() => mainResponse({}, 1, null, '{}')).toThrow('renderer callback failed')
    expect(() => mainResponse({}, 1, null, '{}')).not.toThrow()
    expect(() => mainResponse({}, '__proto__', null, '{}')).not.toThrow()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })

  test('bounds aggregate main RPC response values', () => {
    const callback = jest.fn()
    rpc('getState', callback)

    mainResponse({}, 1, '"' + 'x'.repeat(16 * 1024 * 1024) + '"')

    expect(callback).toHaveBeenCalledWith('Invalid main RPC response')
  })
})
