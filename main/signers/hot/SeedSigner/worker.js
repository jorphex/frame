const { HDKey } = require('@scure/bip32')
const { computeAddress, hexlify } = require('ethers')
const HotSignerWorker = require('../HotSigner/worker')
const { decryptSecret } = require('../crypto')

class SeedSignerWorker extends HotSignerWorker {
  constructor() {
    super()
    this.seed = null
    process.on('message', (message) => this.handleMessage(message))
  }

  unlock({ encryptedSeed, password, addresses }, pseudoCallback) {
    try {
      const { plaintext, version } = decryptSecret(encryptedSeed, password)
      if (!/^[0-9a-f]{128}$/i.test(plaintext)) throw new Error('Invalid seed')

      if (!Array.isArray(addresses) || addresses.length !== 100) throw new Error('Invalid seed addresses')
      const wallet = HDKey.fromMasterSeed(Buffer.from(plaintext, 'hex'))
      const addressesMatch = addresses.every((address, index) => {
        const publicKey = wallet.derive(`m/44'/60'/0'/0/${index}`).publicKey
        return (
          publicKey &&
          typeof address === 'string' &&
          computeAddress(hexlify(publicKey)).toLowerCase() === address.toLowerCase()
        )
      })
      if (!addressesMatch) throw new Error('Seed does not match addresses')

      this.seed = plaintext
      const result = version === 1 ? { encryptedSeed: this._encrypt(plaintext, password) } : undefined
      pseudoCallback(null, result)
    } catch (e) {
      pseudoCallback('Invalid password')
    }
  }

  lock(_, pseudoCallback) {
    this.seed = null
    pseudoCallback(null)
  }

  encryptSeed({ seed, password }, pseudoCallback) {
    try {
      const plaintext = seed.toString('hex')
      if (!/^[0-9a-f]{128}$/i.test(plaintext)) throw new Error('Invalid seed')
      pseudoCallback(null, this._encrypt(plaintext, password))
    } catch (e) {
      pseudoCallback('Unable to encrypt seed')
    }
  }

  signMessage({ index, message }, pseudoCallback) {
    // Make sure signer is unlocked
    if (!this.seed) return pseudoCallback('Signer locked')
    // Derive private key
    const key = this._derivePrivateKey(index)
    // Sign message
    super.signMessage(key, message, pseudoCallback)
  }

  signTypedData({ index, typedMessage }, pseudoCallback) {
    // Make sure signer is unlocked
    if (!this.seed) return pseudoCallback('Signer locked')
    // Derive private key
    const key = this._derivePrivateKey(index)
    // Sign message
    super.signTypedData(key, typedMessage, pseudoCallback)
  }

  signTransaction({ index, rawTx }, pseudoCallback) {
    // Make sure signer is unlocked
    if (!this.seed) return pseudoCallback('Signer locked')
    // Derive private key
    const key = this._derivePrivateKey(index)
    // Sign transaction
    super.signTransaction(key, rawTx, pseudoCallback)
  }

  _derivePrivateKey(index) {
    let key = HDKey.fromMasterSeed(Buffer.from(this.seed, 'hex'))
    key = key.derive("m/44'/60'/0'/0/" + index)
    if (!key.privateKey) throw new Error(`Unable to derive private key at index ${index}`)
    return Buffer.from(key.privateKey)
  }
}

const seedSignerWorker = new SeedSignerWorker() // eslint-disable-line
