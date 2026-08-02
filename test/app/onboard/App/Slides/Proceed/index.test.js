import { render, screen } from '../../../../../componentSetup'
import Proceed from '../../../../../../app/onboard/App/Slides/Proceed'

it('completes when the user clicks close', async () => {
  const onComplete = jest.fn()
  const { user } = render(
    <Proceed
      slide={7}
      proceed={{ action: 'complete', text: 'Done' }}
      nextSlide={() => {}}
      prevSlide={() => {}}
      onComplete={onComplete}
    />
  )

  await user.click(screen.getByRole('button', { name: 'Done' }))

  expect(onComplete).toHaveBeenCalled()

  const style = window.getComputedStyle(screen.getByRole('button', { name: 'Done' }))
  expect(style.display).toBe('flex')
  expect(style.width).toBe('180px')
  expect(style.height).toBe('48px')
  expect(style.borderRadius).toBe('24px')
})
