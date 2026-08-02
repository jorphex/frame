import provider from '../../../main/provider'
import { Interface } from 'ethers'

import Erc20Contract from '../../../main/contracts/erc20'
import { erc20Interface } from '../../../resources/contracts'

jest.mock('../../../main/provider', () => ({
  __esModule: true,
  default: { sendAsync: jest.fn() }
}))

const address = '0x0000000000000000000000000000000000000001'

function mockContractReads(decimals) {
  const values = {
    decimals,
    name: 'Zero Token',
    symbol: 'ZERO',
    totalSupply: 1n
  }

  provider.sendAsync.mockImplementation((payload, callback) => {
    const data = payload.params[0].data
    const fn = erc20Interface.getFunction(data.slice(0, 10)).name
    const value = values[fn]

    if (value instanceof Error) return callback(value)
    callback(null, { result: erc20Interface.encodeFunctionResult(fn, [value]) })
  })

  return new Erc20Contract(address, 1)
}

it('preserves a valid zero-decimal contract value through Frame RPC', async () => {
  const token = await mockContractReads(0n).getTokenData()

  expect(token).toEqual({ decimals: 0, name: 'Zero Token', symbol: 'ZERO', totalSupply: '1' })
  expect(provider.sendAsync).toHaveBeenCalledTimes(4)
  expect(provider.sendAsync.mock.calls[0][0]).toMatchObject({
    method: 'eth_call',
    chainId: '0x1',
    _origin: 'frame-internal',
    params: [{ to: address }, 'latest']
  })
})

it('does not represent a failed decimals call as zero', async () => {
  const token = await mockContractReads(new Error('call failed')).getTokenData()

  expect(token.decimals).toBeUndefined()
  expect(token).not.toHaveProperty('decimals')
  expect(token.name).toBe('Zero Token')
})

it('reads and decodes an ERC-1046 tokenURI on the selected chain', async () => {
  const tokenUriInterface = new Interface(['function tokenURI() view returns (string)'])
  provider.sendAsync.mockImplementation((payload, callback) => {
    callback(null, {
      result: tokenUriInterface.encodeFunctionResult('tokenURI', ['ipfs://bafy-metadata'])
    })
  })

  await expect(new Erc20Contract(address, 10).getTokenUri()).resolves.toBe('ipfs://bafy-metadata')
  expect(provider.sendAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'eth_call',
      chainId: '0xa',
      params: [
        expect.objectContaining({
          to: address,
          data: tokenUriInterface.encodeFunctionData('tokenURI')
        }),
        'latest'
      ]
    }),
    expect.any(Function)
  )
})
