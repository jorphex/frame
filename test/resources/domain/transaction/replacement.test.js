import { toRpcQuantity } from '../../../../resources/domain/transaction/quantity'
import {
  getReplacementStatus,
  increaseByTenPercent,
  minimumReplacementFee,
  requiresReplacementFeeBump
} from '../../../../resources/domain/transaction/replacement'

const nonce = '0x7'
const monitored = (data, overrides = {}) => ({
  mode: 'monitor',
  status: 'sent',
  data: { nonce, ...data },
  ...overrides
})

it('calculates the inclusive 10% policy exactly', () => {
  expect(increaseByTenPercent(101n)).toBe(112n)
  expect(minimumReplacementFee(0n)).toBe(1n)
  expect(requiresReplacementFeeBump(100n, 110n)).toBe(true)
  expect(requiresReplacementFeeBump(100n, 111n)).toBe(false)
})

it('ignores unrelated, errored, and non-monitored requests', () => {
  const request = { data: { nonce, gasPrice: '0x64' } }
  const requests = [
    monitored({ gasPrice: '0xffff' }, { mode: 'normal' }),
    monitored({ gasPrice: '0xffff' }, { status: 'error' }),
    monitored({ nonce: '0x8', gasPrice: '0xffff' })
  ]

  expect(getReplacementStatus(request, requests)).toEqual({ replacement: false, possible: true })
})

it('does not assess a monitored request as its own replacement', () => {
  const request = monitored({ gasPrice: '0x64' })

  expect(getReplacementStatus(request, [request])).toEqual({ replacement: false, possible: true })
})

it.each(['confirming', 'confirmed'])('reports a %s same-nonce transaction as used', (status) => {
  const request = { data: { nonce, gasPrice: '0x64' } }

  expect(getReplacementStatus(request, [monitored({ gasPrice: '0x1' }, { status })])).toEqual({
    replacement: true,
    possible: false,
    reason: 'nonce-used'
  })
})

it('uses the exact maximum legacy fee and 10% threshold', () => {
  const existing = 9007199254740993n
  const thresholdFloor = (existing * 11n) / 10n
  const request = { data: { nonce, gasPrice: toRpcQuantity(thresholdFloor) } }
  const requests = [monitored({ gasPrice: '0x1' }), monitored({ gasPrice: toRpcQuantity(existing) })]

  expect(getReplacementStatus(request, requests)).toEqual({
    replacement: true,
    possible: false,
    reason: 'gas-price-too-low'
  })

  request.data.gasPrice = toRpcQuantity(thresholdFloor + 1n)
  expect(getReplacementStatus(request, requests)).toEqual({ replacement: true, possible: true })
})

it('requires both EIP-1559 fields to clear the threshold', () => {
  const request = {
    data: { nonce, maxPriorityFeePerGas: '0xc', maxFeePerGas: '0x6e' }
  }
  const requests = [monitored({ maxPriorityFeePerGas: '0xa', maxFeePerGas: '0x64' })]

  expect(getReplacementStatus(request, requests)).toEqual({
    replacement: true,
    possible: false,
    reason: 'gas-fees-too-low'
  })

  request.data.maxFeePerGas = '0x6f'
  expect(getReplacementStatus(request, requests)).toEqual({ replacement: true, possible: true })
})

it('uses independent EIP-1559 maxima consistently with the main process', () => {
  const request = {
    data: { nonce, maxPriorityFeePerGas: '0xc', maxFeePerGas: '0x6f' }
  }
  const requests = [
    monitored({ maxPriorityFeePerGas: '0xa', maxFeePerGas: '0x14' }),
    monitored({ maxPriorityFeePerGas: '0x5', maxFeePerGas: '0x64' })
  ]

  expect(getReplacementStatus(request, requests)).toEqual({ replacement: true, possible: true })
})

it('ignores malformed or incomplete fee history without falling between envelope types', () => {
  const requests = [monitored({ gasPrice: '0xffff', maxPriorityFeePerGas: '0x01', maxFeePerGas: '0x02' })]
  const request = {
    data: {
      nonce,
      gasPrice: '0x1',
      maxPriorityFeePerGas: '0x01',
      maxFeePerGas: '0x2'
    }
  }

  expect(() => getReplacementStatus(request, requests)).not.toThrow()
  expect(getReplacementStatus(request, requests)).toEqual({ replacement: true, possible: true })
})
