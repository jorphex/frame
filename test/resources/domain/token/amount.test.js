import {
  formatTokenBaseUnitAmount,
  parseTokenBaseUnitAmount,
  parseTokenDecimalAmount
} from '../../../../resources/domain/token/amount'

const max = 2n ** 256n - 1n

it('parses and normalizes bounded base-unit amounts exactly', () => {
  expect(parseTokenBaseUnitAmount('0')).toBe(0n)
  expect(parseTokenBaseUnitAmount('42')).toBe(42n)
  expect(parseTokenBaseUnitAmount('0x2a')).toBe(42n)
  expect(parseTokenBaseUnitAmount('0x00')).toBe(0n)
  expect(parseTokenBaseUnitAmount('0x01')).toBe(1n)
  expect(parseTokenBaseUnitAmount(max.toString(10))).toBe(max)
})

it.each([
  '',
  '00',
  '01',
  '-1',
  '+1',
  '1.0',
  '1e2',
  ' 1',
  '0x',
  '0xzz',
  `0x1${'0'.repeat(64)}`,
  (max + 1n).toString(10),
  1,
  null
])('rejects invalid or overflowing base-unit amount %p', (value) => {
  expect(parseTokenBaseUnitAmount(value)).toBeUndefined()
})

it('converts plain token decimals to exact base units', () => {
  expect(parseTokenDecimalAmount('0', 18)).toBe(0n)
  expect(parseTokenDecimalAmount('.5', 4)).toBe(5000n)
  expect(parseTokenDecimalAmount('50.1', 4)).toBe(501000n)
  expect(parseTokenDecimalAmount('42', 0)).toBe(42n)
  expect(parseTokenDecimalAmount(`${max}`, 0)).toBe(max)
})

it.each([
  ['1e2', 18],
  ['-1', 18],
  ['1.00001', 4],
  ['1.1', 0],
  ['1', -1],
  ['1', 256],
  ['1', 1.5],
  [(max + 1n).toString(10), 0]
])('rejects invalid token decimal %p with precision %p', (value, decimals) => {
  expect(parseTokenDecimalAmount(value, decimals)).toBeUndefined()
})

it('formats base units without precision loss', () => {
  expect(formatTokenBaseUnitAmount('0x7a508', 4)).toBe('50.1')
  expect(formatTokenBaseUnitAmount('42', 0)).toBe('42')
  expect(formatTokenBaseUnitAmount('1', 4)).toBe('0.0001')
  expect(formatTokenBaseUnitAmount(max.toString(10), 18)).toBe(
    '115792089237316195423570985008687907853269984665640564039457.584007913129639935'
  )
})
