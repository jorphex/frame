export type SignatureRiskKind = 'message' | 'typed-data'

const REQUIRED_RISKS: Record<SignatureRiskKind, readonly string[]> = {
  message: [
    'legacy-eth-sign',
    'siwe-malformed',
    'siwe-origin-mismatch',
    'siwe-address-mismatch',
    'siwe-chain-mismatch',
    'siwe-expired',
    'siwe-not-yet-valid',
    'siwe-issued-in-future'
  ],
  'typed-data': ['legacy-v1', 'domain-chain-missing', 'domain-chain-invalid', 'domain-chain-mismatch']
}

export function requiredSignatureRisks(kind: SignatureRiskKind, risks: unknown): string[] {
  if (!Array.isArray(risks)) return []

  const supplied = new Set(risks.filter((risk): risk is string => typeof risk === 'string'))
  return REQUIRED_RISKS[kind].filter((risk) => supplied.has(risk))
}
