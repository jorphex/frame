import Recipient from '../../../../../../../app/tray/Account/Requests/TransactionRequest/TxAction/recipient'
import { fireEvent, render, screen } from '../../../../../../componentSetup'

it('keeps copy feedback local and clears its timer on unmount', () => {
  const address = '0x0000000000000000000000000000000000000001'
  const copyAddress = jest.fn()
  const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
  const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
  const view = render(<Recipient address={address} copyAddress={copyAddress} />)

  fireEvent.click(screen.getByText(address))

  const timerIndex = setTimeoutSpy.mock.calls.findLastIndex(([, delay]) => delay === 1000)
  const copyTimer = setTimeoutSpy.mock.results[timerIndex].value
  expect(copyAddress).toHaveBeenCalledWith(address)
  expect(screen.getByText('Address Copied')).toBeTruthy()

  view.unmount()
  expect(clearTimeoutSpy).toHaveBeenCalledWith(copyTimer)
  setTimeoutSpy.mockRestore()
  clearTimeoutSpy.mockRestore()
})
