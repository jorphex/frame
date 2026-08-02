// Frames are the windows that run dapps and other functionality
// They are rendered based on the state of `main.frames`
import log from 'electron-log'
import store from '../../store'
import { requireStoreAction } from '../../store/action'

import frameInstances, { FrameInstance } from './frameInstances'
import viewInstances from './viewInstances'

function getFrames(): Record<string, Frame> {
  return store('main.frames')
}

export default class FrameManager {
  private frameInstances: Record<string, FrameInstance> = {}

  start() {
    store.observer(() => {
      const inFocus = store('main.focusedFrame')

      const frames = getFrames()

      this.manageFrames(frames, inFocus)
      this.manageViews(frames)
      // manageOverlays(frames)
    })
  }

  manageFrames(frames: Record<string, Frame>, inFocus: string) {
    const frameIds = Object.keys(frames)
    const instanceIds = Object.keys(this.frameInstances)

    // create an instance for each new frame in the store
    frameIds
      .filter((frameId) => !instanceIds.includes(frameId))
      .forEach((frameId) => {
        const frame = frames[frameId]
        if (!frame) return
        const frameInstance = frameInstances.create(frame)

        this.frameInstances[frameId] = frameInstance

        frameInstance.on('closed', () => {
          this.removeFrameInstance(frameId)
          requireStoreAction('removeFrame')(frameId)
        })

        frameInstance.on('maximize', () => {
          requireStoreAction('updateFrame')(frameId, { maximized: true })
        })

        frameInstance.on('unmaximize', () => {
          requireStoreAction('updateFrame')(frameId, { maximized: false })
        })

        frameInstance.on('enter-full-screen', () => {
          requireStoreAction('updateFrame')(frameId, { fullscreen: true })
        })

        frameInstance.on('leave-full-screen', () => {
          const platform = store('platform')
          // Handle broken linux window events
          if (platform !== 'win32' && platform !== 'darwin' && !frameInstance.isFullScreen()) {
            if (frameInstance.isMaximized()) {
              // Trigger views to reposition
              setTimeout(() => {
                const frame = getFrames()[frameId]
                if (frame?.currentView) viewInstances.position(frameInstance, frame.currentView)
              }, 100)
              requireStoreAction('updateFrame')(frameId, { maximized: true })
            } else {
              requireStoreAction('updateFrame')(frameId, { maximized: false })
            }
          } else {
            requireStoreAction('updateFrame')(frameId, { fullscreen: false })
          }
        })

        frameInstance.on('resize', () => {
          const currentView = getFrames()[frameId]?.currentView
          if (currentView) viewInstances.position(frameInstance, currentView)
        })

        frameInstance.on('focus', () => {
          // Give focus to current view
          const currentView = getFrames()[frameId]?.currentView
          const view = currentView ? frameInstance.views?.[currentView] : undefined
          view?.webContents.focus()
        })
      })

    // destroy each frame instance that is no longer in the store
    instanceIds
      .filter((instanceId) => !frameIds.includes(instanceId))
      .forEach((instanceId) => {
        const frameInstance = this.removeFrameInstance(instanceId)

        if (frameInstance) {
          frameInstance.destroy()
        }
      })

    if (inFocus) {
      const focusedFrame = this.frameInstances[inFocus]

      if (focusedFrame && !focusedFrame.isFocused()) {
        focusedFrame.show()
        focusedFrame.focus()
      }
    }
  }

  manageViews(frames: Record<string, Frame>) {
    const frameIds = Object.keys(frames)

    frameIds.forEach((frameId) => {
      const frameInstance = this.frameInstances[frameId]
      if (!frameInstance) return log.error('Instance not found when managing views')

      const frame = frames[frameId]
      if (!frame) return
      const frameInstanceViews = frameInstance.views || {}
      const frameViewIds = Object.keys(frame.views)
      const instanceViewIds = Object.keys(frameInstanceViews)

      instanceViewIds
        .filter((instanceViewId) => !frameViewIds.includes(instanceViewId))
        .forEach((instanceViewId) => viewInstances.destroy(frameInstance, instanceViewId))

      // For each view in the store that belongs to this frame
      frameViewIds.forEach((frameViewId) => {
        const viewData = frame.views[frameViewId]
        if (!viewData) return

        // Create them
        if (!instanceViewIds.includes(frameViewId)) viewInstances.create(frameInstance, viewData)
        const viewInstance = frameInstance.views?.[frameViewId]
        if (!viewInstance) return

        // Show the correct one
        if (
          frame.currentView === frameViewId &&
          viewData.ready &&
          frameInstance.showingView !== frameViewId
        ) {
          frameInstance.contentView.addChildView(viewInstance)
          frameInstance.showingView = frameViewId
          viewInstances.position(frameInstance, frameViewId)
          setTimeout(() => {
            if (frameInstance.isFocused()) viewInstance.webContents.focus()
          }, 100)
        } else if (frame.currentView !== frameViewId && frameInstance.showingView === frameViewId) {
          frameInstance.contentView.removeChildView(viewInstance)
          frameInstance.showingView = ''
        }
      })
    })
  }

  removeFrameInstance(frameId: string) {
    const frameInstance = this.frameInstances[frameId]
    if (!frameInstance) return

    Object.keys(frameInstance.views || {}).forEach((viewId) => {
      viewInstances.destroy(frameInstance, viewId)
    })

    delete this.frameInstances[frameId]

    if (frameInstance) {
      frameInstance.removeAllListeners('closed')
    }

    return frameInstance
  }

  private sendMessageToFrame(frameId: string, channel: string, ...args: unknown[]) {
    const frameInstance = this.frameInstances[frameId]

    if (frameInstance && !frameInstance.isDestroyed()) {
      const webContents = frameInstance.webContents
      webContents.send(channel, ...args)
    } else {
      log.error(
        new Error(
          `Tried to send a message to frame with id ${frameId} but it does not exist or has been destroyed`
        )
      )
    }
  }

  broadcast(channel: string, args: unknown[]) {
    Object.keys(this.frameInstances).forEach((id) => this.sendMessageToFrame(id, channel, ...args))
  }

  reloadFrames() {
    Object.keys(this.frameInstances).forEach((win) => {
      this.frameInstances[win]?.webContents.reload()
    })
  }

  refocus(id: string) {
    const frameInstance = this.frameInstances[id]
    if (frameInstance) {
      frameInstance.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      frameInstance.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      frameInstance.show()
      frameInstance.focus()
    }
  }

  isFrameShowing() {
    return Object.keys(this.frameInstances).some((win) => this.frameInstances[win]?.isVisible() || false)
  }
}
