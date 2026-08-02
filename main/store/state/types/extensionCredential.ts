import { createHash, createPublicKey } from 'crypto'
import { z } from 'zod'

export const ExtensionBrowserSchema = z.enum(['chrome', 'firefox', 'safari'])
export const ExtensionFingerprintSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const ExtensionInstallationIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
const P256CoordinateSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine((value) => {
    const coordinate = Buffer.from(value, 'base64url')
    return coordinate.length === 32 && coordinate.toString('base64url') === value
  }, 'Expected a canonical 32-byte Base64URL coordinate')

export const ExtensionPublicKeySchema = z
  .object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    x: P256CoordinateSchema,
    y: P256CoordinateSchema,
    ext: z.literal(true),
    key_ops: z.tuple([z.literal('verify')])
  })
  .strict()

export type ExtensionPublicKey = z.infer<typeof ExtensionPublicKeySchema>

export const extensionPublicKeyFingerprint = (publicKey: ExtensionPublicKey) =>
  createHash('sha256').update(`${publicKey.x}.${publicKey.y}`, 'utf8').digest('base64url')

export const ExtensionCredentialSchema = z
  .object({
    protocolVersion: z.literal(2),
    installationId: ExtensionInstallationIdSchema,
    browser: ExtensionBrowserSchema,
    extensionId: z.string().min(1).max(128),
    publicKey: ExtensionPublicKeySchema,
    fingerprint: ExtensionFingerprintSchema,
    pairedAt: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((credential, context) => {
    try {
      createPublicKey({ key: credential.publicKey, format: 'jwk' })
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicKey'],
        message: 'Expected a valid P-256 public key'
      })
    }

    if (extensionPublicKeyFingerprint(credential.publicKey) !== credential.fingerprint) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fingerprint'],
        message: 'Fingerprint does not match the public key'
      })
    }
  })

export const ExtensionCredentialsSchema = z
  .record(ExtensionFingerprintSchema, ExtensionCredentialSchema)
  .superRefine((credentials, context) => {
    Object.entries(credentials).forEach(([fingerprint, credential]) => {
      if (fingerprint !== credential.fingerprint) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [fingerprint],
          message: 'Credential record key does not match its fingerprint'
        })
      }
    })
  })

export type ExtensionBrowser = z.infer<typeof ExtensionBrowserSchema>
export type ExtensionCredential = z.infer<typeof ExtensionCredentialSchema>
