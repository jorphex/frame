import type { Action } from '.'
import { erc20Interface } from '../../../resources/contracts'
import { MAX_UINT256 } from '../../../resources/domain/transaction/quantity'
import { parseTokenBaseUnitAmount } from '../../../resources/domain/token/amount'
import type { Identity, TransactionRequest } from '../../accounts/types'

export type ActionType = 'erc20:approve' | 'erc20:revoke' | 'erc20:transfer'

type Erc20Spend = {
  amount: HexAmount
  decimals?: number
  name: string
  symbol: string
}

export type Erc20Approve = Erc20Spend & {
  spender: Identity
  contract: Identity
}

type Erc20Transfer = Erc20Spend & {
  recipient: Identity
}

export type ApproveAction = Action<Erc20Approve>
export type TransferAction = Action<Erc20Transfer>

export function updateErc20ApprovalAmount(request: TransactionRequest, data: Erc20Approve, amount: unknown) {
  const parsedAmount = parseTokenBaseUnitAmount(amount)
  if (parsedAmount === undefined) return false

  const approvedAmount = parsedAmount.toString(10)
  const calldata = erc20Interface.encodeFunctionData('approve', [data.spender.address, approvedAmount])

  data.amount = approvedAmount
  request.data.data = calldata

  const decodedAmount = request.decodedData?.args[1]
  if (decodedAmount) {
    decodedAmount.value = parsedAmount === MAX_UINT256 ? 'unlimited' : approvedAmount
  }

  return true
}
