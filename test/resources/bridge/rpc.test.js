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
})
