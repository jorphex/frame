import { Interface, Transaction, getNumber } from 'ethers'

import type { AccessListish, BigNumberish, TransactionLike } from 'ethers'

export const GAS_PRICE_ORACLE_ADDRESS = '0x420000000000000000000000000000000000000F'

const gasPriceOracle = new Interface(['function getL1Fee(bytes) view returns (uint256)'])

export interface RpcProvider {
  call: (tx: { to: string; data: string }) => Promise<string>
  getTransactionCount: (address: string) => Promise<number>
}

export interface OptimismTransactionRequest {
  type?: BigNumberish
  nonce?: BigNumberish
  from?: string
  to?: string | null
  gasLimit?: BigNumberish
  data?: string
  value?: BigNumberish
  chainId?: BigNumberish
  gasPrice?: BigNumberish
  accessList?: AccessListish
  maxFeePerGas?: BigNumberish
  maxPriorityFeePerGas?: BigNumberish
}

export interface CallbackProvider {
  sendAsync: (
    payload: { jsonrpc: '2.0'; id: number; method: string; params: unknown[] },
    callback: (error: Error | null, response?: { error?: { message?: string }; result?: unknown }) => void
  ) => void
}

export function createRpcProvider(provider: CallbackProvider): RpcProvider {
  const request = <T>(method: string, params: unknown[]) =>
    new Promise<T>((resolve, reject) => {
      provider.sendAsync({ jsonrpc: '2.0', id: 1, method, params }, (error, response) => {
        if (error) return reject(error)
        if (response?.error) return reject(new Error(response.error.message || 'RPC request failed'))
        resolve(response?.result as T)
      })
    })

  return {
    call: (tx) => request<string>('eth_call', [tx, 'latest']),
    getTransactionCount: async (address) =>
      getNumber(await request<string>('eth_getTransactionCount', [address, 'latest']))
  }
}

async function getNonce(provider: RpcProvider, tx: OptimismTransactionRequest): Promise<number> {
  if (tx.nonce !== undefined) return getNumber(tx.nonce)
  if (tx.from !== undefined) return provider.getTransactionCount(tx.from)

  // Match the OP SDK fallback: non-zero bytes give a conservative data-fee estimate.
  return 0xffffffff
}

export async function estimateL1GasCost(
  provider: RpcProvider,
  tx: OptimismTransactionRequest
): Promise<bigint> {
  const type = getNumber(tx.type ?? 0)

  if (type !== 0 && type !== 1 && type !== 2) {
    throw new Error(`Unsupported OP Stack transaction type: ${type}`)
  }

  const transaction: TransactionLike = {
    nonce: await getNonce(provider, tx),
    type
  }

  if (tx.to != null) transaction.to = tx.to
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

  const serialized = Transaction.from(transaction).unsignedSerialized
  const data = gasPriceOracle.encodeFunctionData('getL1Fee', [serialized])
  const result = await provider.call({ to: GAS_PRICE_ORACLE_ADDRESS, data })
  const [fee] = gasPriceOracle.decodeFunctionResult('getL1Fee', result)

  return fee
}
