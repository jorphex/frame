import { intToHex } from '@ethereumjs/util'

import type { Block } from '../chains/gas'

interface FeeHistoryResponse {
  baseFeePerGas?: unknown
  gasUsedRatio?: unknown
  reward?: unknown
  oldestBlock?: unknown
}

interface GasPrices {
  slow: string
  standard: string
  fast: string
  asap: string
}

const MAX_UINT256 = (1n << 256n) - 1n
const quantityPattern = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i

function parseFeeQuantity(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length > 66 || !quantityPattern.test(value)) {
    throw new Error(`Invalid eth_feeHistory ${field}`)
  }

  const quantity = BigInt(value)
  if (quantity > MAX_UINT256) throw new Error(`Invalid eth_feeHistory ${field}`)
  return quantity
}

function normalizeFeeHistory(
  response: FeeHistoryResponse,
  requestedBlocks: number,
  rewardPercentiles: number[]
): Block[] {
  const { baseFeePerGas, gasUsedRatio, reward, oldestBlock } = response || {}
  if (
    !Array.isArray(baseFeePerGas) ||
    !Array.isArray(gasUsedRatio) ||
    !Array.isArray(reward) ||
    gasUsedRatio.length > requestedBlocks ||
    baseFeePerGas.length !== gasUsedRatio.length + 1 ||
    reward.length !== gasUsedRatio.length
  ) {
    throw new Error('Invalid eth_feeHistory response shape')
  }

  parseFeeQuantity(oldestBlock, 'oldestBlock')

  return baseFeePerGas.map((baseFee, index) => {
    const isNextBlock = index === gasUsedRatio.length
    if (isNextBlock) {
      return { baseFee: parseFeeQuantity(baseFee, `baseFeePerGas[${index}]`), rewards: [] }
    }

    const ratio = gasUsedRatio[index]
    const rewards = reward[index]
    if (
      typeof ratio !== 'number' ||
      !Number.isFinite(ratio) ||
      ratio < 0 ||
      ratio > 1 ||
      !Array.isArray(rewards) ||
      rewards.length !== rewardPercentiles.length
    ) {
      throw new Error(`Invalid eth_feeHistory block ${index}`)
    }

    return {
      baseFee: parseFeeQuantity(baseFee, `baseFeePerGas[${index}]`),
      gasUsedRatio: ratio,
      rewards: rewards.map((value, rewardIndex) =>
        parseFeeQuantity(value, `reward[${index}][${rewardIndex}]`)
      )
    }
  })
}

export default class GasMonitor {
  private connection

  constructor(connection: any /* Chains */) {
    this.connection = connection
  }

  async getFeeHistory(
    numBlocks: number,
    rewardPercentiles: number[],
    newestBlock = 'pending'
  ): Promise<Block[]> {
    if (!Number.isInteger(numBlocks) || numBlocks < 1 || numBlocks > 1024) {
      throw new Error('Invalid eth_feeHistory block count')
    }
    if (
      rewardPercentiles.length === 0 ||
      rewardPercentiles.some(
        (percentile, index) =>
          !Number.isFinite(percentile) ||
          percentile < 0 ||
          percentile > 100 ||
          (index > 0 && percentile <= rewardPercentiles[index - 1])
      )
    ) {
      throw new Error('Invalid eth_feeHistory reward percentiles')
    }

    const blockCount = intToHex(numBlocks)
    const payload = { method: 'eth_feeHistory', params: [blockCount, newestBlock, rewardPercentiles] }

    const feeHistory: FeeHistoryResponse = await this.connection.send(payload)

    return normalizeFeeHistory(feeHistory, numBlocks, rewardPercentiles)
  }

  async getGasPrices(): Promise<GasPrices> {
    const gasPrice = await this.connection.send({ method: 'eth_gasPrice' })

    // in the future we may want to have specific calculators to calculate variations
    // in the gas price or eliminate this structure altogether
    return {
      slow: gasPrice,
      standard: gasPrice,
      fast: gasPrice,
      asap: gasPrice
    }
  }
}
