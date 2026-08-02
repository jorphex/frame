import { intToHex } from '@ethereumjs/util'
import GasMonitor from '../../../main/transaction/gasMonitor'

let requestHandlers
let testConnection = {
  send: jest.fn((payload) => {
    if (payload.method in requestHandlers) {
      return Promise.resolve(requestHandlers[payload.method](payload.params))
    }

    return Promise.reject('unsupported method: ' + payload.method)
  })
}

describe('#getGasPrices', () => {
  const gasPrice = '0x3baa1028'

  beforeEach(() => {
    requestHandlers = {
      eth_gasPrice: () => gasPrice
    }
  })

  it('sets the slow gas price', async () => {
    const monitor = new GasMonitor(testConnection)

    const gas = await monitor.getGasPrices()

    expect(gas.slow).toBe(gasPrice)
  })

  it('sets the standard gas price', async () => {
    const monitor = new GasMonitor(testConnection)

    const gas = await monitor.getGasPrices()

    expect(gas.standard).toBe(gasPrice)
  })

  it('sets the fast gas price', async () => {
    const monitor = new GasMonitor(testConnection)

    const gas = await monitor.getGasPrices()

    expect(gas.fast).toBe(gasPrice)
  })

  it('sets the asap gas price', async () => {
    const monitor = new GasMonitor(testConnection)

    const gas = await monitor.getGasPrices()

    expect(gas.asap).toBe(gasPrice)
  })

  it.each([null, 1, '1', '0x01'])('rejects an invalid gas price response: %p', async (response) => {
    requestHandlers.eth_gasPrice = () => response

    await expect(new GasMonitor(testConnection).getGasPrices()).rejects.toThrow(
      'Invalid eth_gasPrice response'
    )
  })
})

describe('#getFeeHistory', () => {
  const nextBlockBaseFee = '0xb6'

  let gasUsedRatios, blockRewards

  beforeEach(() => {
    // default to all blocks being ineligible for priority fee calculation
    gasUsedRatios = []
    blockRewards = []

    requestHandlers = {
      eth_feeHistory: jest.fn((params) => {
        const numBlocks = parseInt(params[0] || '0x', 16)
        const rewardPercentiles = params[2]

        return {
          // base fees include the requested number of blocks plus the next block
          baseFeePerGas: Array(numBlocks).fill('0x8').concat([nextBlockBaseFee]),
          gasUsedRatio: fillEmptySlots(gasUsedRatios, numBlocks, 0).reverse(),
          oldestBlock: '0x89502f',
          reward: fillEmptySlots(
            blockRewards,
            numBlocks,
            rewardPercentiles.map(() => '0x0')
          ).reverse()
        }
      })
    }
  })

  it('requests the correct percentiles with the eth_feeHistory RPC call', async () => {
    const monitor = new GasMonitor(testConnection)
    await monitor.getFeeHistory(10, [10, 20, 30])
    expect(requestHandlers['eth_feeHistory']).toHaveBeenCalledWith([intToHex(10), 'pending', [10, 20, 30]])
  })

  it.each([
    [0, [10], 'block count'],
    [1025, [10], 'block count'],
    [1, [], 'reward percentiles'],
    [1, [10, 10], 'reward percentiles'],
    [1, [101], 'reward percentiles']
  ])('rejects invalid fee-history request arguments', async (numBlocks, percentiles, message) => {
    await expect(new GasMonitor(testConnection).getFeeHistory(numBlocks, percentiles)).rejects.toThrow(
      message
    )
    expect(requestHandlers.eth_feeHistory).not.toHaveBeenCalled()
  })

  it('return the correct number of fee history items', async () => {
    const monitor = new GasMonitor(testConnection)
    const feeHistory = await monitor.getFeeHistory(1, [10])
    expect(feeHistory.length).toBe(2)
  })

  it('return the correct baseFee for the next block', async () => {
    const monitor = new GasMonitor(testConnection)
    const feeHistory = await monitor.getFeeHistory(1, [10])
    expect(feeHistory[1].baseFee).toBe(182n)
  })

  it('return the correct fee data for historical blocks', async () => {
    const monitor = new GasMonitor(testConnection)
    const feeHistory = await monitor.getFeeHistory(1, [10])
    expect(feeHistory[0]).toStrictEqual({ baseFee: 8n, gasUsedRatio: 0, rewards: [0n] })
  })

  it('preserves quantities beyond the safe integer range', async () => {
    const exactFee = '0x20000000000001'
    requestHandlers.eth_feeHistory.mockImplementationOnce(() => ({
      baseFeePerGas: [exactFee, exactFee],
      gasUsedRatio: [0.5],
      oldestBlock: '0x1',
      reward: [[exactFee]]
    }))

    const feeHistory = await new GasMonitor(testConnection).getFeeHistory(1, [10])

    expect(feeHistory[0]).toStrictEqual({
      baseFee: 9007199254740993n,
      gasUsedRatio: 0.5,
      rewards: [9007199254740993n]
    })
  })

  it.each([
    {
      name: 'mismatched base-fee length',
      response: { baseFeePerGas: ['0x1'], gasUsedRatio: [0.5], oldestBlock: '0x1', reward: [['0x1']] }
    },
    {
      name: 'non-canonical quantity',
      response: {
        baseFeePerGas: ['0x01', '0x2'],
        gasUsedRatio: [0.5],
        oldestBlock: '0x1',
        reward: [['0x1']]
      }
    },
    {
      name: 'out-of-range gas ratio',
      response: {
        baseFeePerGas: ['0x1', '0x2'],
        gasUsedRatio: [1.1],
        oldestBlock: '0x1',
        reward: [['0x1']]
      }
    },
    {
      name: 'mismatched reward percentiles',
      response: {
        baseFeePerGas: ['0x1', '0x2'],
        gasUsedRatio: [0.5],
        oldestBlock: '0x1',
        reward: [['0x1', '0x2']]
      }
    },
    {
      name: 'more blocks than requested',
      response: {
        baseFeePerGas: ['0x1', '0x2', '0x3'],
        gasUsedRatio: [0.5, 0.5],
        oldestBlock: '0x1',
        reward: [['0x1'], ['0x1']]
      }
    },
    {
      name: 'oversized quantity',
      response: {
        baseFeePerGas: [`0x1${'0'.repeat(64)}`, '0x2'],
        gasUsedRatio: [0.5],
        oldestBlock: '0x1',
        reward: [['0x1']]
      }
    }
  ])('rejects a malformed fee-history response: $name', async ({ response }) => {
    requestHandlers.eth_feeHistory.mockImplementationOnce(() => response)

    await expect(new GasMonitor(testConnection).getFeeHistory(1, [10])).rejects.toThrow(
      'Invalid eth_feeHistory'
    )
  })
})

// helper functions
function fillEmptySlots(arr, targetLength, value) {
  const target = arr.slice()
  let i = 0

  while (i < targetLength) {
    target[i] = target[i] || value
    i += 1
  }

  return target
}
