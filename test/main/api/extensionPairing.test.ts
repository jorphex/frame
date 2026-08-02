import { generateKeyPairSync } from 'crypto'

import store from '../../../main/store'
import {
  authorizeExtension,
  respondToExtensionPairing,
  revokeExtensionCredential
} from '../../../main/api/extensionPairing'

import type { ExtensionPairingCandidate } from '../../../main/api/extensionAuth'
import { extensionKeyFingerprint } from '../../../main/api/extensionAuth'

jest.mock('../../../main/store')

const publicKeys = new Map<string, ExtensionPairingCandidate['publicKey']>()

function publicKey(marker: string) {
  const existing = publicKeys.get(marker)
  if (existing) return existing
  const exported = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
  const key: ExtensionPairingCandidate['publicKey'] = {
    kty: 'EC',
    crv: 'P-256',
    x: exported.x || '',
    y: exported.y || '',
    ext: true,
    key_ops: ['verify']
  }
  publicKeys.set(marker, key)
  return key
}

function candidate(marker: string, overrides = {}): ExtensionPairingCandidate {
  const key = publicKey(marker)
  const fingerprint = extensionKeyFingerprint(key)
  return {
    protocolVersion: 1,
    browser: 'chrome',
    extensionId: marker.repeat(32),
    publicKey: key,
    fingerprint,
    pairingCode: '123456',
    pairedAt: 1000,
    ...overrides
  }
}

beforeEach(() => {
  store.clear()
  store.set('main.extensionCredentials', {})
  store.notify = jest.fn()
  store.setExtensionCredential = jest.fn()
  store.removeExtensionCredential = jest.fn()
})

it('accepts only an exact persisted browser identity and public key', async () => {
  const paired = candidate('a')
  const { pairingCode: _pairingCode, ...credential } = paired
  store.set('main.extensionCredentials', paired.fingerprint, credential)

  await expect(authorizeExtension(paired)).resolves.toBe(true)
  expect(store.notify).not.toHaveBeenCalled()

  const changedIdentity = candidate('a', { extensionId: 'b'.repeat(32) })
  const pending = authorizeExtension(changedIdentity)
  expect(store.notify).toHaveBeenCalledTimes(1)
  const request = store.notify.mock.calls[0][1]
  expect(respondToExtensionPairing(request.requestId, false)).toBe(true)
  await expect(pending).resolves.toBe(false)
})

it('deduplicates concurrent consent and persists the approved credential', async () => {
  const pairing = candidate('c')
  const first = authorizeExtension(pairing)
  const second = authorizeExtension(pairing)

  expect(store.notify).toHaveBeenCalledTimes(1)
  const request = store.notify.mock.calls[0][1]
  expect(request).toMatchObject({
    requestId: expect.any(String),
    fingerprint: pairing.fingerprint,
    pairingCode: pairing.pairingCode
  })
  expect(respondToExtensionPairing(request.requestId, true)).toBe(true)
  await expect(Promise.all([first, second])).resolves.toEqual([true, true])
  expect(store.setExtensionCredential).toHaveBeenCalledWith({
    protocolVersion: 1,
    browser: pairing.browser,
    extensionId: pairing.extensionId,
    publicKey: pairing.publicKey,
    fingerprint: pairing.fingerprint,
    pairedAt: pairing.pairedAt
  })
  expect(respondToExtensionPairing(request.requestId, true)).toBe(false)
})

it('rejects a competing key for an extension identity with an active prompt', async () => {
  const firstCandidate = candidate('g')
  const competingCandidate = candidate('h', { extensionId: firstCandidate.extensionId })
  const first = authorizeExtension(firstCandidate)

  await expect(authorizeExtension(competingCandidate)).resolves.toBe(false)
  expect(store.notify).toHaveBeenCalledTimes(1)

  const request = store.notify.mock.calls[0][1]
  respondToExtensionPairing(request.requestId, false)
  await expect(first).resolves.toBe(false)
})

it('allows only one visible pairing candidate at a time', async () => {
  const firstCandidate = candidate('i')
  const first = authorizeExtension(firstCandidate)

  await expect(authorizeExtension(candidate('j'))).resolves.toBe(false)
  expect(store.notify).toHaveBeenCalledTimes(1)

  respondToExtensionPairing(store.notify.mock.calls[0][1].requestId, false)
  await expect(first).resolves.toBe(false)
})

it('caches a rejection for the process lifetime and cancels abandoned consent', async () => {
  const rejected = candidate('d')
  const first = authorizeExtension(rejected)
  const rejectionRequest = store.notify.mock.calls[0][1]
  respondToExtensionPairing(rejectionRequest.requestId, false)
  await expect(first).resolves.toBe(false)
  await expect(authorizeExtension(rejected)).resolves.toBe(false)
  expect(store.notify).toHaveBeenCalledTimes(1)

  const abandoned = candidate('e')
  const controller = new AbortController()
  const waiting = authorizeExtension(abandoned, controller.signal)
  const abandonedRequest = store.notify.mock.calls.at(-1)[1]
  store.set('view.notify', 'extensionConnect')
  store.set('view.notifyData', abandonedRequest)
  controller.abort()
  await expect(waiting).resolves.toBe(false)
  expect(store.notify).toHaveBeenLastCalledWith()
})

it('rejects without clearing when another workflow replaces the pairing notification', async () => {
  const waiting = authorizeExtension(candidate('k'))
  const request = store.notify.mock.calls[0][1]
  store.set('view.notify', 'gasFeeWarning')
  store.set('view.notifyData', { requestId: 'different-request' })
  store.notify.mockClear()

  store.getObserver(`extension-pairing:${request.requestId}`).fire()

  await expect(waiting).resolves.toBe(false)
  expect(store.notify).not.toHaveBeenCalled()
})

it('exposes explicit credential revocation', () => {
  const fingerprint = candidate('f').fingerprint
  revokeExtensionCredential(fingerprint)
  expect(store.removeExtensionCredential).toHaveBeenCalledWith(fingerprint)
})
