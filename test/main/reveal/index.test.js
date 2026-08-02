import provider from '../../../main/provider'
import reveal from '../../../main/reveal'
import { erc20Interface } from '../../../resources/contracts'

jest.mock('ethereum-provider', () =>
  jest.fn(() => ({
    setChain: jest.fn(),
    request: jest.fn().mockResolvedValue('0x')
  }))
)
jest.mock('../../../main/provider', () => ({
  __esModule: true,
  default: { sendAsync: jest.fn() }
}))
jest.mock('../../../main/provider/proxy', () => ({}))
jest.mock('../../../main/contracts/deployments/ens', () => ({ __esModule: true, default: [] }))
jest.mock('../../../main/nebula', () =>
  jest.fn(() => ({ ens: { reverseLookup: jest.fn().mockResolvedValue(['']) } }))
)

const token = '0x1111111111111111111111111111111111111111'
const counterparty = '0x2222222222222222222222222222222222222222'

beforeEach(() => {
  const values = { decimals: 18n, name: 'Frame Token', symbol: 'FRAME', totalSupply: 1000n }

  provider.sendAsync.mockImplementation((payload, callback) => {
    const data = payload.params[0].data
    const fn = erc20Interface.getFunction(data.slice(0, 10)).name
    callback(null, { result: erc20Interface.encodeFunctionResult(fn, [values[fn]]) })
  })
})

it.each([
  ['approve', 'erc20:approve', 'spender', 42n, '0x2a'],
  ['transfer', 'erc20:transfer', 'recipient', 7n, '0x07']
])('recognizes Ethers 6 bigint %s amounts', async (method, actionId, identityKey, amount, hexAmount) => {
  const calldata = erc20Interface.encodeFunctionData(method, [counterparty, amount])

  const actions = await reveal.recog(calldata, { contractAddress: token, chainId: 1 })

  expect(actions).toHaveLength(1)
  expect(actions[0]).toMatchObject({
    id: actionId,
    data: {
      amount: hexAmount,
      decimals: 18,
      name: 'Frame Token',
      symbol: 'FRAME',
      [identityKey]: { address: counterparty }
    }
  })
})
