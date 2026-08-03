import type { App, BrowserWindow, Event } from 'electron'

export function installCloseToTray(app: App, window: BrowserWindow, hide: () => void) {
  let quitting = false

  const allowClose = () => {
    quitting = true
  }
  const handleClose = (event: Event) => {
    if (quitting) return

    event.preventDefault()
    hide()
  }
  const cleanup = () => {
    app.off('before-quit', allowClose)
    window.off('close', handleClose)
  }

  app.once('before-quit', allowClose)
  window.on('close', handleClose)
  window.once('closed', cleanup)
}
