import { Interface, toNumber } from 'ethers'
import { addHexPrefix } from '@ethereumjs/util'
import provider from '../provider'
import { erc20Interface } from '../../resources/contracts'

import type { Result, TransactionDescription } from 'ethers'

const erc1046Interface = new Interface(['function tokenURI() view returns (string)'])

export interface TokenData {
  decimals?: number
  name: string
  symbol: string
  totalSupply?: string
}

function callContract(
  address: Address,
  chainId: number,
  fn: string,
  contractInterface: Interface = erc20Interface
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const wrappedPayload = {
      method: 'eth_call',
      params: [{ to: address, data: contractInterface.encodeFunctionData(fn) }, 'latest'],
      id: 1,
      jsonrpc: '2.0',
      _origin: 'frame-internal',
      chainId: addHexPrefix(chainId.toString(16))
    } as const

    provider.sendAsync(wrappedPayload, (error, response) => {
      if (error) return reject(error)
      if (typeof response?.result !== 'string') return reject(new Error(`Missing ${fn} contract result`))
      try {
        resolve(contractInterface.decodeFunctionResult(fn, response.result))
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
    const [spender, value] = data.fragment.inputs
    return (
      data.name === 'approve' &&
      data.fragment.inputs.length === 2 &&
      spender !== undefined &&
      value !== undefined &&
      (spender.name || '').toLowerCase().endsWith('spender') &&
      spender.type === 'address' &&
      (value.name || '').toLowerCase().endsWith('value') &&
      value.type === 'uint256'
    )
  }

  static isTransfer(data: TransactionDescription) {
    const [recipient, value] = data.fragment.inputs
    return (
      data.name === 'transfer' &&
      data.fragment.inputs.length === 2 &&
      recipient !== undefined &&
      value !== undefined &&
      (recipient.name || '').toLowerCase().endsWith('to') &&
      recipient.type === 'address' &&
      (value.name || '').toLowerCase().endsWith('value') &&
      value.type === 'uint256'
    )
  }

  static decodeCallData(calldata: string) {
    try {
      return erc20Interface.parseTransaction({ data: calldata })
    } catch (e) {
      // call does not match ERC-20 interface
    }

    return undefined
  }

  static encodeCallData(fn: string, params: readonly unknown[]) {
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
      ...(calls[0] !== undefined && { decimals: calls[0] }),
      name: calls[1],
      symbol: calls[2],
      totalSupply: calls[3]
    }
  }

  async getTokenUri(): Promise<string> {
    const [tokenUri] = await callContract(this.address, this.chainId, 'tokenURI', erc1046Interface)
    if (typeof tokenUri !== 'string' || !tokenUri) throw new Error('Missing tokenURI contract result')
    return tokenUri
  }
}
