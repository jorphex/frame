import { URL } from 'url'
import log from 'electron-log'

import { FrameInstance } from './frameInstances'
import store from '../../store'
import { requireStoreAction } from '../../store/action'
import server from '../../dapps/server'
import { createViewInstance } from '../window'

interface Extract {
  session: string
  ens: string
}

const extract = (l: string): Extract => {
  const url = new URL(l)
  const session = url.searchParams.get('session') || ''
  const ens = url.port === '8421' ? url.hostname.replace('.localhost', '') || '' : ''
  return { session, ens }
}

export const embeddedDappOrigin = (ens: string) => `http://${ens}.localhost:8421`

export default {
  // Create a view instance on a frame
  create: (frameInstance: FrameInstance, view: ViewMetadata) => {
    const { frameId } = frameInstance
    if (!frameId) throw new Error('Frame instance has no state id')
    const frame = store('main.frames', frameId)
    if (!frame) throw new Error(`Frame ${frameId} is unavailable while creating a view`)

    const viewInstance = createViewInstance(view.ens)
    const { session } = extract(view.url)

    viewInstance.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
      if (!details || !details.frame) return cb({ cancel: true }) // Reject the request\

      const appUrl = details.frame.url

      if (
        // Initial request for app
        details.resourceType === 'mainFrame' &&
        details.url === view.url &&
        !appUrl
      ) {
        return cb({ requestHeaders: details.requestHeaders }) // Leave untouched
      } else if (
        // devtools:// request
        details.url.startsWith('devtools://')
      ) {
        return cb({ requestHeaders: details.requestHeaders }) // Leave untouched
      } else if (
        // Reqest from app
        appUrl === view.url
      ) {
        const { ens, session } = extract(appUrl)
        if (ens !== view.ens || !server.sessions.verify(ens, session)) {
          return cb({ cancel: true })
        } else {
          details.requestHeaders['Origin'] = embeddedDappOrigin(view.ens)
          return cb({ requestHeaders: details.requestHeaders })
        }
      } else {
        return cb({ cancel: true }) // Reject the request
      }
    })

    const fullscreen = !!frame.fullscreen

    const { width, height } = frameInstance.getBounds()

    frameInstance.contentView.addChildView(viewInstance)

    const dappBackground = store('main.dapps', view.dappId, 'colors', 'background')
    if (dappBackground) frameInstance.setBackgroundColor(dappBackground)

    viewInstance.setBounds({
      x: 0,
      y: fullscreen ? 0 : 32,
      width: width,
      height: fullscreen ? height : height - 32
    })

    viewInstance.webContents.setVisualZoomLevelLimits(1, 3)

    frameInstance.contentView.removeChildView(viewInstance)

    // viewInstance.webContents.openDevTools({ mode: 'detach' })

    viewInstance.webContents.session.cookies
      .set({
        url: view.url,
        name: '__frameSession',
        value: session
      })
      .then(
        () => {
          viewInstance.webContents.loadURL(view.url)
        },
        (error) => log.error(error)
      )

    viewInstance.webContents.on('did-finish-load', () => {
      requireStoreAction('updateFrameView')(frameId, view.id, { ready: true })
    })

    // Keep reference to view on frame instance
    frameInstance.views = { ...(frameInstance.views || {}), [view.id]: viewInstance }
  },
  // Destroy a view instance on a frame
  destroy: (frameInstance: FrameInstance, viewId: string) => {
    const views = frameInstance.views || {}
    const { frameId } = frameInstance

    const viewMetadata = frameId ? store('main.frames', frameId, 'views', viewId) : undefined
    if (viewMetadata) {
      const { ens, session } = extract(viewMetadata.url)
      server.sessions.remove(ens, session)
    }

    const view = views[viewId]
    if (!view) return

    if (frameInstance && !frameInstance.isDestroyed()) {
      frameInstance.contentView.removeChildView(view)
    }

    view.webContents.close({ waitForBeforeUnload: false })

    delete views[viewId]
  },
  position: (frameInstance: FrameInstance, viewId: string) => {
    const { frameId } = frameInstance
    if (!frameId) return
    const frame = store('main.frames', frameId)
    if (!frame) return
    const fullscreen = !!frame.fullscreen
    const viewInstance = (frameInstance.views || {})[viewId]
    if (viewInstance) {
      const { width, height } = frameInstance.getBounds()
      viewInstance.setBounds({
        x: 0,
        y: fullscreen ? 0 : 32,
        width: width,
        height: fullscreen ? height : height - 32
      })
      // viewInstance.setBounds({ x: 73, y: 16, width: width - 73, height: height - 16 })
    }
  }
}
