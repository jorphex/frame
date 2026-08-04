import Dropdown from '../../../../resources/Components/Dropdown'
import { render, screen } from '../../../componentSetup'

const options = [
  { text: 'Dark', value: 'dark' },
  { text: 'Light', value: 'light' }
]

it('selects the first option with a numeric list offset', () => {
  render(<Dropdown options={options} syncValue='dark' onChange={jest.fn()} />)

  expect(screen.getByRole('option', { name: 'Dark' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getByRole('listbox').style.marginTop).toBe('0px')
})

it('tracks a changed synchronized value without emitting a user change', () => {
  const onChange = jest.fn()
  const { rerender } = render(<Dropdown options={options} syncValue='dark' onChange={onChange} />)

  rerender(<Dropdown options={options} syncValue='light' onChange={onChange} />)

  expect(screen.getByRole('option', { name: 'Light' }).getAttribute('aria-selected')).toBe('true')
  expect(onChange).not.toHaveBeenCalled()
})

it('emits a newly selected value once', async () => {
  const onChange = jest.fn()
  const { user } = render(<Dropdown options={options} syncValue='dark' onChange={onChange} />)

  await user.click(screen.getByRole('option', { name: 'Light' }))

  expect(onChange).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenCalledWith('light')
})
