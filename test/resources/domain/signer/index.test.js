import {
  getAccountSignerType,
  isHardwareSigner,
  isWatchOnlyAccountType
} from '../../../../resources/domain/signer'

describe('watch-only account types', () => {
  it.each([
    ['address', 'address'],
    ['Address', 'address'],
    ['ledger', 'ledger'],
    ['TREZOR', 'trezor']
  ])('normalizes %s to %s', (input, expected) => {
    expect(getAccountSignerType(input)).toBe(expected)
  })

  it.each([undefined, null, '', 'future-signer'])('fails closed for %p', (input) => {
    expect(getAccountSignerType(input)).toBe('address')
    expect(isWatchOnlyAccountType(input)).toBe(true)
  })

  it('does not classify real signer types as watch-only', () => {
    expect(isWatchOnlyAccountType('seed')).toBe(false)
    expect(isWatchOnlyAccountType('ledger')).toBe(false)
  })
})

describe('#isHardwareSigner', () => {
  const hardwareSigners = ['lattice', 'trezor', 'ledger']

  hardwareSigners.forEach((signerType) => {
    it(`considers a string type of ${signerType} to be a hardware signer`, () => {
      expect(isHardwareSigner(signerType)).toBe(true)
    })
  })

  it('determines the hardware type of a signer object', () => {
    const signer = { type: 'ledger' }
    expect(isHardwareSigner(signer)).toBe(true)
  })

  it('handles signer types regardless of case', () => {
    expect(isHardwareSigner('tReZoR')).toBe(true)
  })

  it('does not consider an unexpected type to be a hardware signer', () => {
    expect(isHardwareSigner('seed')).toBe(false)
  })
})
