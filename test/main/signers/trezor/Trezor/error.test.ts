import { Derivation } from '../../../../../main/signers/Signer/derive'
import { getTransactionErrorMessage } from '../../../../../main/signers/trezor/Trezor'

it('explains strict safety rejection without telling users to disable protection', () => {
  const message = getTransactionErrorMessage(
    new Error('Forbidden key path requested by host'),
    Derivation.standard
  )

  expect(message).toBe(
    'Trezor strict safety checks rejected the standard derivation path for this chain. The request was not signed. Use an account derived for this network, or choose Prompt safety checks in Trezor Suite only if you understand the mismatched coin-key risk.'
  )
  expect(message).not.toMatch(/turn off|disable/i)
})

it('preserves unrelated Trezor transaction errors', () => {
  expect(getTransactionErrorMessage(new Error('Device disconnected'), Derivation.standard)).toBe(
    'Device disconnected'
  )
})
