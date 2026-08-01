import { utils } from 'ethers'

import { estimateL1GasCost, GAS_PRICE_ORACLE_ADDRESS } from '../../../main/chains/optimism'

const encodedFee = utils.defaultAbiCoder.encode(['uint256'], ['123456789'])

function createProvider() {
  return {
    call: jest.fn().mockResolvedValue(encodedFee),
    getTransactionCount: jest.fn().mockResolvedValue(7)
  }
}

const fixtures = [
  {
    name: 'legacy transaction with the fallback nonce',
    tx: {
      chainId: 10,
      type: 0,
      to: '0x1111111111111111111111111111111111111111',
      gasLimit: 21000,
      gasPrice: 1000000,
      value: 1,
      data: '0x'
    },
    calldata:
      '0x49948e0e00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000027e684ffffffff830f424082520894111111111111111111111111111111111111111101800a808000000000000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-2930 transaction with an explicit zero nonce',
    tx: {
      chainId: 10,
      type: 1,
      nonce: 0,
      to: '0x2222222222222222222222222222222222222222',
      gasLimit: 50000,
      gasPrice: 2000000,
      value: 0,
      data: '0x1234',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002501e30a80831e848082c35094222222222222222222222222222222222222222280821234c0000000000000000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-1559 transaction with the fallback nonce',
    tx: {
      chainId: 10,
      type: 2,
      to: '0x1111111111111111111111111111111111111111',
      gasLimit: 21000,
      maxFeePerGas: 3000000,
      maxPriorityFeePerGas: 1000000,
      value: 1,
      data: '0x',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002b02e90a84ffffffff830f4240832dc6c08252089411111111111111111111111111111111111111110180c0000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-1559 transaction with an explicit zero nonce',
    tx: {
      chainId: 10,
      type: 2,
      nonce: 0,
      to: '0x2222222222222222222222222222222222222222',
      gasLimit: 50000,
      maxFeePerGas: 4000000,
      maxPriorityFeePerGas: 2000000,
      value: 0,
      data: '0x1234',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002902e70a80831e8480833d090082c35094222222222222222222222222222222222222222280821234c00000000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-1559 transaction with a provider nonce',
    tx: {
      chainId: 10,
      type: 2,
      from: '0x3333333333333333333333333333333333333333',
      to: '0x4444444444444444444444444444444444444444',
      gasLimit: 65000,
      maxFeePerGas: 5000000,
      maxPriorityFeePerGas: 3000000,
      value: 2,
      data: '0xa9059cbb',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002b02e90a07832dc6c0834c4b4082fde89444444444444444444444444444444444444444440284a9059cbbc0000000000000000000000000000000000000000000'
  }
]

describe('OP Stack L1 fee estimation', () => {
  it.each(fixtures)('encodes $name', async ({ tx, calldata }) => {
    const provider = createProvider()

    const fee = await estimateL1GasCost(provider, tx)

    expect(fee.toString()).toBe('123456789')
    expect(provider.call).toHaveBeenCalledWith({
      to: GAS_PRICE_ORACLE_ADDRESS,
      data: calldata
    })

    if (tx.from && tx.nonce === undefined) {
      expect(provider.getTransactionCount).toHaveBeenCalledWith(tx.from)
    } else {
      expect(provider.getTransactionCount).not.toHaveBeenCalled()
    }
  })

  it('rejects unsupported transaction envelopes before making an RPC call', async () => {
    const provider = createProvider()

    await expect(estimateL1GasCost(provider, { type: 3 })).rejects.toThrow(
      'Unsupported OP Stack transaction type: 3'
    )
    expect(provider.call).not.toHaveBeenCalled()
  })

  it('propagates GasPriceOracle RPC errors', async () => {
    const provider = createProvider()
    provider.call.mockRejectedValue(new Error('oracle unavailable'))

    await expect(estimateL1GasCost(provider, { chainId: 10, type: 2 })).rejects.toThrow('oracle unavailable')
  })
})
