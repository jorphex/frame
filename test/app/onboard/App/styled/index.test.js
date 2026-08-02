import { render, screen } from '../../../../componentSetup'
import { SlideItem } from '../../../../../app/onboard/App/styled'

it('renders slide items as column flex containers', () => {
  render(<SlideItem data-testid='slide-item' />)

  const style = window.getComputedStyle(screen.getByTestId('slide-item'))
  expect(style.display).toBe('flex')
  expect(style.flexDirection).toBe('column')
})
