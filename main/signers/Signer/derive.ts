import { HDKey } from '@scure/bip32'

import { publicToAddress, toChecksumAddress } from '@ethereumjs/util'

export enum Derivation {
  live = 'live',
  legacy = 'legacy',
  standard = 'standard',
  testnet = 'testnet'
}

export function deriveHDAccounts(publicKey: string, chainCode: string, cb: Callback<string[]>) {
  try {
    const hdk = new HDKey({
      publicKey: Buffer.from(publicKey, 'hex'),
      chainCode: Buffer.from(chainCode, 'hex')
    })
    const derive = (index: number) => {
      const derivedKey = hdk.derive(`m/${index}`)
      if (!derivedKey.publicKey) throw new Error(`Unable to derive public key at index ${index}`)
      const address = publicToAddress(Buffer.from(derivedKey.publicKey), true)
      return toChecksumAddress(`0x${address.toString('hex')}`)
    }
    const accounts = []
    for (let i = 0; i < 100; i++) {
      accounts[i] = derive(i)
    }

    cb(null, accounts)
  } catch (e) {
    cb(e as Error, undefined)
  }
}

const derivationPaths: { [key: string]: string } = {
  [Derivation.legacy.valueOf()]: "44'/60'/0'/<index>",
  [Derivation.standard.valueOf()]: "44'/60'/0'/0/<index>",
  [Derivation.testnet.valueOf()]: "44'/1'/0'/0/<index>",
  [Derivation.live.valueOf()]: "44'/60'/<index>'/0/0"
}

export function getDerivationPath(derivation: Derivation, index = -1) {
  const path = derivationPaths[derivation.valueOf()]
  if (!path) throw new Error(`Unsupported derivation path: ${derivation}`)

  return path.replace('<index>', (index > -1 ? index : '').toString())
}
