import { WebContentsView } from 'electron'

import { createViewInstance } from '../../../main/windows/window'

const mockView = {
  setBackgroundColor: jest.fn(),
  webContents: {
    on: jest.fn(),
    setWindowOpenHandler: jest.fn()
  }
}

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  shell: { openExternal: jest.fn() },
  WebContentsView: jest.fn(() => mockView)
}))

jest.mock('../../../main/store', () => jest.fn())

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
