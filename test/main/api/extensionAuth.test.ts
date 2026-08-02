import { generateKeyPairSync, sign } from 'crypto'

import {
  EXTENSION_AUTH_CHALLENGE_TTL_MS,
  ExtensionAuthSession,
  extensionAuthPayload,
  extensionKeyFingerprint,
  extensionPairingCode,
  parseExtensionAuthMessage
} from '../../../main/api/extensionAuth'

import type { ExtensionPublicKey } from '../../../main/store/state/types/extensionCredential'
import {
  ExtensionCredentialSchema,
  ExtensionCredentialsSchema
} from '../../../main/store/state/types/extensionCredential'

const clientNonce = Buffer.alloc(32, 1).toString('base64url')
const serverNonce = Buffer.alloc(32, 2).toString('base64url')
const challengeId = '18e73d72-3643-4cf6-846f-83854160f9f2'

function keyPair() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const exported = pair.publicKey.export({ format: 'jwk' })
  const publicKey: ExtensionPublicKey = {
    kty: 'EC',
    crv: 'P-256',
    x: exported.x || '',
    y: exported.y || '',
    ext: true,
    key_ops: ['verify']
  }
  return { privateKey: pair.privateKey, publicKey }
}

function hello(publicKey: ExtensionPublicKey, overrides = {}) {
  return JSON.stringify({
    type: 'frame-auth',
    version: 1,
    step: 'hello',
    clientNonce,
    publicKey,
    ...overrides
  })
}

function session(authorize = jest.fn(async () => true), now = jest.fn(() => 1_000)) {
  return {
    authorize,
    now,
    auth: new ExtensionAuthSession(
      { browser: 'chrome', id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      {
        authorize,
        now,
        randomNonce: () => serverNonce,
        randomChallengeId: () => challengeId
      }
    )
  }
}

it('parses only exact bounded version-one authentication messages', () => {
  const { publicKey } = keyPair()
  expect(parseExtensionAuthMessage(hello(publicKey)).success).toBe(true)
  expect(parseExtensionAuthMessage(hello(publicKey, { version: 2 }))).toEqual({
    success: false,
    code: 'unsupported-version'
  })
  expect(parseExtensionAuthMessage(hello(publicKey, { extra: true }))).toEqual({
    success: false,
    code: 'invalid-message'
  })
  expect(parseExtensionAuthMessage('{')).toEqual({ success: false, code: 'invalid-message' })
  expect(parseExtensionAuthMessage('x'.repeat(9 * 1024))).toEqual({
    success: false,
    code: 'invalid-message'
  })
})

it('derives stable fingerprints and six-digit pairing codes', () => {
  const { publicKey } = keyPair()
  const fingerprint = extensionKeyFingerprint(publicKey)
  expect(fingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(extensionKeyFingerprint(publicKey)).toBe(fingerprint)
  expect(
    extensionPairingCode({
      type: 'frame-auth',
      version: 1,
      step: 'challenge',
      challengeId,
      clientNonce,
      serverNonce,
      browser: 'chrome',
      extensionId: 'a'.repeat(32),
      fingerprint: 'f'.repeat(43),
      expiresAt: 61_000
    })
  ).toBe('533220')
})

it('rejects non-canonical coordinates and inconsistent persisted identities', () => {
  const { publicKey } = keyPair()
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const last = publicKey.x.at(-1) || ''
  const nonCanonicalX = `${publicKey.x.slice(0, -1)}${alphabet[alphabet.indexOf(last) + 1]}`
  expect(Buffer.from(nonCanonicalX, 'base64url')).toEqual(Buffer.from(publicKey.x, 'base64url'))
  expect(parseExtensionAuthMessage(hello({ ...publicKey, x: nonCanonicalX }))).toEqual({
    success: false,
    code: 'invalid-message'
  })

  const credential = {
    protocolVersion: 1,
    browser: 'chrome',
    extensionId: 'a'.repeat(32),
    publicKey,
    fingerprint: extensionKeyFingerprint(publicKey),
    pairedAt: 1_000
  }
  expect(ExtensionCredentialSchema.safeParse(credential).success).toBe(true)
  expect(ExtensionCredentialsSchema.safeParse({ [credential.fingerprint]: credential }).success).toBe(true)
  expect(ExtensionCredentialsSchema.safeParse({ ['b'.repeat(43)]: credential }).success).toBe(false)
  expect(ExtensionCredentialSchema.safeParse({ ...credential, fingerprint: 'a'.repeat(43) }).success).toBe(
    false
  )
  expect(
    ExtensionCredentialSchema.safeParse({
      ...credential,
      publicKey: {
        ...publicKey,
        x: Buffer.alloc(32).toString('base64url'),
        y: Buffer.alloc(32).toString('base64url')
      }
    }).success
  ).toBe(false)
})

it('authorizes a candidate and verifies one replay-resistant proof', async () => {
  const { privateKey, publicKey } = keyPair()
  const { auth, authorize } = session()
  const challenge = await auth.receive(hello(publicKey))
  expect(challenge).toMatchObject({
    type: 'frame-auth',
    version: 1,
    step: 'challenge',
    challengeId,
    clientNonce,
    serverNonce,
    browser: 'chrome',
    extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    expiresAt: 1_000 + EXTENSION_AUTH_CHALLENGE_TTL_MS
  })
  if (challenge.step !== 'challenge') throw new Error('Expected challenge')
  expect(extensionPairingCode(challenge)).toMatch(/^\d{6}$/)
  expect(extensionPairingCode(challenge)).toBe(extensionPairingCode(challenge))
  expect(authorize).not.toHaveBeenCalled()

  const signature = sign('sha256', extensionAuthPayload(challenge), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url')
  await expect(
    auth.receive(
      JSON.stringify({
        type: 'frame-auth',
        version: 1,
        step: 'proof',
        challengeId,
        signature
      })
    )
  ).resolves.toEqual({
    type: 'frame-auth',
    version: 1,
    step: 'authenticated',
    fingerprint: challenge.fingerprint
  })
  expect(authorize).toHaveBeenCalledWith(
    expect.objectContaining({
      browser: 'chrome',
      extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publicKey,
      pairingCode: expect.stringMatching(/^\d{6}$/)
    }),
    undefined
  )
  expect(auth.authenticated).toBe(true)
})

it('rejects denied, expired, mismatched, invalid, and replayed proofs', async () => {
  const { privateKey, publicKey } = keyPair()
  const denied = session(jest.fn(async () => false)).auth
  const deniedChallenge = await denied.receive(hello(publicKey))
  if (deniedChallenge.step !== 'challenge') throw new Error('Expected challenge')
  const deniedSignature = sign('sha256', extensionAuthPayload(deniedChallenge), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url')
  await expect(
    denied.receive(
      JSON.stringify({
        type: 'frame-auth',
        version: 1,
        step: 'proof',
        challengeId,
        signature: deniedSignature
      })
    )
  ).resolves.toMatchObject({ step: 'error', code: 'denied' })

  const expiring = session()
  const challenge = await expiring.auth.receive(hello(publicKey))
  if (challenge.step !== 'challenge') throw new Error('Expected challenge')
  const signature = sign('sha256', extensionAuthPayload(challenge), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url')
  expiring.now.mockReturnValue(challenge.expiresAt)
  await expect(
    expiring.auth.receive(
      JSON.stringify({ type: 'frame-auth', version: 1, step: 'proof', challengeId, signature })
    )
  ).resolves.toMatchObject({ step: 'error', code: 'expired' })

  const invalid = session().auth
  await invalid.receive(hello(publicKey))
  await expect(
    invalid.receive(
      JSON.stringify({
        type: 'frame-auth',
        version: 1,
        step: 'proof',
        challengeId,
        signature: Buffer.alloc(64).toString('base64url')
      })
    )
  ).resolves.toMatchObject({ step: 'error', code: 'invalid-proof' })
  await expect(
    invalid.receive(JSON.stringify({ type: 'frame-auth', version: 1, step: 'proof', challengeId, signature }))
  ).resolves.toMatchObject({ step: 'error', code: 'invalid-state' })
})

it('serializes approval and rejects malformed public points before prompting', async () => {
  const { privateKey, publicKey } = keyPair()
  let approve = () => {}
  const authorize = jest.fn(
    () =>
      new Promise<boolean>((resolve) => {
        approve = () => resolve(true)
      })
  )
  const { auth } = session(authorize)
  const challenge = await auth.receive(hello(publicKey))
  if (challenge.step !== 'challenge') throw new Error('Expected challenge')
  const signature = sign('sha256', extensionAuthPayload(challenge), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url')
  const proof = JSON.stringify({
    type: 'frame-auth',
    version: 1,
    step: 'proof',
    challengeId,
    signature
  })
  const first = auth.receive(proof)
  await expect(auth.receive(proof)).resolves.toMatchObject({
    step: 'error',
    code: 'invalid-state'
  })
  approve()
  await expect(first).resolves.toMatchObject({ step: 'authenticated' })

  const invalidKey = {
    ...publicKey,
    x: Buffer.alloc(32).toString('base64url'),
    y: Buffer.alloc(32).toString('base64url')
  }
  const malformedAuthorize = jest.fn(async () => true)
  const malformed = session(malformedAuthorize).auth
  await expect(malformed.receive(hello(invalidKey))).resolves.toMatchObject({
    step: 'error',
    code: 'invalid-message'
  })
  expect(malformedAuthorize).not.toHaveBeenCalled()
})
