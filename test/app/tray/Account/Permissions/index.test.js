import Restore from 'react-restore'

import { DappsPermissionsPreview } from '../../../../../app/tray/Account/Permissions/DappsPreview'
import { DappsPermissionsExpanded } from '../../../../../app/tray/Account/Permissions/DappsExpanded'
import link from '../../../../../resources/link'
import { fireEvent, render, screen } from '../../../../componentSetup'

jest.mock('../../../../../resources/link', () => ({ send: jest.fn() }))

const account = '0x0000000000000000000000000000000000000001'
const permissions = {
  second: { origin: 'zeta.example', provider: true },
  first: { origin: 'alpha.example', provider: false }
}

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
  const store = Restore.create({ main: { permissions: { [account]: permissions } } }, {})
  class TestComponent extends Component {
    constructor(componentProps) {
      super(componentProps)
      this.store = store
    }
  }
  return render(<TestComponent account={account} moduleId='permissions' {...props} />)
}

it('sorts permission rows by their displayed origin and toggles the selected permission', () => {
  renderWithStore(DappsPermissionsPreview)

  expect(screen.getAllByText(/\.example$/).map((node) => node.textContent)).toEqual([
    'alpha.example',
    'zeta.example'
  ])
  fireEvent.click(screen.getByText('alpha.example').parentElement.querySelector('.signerPermissionToggle'))
  expect(link.send).toHaveBeenCalledWith('tray:action', 'toggleAccess', account, 'first')
})

it('applies the account filter in the expanded permission view', () => {
  renderWithStore(DappsPermissionsExpanded, { expanded: true, filter: 'zeta' })

  expect(screen.queryByText('alpha.example')).toBeNull()
  expect(screen.getByText('zeta.example')).toBeTruthy()
})
