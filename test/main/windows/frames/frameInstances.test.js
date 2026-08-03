import electron from 'electron'
import fs from 'fs'
import path from 'path'

import frameInstances from '../../../../main/windows/frames/frameInstances'
import { createWindow } from '../../../../main/windows/window'

const mockFrameWindow = {
  getSize: jest.fn(() => [800, 600]),
  loadURL: jest.fn(),
  on: jest.fn(),
  setMinimumSize: jest.fn(),
  setPosition: jest.fn(),
  setSize: jest.fn()
}

jest.mock('electron', () => ({
  screen: {
    getCursorScreenPoint: jest.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: jest.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    }))
  }
}))

jest.mock('../../../../main/windows/window', () => ({
  createWindow: jest.fn(() => mockFrameWindow)
}))

beforeEach(() => {
  jest.clearAllMocks()
})

it('uses the packaged application icon for dapp windows', () => {
  frameInstances.create({ id: 'frame-id' })

  const options = createWindow.mock.calls[0][1]
  expect(options.icon).toBe(path.resolve(__dirname, '../../../../main/windows/AppIcon.png'))
  expect(fs.existsSync(options.icon)).toBe(true)
  expect(electron.screen.getDisplayNearestPoint).toHaveBeenCalled()
})
