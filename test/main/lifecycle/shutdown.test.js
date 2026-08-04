import { EventEmitter } from 'events'

import { installShutdownHandlers } from '../../../main/lifecycle/shutdown'

class TestApplication extends EventEmitter {
  quit = jest.fn()
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('installShutdownHandlers', () => {
  it('holds before-quit until resources close and only closes once', async () => {
    const app = new TestApplication()
    const event = { preventDefault: jest.fn() }
    let finishClose
    const close = jest.fn(
      () =>
        new Promise((resolve) => {
          finishClose = resolve
        })
    )
    const reportError = jest.fn()

    installShutdownHandlers(app, close, reportError)
    app.emit('before-quit', event)
    app.emit('before-quit', event)
    app.emit('quit')

    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledTimes(1)
    expect(app.quit).not.toHaveBeenCalled()

    finishClose()
    await flushPromises()

    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('retains quit as a fallback when before-quit is not emitted', async () => {
    const app = new TestApplication()
    const close = jest.fn()
    const reportError = jest.fn()

    installShutdownHandlers(app, close, reportError)
    app.emit('quit')
    await flushPromises()

    expect(close).toHaveBeenCalledTimes(1)
    expect(app.quit).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('reports shutdown errors and still resumes quitting', async () => {
    const app = new TestApplication()
    const event = { preventDefault: jest.fn() }
    const error = new Error('close failed')
    const close = jest.fn().mockRejectedValue(error)
    const reportError = jest.fn()

    installShutdownHandlers(app, close, reportError)
    app.emit('before-quit', event)
    await flushPromises()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith(error)
    expect(app.quit).toHaveBeenCalledTimes(1)
  })
})
