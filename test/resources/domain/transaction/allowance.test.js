import {
  buildErc20AllowanceCalldata,
  parseErc20AllowanceResult,
  parseErc20ApprovalIntent
} from '../../../../resources/domain/transaction/allowance'

const owner = '0x1111111111111111111111111111111111111111'
const spender = '0x2222222222222222222222222222222222222222'
const addressWord = (address) => `${'0'.repeat(24)}${address.slice(2)}`
const uintWord = (value) => BigInt(value).toString(16).padStart(64, '0')
const approve = (amount) => `0x095ea7b3${addressWord(spender)}${uintWord(amount)}`

it.each([
  [0n, '0'],
  [42n, '42'],
  [2n ** 256n - 1n, (2n ** 256n - 1n).toString(10)]
])('parses canonical approve calldata amount %s', (amount, expected) => {
  expect(parseErc20ApprovalIntent(approve(amount))).toEqual({ spender, amount: expected })
})

it.each([
  undefined,
  '0x',
  `0x095ea7b3${'f'.repeat(24)}${spender.slice(2)}${uintWord(1)}`,
  `${approve(1)}00`,
  `0x095ea7b4${addressWord(spender)}${uintWord(1)}`
])('rejects noncanonical approval calldata %p', (calldata) => {
  expect(parseErc20ApprovalIntent(calldata)).toBeUndefined()
})

it('builds a canonical allowance call from normalized addresses', () => {
  expect(buildErc20AllowanceCalldata(owner.toUpperCase().replace('0X', '0x'), spender)).toBe(
    `0xdd62ed3e${addressWord(owner)}${addressWord(spender)}`
  )
})

it.each([undefined, '0x1', '0x' + '00'.repeat(31), '0x' + '00'.repeat(33), '0x' + 'gg'.repeat(32)])(
  'rejects invalid allowance output %p',
  (result) => {
    expect(parseErc20AllowanceResult(result)).toBeUndefined()
  }
)

it('parses one ABI uint256 allowance word into exact decimal units', () => {
  expect(parseErc20AllowanceResult(`0x${uintWord(2n ** 255n + 7n)}`)).toBe((2n ** 255n + 7n).toString(10))
})

it.each([
  ['owner', spender],
  [owner, '0x1'],
  [owner, `${spender}00`]
])('rejects invalid allowance call addresses', (invalidOwner, invalidSpender) => {
  expect(buildErc20AllowanceCalldata(invalidOwner, invalidSpender)).toBeUndefined()
})
