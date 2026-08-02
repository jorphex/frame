import EventEmitter from 'events'
import crypto from 'crypto'
import log from 'electron-log'
import { v4 as uuid } from 'uuid'
import { isAddress } from 'ethers'
import { recoverTypedSignature, SignTypedDataVersion } from '@metamask/eth-sig-util'
import { addHexPrefix, intToHex } from '@ethereumjs/util'

import store from '../store'
import packageFile from '../../package.json'

import proxyConnection from './proxy'
import accounts, {
  AccountRequest,
  TransactionRequest,
  SignTypedDataRequest,
  AddChainRequest,
  SwitchChainRequest,
  AddTokenRequest,
  WalletCallsRequest
} from '../accounts'

import FrameAccount from '../accounts/Account'
import Chains, { Chain } from '../chains'
import { createRpcProvider, estimateL1GasCost } from '../chains/optimism'
import reveal from '../reveal'
import { getSignerType, Type as SignerType } from '../../resources/domain/signer'
import { normalizeChainId, TransactionData } from '../../resources/domain/transaction'
import { populate as populateTransaction, maxFee, classifyTransaction } from '../transaction'
import { capitalize } from '../../resources/utils'
import { ApprovalType } from '../../resources/constants'
import { createObserver as AssetsObserver, loadAssets } from './assets'
import { getTypedDataContext, parseTypedMessage } from './typedData'
import { parseAddChainRequest, parseChainRequestId } from './chainRequests'
import { parseWatchAssetRequest } from './watchAsset'
import {
  grantedAccountPermission,
  parseGetPermissions,
  parseRequestPermissions,
  requestedAccountPermission
} from './permissions'
import Erc20Contract from '../contracts/erc20'
import { getOriginAccess, requestOriginAccess } from '../api/origins'
import { parseCallsStatus, parseGetCapabilities, parseSendCalls, parseShowCallsStatus } from './walletCalls'
import { WalletCallLifecycleController } from './walletCallLifecycle'
import walletCallBatchLedger from './walletCallLedger'
import { executeWalletCallRuntime } from './walletCallRuntime'
import walletCallEvidenceRuntime from './walletCallEvidenceRuntime'
import { showWalletCallStatus } from './walletCallStatusView'

import { Subscription, SubscriptionType, hasSubscriptionPermission } from './subscriptions'
import {
  checkExistingNonceGas,
  ecRecover,
  feeTotalOverMax,
  gasFees,
  getRawTx,
  getSignedAddress,
  resError
} from './helpers'

import {
  createChainsObserver as ChainsObserver,
  createOriginChainObserver as OriginChainObserver,
  getActiveChains
} from './chains'
import {
  EIP2612TypedData,
  LegacyTypedData,
  MessageSigningMethod,
  PermitSignatureRequest,
  SignRequest,
  TypedData,
  TypedMessage
} from '../accounts/types'
import * as sigParser from '../signatures'
import { parseMessageRequest } from '../signatures/message'
import { hasAddress } from '../../resources/domain/account'
import { mapRequest } from '../requests'

import type { Origin, Token } from '../store/state'

interface RequiredApproval {
  type: ApprovalType
  data: any
}

export interface TransactionMetadata {
  tx: TransactionData
  approvals: RequiredApproval[]
}

const storeApi = {
  getOrigin: (id: string) => store('main.origins', id) as Origin
}

const getAccounts = () => accounts
const MAX_TOKEN_NAME_LENGTH = 128
const MAX_TOKEN_SYMBOL_LENGTH = 32
const TOKEN_METADATA_TIMEOUT_MS = 15_000

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Token metadata request timed out')), timeoutMs)
    timer.unref()
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const getPayloadOrigin = ({ _origin }: RPCRequestPayload) => storeApi.getOrigin(_origin)

export class Provider extends EventEmitter {
  connected = false
  connection = Chains
  private pendingAssetSuggestions = new Set<string>()

  handlers: { [id: string]: any } = {}
  subscriptions: { [key in SubscriptionType]: Subscription[] } = {
    accountsChanged: [],
    assetsChanged: [],
    chainChanged: [],
    chainsChanged: [],
    networkChanged: []
  }

  constructor() {
    super()

    this.connection.on('connect', (...args) => {
      this.connected = true
      this.emit('connect', ...args)
    })

    this.connection.on('close', () => {
      this.connected = false
    })

    this.connection.on('data', (chain, ...args) => {
      if ((args[0] || {}).method === 'eth_subscription') {
        this.emit('data:subscription', ...args)
      }

      this.emit(`data:${chain.type}:${chain.id}`, ...args)
    })

    this.connection.on('error', (chain, err) => {
      log.error(err)
    })

    this.connection.on('update', (chain: Chain, event) => {
      if (event.type === 'fees') {
        const accountsState = getAccounts()
        if (accountsState && typeof accountsState.updatePendingFees === 'function') {
          return accountsState.updatePendingFees(chain.id)
        }
      }

      if (event.type === 'status') {
        this.emit(`status:${chain.type}:${chain.id}`, event.status)
      }
    })

    proxyConnection.on('provider:send', (payload: RPCRequestPayload) => {
      const { id, method } = payload
      this.send(payload, ({ error, result }) => {
        proxyConnection.emit('payload', { id, method, error, result })
      })
    })

    proxyConnection.on('provider:subscribe', (payload: RPC.Subscribe.Request) => {
      const subId = this.createSubscription(payload)
      const { id, jsonrpc } = payload

      proxyConnection.emit('payload', { id, jsonrpc, result: subId })
    })

    this.getNonce = this.getNonce.bind(this)
  }

  accountsChanged(accounts: string[]) {
    const address = accounts[0]

    this.subscriptions.accountsChanged
      .filter((subscription) =>
        hasSubscriptionPermission(SubscriptionType.ACCOUNTS, address, subscription.originId)
      )
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, accounts))
  }

  assetsChanged(address: string, assets: RPC.GetAssets.Assets) {
    this.subscriptions.assetsChanged
      .filter((subscription) =>
        hasSubscriptionPermission(SubscriptionType.ASSETS, address, subscription.originId)
      )
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, { ...assets, account: address }))
  }

  chainChanged(chainId: number, originId: string) {
    const chain = intToHex(chainId)

    this.subscriptions.chainChanged
      .filter((subscription) => subscription.originId === originId)
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, chain))
  }

  // fires when the list of available chains changes
  chainsChanged(address: string, chains: RPC.GetEthereumChains.Chain[]) {
    this.subscriptions.chainsChanged
      .filter((subscription) => hasSubscriptionPermission('chainsChanged', address, subscription.originId))
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, chains))
  }

  networkChanged(netId: number | string, originId: string) {
    this.subscriptions.networkChanged
      .filter((subscription) => subscription.originId === originId)
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, netId))
  }

  private sendSubscriptionData(subscription: string, result: any) {
    const payload: RPC.Susbcription.Response = {
      jsonrpc: '2.0',
      method: 'eth_subscription',
      params: { subscription, result }
    }

    proxyConnection.emit('payload', payload)
    this.emit('data:subscription', payload)
  }

  getNetVersion(payload: RPCRequestPayload, res: RPCRequestCallback, targetChain: Chain) {
    const chain = store('main.networks.ethereum', targetChain.id)
    if (!chain?.on) {
      return resError(
        { message: `Frame is not connected to chain ${targetChain.id}`, code: 4901 },
        payload,
        res
      )
    }

    res({ id: payload.id, jsonrpc: payload.jsonrpc, result: targetChain.id.toString() })
  }

  getChainId(payload: RPCRequestPayload, res: RPCRequestCallback, targetChain: Chain) {
    const chain = store('main.networks.ethereum', targetChain.id)
    if (!chain?.on) {
      return resError(
        { message: `Frame is not connected to chain ${targetChain.id}`, code: 4901 },
        payload,
        res
      )
    }

    res({ id: payload.id, jsonrpc: payload.jsonrpc, result: intToHex(targetChain.id) })
  }

  declineRequest(req: AccountRequest) {
    const res = (data: any) => {
      if (this.handlers[req.handlerId]) this.handlers[req.handlerId](data)
      delete this.handlers[req.handlerId]
    }

    const payload = req.payload
    resError({ message: 'User declined transaction', code: 4001 }, payload, res)
  }

  verifySignature(signed: string, message: string, address: string, cb: Callback<boolean>) {
    getSignedAddress(signed, message, (err, verifiedAddress) => {
      if (err) return cb(err)
      if ((verifiedAddress || '').toLowerCase() !== address.toLowerCase())
        return cb(new Error('Frame verifySignature: Failed ecRecover check'))
      cb(null, true)
    })
  }

  approveSign(req: SignRequest, cb: Callback<string>) {
    const res = (data: any) => {
      if (this.handlers[req.handlerId]) this.handlers[req.handlerId](data)
      delete this.handlers[req.handlerId]
    }

    const storedRequest = accounts.current()?.getRequest(req.handlerId)
    if (!storedRequest || storedRequest.type !== 'sign') {
      const error = new Error('Message signing request is no longer available')
      resError(error.message, req.payload, res)
      return cb(error)
    }
    const signRequest = storedRequest as SignRequest
    if (
      !Array.isArray(signRequest.approvals) ||
      signRequest.approvals.some((approval) => !approval.approved)
    ) {
      return cb(new Error('Message signature approval state is missing or unconfirmed'))
    }

    const { payload, data } = signRequest
    const address = signRequest.account
    const message = data.rawMessage

    accounts.signMessage(address, message, (err, signed) => {
      if (err) {
        resError(err.message, payload, res)
        cb(err, undefined)
      } else {
        const signature = signed || ''
        this.verifySignature(signature, message, address, (err) => {
          if (err) {
            resError(err.message, payload, res)
            cb(err)
          } else {
            res({ id: payload.id, jsonrpc: payload.jsonrpc, result: signature })
            cb(null, signature)
          }
        })
      }
    })
  }

  approveSignTypedData(req: SignTypedDataRequest, cb: Callback<string>) {
    const res = (data: unknown) => {
      if (this.handlers[req.handlerId]) this.handlers[req.handlerId](data)
      delete this.handlers[req.handlerId]
    }

    if (!Array.isArray(req.approvals) || req.approvals.some((approval) => !approval.approved)) {
      return cb(new Error('Typed signature approval state is missing or unconfirmed'))
    }

    const { payload, typedMessage } = req
    const [address] = payload.params

    accounts.signTypedData(address, typedMessage, (err, signature = '') => {
      if (err) {
        resError(err.message, payload, res)
        cb(err)
      } else {
        try {
          const recoveredAddress = recoverTypedSignature({ ...typedMessage, signature })
          if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            throw new Error('TypedData signature verification failed')
          }

          res({ id: payload.id, jsonrpc: payload.jsonrpc, result: signature })
          cb(null, signature)
        } catch (e) {
          const err = e as Error
          resError(err.message, payload, res)

          cb(err)
        }
      }
    })
  }

  async getL1GasCost(txData: TransactionData) {
    const { chainId, type, ...tx } = txData

    const txRequest = {
      ...tx,
      type: parseInt(type, 16),
      chainId: parseInt(chainId, 16)
    }

    const connection = this.connection.connections['ethereum'][txRequest.chainId] as any
    const connectedProvider = connection?.primary?.connected
      ? connection.primary?.provider
      : connection.secondary?.provider

    if (!connectedProvider) {
      return 0n
    }

    return estimateL1GasCost(createRpcProvider(connectedProvider), txRequest)
  }

  signAndSend(req: TransactionRequest, cb: Callback<string>) {
    const rawTx = req.data
    const res = (data: any) => {
      if (this.handlers[req.handlerId]) this.handlers[req.handlerId](data)
      delete this.handlers[req.handlerId]
    }

    const payload = req.payload
    const maxTotalFee = maxFee(rawTx)

    if (feeTotalOverMax(rawTx, maxTotalFee)) {
      const chainId = parseInt(rawTx.chainId)
      const symbol = store(`main.networks.ethereum.${chainId}.symbol`)
      const displayAmount = symbol ? ` (${maxTotalFee / 10n ** 18n} ${symbol})` : ''

      const err = `Max fee is over hard limit${displayAmount}`

      resError(err, payload, res)
      cb(new Error(err))
    } else {
      accounts.signTransaction(rawTx, (err, signedTx) => {
        // Sign Transaction
        if (err) {
          resError(err, payload, res)
          cb(err)
        } else {
          accounts.setTxSigned(req.handlerId, (err) => {
            if (err) return cb(err)
            let done = false
            const cast = () => {
              this.connection.send(
                {
                  id: req.payload.id,
                  jsonrpc: req.payload.jsonrpc,
                  method: 'eth_sendRawTransaction',
                  params: [signedTx]
                },
                (response) => {
                  clearInterval(broadcastTimer)
                  if (done) return
                  done = true
                  if (response.error) {
                    resError(response.error, payload, res)
                    cb(new Error(response.error.message))
                  } else {
                    res(response)
                    cb(null, response.result)
                  }
                },
                {
                  type: 'ethereum',
                  id: parseInt(req.data.chainId, 16)
                }
              )
            }
            const broadcastTimer = setInterval(() => cast(), 1000)
            cast()
          })
        }
      })
    }
  }

  approveTransactionRequest(req: TransactionRequest, cb: Callback<string>) {
    if (req.simulation?.status === 'pending') {
      return cb(new Error('Transaction execution check is still pending'))
    }

    if ((req.approvals || []).some((approval) => !approval.approved)) {
      return cb(new Error('Transaction has an unconfirmed required approval'))
    }

    const signAndSend = (requestToSign: TransactionRequest) => {
      // remove callback from logging
      const { res, ...txToLog } = requestToSign
      log.info('approveRequest', txToLog)

      this.signAndSend(requestToSign, cb)
    }

    accounts.lockRequest(req.handlerId)

    if (req.data.nonce) return signAndSend(req)

    this.getNonce(req.data, (response) => {
      if (response.error) {
        if (this.handlers[req.handlerId]) {
          this.handlers[req.handlerId](response)
          delete this.handlers[req.handlerId]
        }

        return cb(new Error(response.error.message))
      }

      const updatedReq = accounts.updateNonce(req.handlerId, response.result)

      if (updatedReq) {
        signAndSend(updatedReq)
      } else {
        log.error(`could not find request with handlerId="${req.handlerId}"`)
        cb(new Error('could not find request'))
      }
    })
  }

  private addRequestHandler(res: RPCRequestCallback) {
    const handlerId: string = uuid()
    this.handlers[handlerId] = res

    return handlerId
  }

  private createWalletCallLifecycle() {
    return new WalletCallLifecycleController({
      ledger: walletCallBatchLedger,
      accounts,
      execute: (input) =>
        executeWalletCallRuntime(input, {
          accounts,
          connection: this.connection,
          ledger: walletCallBatchLedger,
          evidenceAvailable: () => walletCallEvidenceRuntime.wake()
        }),
      reportError: (error) => log.error('Wallet-call lifecycle error', error)
    })
  }

  sendWalletCalls(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      const access = getOriginAccess(payload)
      if (!access?.permission?.provider) {
        throw { code: 4100, message: 'Origin is not authorized for wallet calls' }
      }

      const currentAccount = accounts.current()
      if (!currentAccount || currentAccount.id.toLowerCase() !== access.address.toLowerCase()) {
        throw { code: 4100, message: 'Wallet-call account is no longer selected' }
      }

      const request = parseSendCalls(payload.params)
      if (request.from && request.from !== currentAccount.id.toLowerCase()) {
        throw { code: 4100, message: 'Wallet-call sender is not the selected account' }
      }

      const chainId = Number(BigInt(request.chainId))
      if (!this.walletCallChainAvailable(chainId)) {
        throw { code: 5710, message: `Unsupported chain id: ${request.chainId}` }
      }

      return this.createWalletCallLifecycle().admit(
        {
          handlerId: uuid(),
          origin: payload._origin,
          account: currentAccount.id,
          payload
        },
        res
      )
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }
  }

  approveWalletCallsRequest(accountId: string, handlerId: string) {
    try {
      const request = accounts.getRequestForAccount<WalletCallsRequest>(accountId, handlerId)
      if (request.type !== 'walletCalls') throw new Error('Wallet-call request is no longer available')

      let rejection: EVMError | undefined
      if (!this.walletCallOriginAuthorized(request.origin, request.account)) {
        rejection = { code: 4100, message: 'Wallet-call origin is no longer authorized' }
      } else {
        try {
          if (!this.walletCallChainAvailable(Number(BigInt(request.chainId)))) {
            rejection = { code: 5710, message: `Unsupported chain id: ${request.chainId}` }
          }
        } catch (_) {
          rejection = { code: -32602, message: 'Invalid wallet-call chain id' }
        }
      }

      if (rejection) {
        accounts.rejectRequestForAccount(accountId, handlerId, rejection)
        throw Object.assign(new Error(rejection.message), { code: rejection.code })
      }

      return this.createWalletCallLifecycle().approve(accountId, handlerId)
    } catch (error) {
      return Promise.reject(error)
    }
  }

  declineWalletCallsRequest(accountId: string, handlerId: string) {
    return accounts.rejectRequestForAccount(accountId, handlerId, {
      code: 4001,
      message: 'User rejected the wallet-call request'
    })
  }

  getWalletCallsStatus(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      const id = parseCallsStatus(payload.params)
      const access = getOriginAccess(payload)
      if (!access?.permission?.provider) {
        throw { code: 4100, message: 'Origin is not authorized for wallet-call status' }
      }

      const result = walletCallBatchLedger.getStatus(payload._origin, access.address, id)
      return res({ id: payload.id, jsonrpc: payload.jsonrpc, result })
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }
  }

  showWalletCallsStatus(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      const id = parseShowCallsStatus(payload.params)
      const access = getOriginAccess(payload)
      if (!access?.permission?.provider) {
        throw { code: 4100, message: 'Origin is not authorized for wallet-call status' }
      }

      const status = walletCallBatchLedger.getStatus(payload._origin, access.address, id)
      showWalletCallStatus({ account: access.address, originName: access.origin, status })
      return res({ id: payload.id, jsonrpc: payload.jsonrpc, result: null })
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }
  }

  getWalletCallCapabilities(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      const request = parseGetCapabilities(payload.params)
      const access = getOriginAccess(payload)
      if (!access?.permission?.provider || request.address.toLowerCase() !== access.address.toLowerCase()) {
        throw { code: 4100, message: 'Account is not authorized for wallet-call capabilities' }
      }

      const requestedChains =
        request.chainIds ||
        Object.keys(this.connection.connections?.ethereum || {})
          .map(Number)
          .filter((id) => Number.isSafeInteger(id) && id > 0)
          .map((id) => intToHex(id))
      const result = [...new Set(requestedChains)]
        .map((chainId) => ({ chainId, numericId: Number(BigInt(chainId)) }))
        .filter(({ numericId }) => this.walletCallChainAvailable(numericId))
        .sort((left, right) => left.numericId - right.numericId)
        .reduce<Record<string, { atomic: { status: 'unsupported' } }>>((capabilities, { numericId }) => {
          capabilities[intToHex(numericId)] = { atomic: { status: 'unsupported' } }
          return capabilities
        }, {})

      return res({ id: payload.id, jsonrpc: payload.jsonrpc, result })
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }
  }

  private walletCallOriginAuthorized(originId: string, accountId: string) {
    const origin = store('main.origins', originId)
    if (!origin || typeof origin.name !== 'string') return false
    const permissions = (store('main.permissions', accountId.toLowerCase()) || {}) as Record<
      string,
      { origin?: string; provider?: boolean }
    >
    return Object.values(permissions).some(
      (permission) => permission.origin === origin.name && permission.provider === true
    )
  }

  private walletCallChainAvailable(chainId: number) {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) return false
    const network = store('main.networks.ethereum', chainId)
    const connection = this.connection.connections?.ethereum?.[chainId]
    return Boolean(
      network &&
        network.on !== false &&
        connection?.chainConfig &&
        (connection.primary?.connected || connection.secondary?.connected)
    )
  }

  private async getGasEstimate(rawTx: TransactionData) {
    const { from, to, value, data, nonce } = rawTx
    const txParams = { from, to, value, data, nonce }

    const payload: JSONRPCRequestPayload = {
      method: 'eth_estimateGas',
      params: [txParams],
      jsonrpc: '2.0',
      id: 1
    }

    const targetChain: Chain = {
      type: 'ethereum',
      id: parseInt(rawTx.chainId, 16)
    }

    return new Promise<string>((resolve, reject) => {
      this.connection.send(
        payload,
        (response) => {
          if (response.error) {
            log.warn(`error estimating gas for tx to ${txParams.to}: ${response.error}`)
            return reject(response.error)
          }

          const estimatedLimit = parseInt(response.result, 16)
          const paddedLimit = Math.ceil(estimatedLimit * 1.5)

          log.verbose(
            `gas estimate for tx to ${txParams.to}: ${estimatedLimit}, using ${paddedLimit} as gas limit`
          )
          return resolve(addHexPrefix(paddedLimit.toString(16)))
        },
        targetChain
      )
    })
  }

  getNonce(rawTx: TransactionData, res: RPCRequestCallback) {
    const targetChain: Chain = {
      type: 'ethereum',
      id: parseInt(rawTx.chainId, 16)
    }

    this.connection.send(
      { id: 1, jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [rawTx.from, 'pending'] },
      res,
      targetChain
    )
  }

  async fillTransaction(newTx: RPC.SendTransaction.TxParams, cb: Callback<TransactionMetadata>) {
    if (!newTx) {
      return cb(new Error('No transaction data'))
    }

    const connection = this.connection.connections['ethereum'][parseInt(newTx.chainId, 16)]
    const chainConnected = connection && (connection.primary?.connected || connection.secondary?.connected)

    if (!chainConnected) {
      return cb(new Error(`Chain ${newTx.chainId} not connected`))
    }

    try {
      const approvals: RequiredApproval[] = []
      const rawTx = getRawTx(newTx)
      const gas = gasFees(rawTx)
      const { chainConfig } = connection

      const estimateGasLimit = async () => {
        try {
          return await this.getGasEstimate(rawTx)
        } catch (error) {
          approvals.push({
            type: ApprovalType.GasLimitApproval,
            data: {
              message: (error as Error).message,
              gasLimit: '0x00'
            }
          })
          return '0x00'
        }
      }

      const [gasLimit, recipientType] = await Promise.all([
        rawTx.gasLimit ?? estimateGasLimit(),
        rawTx.to ? reveal.resolveEntityType(rawTx.to, parseInt(rawTx.chainId, 16)) : ''
      ])

      const tx = { ...rawTx, gasLimit, recipientType }

      try {
        const populatedTransaction = populateTransaction(tx, chainConfig, gas)
        const checkedTransaction = checkExistingNonceGas(populatedTransaction)

        log.verbose('Successfully populated transaction', checkedTransaction)

        cb(null, { tx: checkedTransaction, approvals })
      } catch (error) {
        return cb(error as Error)
      }
    } catch (e) {
      log.error('error creating transaction', e)
      cb(e as Error)
    }
  }

  sendTransaction(payload: RPC.SendTransaction.Request, res: RPCRequestCallback, targetChain: Chain) {
    try {
      const txParams = payload.params[0]
      const payloadChain = payload.chainId

      const normalizedTx = normalizeChainId(txParams, payloadChain ? parseInt(payloadChain, 16) : undefined)
      const tx = {
        ...normalizedTx,
        chainId: normalizedTx.chainId || payloadChain || addHexPrefix(targetChain.id.toString(16))
      }

      const currentAccount = accounts.current()

      log.verbose(`sendTransaction(${JSON.stringify(tx)}`)

      const from = tx.from || (currentAccount && currentAccount.id)

      if (!currentAccount || !from || !hasAddress(currentAccount, from)) {
        return resError('Transaction is not from currently selected account', payload, res)
      }

      this.fillTransaction({ ...tx, from }, (err, transactionMetadata) => {
        if (err) {
          resError(err, payload, res)
        } else {
          const handlerId = this.addRequestHandler(res)
          const txMetadata = transactionMetadata as TransactionMetadata
          const { feesUpdated, recipientType, ...data } = txMetadata.tx

          const unclassifiedReq = {
            handlerId,
            type: 'transaction',
            data,
            payload,
            account: (currentAccount as FrameAccount).id,
            origin: payload._origin,
            approvals: [],
            feesUpdatedByUser: false,
            recipientType,
            recognizedActions: [],
            simulation: { status: 'pending' }
          } as Omit<TransactionRequest, 'classification'>

          const classification = classifyTransaction(unclassifiedReq)

          const req = {
            ...unclassifiedReq,
            classification
          }

          accounts.addRequest(req, res)

          txMetadata.approvals.forEach((approval) => {
            currentAccount?.addRequiredApproval(req, approval.type, approval.data)
          })
        }
      })
    } catch (e) {
      resError((e as Error).message, payload, res)
    }
  }

  getTransactionByHash(payload: RPCRequestPayload, cb: RPCRequestCallback, targetChain: Chain) {
    const res = (response: any) => {
      if (response.result && !response.result.gasPrice && response.result.maxFeePerGas) {
        return cb({ ...response, result: { ...response.result, gasPrice: response.result.maxFeePerGas } })
      }

      cb(response)
    }

    this.connection.send(payload, res, targetChain)
  }

  _personalSign(payload: RPCRequestPayload, targetChain: Chain, res: RPCRequestCallback) {
    return this.sign(payload, 'personal_sign', targetChain, res)
  }

  sign(
    payload: RPCRequestPayload,
    method: MessageSigningMethod,
    targetChain: Chain,
    res: RPCRequestCallback
  ) {
    const currentAccount = accounts.current()

    if (!currentAccount) {
      return resError({ code: 4100, message: 'No account selected for message signing' }, payload, res)
    }

    let parsedRequest
    try {
      parsedRequest = parseMessageRequest(method, payload.params, {
        account: currentAccount.getSelectedAddress(),
        origin: getPayloadOrigin(payload)?.name || 'Unknown',
        requestChainId: targetChain.id
      })
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }

    const normalizedPayload = { ...payload, params: parsedRequest.params }
    const handlerId = this.addRequestHandler(res)

    const req: SignRequest = {
      handlerId,
      type: 'sign',
      payload: normalizedPayload,
      account: currentAccount.getSelectedAddress(),
      origin: payload._origin,
      data: {
        rawMessage: parsedRequest.rawMessage,
        decodedMessage: parsedRequest.decodedMessage,
        context: parsedRequest.context
      },
      approvals: []
    }

    const _res = (data: any) => {
      if (this.handlers[req.handlerId]) this.handlers[req.handlerId](data)
      delete this.handlers[req.handlerId]
    }

    accounts.addRequest(req, _res)
  }

  signTypedData(
    rawPayload: RPC.SignTypedData.Request,
    version: SignTypedDataVersion | undefined,
    targetChain: Chain,
    res: RPCCallback<RPC.SignTypedData.Response>
  ) {
    // ensure param order is [address, data, ...] regardless of version
    const rawParams = Array.isArray(rawPayload.params) ? rawPayload.params : []
    const orderedParams =
      isAddress(rawParams[1]) && !isAddress(rawParams[0])
        ? [rawParams[1], rawParams[0], ...rawParams.slice(2)]
        : [...rawParams]

    const payload = {
      ...rawPayload,
      params: orderedParams
    }

    let [from = '', typedData, ...additionalParams] = payload.params

    if (typedData === undefined) {
      return resError({ code: -32602, message: 'Invalid params: missing typed data' }, payload, res)
    }
    if (!isAddress(from)) {
      return resError({ code: -32602, message: 'Invalid params: invalid signing address' }, payload, res)
    }

    // HACK: Standards clearly say, that second param is an object but it seems like in the wild it can be a JSON-string.
    if (typeof typedData === 'string') {
      try {
        typedData = JSON.parse(typedData) as LegacyTypedData | TypedData
        payload.params = [from, typedData, ...additionalParams]
      } catch (e) {
        return resError({ code: -32602, message: 'Invalid params: malformed typed data JSON' }, payload, res)
      }
    }

    let typedMessage: TypedMessage
    try {
      typedMessage = parseTypedMessage(typedData, version)
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }
    version = typedMessage.version

    const targetAccount = accounts.get(from.toLowerCase())

    if (!targetAccount) {
      return resError(`Unknown account: ${from}`, payload, res)
    }

    const currentAccount = accounts.current()
    if (!currentAccount || !hasAddress(currentAccount, targetAccount.id)) {
      return resError('Sign request is not from currently selected account', payload, res)
    }

    const signerType = getSignerType(targetAccount.lastSignerType)

    // check for signers that only support signing a specific version of typed data
    if (
      version !== SignTypedDataVersion.V4 &&
      signerType &&
      [SignerType.Ledger, SignerType.Trezor].includes(signerType)
    ) {
      const signerName = capitalize(signerType)
      return resError(`${signerName} only supports eth_signTypedData_v4+`, payload, res)
    }
    if (
      ![SignTypedDataVersion.V3, SignTypedDataVersion.V4].includes(version) &&
      signerType === SignerType.Lattice
    ) {
      return resError('Lattice only supports eth_signTypedData_v3+', payload, res)
    }

    const type = sigParser.identify(typedMessage)
    if (type === 'signErc20Permit') {
      const { owner } = (typedMessage.data as EIP2612TypedData).message
      if (!isAddress(owner) || owner.toLowerCase() !== targetAccount.address.toLowerCase()) {
        return resError(
          { code: -32602, message: 'Invalid params: permit owner does not match signing address' },
          payload,
          res
        )
      }
    }

    const handlerId = this.addRequestHandler(res)
    const context = getTypedDataContext(typedMessage, targetChain.id)

    const req: SignTypedDataRequest = {
      handlerId,
      type: 'signTypedData',
      typedMessage,
      payload,
      account: targetAccount.address,
      origin: payload._origin,
      context,
      approvals: []
    }

    // TODO: all of this below code to construct the original request can be added to
    // a module like the above sigparser which, instead of identifying the request, creates it
    if (type === 'signErc20Permit') {
      const {
        message: { deadline, spender: spenderAddress, value, owner, nonce },
        domain: { verifyingContract: contractAddress, chainId }
      } = typedMessage.data as EIP2612TypedData

      const permitRequest: PermitSignatureRequest = {
        ...req,
        type: 'signErc20Permit',
        typedMessage: {
          data: typedMessage.data as EIP2612TypedData,
          version: SignTypedDataVersion.V4
        },
        permit: {
          deadline,
          value,
          owner,
          chainId,
          nonce,
          spender: {
            address: spenderAddress,
            ens: '',
            type: ''
          },
          verifyingContract: {
            address: contractAddress,
            ens: '',
            type: ''
          }
        },
        tokenData: {
          name: '',
          symbol: ''
        },
        approvals: []
      }

      accounts.addRequest(permitRequest)
    } else {
      accounts.addRequest(req)
    }
  }

  subscribe(payload: RPC.Subscribe.Request, res: RPCSuccessCallback) {
    log.debug('provider subscribe', { payload })

    const subId = this.createSubscription(payload)

    res({ id: payload.id, jsonrpc: '2.0', result: subId })
  }

  private createSubscription(payload: RPC.Subscribe.Request) {
    const subId = addHexPrefix(crypto.randomBytes(16).toString('hex'))
    const subscriptionType = payload.params[0] as SubscriptionType

    this.subscriptions[subscriptionType] = this.subscriptions[subscriptionType] || []
    this.subscriptions[subscriptionType].push({ id: subId, originId: payload._origin })

    return subId
  }

  ifSubRemove(id: string) {
    return Object.keys(this.subscriptions).some((type) => {
      const subscriptionType = type as SubscriptionType
      const index = this.subscriptions[subscriptionType].findIndex((sub) => sub.id === id)

      return index > -1 && this.subscriptions[subscriptionType].splice(index, 1)
    })
  }

  clientVersion(payload: RPCRequestPayload, res: RPCSuccessCallback) {
    res({ id: payload.id, jsonrpc: '2.0', result: `Frame/v${packageFile.version}` })
  }

  private switchEthereumChain(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      const chainId = parseChainRequestId(payload.params)

      // Check if chain exists
      const targetChain = store('main.networks.ethereum', chainId)
      if (!targetChain) {
        const err: EVMError = { message: 'Chain does not exist', code: 4902 }
        return resError(err, payload, res)
      }
      if (targetChain.on === false) {
        const err: EVMError = { message: `Frame is not connected to chain ${chainId}`, code: 4901 }
        return resError(err, payload, res)
      }

      const originId = payload._origin
      const origin = getPayloadOrigin(payload)
      if (!origin) {
        return resError({ message: 'Unknown requesting origin', code: 4100 }, payload, res)
      }
      if (origin.chain.id === chainId) return res({ id: payload.id, jsonrpc: '2.0', result: null })

      const currentAccount = accounts.current()
      if (!currentAccount) {
        return resError(
          { message: 'No account selected to approve the chain-switch request', code: 4100 },
          payload,
          res
        )
      }

      const request: SwitchChainRequest = {
        handlerId: uuid(),
        type: 'switchChain',
        chain: { type: origin.chain.type, id: chainId },
        sourceChainId: origin.chain.id,
        account: currentAccount.id,
        origin: originId,
        payload
      }

      accounts.addRequest(request, res)
    } catch (e) {
      return resError(e as EVMError, payload, res)
    }
  }

  approveSwitchChain(handlerId: string, cb: Callback<void>) {
    const currentAccount = accounts.current()
    const request = currentAccount?.getRequest<SwitchChainRequest>(handlerId)

    if (!currentAccount || !request || request.type !== 'switchChain') {
      return cb(new Error('Chain-switch request is no longer available'))
    }

    const targetChain = store('main.networks', request.chain.type, request.chain.id)
    if (!targetChain) {
      const error = { code: 4902, message: 'Requested chain is no longer available' }
      currentAccount.rejectRequest(request, error)
      return cb(new Error(error.message))
    }
    if (targetChain.on === false) {
      const error = { code: 4901, message: `Frame is not connected to chain ${request.chain.id}` }
      currentAccount.rejectRequest(request, error)
      return cb(new Error(error.message))
    }

    const origin = storeApi.getOrigin(request.origin)
    if (!origin || origin.chain.id !== request.sourceChainId || origin.chain.type !== request.chain.type) {
      const error = { code: 4901, message: 'Chain-switch request is stale' }
      currentAccount.rejectRequest(request, error)
      return cb(new Error(error.message))
    }

    accounts.rejectUnapprovedRequestsForOriginChain(request.origin, request.sourceChainId, request.handlerId)
    store.switchOriginChain(request.origin, request.chain.id, request.chain.type)
    currentAccount.resolveRequest(request, null)
    cb(null)
  }

  private addEthereumChain(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      const id = parseChainRequestId(payload.params)
      const type = 'ethereum'

      if (store('main.networks', type, id)) return this.switchEthereumChain(payload, res)

      const request = parseAddChainRequest(payload.params)
      const currentAccount = accounts.current()
      if (!currentAccount) {
        throw { code: 4100, message: 'No account selected to approve the add-chain request' }
      }
      const handlerId = uuid()

      accounts.addRequest(
        {
          handlerId,
          type: 'addChain',
          chain: {
            type,
            id: request.id,
            name: request.name,
            symbol: request.symbol,
            primaryRpc: request.rpcUrls[0],
            secondaryRpc: request.rpcUrls[1],
            explorer: request.blockExplorerUrls[0] || '',
            nativeCurrencyName: request.nativeCurrencyName,
            nativeCurrencyDecimals: request.nativeCurrencyDecimals,
            icon: request.iconUrls[0] || '',
            nativeCurrencyIcon: '',
            isTestnet: false,
            primaryColor: 'accent2'
          },
          account: currentAccount.id,
          origin: payload._origin,
          payload
        } as AddChainRequest,
        res
      )
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }
  }

  private async queueCustomTokenRequest(
    payload: RPCRequestPayload,
    accountId: Address,
    address: Address,
    chainId: number
  ) {
    try {
      const tokenData = await withTimeout(
        new Erc20Contract(address, chainId).getTokenData(),
        TOKEN_METADATA_TIMEOUT_MS
      )
      const name = tokenData.name.trim()
      const symbol = tokenData.symbol.trim()
      const decimals = tokenData.decimals

      if (
        !name ||
        name.length > MAX_TOKEN_NAME_LENGTH ||
        !symbol ||
        symbol.length > MAX_TOKEN_SYMBOL_LENGTH ||
        !tokenData.totalSupply ||
        typeof decimals !== 'number' ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 255
      ) {
        return log.warn('Could not verify suggested ERC-20 token metadata', { address, chainId })
      }

      if (accounts.current()?.id !== accountId) {
        return log.info('Ignoring asset suggestion after selected account changed', { address, chainId })
      }

      const tokenExists = store('main.tokens.custom').some(
        (token: Token) => token.chainId === chainId && token.address.toLowerCase() === address.toLowerCase()
      )
      if (tokenExists) return

      const token: Token = {
        chainId,
        name,
        address,
        symbol,
        decimals,
        logoURI: ''
      }

      accounts.addRequest({
        handlerId: uuid(),
        type: 'addToken',
        token,
        account: accountId,
        origin: payload._origin,
        payload
      } as AddTokenRequest)
    } catch (error) {
      log.warn('Could not verify suggested ERC-20 token', { address, chainId, error })
    }
  }

  private addCustomToken(payload: RPCRequestPayload, cb: RPCRequestCallback, targetChain: Chain) {
    try {
      const request = parseWatchAssetRequest(payload.params, targetChain.id)
      const chain = store('main.networks.ethereum', request.chainId)
      const connection = this.connection.connections.ethereum[request.chainId]

      if (!chain?.on || !connection?.chainConfig) {
        return resError(
          { code: 4901, message: `Frame is not connected to chain ${request.chainId}` },
          payload,
          cb
        )
      }

      const currentAccount = accounts.current()
      if (!currentAccount) {
        return resError({ code: 4100, message: 'No account selected to review the asset' }, payload, cb)
      }

      const tokenExists = store('main.tokens.custom').some(
        (token: Token) =>
          token.chainId === request.chainId && token.address.toLowerCase() === request.address.toLowerCase()
      )

      cb({ id: payload.id, jsonrpc: '2.0', result: true })

      const suggestionKey = `${currentAccount.id.toLowerCase()}:${
        request.chainId
      }:${request.address.toLowerCase()}`
      if (!tokenExists && !this.pendingAssetSuggestions.has(suggestionKey)) {
        this.pendingAssetSuggestions.add(suggestionKey)
        void this.queueCustomTokenRequest(
          payload,
          currentAccount.id,
          request.address,
          request.chainId
        ).finally(() => this.pendingAssetSuggestions.delete(suggestionKey))
      }
    } catch (error) {
      return resError(error as EVMError, payload, cb)
    }
  }

  private parseTargetChain(payload: RPCRequestPayload): Chain {
    if ('chainId' in payload) {
      const chainId = parseInt(payload.chainId || '', 16)
      const chainConnection = this.connection.connections['ethereum'][chainId] || {}

      return chainConnection.chainConfig && { type: 'ethereum', id: chainId }
    }

    return getPayloadOrigin(payload).chain
  }

  private getChains(payload: JSONRPCRequestPayload, res: RPCSuccessCallback) {
    res({ id: payload.id, jsonrpc: payload.jsonrpc, result: getActiveChains() })
  }

  private getPermissions(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      parseGetPermissions(payload.params)
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }

    const access = getOriginAccess(payload)
    const result = access?.permission?.provider ? [grantedAccountPermission(access.origin)] : []
    res({ id: payload.id, jsonrpc: '2.0', result })
  }

  private async requestPermissions(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      parseRequestPermissions(payload.params)
    } catch (error) {
      return resError(error as EVMError, payload, res)
    }

    const initialAccess = getOriginAccess(payload)
    if (!initialAccess) {
      return resError({ code: 4100, message: 'No account is available to grant permission' }, payload, res)
    }

    let granted: boolean
    try {
      granted = await requestOriginAccess(payload, initialAccess.address)
    } catch (error) {
      return resError({ code: -32603, message: (error as Error).message }, payload, res)
    }

    if (!granted) {
      const currentAccess = getOriginAccess(payload)
      if (currentAccess?.address.toLowerCase() !== initialAccess.address.toLowerCase()) {
        return resError({ code: 4100, message: 'Account changed during permission request' }, payload, res)
      }

      return resError({ code: 4001, message: 'User rejected the permission request' }, payload, res)
    }

    res({ id: payload.id, jsonrpc: '2.0', result: [requestedAccountPermission()] })
  }

  private getAssets(
    payload: RPC.GetAssets.Request,
    currentAccount: FrameAccount | null,
    cb: RPCCallback<RPC.GetAssets.Response>
  ) {
    if (!currentAccount) return resError('no account selected', payload, cb)

    try {
      const { nativeCurrency, erc20 } = loadAssets(currentAccount.id)
      const { id, jsonrpc } = payload

      return cb({ id, jsonrpc, result: { nativeCurrency, erc20 } })
    } catch (e) {
      return resError({ message: (e as Error).message, code: 5901 }, payload, cb)
    }
  }

  sendAsync(payload: RPCRequestPayload, cb: Callback<RPCResponsePayload>) {
    this.send(payload, (res) => {
      if (res.error) {
        const errMessage = res.error.message || `sendAsync error did not have message`
        cb(new Error(errMessage))
      } else {
        cb(null, res)
      }
    })
  }

  send(requestPayload: RPCRequestPayload, res: RPCRequestCallback = () => {}) {
    // TODO: in the future this mapping will happen in the requests module so that the handler only ever
    // has to worry about one shape of request, error handling for each request type will happen
    // in the request handler for each type of request
    let payload: RPCRequestPayload

    try {
      payload = mapRequest(requestPayload)
    } catch (e) {
      return resError({ message: (e as Error).message }, requestPayload, res)
    }

    const method = payload.method || ''

    // method handlers that are not chain-specific can go here, before parsing the target chain
    if (method === 'eth_unsubscribe' && this.ifSubRemove(payload.params[0]))
      return res({ id: payload.id, jsonrpc: '2.0', result: true }) // Subscription was ours
    if (method === 'wallet_getPermissions') return this.getPermissions(payload, res)
    if (method === 'wallet_requestPermissions') return this.requestPermissions(payload, res)
    if (method === 'wallet_addEthereumChain') return this.addEthereumChain(payload, res)
    if (method === 'wallet_switchEthereumChain') return this.switchEthereumChain(payload, res)
    if (method === 'wallet_sendCalls') return this.sendWalletCalls(payload, res)
    if (method === 'wallet_getCallsStatus') return this.getWalletCallsStatus(payload, res)
    if (method === 'wallet_showCallsStatus') return this.showWalletCallsStatus(payload, res)
    if (method === 'wallet_getCapabilities') return this.getWalletCallCapabilities(payload, res)

    const targetChain = this.parseTargetChain(payload)

    if (!targetChain) {
      log.warn('received request with unknown chain', JSON.stringify(payload))
      return resError({ message: `unknown chain: ${payload.chainId}`, code: 4901 }, payload, res)
    }

    function getAccounts(payload: JSONRPCRequestPayload, res: RPCRequestCallback) {
      res({
        id: payload.id,
        jsonrpc: payload.jsonrpc,
        result: accounts.getSelectedAddresses().map((a) => a.toLowerCase())
      })
    }

    function getCoinbase(payload: RPCRequestPayload, res: RPCRequestCallback) {
      accounts.getAccounts((err, accounts) => {
        if (err) return resError(`signTransaction Error: ${JSON.stringify(err)}`, payload, res)
        res({ id: payload.id, jsonrpc: payload.jsonrpc, result: (accounts || [])[0] })
      })
    }

    if (method === 'eth_coinbase') return getCoinbase(payload, res)
    if (method === 'eth_accounts') return getAccounts(payload, res)
    if (method === 'eth_requestAccounts') return getAccounts(payload, res)
    if (method === 'eth_sendTransaction')
      return this.sendTransaction(payload as RPC.SendTransaction.Request, res, targetChain)
    if (method === 'eth_getTransactionByHash') return this.getTransactionByHash(payload, res, targetChain)
    if (method === 'personal_ecRecover') return ecRecover(payload, res)
    if (method === 'web3_clientVersion') return this.clientVersion(payload, res)
    if (method === 'eth_subscribe' && payload.params[0] in this.subscriptions) {
      return this.subscribe(payload as RPC.Subscribe.Request, res)
    }

    if (method === 'personal_sign') return this._personalSign(payload, targetChain, res)
    if (method === 'eth_sign') return this.sign(payload, 'eth_sign', targetChain, res)

    if (
      ['eth_signTypedData', 'eth_signTypedData_v1', 'eth_signTypedData_v3', 'eth_signTypedData_v4'].includes(
        method
      )
    ) {
      const underscoreIndex = method.lastIndexOf('_')
      const version = (
        underscoreIndex > 3 ? method.substring(underscoreIndex + 1).toUpperCase() : undefined
      ) as SignTypedDataVersion
      return this.signTypedData(
        payload as RPC.SignTypedData.Request,
        version,
        targetChain,
        res as RPCCallback<RPC.SignTypedData.Response>
      )
    }

    if (method === 'wallet_watchAsset') return this.addCustomToken(payload, res, targetChain)
    if (method === 'wallet_getEthereumChains') return this.getChains(payload, res)
    if (method === 'wallet_getAssets')
      return this.getAssets(
        payload as RPC.GetAssets.Request,
        accounts.current(),
        res as RPCCallback<RPC.GetAssets.Response>
      )

    // Connection dependent methods need to pass targetChain
    if (method === 'net_version') return this.getNetVersion(payload, res, targetChain)
    if (method === 'eth_chainId') return this.getChainId(payload, res, targetChain)

    // remove custom data
    const { _origin, chainId, ...rpcPayload } = payload

    // Pass everything else to our connection
    this.connection.send(rpcPayload, res, targetChain)
  }

  emit(type: string | symbol, ...args: any[]) {
    return super.emit(type, ...args)
  }
}

const provider = new Provider()

store.observer(ChainsObserver(provider), 'provider:chains')
store.observer(OriginChainObserver(provider), 'provider:origins')
store.observer(AssetsObserver(provider), 'provider:assets')

export default provider
