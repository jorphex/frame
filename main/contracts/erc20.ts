import { toNumber } from 'ethers'
import { addHexPrefix } from '@ethereumjs/util'
import provider from '../provider'
import { erc20Interface } from '../../resources/contracts'

import type { Result, TransactionDescription } from 'ethers'

export interface TokenData {
  decimals?: number
  name: string
  symbol: string
  totalSupply?: string
}

function callContract(address: Address, chainId: number, fn: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const wrappedPayload = {
      method: 'eth_call',
      params: [{ to: address, data: erc20Interface.encodeFunctionData(fn) }, 'latest'],
      id: 1,
      jsonrpc: '2.0',
      _origin: 'frame-internal',
      chainId: addHexPrefix(chainId.toString(16))
    } as const

    provider.sendAsync(wrappedPayload, (error, response) => {
      if (error) return reject(error)
      if (!response?.result) return reject(new Error(`Missing ${fn} contract result`))
      try {
        resolve(erc20Interface.decodeFunctionResult(fn, response.result))
      } catch (decodeError) {
        reject(decodeError)
      }
    })
  })
}

export default class Erc20Contract {
  private address: Address
  private chainId: number

  constructor(address: Address, chainId: number) {
    this.address = address
    this.chainId = chainId
  }

  static isApproval(data: TransactionDescription) {
    return (
      data.name === 'approve' &&
      data.fragment.inputs.length === 2 &&
      (data.fragment.inputs[0].name || '').toLowerCase().endsWith('spender') &&
      data.fragment.inputs[0].type === 'address' &&
      (data.fragment.inputs[1].name || '').toLowerCase().endsWith('value') &&
      data.fragment.inputs[1].type === 'uint256'
    )
  }

  static isTransfer(data: TransactionDescription) {
    return (
      data.name === 'transfer' &&
      data.fragment.inputs.length === 2 &&
      (data.fragment.inputs[0].name || '').toLowerCase().endsWith('to') &&
      data.fragment.inputs[0].type === 'address' &&
      (data.fragment.inputs[1].name || '').toLowerCase().endsWith('value') &&
      data.fragment.inputs[1].type === 'uint256'
    )
  }

  static decodeCallData(calldata: string) {
    try {
      return erc20Interface.parseTransaction({ data: calldata })
    } catch (e) {
      // call does not match ERC-20 interface
    }
  }

  static encodeCallData(fn: string, params: any[]) {
    return erc20Interface.encodeFunctionData(fn, params)
  }

  async getTokenData(): Promise<TokenData> {
    const read = (fn: string) => callContract(this.address, this.chainId, fn)
    const calls = await Promise.all([
      read('decimals')
        .then(([decimals]) => toNumber(decimals))
        .catch(() => undefined),
      read('name')
        .then(([name]) => name)
        .catch(() => ''),
      read('symbol')
        .then(([symbol]) => symbol)
        .catch(() => ''),
      read('totalSupply')
        .then(([supply]) => supply.toString())
        .catch(() => '') // totalSupply is mandatory on the ERC20 interface
    ])

    return {
      decimals: calls[0],
      name: calls[1],
      symbol: calls[2],
      totalSupply: calls[3]
    }
  }
}
