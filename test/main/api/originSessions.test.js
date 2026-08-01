import { OriginSessionMonitor } from '../../../main/api/originSessions'

jest.mock('../../../main/store')

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it('shares and extends one expiry timer for an origin', () => {
  const endSession = jest.fn()
  const sessions = new OriginSessionMonitor(endSession, 1000)

  sessions.extend('origin-1')
  jest.advanceTimersByTime(900)
  sessions.extend('origin-1')
  jest.advanceTimersByTime(900)

  expect(endSession).not.toHaveBeenCalled()
  jest.advanceTimersByTime(100)
  expect(endSession).toHaveBeenCalledTimes(1)
  expect(endSession).toHaveBeenCalledWith('origin-1')
})

it('tracks different origins independently and can clear pending timers', () => {
  const endSession = jest.fn()
  const sessions = new OriginSessionMonitor(endSession, 1000)

  sessions.extend('origin-1')
  sessions.extend('origin-2')
  sessions.clear()
  jest.runOnlyPendingTimers()

  expect(endSession).not.toHaveBeenCalled()
})

it('ignores an empty origin id', () => {
  const endSession = jest.fn()
  const sessions = new OriginSessionMonitor(endSession, 1000)

  sessions.extend('')
  jest.runOnlyPendingTimers()

  expect(endSession).not.toHaveBeenCalled()
})
