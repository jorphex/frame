import crypto from 'crypto'

import { decryptSecret, encryptSecret, ENVELOPE_VERSION } from '../../../../main/signers/hot/crypto'

const PASSWORD = 'frame test password'
const PLAINTEXT = '4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'
const flipFirstNibble = (value) => `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`

jest.setTimeout(2_000)

function legacyEncrypt(plaintext, password) {
  const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
  const iv = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex')
  const key = crypto.scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 36_000_000 })

  try {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return `${salt.toString('hex')}:${iv.toString('hex')}:${ciphertext.toString('hex')}`
  } finally {
    key.fill(0)
  }
}

describe('software signer encryption', () => {
  it('round-trips a secret through a randomized authenticated envelope', () => {
    const first = encryptSecret(PLAINTEXT, PASSWORD)
    const second = encryptSecret(PLAINTEXT, PASSWORD)

    expect(first).toMatchObject({
      version: ENVELOPE_VERSION,
      kdf: { name: 'scrypt', N: 32768, r: 8, p: 1, keyLength: 32 },
      cipher: { name: 'aes-256-gcm' }
    })
    expect(first).not.toEqual(second)
    expect(JSON.stringify(first)).not.toContain(PLAINTEXT)
    expect(decryptSecret(first, PASSWORD)).toEqual({ plaintext: PLAINTEXT, version: ENVELOPE_VERSION })
  })

  it('decrypts the legacy CBC format without writing it', () => {
    const legacy = legacyEncrypt(PLAINTEXT, PASSWORD)

    expect(decryptSecret(legacy, PASSWORD)).toEqual({ plaintext: PLAINTEXT, version: 1 })
    expect(typeof encryptSecret(PLAINTEXT, PASSWORD)).toBe('object')
  })

  it('rejects the wrong password with a stable error', () => {
    const encrypted = encryptSecret(PLAINTEXT, PASSWORD)

    expect(() => decryptSecret(encrypted, 'wrong password')).toThrow('Invalid encrypted secret')
  })

  it.each([
    ['ciphertext', (envelope) => (envelope.ciphertext = flipFirstNibble(envelope.ciphertext))],
    [
      'authentication tag',
      (envelope) => (envelope.cipher.authTag = flipFirstNibble(envelope.cipher.authTag))
    ],
    ['IV', (envelope) => (envelope.cipher.iv = flipFirstNibble(envelope.cipher.iv))]
  ])('rejects tampered %s', (_, tamper) => {
    const encrypted = encryptSecret(PLAINTEXT, PASSWORD)
    tamper(encrypted)

    expect(() => decryptSecret(encrypted, PASSWORD)).toThrow('Invalid encrypted secret')
  })

  it.each([
    ['an unknown version', (envelope) => (envelope.version = 3)],
    ['changed KDF work factors', (envelope) => (envelope.kdf.N = 65536)],
    ['an unknown cipher', (envelope) => (envelope.cipher.name = 'aes-256-cbc')],
    ['extra metadata', (envelope) => (envelope.note = 'ignored')],
    ['a short authentication tag', (envelope) => (envelope.cipher.authTag = '00')]
  ])('rejects %s before accepting an envelope', (_, mutate) => {
    const encrypted = encryptSecret(PLAINTEXT, PASSWORD)
    mutate(encrypted)

    expect(() => decryptSecret(encrypted, PASSWORD)).toThrow('Invalid encrypted secret')
  })

  it.each([null, {}, '', 'not:a:legacy:payload', { version: ENVELOPE_VERSION }])(
    'rejects malformed payload %p',
    (payload) => {
      expect(() => decryptSecret(payload, PASSWORD)).toThrow('Invalid encrypted secret')
    }
  )

  it('bounds plaintext and ciphertext before cryptographic work', () => {
    expect(() => encryptSecret('x'.repeat(64 * 1024 + 1), PASSWORD)).toThrow('Invalid encrypted secret')

    const encrypted = encryptSecret(PLAINTEXT, PASSWORD)
    encrypted.ciphertext = '00'.repeat(64 * 1024 + 1)
    expect(() => decryptSecret(encrypted, PASSWORD)).toThrow('Invalid encrypted secret')
  })
})
