import type {
  MessageTypes,
  SignTypedDataVersion,
  TypedDataV1,
  TypedMessage as BaseTypedMessage
} from '@metamask/eth-sig-util'
import type { DecodedCallData } from '../contracts'
import type { Chain } from '../chains'
import type { TransactionData } from '../../resources/domain/transaction'
import type { Action } from '../transaction/actions'
import type { TokenData } from '../contracts/erc20'
import type { Token } from '../store/state'
import type { TransactionSimulation, WalletCallsSimulation } from '../transaction/simulation'

export enum ReplacementType {
  Speed = 'speed',
  Cancel = 'cancel'
}

export enum RequestMode {
  Normal = 'normal',
  Monitor = 'monitor'
}

export enum RequestStatus {
  Pending = 'pending',
  Sending = 'sending',
  Verifying = 'verifying',
  Confirming = 'confirming',
  Confirmed = 'confirmed',
  Sent = 'sent',
  Declined = 'declined',
  Error = 'error',
  Success = 'success'
}

export type TypedSignatureRequestType = 'signTypedData' | 'signErc20Permit'

export type SignatureRequestType = 'sign' | TypedSignatureRequestType

export type RequestType =
  | SignatureRequestType
  | 'transaction'
  | 'access'
  | 'addChain'
  | 'switchChain'
  | 'addToken'
  | 'walletCalls'

interface Request {
  type: RequestType
  handlerId: string
}

export type Identity = {
  address: Address
  ens: string
  type: string
}

export interface AccountRequest<T extends RequestType = RequestType> extends Request {
  type: T
  origin: string
  payload: JSONRPCRequestPayload
  account: string
  status?: RequestStatus
  mode?: RequestMode
  notice?: string
  created?: number
  res?: (response?: RPCResponsePayload) => void
}

export interface TransactionReceipt {
  gasUsed: string
  blockNumber: string
}

export interface Approval {
  type: string
  data: any
  approved: boolean
  approve: (data: any) => void
}

export interface Permit {
  deadline: string | number
  spender: string
  value: string | number
  owner: string
  verifyingContract: string
  chainId: number
  nonce: string | number
}

export enum TxClassification {
  CONTRACT_DEPLOY = 'CONTRACT_DEPLOY',
  CONTRACT_CALL = 'CONTRACT_CALL',
  SEND_DATA = 'SEND_DATA',
  NATIVE_TRANSFER = 'NATIVE_TRANSFER'
}

export interface TransactionRequest extends AccountRequest<'transaction'> {
  payload: RPC.SendTransaction.Request
  data: TransactionData
  decodedData?: DecodedCallData
  chainData?: {
    optimism?: {
      l1Fees: string
    }
  }
  tx?: {
    receipt?: TransactionReceipt
    hash?: string
    confirmations: number
  }
  approvals: Approval[]
  locked?: boolean
  automaticFeeUpdateNotice?: {
    previousFee: any
  }
  recipient?: string // ens name
  updatedFees?: boolean
  feeAtTime?: string
  completed?: number
  feesUpdatedByUser: boolean
  recipientType: string
  recognizedActions: Action<unknown>[]
  classification: TxClassification
  simulation: TransactionSimulation
}

export interface SignRequest extends AccountRequest<'sign'> {
  data: {
    rawMessage: string
    decodedMessage: string
    context: MessageSigningContext
  }
  approvals: Approval[]
}

export type MessageSigningMethod = 'personal_sign' | 'eth_sign'

export type MessageSigningRisk =
  | 'legacy-eth-sign'
  | 'opaque-message'
  | 'siwe-malformed'
  | 'siwe-origin-unverified'
  | 'siwe-origin-mismatch'
  | 'siwe-address-mismatch'
  | 'siwe-chain-mismatch'
  | 'siwe-expired'
  | 'siwe-not-yet-valid'
  | 'siwe-issued-in-future'

export interface SiweMessageData {
  scheme?: string
  domain: string
  address: string
  statement?: string
  uri: string
  version: string
  chainId: string
  nonce: string
  issuedAt?: string
  expirationTime?: string
  notBefore?: string
  requestId?: string
  resources?: string[]
}

export interface MessageSigningContext {
  method: MessageSigningMethod
  requestChainId: number
  origin: string
  encoding: 'utf8' | 'hex'
  byteLength: number
  risks: MessageSigningRisk[]
  siwe?: SiweMessageData
}

export type TypedData<T extends MessageTypes = MessageTypes> = BaseTypedMessage<T>
export type LegacyTypedData = TypedDataV1

export interface TypedMessage<V extends SignTypedDataVersion = SignTypedDataVersion> {
  data: V extends SignTypedDataVersion.V1 ? LegacyTypedData : TypedData
  version: V
}

export type TypedDataRisk =
  | 'legacy-v1'
  | 'domain-chain-missing'
  | 'domain-chain-invalid'
  | 'domain-chain-mismatch'

export interface TypedDataContext {
  requestChainId: number
  domainChainId?: string
  risks: TypedDataRisk[]
}

export type SignTypedDataRequest = DefaultSignTypedDataRequest | PermitSignatureRequest

export type SignatureRequest = SignTypedDataRequest | SignRequest

export interface DefaultSignTypedDataRequest extends AccountRequest<'signTypedData'> {
  typedMessage: TypedMessage
  context: TypedDataContext
  approvals: Approval[]
}

interface EIP2612PermitDomain {
  chainId: number
  verifyingContract: string
}

export interface EIP2612TypedData {
  types: MessageTypes
  primaryType: 'Permit'
  domain: EIP2612PermitDomain
  message: Omit<Permit, 'chainId' | 'verifyingContract'>
}

interface PermitData extends Omit<Permit, 'spender' | 'verifyingContract'> {
  spender: Identity
  verifyingContract: Identity
}

export interface PermitSignatureRequest extends AccountRequest<'signErc20Permit'> {
  typedMessage: {
    data: EIP2612TypedData
    version: SignTypedDataVersion
  }
  permit: PermitData
  tokenData: TokenData
  context: TypedDataContext
  approvals: Approval[]
}

export type AccessRequest = AccountRequest<'access'>

export interface AddChainRequest extends AccountRequest<'addChain'> {
  chain: Chain
}

export interface SwitchChainRequest extends AccountRequest<'switchChain'> {
  chain: Chain
  sourceChainId: number
}

export interface AddTokenRequest extends AccountRequest<'addToken'> {
  token: Token
}

export interface WalletCallsRequest extends AccountRequest<'walletCalls'> {
  version: '2.0.0'
  batchId: string
  chainId: string
  atomic: false
  calls: Array<{
    to?: string
    data: string
    value: string
  }>
  locked?: boolean
  preparation: WalletCallsPreparation
  simulation: WalletCallsSimulation
}

export type WalletCallsPreparation =
  | { status: 'pending' }
  | { status: 'failed'; reason: string }
  | {
      status: 'succeeded'
      calls: readonly Readonly<{
        transaction: Readonly<TransactionData>
        maxFee: string
      }>[]
      maxFee: string
    }
