import { erc20Interface } from '../../../../resources/contracts'
import { updateErc20ApprovalAmount } from '../../../../main/transaction/actions/erc20'

const spender = '0x2222222222222222222222222222222222222222'
const data = () => ({
  amount: '0x1',
  decimals: 18,
  name: 'Token',
  symbol: 'TKN',
  spender: { address: spender, ens: '', type: 'external' },
  contract: { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ens: '', type: 'contract' }
})
const request = () => ({
  type: 'transaction',
  data: { data: '0x095ea7b3' },
  decodedData: { args: [{ value: spender }, { value: '1' }] }
})

it('encodes a normalized approval before mutating request state', () => {
  const actionData = data()
  const txRequest = request()

  expect(updateErc20ApprovalAmount(txRequest, actionData, '42')).toBe(true)

  const [encodedSpender, encodedAmount] = erc20Interface.decodeFunctionData('approve', txRequest.data.data)
  expect(encodedSpender.toLowerCase()).toBe(spender)
  expect(encodedAmount.toString()).toBe('42')
  expect(actionData.amount).toBe('42')
  expect(txRequest.decodedData.args[1].value).toBe('42')
})

it('marks exact uint256-max approval display as unlimited', () => {
  const actionData = data()
  const txRequest = request()
  const max = (2n ** 256n - 1n).toString(10)

  expect(updateErc20ApprovalAmount(txRequest, actionData, max)).toBe(true)
  expect(actionData.amount).toBe(max)
  expect(txRequest.decodedData.args[1].value).toBe('unlimited')
})

it.each(['', '-1', '1e2', (2n ** 256n).toString(10)])(
  'rejects invalid amount %p without partial mutation',
  (amount) => {
    const actionData = data()
    const txRequest = request()
    const original = JSON.parse(JSON.stringify({ actionData, txRequest }))

    expect(updateErc20ApprovalAmount(txRequest, actionData, amount)).toBe(false)
    expect({ actionData, txRequest }).toEqual(original)
  }
)
