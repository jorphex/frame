import { screen, render } from '../../../../../componentSetup'
import SignPermitRequest from '../../../../../../app/tray/Account/Requests/SignPermitRequest'

jest.mock(
  '../../../../../../resources/Components/RingIcon',
  () =>
    function RingIconMock() {
      return <div />
    }
)

const typedData = {
  types: {
    EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  },
  primaryType: 'Permit',
  domain: { chainId: 1 },
  message: {
    owner: '0x0000000000000000000000000000000000000001',
    spender: '0x0000000000000000000000000000000000000002',
    value: '1',
    nonce: '0',
    deadline: '2000000000'
  }
}

const req = {
  type: 'signErc20Permit',
  status: 'pending',
  handlerId: 'permit-request',
  context: { requestChainId: 5, domainChainId: '1', risks: ['domain-chain-mismatch'] },
  typedMessage: { data: typedData, version: 'V4' },
  permit: {
    spender: {
      address: typedData.message.spender,
      ens: '',
      type: 'external'
    },
    value: typedData.message.value,
    deadline: typedData.message.deadline
  },
  tokenData: { symbol: 'TEST', decimals: 18 }
}

const chainData = {
  chainName: 'Ethereum',
  requestChainName: 'Goerli',
  chainColor: 'good'
}

it('shows domain mismatch warnings in the specialized permit overview', () => {
  render(<SignPermitRequest chainData={chainData} originName='example.test' req={req} />)

  expect(screen.getByRole('alert').textContent).toBe('Domain chain 1 does not match request chain 5.')
})

it('labels the raw permit view with the resolved request chain', () => {
  render(<SignPermitRequest chainData={chainData} originName='example.test' req={req} step='viewRaw' />)

  expect(screen.getByText('Goerli (5)')).toBeTruthy()
  expect(screen.getByText('Type Definitions')).toBeTruthy()
})
