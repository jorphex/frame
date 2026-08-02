import { MessageTypeProperty } from '@metamask/eth-sig-util'

interface LabelledSignatureType {
  primaryType: string
  domainFilter: MessageTypeProperty[]
  types: { [key: string]: MessageTypeProperty[] }
}

const eip2612Permit: LabelledSignatureType = {
  primaryType: 'Permit',
  types: {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  },
  domainFilter: [
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' }
  ]
}

const signatureTypes: { [key: string]: LabelledSignatureType } = {
  signErc20Permit: eip2612Permit
}

export default signatureTypes
