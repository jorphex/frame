import { validateMnemonic } from 'bip39'

import migrations from '../../../../main/store/migrate'

const forbiddenKey = /(private.?key|mnemonic|seed|password|passphrase|api.?key|secret)/i
const rawPrivateKey = /^(?:0x)?[0-9a-f]{64}$/i
const extendedPrivateKey = /^(?:xprv|yprv|zprv)/i
const encryptedSignerPayload = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i
const credentialQuery = /[?&](?:api_?key|token|secret)=/i

const visit = (value, path = '$') => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}[${index}]`))
    return
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      if (forbiddenKey.test(key)) throw new Error(`Forbidden secret-shaped key at ${path}.${key}`)
      visit(entry, `${path}.${key}`)
    })
    return
  }

  if (typeof value !== 'string') return

  if (rawPrivateKey.test(value)) throw new Error(`Raw private-key-shaped value at ${path}`)
  if (extendedPrivateKey.test(value)) throw new Error(`Extended private-key-shaped value at ${path}`)
  if (encryptedSignerPayload.test(value)) throw new Error(`Encrypted signer payload at ${path}`)
  if (credentialQuery.test(value)) throw new Error(`Credential-shaped URL at ${path}`)
  if (validateMnemonic(value)) throw new Error(`Mnemonic phrase at ${path}`)
}

export const assertSafeMigrationFixture = (fixture, filename = 'fixture') => {
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    throw new Error(`${filename} must contain an object`)
  }

  const { metadata, state } = fixture

  if (metadata?.formatVersion !== 1 || metadata?.synthetic !== true) {
    throw new Error(`${filename} must declare synthetic fixture format version 1`)
  }

  if (!Number.isInteger(metadata.sourceVersion) || metadata.sourceVersion < 0) {
    throw new Error(`${filename} has an invalid source version`)
  }

  if (metadata.sourceVersion > migrations.latest) {
    throw new Error(`${filename} is newer than the latest known migration`)
  }

  if (typeof metadata.title !== 'string' || !metadata.title.trim()) {
    throw new Error(`${filename} must include a title`)
  }

  if (!state?.main || state.main._version !== metadata.sourceVersion) {
    throw new Error(`${filename} source version must match state.main._version`)
  }

  visit(fixture)
  return fixture
}
