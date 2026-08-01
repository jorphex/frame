import type { Provider, TransactionRequest } from '@ethersproject/providers'
import { BigNumber, utils } from 'ethers'

export const GAS_PRICE_ORACLE_ADDRESS = '0x420000000000000000000000000000000000000F'

const gasPriceOracle = new utils.Interface(['function getL1Fee(bytes) view returns (uint256)'])

async function getNonce(provider: Provider, tx: TransactionRequest): Promise<number> {
  if (tx.nonce !== undefined) return BigNumber.from(tx.nonce).toNumber()
  if (tx.from !== undefined) return provider.getTransactionCount(tx.from)

  // Match the OP SDK fallback: non-zero bytes give a conservative data-fee estimate.
  return 0xffffffff
}

export async function estimateL1GasCost(provider: Provider, tx: TransactionRequest): Promise<BigNumber> {
  const type = tx.type ?? 0

  if (type !== 0 && type !== 1 && type !== 2) {
    throw new Error(`Unsupported OP Stack transaction type: ${type}`)
  }

  const transaction: Parameters<typeof utils.serializeTransaction>[0] = {
    nonce: await getNonce(provider, tx),
    type
  }

  if (tx.to !== undefined) transaction.to = tx.to
  if (tx.gasLimit !== undefined) transaction.gasLimit = tx.gasLimit
  if (tx.data !== undefined) transaction.data = tx.data
  if (tx.value !== undefined) transaction.value = tx.value
  if (tx.chainId !== undefined) transaction.chainId = tx.chainId

  if ((type === 0 || type === 1) && tx.gasPrice !== undefined) transaction.gasPrice = tx.gasPrice
  if ((type === 1 || type === 2) && tx.accessList !== undefined) transaction.accessList = tx.accessList
  if (type === 2) {
    if (tx.maxFeePerGas !== undefined) transaction.maxFeePerGas = tx.maxFeePerGas
    if (tx.maxPriorityFeePerGas !== undefined) {
      transaction.maxPriorityFeePerGas = tx.maxPriorityFeePerGas
    }
  }

  const serialized = utils.serializeTransaction(transaction)
  const data = gasPriceOracle.encodeFunctionData('getL1Fee', [serialized])
  const result = await provider.call({ to: GAS_PRICE_ORACLE_ADDRESS, data })
  const [fee] = gasPriceOracle.decodeFunctionResult('getL1Fee', result)

  return BigNumber.from(fee)
}
