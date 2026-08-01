import { requiredSignatureRisks } from '../../../../resources/domain/signature/risk'

it('selects only high-risk message conditions in stable policy order', () => {
  expect(
    requiredSignatureRisks('message', [
      'opaque-message',
      'siwe-origin-unverified',
      'siwe-expired',
      'legacy-eth-sign',
      'legacy-eth-sign',
      'unknown-risk'
    ])
  ).toEqual(['legacy-eth-sign', 'siwe-expired'])
})

it('selects all normalized typed-data domain risks', () => {
  expect(
    requiredSignatureRisks('typed-data', [
      'domain-chain-mismatch',
      'legacy-v1',
      'domain-chain-invalid',
      'domain-chain-missing'
    ])
  ).toEqual(['legacy-v1', 'domain-chain-missing', 'domain-chain-invalid', 'domain-chain-mismatch'])
})

it.each([undefined, null, {}, ['opaque-message', 'siwe-origin-unverified'], ['unknown-risk']])(
  'returns no required risks for informational or malformed input %p',
  (risks) => {
    expect(requiredSignatureRisks('message', risks)).toEqual([])
  }
)
