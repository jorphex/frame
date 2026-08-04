import React from 'react'

import { RequestCommand } from '../../../../../app/tray/Footer/RequestCommand'
import { Time } from '../../../../../app/tray/Footer/Time'
import { render } from '../../../../componentSetup'

const request = {
  account: '0x0000000000000000000000000000000000000001',
  handlerId: '22222222-2222-4222-8222-222222222222'
}

const commandWithStore = () => {
  const command = new RequestCommand({ signingDelay: 1500 })
  command.setState = jest.fn()
  command.store = { notify: jest.fn() }
  return command
}

it('cancels delayed request state updates when unmounted', () => {
  const command = new RequestCommand({ signingDelay: 1500 })
  command.setState = jest.fn()
  command.scheduleTimer('txHashCopiedTimer', () => command.setState({ txHashCopied: false }), 3000)
  command.scheduleTimer('signerLockedTimer', () => command.setState({ signerLocked: false }), 3000)

  command.componentWillUnmount()
  jest.runOnlyPendingTimers()

  expect(command.setState).not.toHaveBeenCalled()
})

it('fails closed when signer compatibility cannot be determined', () => {
  const command = commandWithStore()

  expect(command.handleSignerCompatibilityFailure('Unexpected signer failure', undefined, request)).toBe(true)
  expect(command.store.notify).toHaveBeenCalledWith('signerUnavailableWarning', { req: request })
  command.componentWillUnmount()
})

it('preserves specific missing and locked signer handling', () => {
  const missing = commandWithStore()
  expect(missing.handleSignerCompatibilityFailure('No signer', undefined, request)).toBe(true)
  expect(missing.store.notify).toHaveBeenCalledWith('noSignerWarning', { req: request })
  missing.componentWillUnmount()

  const locked = commandWithStore()
  expect(locked.handleSignerCompatibilityFailure('Signer unavailable', undefined, request)).toBe(true)
  expect(locked.setState).toHaveBeenCalledWith({ signerLocked: true })
  expect(locked.store.notify).not.toHaveBeenCalled()
  locked.componentWillUnmount()
})

it('continues only with a valid compatibility result', () => {
  const command = commandWithStore()
  expect(
    command.handleSignerCompatibilityFailure(
      null,
      { compatible: true, signer: 'ring', tx: 'london' },
      request
    )
  ).toBe(false)
  expect(command.store.notify).not.toHaveBeenCalled()
  command.componentWillUnmount()
})

it('stops the completed-transaction clock when unmounted', () => {
  const ref = React.createRef()
  const clearIntervalSpy = jest.spyOn(global, 'clearInterval')
  const view = render(<Time ref={ref} time={Date.now()} />)
  const clock = ref.current.clock

  view.unmount()
  expect(clearIntervalSpy).toHaveBeenCalledWith(clock)
  clearIntervalSpy.mockRestore()
})
