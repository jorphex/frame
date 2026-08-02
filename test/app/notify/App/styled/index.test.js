import { render, screen } from '../../../../componentSetup'
import { Item, PylonConfirmButtonSub } from '../../../../../app/notify/App/styled'

it('renders notification items as column flex containers', () => {
  render(<Item data-testid='notification-item' />)

  const style = window.getComputedStyle(screen.getByTestId('notification-item'))
  expect(style.display).toBe('flex')
  expect(style.flexDirection).toBe('column')
})

it('preserves base styles when extending a styled component', () => {
  render(<PylonConfirmButtonSub role='button'>confirm</PylonConfirmButtonSub>)

  const style = window.getComputedStyle(screen.getByRole('button', { name: 'confirm' }))
  expect(style.display).toBe('flex')
  expect(style.cursor).toBe('pointer')
  expect(style.width).toBe('180px')
  expect(style.height).toBe('30px')
  expect(style.fontSize).toBe('10px')
})
