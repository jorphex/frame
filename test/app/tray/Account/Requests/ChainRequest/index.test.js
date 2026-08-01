import { screen, render } from '../../../../../componentSetup'
import { ChainRequest } from '../../../../../../app/tray/Account/Requests/ChainRequest'

it('identifies the origin and exact source and destination chains', () => {
  render(
    <ChainRequest
      originName='example.test'
      chainData={{ sourceChainName: 'Ethereum', destinationChainName: 'Optimism' }}
      req={{
        handlerId: 'switch-request',
        type: 'switchChain',
        sourceChainId: 1,
        chain: { type: 'ethereum', id: 10 }
      }}
    />
  )

  expect(screen.getByText('example.test')).toBeTruthy()
  expect(screen.getByText('wants to switch chains')).toBeTruthy()
  expect(screen.getByText('Ethereum (1) to Optimism (10)')).toBeTruthy()
})
