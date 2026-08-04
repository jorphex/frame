import React from 'react'

import { RequestCommand } from '../../../../../app/tray/Footer/RequestCommand'
import { Time } from '../../../../../app/tray/Footer/Time'
import { render } from '../../../../componentSetup'

it('cancels delayed request state updates when unmounted', () => {
  const command = new RequestCommand({ signingDelay: 1500 })
  command.setState = jest.fn()
  command.scheduleTimer('txHashCopiedTimer', () => command.setState({ txHashCopied: false }), 3000)
  command.scheduleTimer('signerLockedTimer', () => command.setState({ signerLocked: false }), 3000)

  command.componentWillUnmount()
  jest.runOnlyPendingTimers()

  expect(command.setState).not.toHaveBeenCalled()
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
