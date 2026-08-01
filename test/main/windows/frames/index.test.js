import store from '../../../../main/store'
import FrameManager from '../../../../main/windows/frames'
import frameInstances from '../../../../main/windows/frames/frameInstances'
import viewInstances from '../../../../main/windows/frames/viewInstances'

jest.mock('../../../../main/store', () => {
  const store = jest.fn()
  store.removeFrame = jest.fn()
  store.updateFrame = jest.fn()
  return store
})

jest.mock('../../../../main/windows/frames/frameInstances', () => ({
  create: jest.fn()
}))

jest.mock('../../../../main/windows/frames/viewInstances', () => ({
  create: jest.fn(),
  destroy: jest.fn(),
  position: jest.fn()
}))

const createFrameWindow = () => ({
  contentView: {
    addChildView: jest.fn(),
    removeChildView: jest.fn()
  },
  isFocused: jest.fn(() => false),
  on: jest.fn(),
  views: {}
})

describe('FrameManager WebContentsView ownership', () => {
  it('attaches the active view and detaches it when it is no longer current', () => {
    const manager = new FrameManager()
    const view = { webContents: { focus: jest.fn() } }
    const frameWindow = createFrameWindow()
    frameWindow.views = { view: view }
    manager.frameInstances = { frame: frameWindow }

    const frame = { currentView: 'view', views: { view: { ready: true } } }
    manager.manageViews({ frame })

    expect(frameWindow.contentView.addChildView).toHaveBeenCalledWith(view)
    expect(viewInstances.position).toHaveBeenCalledWith(frameWindow, 'view')

    frame.currentView = ''
    manager.manageViews({ frame })

    expect(frameWindow.contentView.removeChildView).toHaveBeenCalledWith(view)
  })

  it('repositions the current view when its frame is resized', () => {
    const listeners = {}
    const frameWindow = createFrameWindow()
    frameWindow.on.mockImplementation((event, listener) => {
      listeners[event] = listener
    })
    frameInstances.create.mockReturnValue(frameWindow)

    const frame = { currentView: 'view', views: {} }
    store.mockImplementation((path) => (path === 'main.frames' ? { frame } : undefined))

    const manager = new FrameManager()
    manager.manageFrames({ frame }, '')
    listeners.resize()

    expect(viewInstances.position).toHaveBeenCalledWith(frameWindow, 'view')
  })
})
