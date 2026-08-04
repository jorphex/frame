import Restore from 'react-restore'

import { Command } from '../../../../app/dash/Command'
import link from '../../../../resources/link'
import { fireEvent, render, screen } from '../../../componentSetup'

jest.mock('../../../../resources/link', () => ({ send: jest.fn() }))

const renderCommand = (nav) => {
  const store = Restore.create({ windows: { dash: { nav } } }, {})
  const ConnectedCommand = Restore.connect(Command, store)
  return render(<ConnectedCommand />)
}

it('uses the Contacts title and routes Back and Close actions', () => {
  renderCommand([{ view: 'addressBook', data: {} }])

  expect(screen.getByText('Contacts')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))

  expect(link.send.mock.calls).toEqual([
    ['tray:action', 'backDash'],
    ['tray:action', 'closeDash']
  ])
})

it('hides Back at the dashboard root while retaining Close', () => {
  renderCommand([])

  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
})
