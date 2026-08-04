import Restore from 'react-restore'

import { SettingsPreview } from '../../../../../app/tray/Account/Settings/SettingsPreview'
import { SettingsExpanded } from '../../../../../app/tray/Account/Settings/SettingsExpanded'
import link from '../../../../../resources/link'
import { fireEvent, render, screen } from '../../../../componentSetup'

jest.mock('../../../../../resources/link', () => ({ rpc: jest.fn(), send: jest.fn() }))

const account = '0x0000000000000000000000000000000000000001'

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  }
})

afterAll(() => {
  delete global.ResizeObserver
})

const renderWithStore = (Component, props = {}) => {
  const store = Restore.create({ main: { accounts: { [account]: { name: 'Primary' } } } }, {})
  class TestComponent extends Component {
    constructor(componentProps) {
      super(componentProps, { store })
      this.store = store
    }
  }
  return render(<TestComponent account={account} moduleId='settings' {...props} />)
}

it('saves a normalized account name only after editing completes', () => {
  renderWithStore(SettingsPreview)
  fireEvent.click(screen.getByText('more'))
  fireEvent.click(screen.getByText('Update Name'))

  const input = screen.getByDisplayValue('Primary')
  fireEvent.change(input, { target: { value: ' Treasury ' } })
  expect(link.send).not.toHaveBeenCalledWith('tray:renameAccount', expect.anything(), expect.anything())
  fireEvent.blur(input)

  expect(link.send).toHaveBeenCalledWith('tray:renameAccount', account, 'Treasury')
})

it('restores the persisted name instead of submitting an empty name', () => {
  renderWithStore(SettingsExpanded, { expanded: true })
  const input = screen.getByDisplayValue('Primary')

  fireEvent.change(input, { target: { value: '   ' } })
  fireEvent.blur(input)

  expect(link.send).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('Primary')).toBeTruthy()
})

it('requires a second action before removing an account', () => {
  renderWithStore(SettingsPreview)
  fireEvent.click(screen.getByText('more'))

  fireEvent.click(screen.getByText('Remove Account'))
  expect(link.rpc).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Confirm Remove'))

  expect(link.rpc).toHaveBeenCalledWith('removeAccount', account, {}, expect.any(Function))
})
