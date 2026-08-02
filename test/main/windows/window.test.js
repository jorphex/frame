import { BrowserWindow, WebContentsView } from 'electron'

import { createViewInstance, createWindow } from '../../../main/windows/window'

const mockWindow = {
  webContents: {
    on: jest.fn(),
    once: jest.fn(),
    setWindowOpenHandler: jest.fn()
  }
}

const mockView = {
  setBackgroundColor: jest.fn(),
  webContents: {
    on: jest.fn(),
    setWindowOpenHandler: jest.fn()
  }
}

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(() => mockWindow),
  shell: { openExternal: jest.fn() },
  WebContentsView: jest.fn(() => mockView)
}))

jest.mock('../../../main/store', () => jest.fn())

const originalBundleLocation = process.env.BUNDLE_LOCATION

beforeAll(() => {
  process.env.BUNDLE_LOCATION = '/tmp/frame-test-bundle'
})

afterAll(() => {
  if (originalBundleLocation === undefined) {
    delete process.env.BUNDLE_LOCATION
  } else {
    process.env.BUNDLE_LOCATION = originalBundleLocation
  }
})

describe('createWindow', () => {
  it('preserves square frameless windows on Linux', () => {
    createWindow('tray')

    const options = BrowserWindow.mock.calls[0][0]
    expect(options).toEqual(
      expect.objectContaining({
        frame: false,
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          additionalArguments: ['--frame-renderer-role=tray'],
          nodeIntegration: false,
          sandbox: true
        })
      })
    )

    if (process.platform === 'linux') {
      expect(options.roundedCorners).toBe(false)
    } else {
      expect(options).not.toHaveProperty('roundedCorners')
    }
  })

  it.each([
    ['dash', 'dash'],
    ['notify', 'notify'],
    ['onboard', 'onboard'],
    ['tray', 'tray'],
    ['frameInstance', 'dapp']
  ])('maps %s windows to the %s renderer role', (windowName, role) => {
    createWindow(windowName, undefined, { additionalArguments: ['--existing'] })

    expect(BrowserWindow.mock.calls[0][0].webPreferences.additionalArguments).toEqual([
      '--existing',
      `--frame-renderer-role=${role}`
    ])
  })

  it('rejects windows without an explicit renderer role', () => {
    expect(() => createWindow('unknown')).toThrow('has no renderer IPC role')
  })
})

describe('createViewInstance', () => {
  it('creates an isolated transparent view with a persistent dapp partition', () => {
    createViewInstance('app.example')

    expect(WebContentsView).toHaveBeenCalledWith({
      webPreferences: expect.objectContaining({
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:app.example',
        sandbox: true,
        webviewTag: false
      })
    })
    expect(mockView.setBackgroundColor).toHaveBeenCalledWith('#00000000')
    expect(mockView.webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function))
    expect(mockView.webContents.on).toHaveBeenCalledWith('will-attach-webview', expect.any(Function))
    expect(mockView.webContents.setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function))
  })
})
