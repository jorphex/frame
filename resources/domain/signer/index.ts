import type Signer from '../../../main/signers/Signer'

// in order of increasing priority
export enum Type {
  Ring = 'ring',
  Seed = 'seed',
  Trezor = 'trezor',
  Ledger = 'ledger',
  Lattice = 'lattice'
}

export const WatchOnlyType = 'address' as const
export const WATCH_ONLY_SIGNING_ERROR = 'Watch-only accounts cannot sign'
export type AccountSignerType = Type | typeof WatchOnlyType

export function getSignerType(typeValue: string) {
  return Object.values(Type).find((type) => type === typeValue)
}

export function getAccountSignerType(typeValue: unknown): AccountSignerType {
  if (typeof typeValue !== 'string') return WatchOnlyType

  const normalized = typeValue.toLowerCase()
  return getSignerType(normalized) || WatchOnlyType
}

export function isWatchOnlyAccountType(typeValue: unknown) {
  return getAccountSignerType(typeValue) === WatchOnlyType
}

export function getSignerDisplayType(typeOrSigner: string | Signer = '') {
  const signerType = typeof typeOrSigner === 'string' ? typeOrSigner : (typeOrSigner as Signer).type
  return ['ring', 'seed'].includes(signerType.toLowerCase()) ? 'hot' : signerType
}

export function isHardwareSigner(typeOrSigner: string | Signer = '') {
  const signerType = typeof typeOrSigner === 'string' ? typeOrSigner : (typeOrSigner as Signer).type

  return ['ledger', 'trezor', 'lattice'].includes(signerType.toLowerCase())
}

export function isSignerReady(signer: Signer) {
  return signer.status === 'ok'
}

export function findUnavailableSigners(signerTypeValue: string, signers: Signer[]): Signer[] {
  if (!isHardwareSigner(signerTypeValue)) return []

  return signers.filter((signer) => signer.type === signerTypeValue && !isSignerReady(signer))
}
