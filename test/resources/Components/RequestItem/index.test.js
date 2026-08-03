import { screen, render } from '../../../componentSetup'
import link from '../../../../resources/link'
import RequestItem from '../../../../resources/Components/RequestItem'

jest.mock('../../../../resources/link', () => ({ send: jest.fn() }))
jest.mock('../../../../resources/Components/RingIcon', () => () => null)

const account = '0x0000000000000000000000000000000000000001'
const handlerId = '8073729a-5e59-53b7-9e69-5d9bcff94087'

beforeEach(() => {
  link.send.mockReset()
})

it('opens a request with a validated navigation breadcrumb', async () => {
  const { user } = render(
    <RequestItem
      account={account}
      color='var(--outerspace)'
      handlerId={handlerId}
      req={{ created: Date.now(), handlerId, status: 'pending', type: 'transaction' }}
      title='Base Sepolia Transaction'
    />
  )

  await user.click(screen.getByText('Base Sepolia Transaction').closest('.clusterValue'))

  expect(link.send).toHaveBeenCalledWith('nav:forward', 'panel', {
    view: 'requestView',
    data: { step: 'confirm', accountId: account, requestId: handlerId }
  })
})
