import { MAX_UINT256, parseRpcQuantity, toRpcQuantity } from '../../../main/provider/quantity'

it.each([
  ['0x0', 0n],
  ['0x1', 1n],
  ['0xABC', 2748n],
  [`0x${MAX_UINT256.toString(16)}`, MAX_UINT256]
])('parses canonical uint256 quantity %s', (value, expected) => {
  expect(parseRpcQuantity(value)).toBe(expected)
})

it.each([undefined, null, 1, '0x', '0x00', '0X1', '1', '0xg', `0x1${'0'.repeat(64)}`])(
  'rejects invalid RPC quantity %p',
  (value) => {
    expect(parseRpcQuantity(value)).toBeUndefined()
  }
)

it('formats canonical uint256 quantities', () => {
  expect(toRpcQuantity(0n)).toBe('0x0')
  expect(toRpcQuantity(MAX_UINT256)).toBe(`0x${MAX_UINT256.toString(16)}`)
})

it.each([-1n, MAX_UINT256 + 1n])('rejects an out-of-range quantity', (value) => {
  expect(() => toRpcQuantity(value)).toThrow('uint256')
})
