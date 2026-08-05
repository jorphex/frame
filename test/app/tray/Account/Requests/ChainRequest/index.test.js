import { screen, render } from '../../../../../componentSetup'
import { ChainRequest } from '../../../../../../app/tray/Account/Requests/ChainRequest'

it('identifies the origin and chain being added', () => {
  render(
    <ChainRequest
      originName='example.test'
      req={{
        handlerId: 'add-request',
        type: 'addChain',
        chain: { type: 'ethereum', id: 10, name: 'Optimism' }
      }}
    />
  )

  expect(screen.getByText('example.test')).toBeTruthy()
  expect(screen.getByText('wants to add chain')).toBeTruthy()
  expect(screen.getByText('Optimism')).toBeTruthy()
})
