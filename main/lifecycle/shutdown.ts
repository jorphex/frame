interface ApplicationLifecycleEvents {
  on(event: 'before-quit' | 'quit', listener: () => void): unknown
}

export function installShutdownHandlers(app: ApplicationLifecycleEvents, close: () => void) {
  let closed = false

  const closeOnce = () => {
    if (closed) return

    closed = true
    close()
  }

  // USB transports must close before Electron starts tearing down Chromium.
  app.on('before-quit', closeOnce)
  app.on('quit', closeOnce)
}
