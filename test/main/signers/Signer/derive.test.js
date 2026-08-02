import crypto from 'crypto'

import { Derivation, deriveHDAccounts, getDerivationPath } from '../../../../main/signers/Signer/derive'

const PUBLIC_KEY = '025a12d6cbcea3e8c6e6a5e2292db88d1b26c4b660f7dfcd052185711b5d0a28f0'
const CHAIN_CODE = '34e048e8ceb78ae0edebd325268e82f9ddbaf1303072ecd0a35beb54ac03d439'
const ADDRESS_HASH = 'eaebca3f7f72518cb25c480408ff28b2393518804e4211a0737a976c9bd82df4'

describe('#deriveHDAccounts', () => {
  it('preserves the complete hardware public-key derivation set', (done) => {
    deriveHDAccounts(PUBLIC_KEY, CHAIN_CODE, (error, addresses) => {
      try {
        expect(error).toBe(null)
        expect(addresses).toHaveLength(100)
        expect(crypto.createHash('sha256').update(addresses.join('\n')).digest('hex')).toBe(ADDRESS_HASH)
        expect([addresses[0], addresses[1], addresses[99]]).toEqual([
          '0x255482b10cea431d6aF9ea4fcD9E4de262E8c341',
          '0xf39f0372c01aD568076B748B74B96ef4225BDCa5',
          '0x25667784683b969153bcc39B3a8eCE83098cFA67'
        ])
        done()
      } catch (assertionError) {
        done(assertionError)
      }
    })
  })
})

describe('#getDerivationPath', () => {
  it('provides a legacy derivation path with no index', () => {
    const path = getDerivationPath(Derivation.legacy)

    expect(path).toBe("44'/60'/0'/")
  })

  it('provides a legacy derivation path with a non-zero index', () => {
    const path = getDerivationPath(Derivation.legacy, 3)

    expect(path).toBe("44'/60'/0'/3")
  })

  it('provides a legacy derivation path with a zero index', () => {
    const path = getDerivationPath(Derivation.legacy, 0)

    expect(path).toBe("44'/60'/0'/0")
  })

  it('provides a standard derivation path with no index', () => {
    const path = getDerivationPath(Derivation.standard)

    expect(path).toBe("44'/60'/0'/0/")
  })

  it('provides a standard derivation path with a non-zero index', () => {
    const path = getDerivationPath(Derivation.standard, 14)

    expect(path).toBe("44'/60'/0'/0/14")
  })

  it('provides a standard derivation path with a zero index', () => {
    const path = getDerivationPath(Derivation.standard, 0)

    expect(path).toBe("44'/60'/0'/0/0")
  })

  it('provides a testnet derivation path with no index', () => {
    const path = getDerivationPath(Derivation.testnet)

    expect(path).toBe("44'/1'/0'/0/")
  })

  it('provides a testnet derivation path with a non-zero index', () => {
    const path = getDerivationPath(Derivation.testnet, 9)

    expect(path).toBe("44'/1'/0'/0/9")
  })

  it('provides a testnet derivation path with a zero index', () => {
    const path = getDerivationPath(Derivation.testnet, 0)

    expect(path).toBe("44'/1'/0'/0/0")
  })

  it('provides a live derivation path with no index', () => {
    const path = getDerivationPath(Derivation.live)

    expect(path).toBe("44'/60'/'/0/0")
  })

  it('provides a live derivation path with a non-zero index', () => {
    const path = getDerivationPath(Derivation.live, 24)

    expect(path).toBe("44'/60'/24'/0/0")
  })

  it('provides a live derivation path with a zero index', () => {
    const path = getDerivationPath(Derivation.live, 0)

    expect(path).toBe("44'/60'/0'/0/0")
  })

  it('rejects an unsupported derivation path', () => {
    expect(() => getDerivationPath('unsupported')).toThrow(/unsupported derivation path/i)
  })
})
