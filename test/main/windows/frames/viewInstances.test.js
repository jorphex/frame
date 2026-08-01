import store from '../../../../main/store'
import server from '../../../../main/dapps/server'
import viewInstances from '../../../../main/windows/frames/viewInstances'

jest.mock('../../../../main/store', () => jest.fn())
jest.mock('../../../../main/dapps/server', () => ({ sessions: { remove: jest.fn() } }))
jest.mock('../../../../main/windows/window', () => ({ createViewInstance: jest.fn() }))

const createFrameWindow = () => {
  const view = { setBounds: jest.fn() }
  return {
    frame: {
      frameId: 'frame',
      getBounds: () => ({ width: 800, height: 600 }),
      views: { view }
    },
    view
  }
}

describe('WebContentsView positioning', () => {
  it('reserves the frame title area in windowed mode', () => {
    const { frame, view } = createFrameWindow()
    store.mockReturnValue({ fullscreen: false })

    viewInstances.position(frame, 'view')

    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 32, width: 800, height: 568 })
  })

  it('fills the complete frame in fullscreen mode', () => {
    const { frame, view } = createFrameWindow()
    store.mockReturnValue({ fullscreen: true })

    viewInstances.position(frame, 'view')

    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 800, height: 600 })
  })
})

describe('WebContentsView destruction', () => {
  it('detaches the view and closes its web contents without waiting for unload', () => {
    const view = { webContents: { close: jest.fn() } }
    const frame = {
      contentView: { removeChildView: jest.fn() },
      frameId: 'frame',
      isDestroyed: () => false,
      views: { view }
    }
    store.mockReturnValue({ url: 'https://app.example/?session=session' })

    viewInstances.destroy(frame, 'view')

    expect(frame.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(view.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
    expect(server.sessions.remove).toHaveBeenCalledWith('', 'session')
    expect(frame.views).not.toHaveProperty('view')
  })
})
