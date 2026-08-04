interface QuitEvent {
  preventDefault(): void
}

interface ApplicationLifecycleEvents {
  on(event: 'before-quit', listener: (event: QuitEvent) => void): unknown
  on(event: 'quit', listener: () => void): unknown
  quit(): void
}

type CloseResources = () => void | Promise<void>
type ReportShutdownError = (error: unknown) => void

export function installShutdownHandlers(
  app: ApplicationLifecycleEvents,
  close: CloseResources,
  reportError: ReportShutdownError
) {
  let closePromise: Promise<void> | undefined
  let readyToQuit = false

  const closeOnce = (resumeQuit: boolean) => {
    if (closePromise || readyToQuit) return

    closePromise = (async () => {
      try {
        await close()
      } catch (error) {
        reportError(error)
      } finally {
        readyToQuit = true
        if (resumeQuit) app.quit()
      }
    })()
  }

  app.on('before-quit', (event) => {
    if (readyToQuit) return

    // Hold Electron open until native signer transports release their devices.
    event.preventDefault()
    closeOnce(true)
  })

  // Retain a best-effort fallback for hosts that do not emit before-quit.
  app.on('quit', () => closeOnce(false))
}
