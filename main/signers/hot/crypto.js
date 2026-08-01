const crypto = require('crypto')

const ENVELOPE_VERSION = 2
const CIPHER_NAME = 'aes-256-gcm'
const KDF_NAME = 'scrypt'
const SALT_BYTES = 16
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const MAX_SECRET_BYTES = 64 * 1024
const SCRYPT_PARAMS = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 32 })
const SCRYPT_MAX_MEMORY = 36_000_000
const AUTHENTICATED_CONTEXT = Buffer.from('frame-hot-signer:v2', 'utf8')
const INVALID_SECRET = 'Invalid encrypted secret'

function fail() {
  throw new Error(INVALID_SECRET)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value, expected) {
  return isPlainObject(value) && Object.keys(value).sort().join(':') === [...expected].sort().join(':')
}

function decodeHex(value, { bytes, maxBytes } = {}) {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) fail()
  const decoded = Buffer.from(value, 'hex')
  if (bytes !== undefined && decoded.length !== bytes) fail()
  if (maxBytes !== undefined && decoded.length > maxBytes) fail()
  return decoded
}

function deriveKey(password, salt) {
  if (typeof password !== 'string') fail()
  return crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_MAX_MEMORY
  })
}

function encryptSecret(plaintext, password) {
  if (
    typeof plaintext !== 'string' ||
    plaintext.length === 0 ||
    Buffer.byteLength(plaintext, 'utf8') > MAX_SECRET_BYTES
  )
    fail()

  const salt = crypto.randomBytes(SALT_BYTES)
  const iv = crypto.randomBytes(IV_BYTES)
  const key = deriveKey(password, salt)

  try {
    const cipher = crypto.createCipheriv(CIPHER_NAME, key, iv, { authTagLength: AUTH_TAG_BYTES })
    cipher.setAAD(AUTHENTICATED_CONTEXT)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

    return {
      version: ENVELOPE_VERSION,
      kdf: {
        name: KDF_NAME,
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        keyLength: SCRYPT_PARAMS.keyLength,
        salt: salt.toString('hex')
      },
      cipher: {
        name: CIPHER_NAME,
        iv: iv.toString('hex'),
        authTag: cipher.getAuthTag().toString('hex')
      },
      ciphertext: ciphertext.toString('hex')
    }
  } finally {
    key.fill(0)
  }
}

function decryptEnvelope(envelope, password) {
  if (!hasExactKeys(envelope, ['version', 'kdf', 'cipher', 'ciphertext'])) fail()
  if (envelope.version !== ENVELOPE_VERSION) fail()
  if (!hasExactKeys(envelope.kdf, ['name', 'N', 'r', 'p', 'keyLength', 'salt'])) fail()
  if (
    envelope.kdf.name !== KDF_NAME ||
    envelope.kdf.N !== SCRYPT_PARAMS.N ||
    envelope.kdf.r !== SCRYPT_PARAMS.r ||
    envelope.kdf.p !== SCRYPT_PARAMS.p ||
    envelope.kdf.keyLength !== SCRYPT_PARAMS.keyLength
  )
    fail()
  if (!hasExactKeys(envelope.cipher, ['name', 'iv', 'authTag'])) fail()
  if (envelope.cipher.name !== CIPHER_NAME) fail()

  const salt = decodeHex(envelope.kdf.salt, { bytes: SALT_BYTES })
  const iv = decodeHex(envelope.cipher.iv, { bytes: IV_BYTES })
  const authTag = decodeHex(envelope.cipher.authTag, { bytes: AUTH_TAG_BYTES })
  const ciphertext = decodeHex(envelope.ciphertext, { maxBytes: MAX_SECRET_BYTES })
  const key = deriveKey(password, salt)

  try {
    const decipher = crypto.createDecipheriv(CIPHER_NAME, key, iv, { authTagLength: AUTH_TAG_BYTES })
    decipher.setAAD(AUTHENTICATED_CONTEXT)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } finally {
    key.fill(0)
  }
}

function decryptLegacy(payload, password) {
  if (typeof payload !== 'string') fail()
  const parts = payload.split(':')
  if (parts.length !== 3) fail()

  const salt = decodeHex(parts[0], { bytes: SALT_BYTES })
  const iv = decodeHex(parts[1], { bytes: 16 })
  const ciphertext = decodeHex(parts[2], { maxBytes: MAX_SECRET_BYTES + 16 })
  const key = deriveKey(password, salt)

  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } finally {
    key.fill(0)
  }
}

function decryptSecret(payload, password) {
  try {
    if (typeof payload === 'string') {
      return { plaintext: decryptLegacy(payload, password), version: 1 }
    }

    return { plaintext: decryptEnvelope(payload, password), version: ENVELOPE_VERSION }
  } catch {
    fail()
  }
}

module.exports = {
  ENVELOPE_VERSION,
  encryptSecret,
  decryptSecret
}
