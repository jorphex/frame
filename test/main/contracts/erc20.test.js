import { Contract } from '@ethersproject/contracts'

import Erc20Contract from '../../../main/contracts/erc20'

jest.mock('@ethersproject/contracts', () => ({ Contract: jest.fn() }))
jest.mock('@ethersproject/providers', () => ({ Web3Provider: jest.fn() }))
jest.mock('../../../main/provider', () => ({ sendAsync: jest.fn() }))

const createContract = (decimals) => {
  Contract.mockImplementation(() => ({
    decimals: jest.fn(() => decimals),
    name: jest.fn().mockResolvedValue('Zero Token'),
    symbol: jest.fn().mockResolvedValue('ZERO'),
    totalSupply: jest.fn().mockResolvedValue({ toString: () => '1' })
  }))

  return new Erc20Contract('0x0000000000000000000000000000000000000001', 1)
}

it('preserves a valid zero-decimal contract value', async () => {
  const token = await createContract(Promise.resolve(0)).getTokenData()

  expect(token.decimals).toBe(0)
})

it('does not represent a failed decimals call as zero', async () => {
  const token = await createContract(Promise.reject(new Error('call failed'))).getTokenData()

  expect(token.decimals).toBeUndefined()
})
