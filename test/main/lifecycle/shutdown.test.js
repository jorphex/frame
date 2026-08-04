import { EventEmitter } from 'events'

import { installShutdownHandlers } from '../../../main/lifecycle/shutdown'

describe('installShutdownHandlers', () => {
  it('closes resources during before-quit and only once', () => {
    const app = new EventEmitter()
    const close = jest.fn()

    installShutdownHandlers(app, close)
    app.emit('before-quit')
    app.emit('quit')

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('retains quit as a fallback when before-quit is not emitted', () => {
    const app = new EventEmitter()
    const close = jest.fn()

    installShutdownHandlers(app, close)
    app.emit('quit')

    expect(close).toHaveBeenCalledTimes(1)
  })
})
