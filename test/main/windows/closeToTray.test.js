import { EventEmitter } from 'events'

import { installCloseToTray } from '../../../main/windows/closeToTray'

const setup = () => {
  const app = new EventEmitter()
  const window = new EventEmitter()
  const hide = jest.fn()

  installCloseToTray(app, window, hide)

  return { app, hide, window }
}

describe('installCloseToTray', () => {
  it('prevents a normal close and hides Frame instead', () => {
    const { hide, window } = setup()
    const event = { preventDefault: jest.fn() }

    window.emit('close', event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('allows windows to close while the application is quitting', () => {
    const { app, hide, window } = setup()
    const event = { preventDefault: jest.fn() }

    app.emit('before-quit')
    window.emit('close', event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(hide).not.toHaveBeenCalled()
  })

  it('removes lifecycle listeners after the window closes', () => {
    const { app, window } = setup()

    window.emit('closed')

    expect(app.listenerCount('before-quit')).toBe(0)
    expect(window.listenerCount('close')).toBe(0)
  })
})
