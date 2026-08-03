import Restore from 'react-restore'

import store from '../../../../../../main/store'
import { screen, render } from '../../../../../componentSetup'
import { SignTypedDataRequest as SignTypedDataRequestComponent } from '../../../../../../app/tray/Account/Requests/SignTypedDataRequest'

jest.mock('../../../../../../main/store/persist')

const SignTypedDataRequest = Restore.connect(SignTypedDataRequestComponent, store)

const req = {
  type: 'signTypedData',
  handlerId: 'typed-data-request',
  origin: 'origin-id',
  context: { requestChainId: 1, domainChainId: '1', risks: [] },
  typedMessage: {
    version: 'V4',
    data: {
      types: {
        EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
        Qualification: [{ name: 'statement', type: 'string' }]
      },
      primaryType: 'Qualification',
      domain: { chainId: 1 },
      message: { statement: 'Review this exact field.' }
    }
  }
}

it('warns before approval when the selected device displays only typed-data hashes', () => {
  render(
    <SignTypedDataRequest
      req={req}
      signer={{
        model: 'Trezor One',
        signingCapabilities: { typedDataHashOnly: true }
      }}
    />
  )

  expect(screen.getByText('"Review this exact field."')).toBeTruthy()
  expect(screen.getByLabelText('Device signing warning').textContent).toMatch(
    /Trezor One will display only the EIP-712 domain and message hashes/
  )
})

it('does not show a hash-only warning for a signer without that capability', () => {
  render(
    <SignTypedDataRequest
      req={req}
      signer={{
        model: 'Trezor Safe 7',
        signingCapabilities: { typedDataHashOnly: false }
      }}
    />
  )

  expect(screen.queryByLabelText('Device signing warning')).toBeNull()
})
