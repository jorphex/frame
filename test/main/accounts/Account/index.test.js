import Account from '../../../../main/accounts/Account'
import provider from '../../../../main/provider'
import { utils } from 'ethers'
import reveal from '../../../../main/reveal'
import { fetchContract } from '../../../../main/contracts'
import { simulateTransaction, simulateWalletCalls } from '../../../../main/transaction/simulation'
import { ApprovalType } from '../../../../resources/constants'
import { GasFeesSource } from '../../../../resources/domain/transaction'

jest.mock('../../../../main/reveal')
jest.mock('../../../../main/transaction/simulation', () => ({
  simulateTransaction: jest.fn(),
  simulateWalletCalls: jest.fn()
}))
jest.mock('../../../../main/contracts', () => {
  const real = jest.requireActual('../../../../main/contracts')

  return {
    ...real,
    fetchContract: jest.fn()
  }
})

jest.mock('../../../../main/provider', () => ({
  on: jest.fn(),
  getNonce: jest.fn(),
  fillTransaction: jest.fn()
}))
jest.mock('../../../../main/accounts', () => ({ RequestMode: { Normal: 'normal' } }))
jest.mock('../../../../main/signers', () => ({}))
jest.mock('../../../../main/windows', () => ({}))
jest.mock('../../../../main/nebula', () => () => ({
  ready: jest.fn(),
  once: jest.fn(),
  ens: {
    reverseLookup: async () => ['frame.eth']
  }
}))

jest.mock('../../../../main/windows/nav', () => ({
  forward: jest.fn()
}))

jest.mock('../../../../main/store', () => {
  const store = jest.fn()
  store.setPermission = jest.fn()
  store.setSignerView = jest.fn()
  store.setPanelView = jest.fn()
  store.navClearReq = jest.fn()
  store.observer = jest.fn()
  return store
})

let account

const accounts = { update: jest.fn() }

const accountState = {
  address: '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990',
  name: 'Test Account'
}

const tokenInterface = new utils.Interface([
  'function approve(address spender, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)'
])
const tokenContract = '0x2222222222222222222222222222222222222222'
const delegate = '0x3333333333333333333333333333333333333333'
const maxTokenAmount = 2n ** 256n - 1n

const permitRequest = (value, handlerId = 'token-permit') => ({
  handlerId,
  type: 'signErc20Permit',
  account: accountState.address,
  origin: 'example.test',
  payload: { params: [accountState.address, {}] },
  typedMessage: {
    data: {
      domain: { chainId: 1, verifyingContract: tokenContract },
      message: {
        owner: accountState.address,
        spender: delegate,
        value,
        nonce: '0',
        deadline: '2000000000'
      }
    },
    version: 'V4'
  },
  permit: {
    owner: accountState.address,
    spender: { address: delegate, ens: '', type: 'external' },
    value,
    nonce: '0',
    deadline: '2000000000',
    chainId: 1,
    verifyingContract: { address: tokenContract, ens: '', type: 'contract' }
  },
  tokenData: { name: 'Test Token', symbol: 'TST', decimals: 18 },
  context: { requestChainId: 1, domainChainId: '1', risks: [] },
  approvals: []
})

const messageRequest = (risks, handlerId = 'message-signature') => ({
  handlerId,
  type: 'sign',
  account: accountState.address,
  origin: 'example.test',
  payload: { params: [accountState.address, '0x01'] },
  data: {
    rawMessage: '0x01',
    decodedMessage: '0x01',
    context: {
      method: 'personal_sign',
      requestChainId: 1,
      origin: 'example.test',
      encoding: 'hex',
      byteLength: 1,
      risks
    }
  },
  approvals: []
})

const typedRequest = (risks, handlerId = 'typed-signature') => ({
  handlerId,
  type: 'signTypedData',
  account: accountState.address,
  origin: 'example.test',
  payload: { params: [accountState.address, {}] },
  typedMessage: { data: {}, version: 'V4' },
  context: { requestChainId: 1, risks },
  approvals: []
})

const walletCallsRequest = (handlerId = 'wallet-calls') => ({
  handlerId,
  type: 'walletCalls',
  account: accountState.address,
  origin: 'example.test',
  payload: { id: 1, jsonrpc: '2.0', method: 'wallet_sendCalls', params: [] },
  version: '2.0.0',
  batchId: 'batch-id',
  chainId: '0x1',
  atomic: false,
  calls: [
    { to: tokenContract, value: '0x0', data: '0xabcd' },
    { value: '0x2', data: '0x6000' }
  ],
  preparation: { status: 'pending' },
  simulation: { status: 'pending', calls: [] }
})

beforeEach(() => {
  jest.clearAllTimers()
  simulateTransaction.mockImplementation(() => new Promise(() => {}))
  simulateWalletCalls.mockImplementation(() => new Promise(() => {}))
  provider.getNonce.mockImplementation((_transaction, callback) => callback({ result: '0x5' }))
  provider.fillTransaction.mockImplementation((transaction, callback) =>
    callback(null, {
      tx: {
        ...transaction,
        type: '0x2',
        gasLimit: '0x5208',
        maxFeePerGas: '0x10',
        maxPriorityFeePerGas: '0x1',
        gasFeesSource: GasFeesSource.Frame
      },
      approvals: []
    })
  )
  account = new Account(accountState, accounts)
  fetchContract.mockResolvedValueOnce(undefined)
})

describe('#addRequest', () => {
  it('simulates exact wallet calls under the selected account and chain', async () => {
    const result = {
      status: 'succeeded',
      source: 'eth_simulateV1',
      calls: [
        { status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x1' },
        { status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x2' }
      ]
    }
    simulateWalletCalls.mockResolvedValueOnce(result)
    const request = walletCallsRequest()
    request.calls[0].from = '0x4444444444444444444444444444444444444444'
    request.calls[0].chainId = '0xa'

    account.addRequest(request)
    expect(request.simulation).toEqual({ status: 'pending', calls: [] })
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(simulateWalletCalls).toHaveBeenCalledWith(
      [
        {
          chainId: '0x1',
          from: accountState.address,
          to: tokenContract,
          value: '0x0',
          data: '0xabcd'
        },
        {
          chainId: '0x1',
          from: accountState.address,
          value: '0x2',
          data: '0x6000'
        }
      ],
      { send: expect.any(Function) }
    )
    expect(request.simulation).toBe(result)
  })

  it('keeps only the newest wallet-call simulation result', async () => {
    let resolveInitial
    let resolveUpdated
    simulateWalletCalls
      .mockImplementationOnce(() => new Promise((resolve) => (resolveInitial = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveUpdated = resolve)))
    const request = walletCallsRequest('wallet-calls-version')

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    account.refreshWalletCallsSimulation(request)
    jest.advanceTimersByTime(1)

    resolveUpdated({ status: 'unavailable', source: 'eth_simulateV1', calls: [], reason: 'unsupported' })
    await jest.advanceTimersByTimeAsync(0)
    expect(request.simulation.status).toBe('unavailable')

    resolveInitial({ status: 'succeeded', source: 'eth_simulateV1', calls: [] })
    await jest.advanceTimersByTimeAsync(0)
    expect(request.simulation.status).toBe('unavailable')
  })

  it('does not apply wallet-call simulation after request removal', async () => {
    let resolveSimulation
    simulateWalletCalls.mockImplementationOnce(() => new Promise((resolve) => (resolveSimulation = resolve)))
    const request = walletCallsRequest('removed-wallet-calls')

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    account.clearRequest(request.handlerId)
    resolveSimulation({ status: 'succeeded', source: 'eth_simulateV1', calls: [] })
    await Promise.resolve()

    expect(account.requests[request.handlerId]).toBeUndefined()
  })

  it('does not apply an in-flight wallet-call simulation after account close', async () => {
    let resolveSimulation
    simulateWalletCalls.mockImplementationOnce(() => new Promise((resolve) => (resolveSimulation = resolve)))
    const request = walletCallsRequest('closed-wallet-calls')

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    account.accountObserver = { remove: jest.fn() }
    account.close()
    resolveSimulation({ status: 'succeeded', source: 'eth_simulateV1', calls: [] })
    await Promise.resolve()

    expect(request.simulation).toEqual({ status: 'pending', calls: [] })
  })

  it('bounds unexpected wallet-call simulation failures', async () => {
    simulateWalletCalls.mockRejectedValueOnce(new Error('x'.repeat(300)))
    const request = walletCallsRequest('failed-wallet-calls')

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.simulation).toEqual({
      status: 'failed',
      source: 'eth_simulateV1',
      calls: [],
      reason: 'x'.repeat(240)
    })
  })

  it('prepares wallet calls with the pinned account, chain, and pending nonce', async () => {
    const request = walletCallsRequest('prepared-wallet-calls')

    account.addRequest(request)
    expect(request.preparation).toEqual({ status: 'pending' })
    await jest.advanceTimersByTimeAsync(1)

    expect(provider.getNonce).toHaveBeenCalledWith(
      { from: accountState.address, chainId: '0x1' },
      expect.any(Function)
    )
    expect(provider.fillTransaction.mock.calls.map(([transaction]) => transaction)).toEqual([
      {
        from: accountState.address.toLowerCase(),
        chainId: '0x1',
        nonce: '0x5',
        to: tokenContract,
        data: '0xabcd',
        value: '0x0'
      },
      {
        from: accountState.address.toLowerCase(),
        chainId: '0x1',
        nonce: '0x6',
        data: '0x6000',
        value: '0x2'
      }
    ])
    expect(request.preparation).toMatchObject({
      status: 'succeeded',
      maxFee: '0xa4100',
      calls: [{ maxFee: '0x52080' }, { maxFee: '0x52080' }]
    })
  })

  it('keeps only the newest wallet-call preparation result', async () => {
    let resolveInitialNonce
    let resolveUpdatedNonce
    provider.getNonce
      .mockImplementationOnce((_transaction, callback) => (resolveInitialNonce = callback))
      .mockImplementationOnce((_transaction, callback) => (resolveUpdatedNonce = callback))
    const request = walletCallsRequest('wallet-calls-preparation-version')

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    account.refreshWalletCallsPreparation(request)
    jest.advanceTimersByTime(1)

    resolveUpdatedNonce({ result: '0x9' })
    await jest.advanceTimersByTimeAsync(0)
    expect(request.preparation.calls[0].transaction.nonce).toBe('0x9')

    resolveInitialNonce({ result: '0x1' })
    await jest.advanceTimersByTimeAsync(0)
    expect(request.preparation.calls[0].transaction.nonce).toBe('0x9')
  })

  it('fails closed when the wallet-call request changes during preparation', async () => {
    let resolveNonce
    provider.getNonce.mockImplementationOnce((_transaction, callback) => (resolveNonce = callback))
    const request = walletCallsRequest('mutated-wallet-calls-preparation')

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    request.calls[0].data = '0xffff'
    resolveNonce({ result: '0x5' })
    await jest.advanceTimersByTimeAsync(0)

    expect(request.preparation).toEqual({
      status: 'failed',
      reason: 'Wallet call request changed during preparation'
    })
  })

  it('rejects a wallet-call request not owned by the account', () => {
    const response = jest.fn()
    const request = walletCallsRequest('wrong-wallet-calls-account')
    request.account = '0x4444444444444444444444444444444444444444'

    account.addRequest(request, response)

    expect(account.requests[request.handlerId]).toBeUndefined()
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: 4100, message: 'Wallet-call request is not owned by this account' }
      })
    )
    expect(provider.getNonce).not.toHaveBeenCalled()
  })

  it('does not apply wallet-call preparation after request removal or account close', async () => {
    let resolveRemovedNonce
    let resolveClosedNonce
    provider.getNonce
      .mockImplementationOnce((_transaction, callback) => (resolveRemovedNonce = callback))
      .mockImplementationOnce((_transaction, callback) => (resolveClosedNonce = callback))

    const removed = walletCallsRequest('removed-wallet-calls-preparation')
    account.addRequest(removed)
    jest.advanceTimersByTime(1)
    account.clearRequest(removed.handlerId)
    resolveRemovedNonce({ result: '0x5' })
    await jest.advanceTimersByTimeAsync(0)
    expect(account.requests[removed.handlerId]).toBeUndefined()
    expect(removed.preparation).toEqual({ status: 'pending' })

    const closed = walletCallsRequest('closed-wallet-calls-preparation')
    account.addRequest(closed)
    jest.advanceTimersByTime(1)
    account.accountObserver = { remove: jest.fn() }
    account.close()
    resolveClosedNonce({ result: '0x5' })
    await jest.advanceTimersByTimeAsync(0)
    expect(closed.preparation).toEqual({ status: 'pending' })
  })

  it('bounds wallet-call preparation provider failures', async () => {
    provider.getNonce.mockImplementationOnce((_transaction, callback) =>
      callback({ error: { message: 'x'.repeat(300) } })
    )
    const request = walletCallsRequest('failed-wallet-calls-preparation')

    account.addRequest(request)
    await jest.advanceTimersByTimeAsync(1)

    expect(request.preparation).toEqual({ status: 'failed', reason: 'x'.repeat(240) })
    expect(provider.fillTransaction).not.toHaveBeenCalled()
  })

  it('requires explicit consent for normalized dangerous message risks', () => {
    const request = messageRequest(['opaque-message', 'legacy-eth-sign', 'siwe-expired'])

    account.addRequest(request)

    expect(request.approvals).toHaveLength(1)
    expect(request.approvals[0]).toMatchObject({
      type: ApprovalType.SignatureRisk,
      approved: false,
      data: {
        title: 'Dangerous Message Signature',
        confirmLabel: 'Sign Anyway',
        riskCodes: 'legacy-eth-sign,siwe-expired'
      }
    })
  })

  it('keeps informational message risks on the normal one-step review path', () => {
    const request = messageRequest(['opaque-message', 'siwe-origin-unverified'])

    account.addRequest(request)

    expect(request.approvals).toEqual([])
  })

  it('requires explicit consent for typed-data domain risks', () => {
    const request = typedRequest(['domain-chain-mismatch'])

    account.addRequest(request)

    expect(request.approvals[0]).toMatchObject({
      type: ApprovalType.SignatureRisk,
      data: { title: 'Risky Typed Signature', riskCodes: 'domain-chain-mismatch' }
    })
  })

  it('composes typed-data and unlimited-permit approvals independently', () => {
    const request = permitRequest(maxTokenAmount.toString(10), 'risky-unlimited-permit')
    request.context.risks = ['domain-chain-mismatch']

    account.addRequest(request)

    expect(request.approvals.map(({ type }) => type)).toEqual([
      ApprovalType.SignatureRisk,
      ApprovalType.TokenPermitRisk
    ])
  })

  it('requires explicit consent for an unlimited EIP-2612 permit', () => {
    const request = permitRequest(maxTokenAmount.toString(10))

    account.addRequest(request)

    expect(request.approvals).toHaveLength(1)
    expect(request.approvals[0]).toMatchObject({
      type: ApprovalType.TokenPermitRisk,
      approved: false,
      data: {
        title: 'Unlimited Token Permit',
        confirmLabel: 'Sign Permit Anyway'
      }
    })
  })

  it('does not require extra consent for an initially finite EIP-2612 permit', () => {
    const request = permitRequest('100', 'finite-token-permit')

    account.addRequest(request)

    expect(request.approvals).toEqual([])
  })

  it('synchronizes unlimited permit consent across safe and repeated values', () => {
    const request = permitRequest(maxTokenAmount.toString(10), 'permit-consent-lifecycle')
    account.addRequest(request)
    const approval = request.approvals[0]
    approval.approve()

    account.syncPermitApprovalRisk(request)
    expect(request.approvals[0]).toBe(approval)
    expect(approval.approved).toBe(true)

    request.permit.value = '100'
    request.typedMessage.data.message.value = '100'
    account.syncPermitApprovalRisk(request)
    expect(request.approvals).toEqual([])

    request.permit.value = maxTokenAmount.toString(10)
    request.typedMessage.data.message.value = maxTokenAmount.toString(10)
    account.syncPermitApprovalRisk(request)
    expect(request.approvals).toHaveLength(1)
    expect(request.approvals[0].approved).toBe(false)

    request.permit.value = '0'
    request.typedMessage.data.message.value = '0'
    account.syncPermitApprovalRisk(request)
    expect(request.approvals).toEqual([])
  })

  it('derives permit authority from the exact typed message sent to the signer', () => {
    const request = permitRequest(maxTokenAmount.toString(10), 'permit-signed-value')
    request.permit.value = '1'

    account.addRequest(request)

    expect(request.approvals).toHaveLength(1)
    expect(request.approvals[0].type).toBe(ApprovalType.TokenPermitRisk)
  })

  describe('recognizing requests', () => {
    it('recognizes an ERC-20 approval', (done) => {
      const request = {
        handlerId: '123456',
        type: 'transaction',
        data: {
          chainId: '0x539',
          to: '0x6887246668a3b87F54DeB3b94Ba47a6f63F32985',
          data: '0x095ea7b30000000000000000000000009bc5baf874d2da8d216ae9f137804184ee5afef40000000000000000000000000000000000000000000000000000000000011170'
        }
      }

      reveal.recog.mockResolvedValue([
        {
          id: 'erc20:approve'
        }
      ])

      accounts.update.mockImplementationOnce(() => {})
      accounts.update.mockImplementationOnce(() => {
        expect(request.recognizedActions).toHaveLength(1)
        done()
      })

      account.addRequest(request)
    })
  })

  it('keeps only the newest execution check result', async () => {
    let resolveInitial
    let resolveUpdated
    simulateTransaction
      .mockImplementationOnce(() => new Promise((resolve) => (resolveInitial = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveUpdated = resolve)))

    const request = {
      handlerId: 'simulation-version',
      type: 'transaction',
      data: { chainId: '0x1', gasLimit: '0x5208' },
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    request.data.gasLimit = '0x6000'
    account.refreshTransactionSimulation(request)
    jest.advanceTimersByTime(1)
    expect(simulateTransaction).toHaveBeenCalledTimes(2)

    resolveUpdated({ status: 'succeeded', source: 'eth_call' })
    await jest.advanceTimersByTimeAsync(0)
    expect(request.simulation).toEqual({ status: 'succeeded', source: 'eth_call' })

    resolveInitial({ status: 'reverted', source: 'eth_simulateV1' })
    await jest.advanceTimersByTimeAsync(0)
    expect(request.simulation).toEqual({ status: 'succeeded', source: 'eth_call' })
  })

  it('coalesces same-turn transaction updates before calling the RPC', async () => {
    simulateTransaction.mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
    const request = {
      handlerId: 'coalesced-simulation',
      type: 'transaction',
      data: { chainId: '0x1', gasLimit: '0x5208' },
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    request.data.gasLimit = '0x6000'
    account.refreshTransactionSimulation(request)
    jest.advanceTimersByTime(1)
    await Promise.resolve()

    expect(simulateTransaction).toHaveBeenCalledTimes(1)
    expect(simulateTransaction.mock.calls[0][0].gasLimit).toBe('0x6000')
    expect(request.simulation.status).toBe('succeeded')
  })

  it('requires explicit approval for a reported revert and invalidates it on edits', async () => {
    simulateTransaction.mockResolvedValueOnce({
      status: 'reverted',
      source: 'eth_call',
      reason: 'execution reverted: denied'
    })
    const gasApproval = { type: ApprovalType.GasLimitApproval, approved: false, data: {} }
    const request = {
      handlerId: 'simulation-approval',
      type: 'transaction',
      data: { chainId: '0x1', gasLimit: '0x5208' },
      approvals: [gasApproval],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    const approval = request.approvals[1]
    expect(request.approvals[0]).toBe(gasApproval)
    expect(approval).toMatchObject({
      type: ApprovalType.SimulationApproval,
      approved: false,
      data: {
        title: 'RPC Reports Revert',
        confirmLabel: 'Sign Anyway'
      }
    })
    expect(approval.data.message).toMatch(/execution reverted: denied/)

    approval.approve()
    expect(approval.approved).toBe(true)

    request.data.gasLimit = '0x6000'
    account.refreshTransactionSimulation(request)
    expect(request.approvals).toEqual([gasApproval])
  })

  it('preserves an acknowledged override across automatic fee rechecks and removes it on success', async () => {
    simulateTransaction
      .mockResolvedValueOnce({ status: 'failed', source: 'eth_simulateV1', reason: 'RPC timeout' })
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
    const request = {
      handlerId: 'preserved-simulation-approval',
      type: 'transaction',
      data: { chainId: '0x1', maxFeePerGas: '0x10' },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    const existingApproval = request.approvals[0]
    existingApproval.approve()

    expect(existingApproval.approved).toBe(true)
    expect(existingApproval.data.title).toBe('Execution Check Failed')

    account.refreshTransactionSimulation(request, true, true)
    expect(request.approvals[0]).toBe(existingApproval)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.simulation.status).toBe('succeeded')
    expect(request.approvals).toEqual([])
  })

  it('requires fresh consent when a preserved execution warning changes', async () => {
    simulateTransaction
      .mockResolvedValueOnce({ status: 'failed', source: 'eth_simulateV1', reason: 'RPC timeout' })
      .mockResolvedValueOnce({ status: 'reverted', source: 'eth_simulateV1', reason: 'denied' })
    const request = {
      handlerId: 'changed-simulation-approval',
      type: 'transaction',
      data: { chainId: '0x1', maxFeePerGas: '0x10' },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    const approval = request.approvals[0]
    approval.approve()

    account.refreshTransactionSimulation(request, true, true)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals[0]).toBe(approval)
    expect(approval).toMatchObject({
      approved: false,
      data: { title: 'RPC Reports Revert' }
    })
  })

  it('requires one approval for broad token authority and invalidates it on intent edits', async () => {
    const max = (2n ** 256n - 1n).toString(10)
    const owner = accountState.address.toLowerCase()
    simulateTransaction.mockResolvedValueOnce({
      status: 'succeeded',
      source: 'eth_simulateV1',
      effects: [
        { type: 'approval', standard: 'erc20', owner, amount: max },
        { type: 'operator-approval', standard: 'erc721-or-erc1155', owner, approved: true },
        { type: 'approval', standard: 'erc20', owner, amount: '100' },
        { type: 'approval', standard: 'erc721', owner, tokenId: max },
        { type: 'operator-approval', standard: 'erc721-or-erc1155', owner, approved: false },
        {
          type: 'approval',
          standard: 'erc20',
          owner: '0x1111111111111111111111111111111111111111',
          amount: max
        }
      ]
    })
    const gasApproval = { type: ApprovalType.GasLimitApproval, approved: false, data: {} }
    const request = {
      handlerId: 'broad-token-approval',
      type: 'transaction',
      account: accountState.address,
      data: { chainId: '0x1', gasLimit: '0x5208' },
      approvals: [gasApproval],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals[0]).toBe(gasApproval)
    expect(request.approvals[1]).toMatchObject({
      type: ApprovalType.TokenApprovalRisk,
      approved: false,
      data: {
        title: 'Broad Token Approvals',
        confirmLabel: 'Approve Anyway',
        riskCount: 2
      }
    })
    expect(request.approvals[1].data.message).toMatch(/configured RPC reports 2 broad token permissions/i)

    request.approvals[1].approve()
    expect(request.approvals[1].approved).toBe(true)

    request.data.gasLimit = '0x6000'
    account.refreshTransactionSimulation(request)
    expect(request.approvals).toEqual([gasApproval])
  })

  it('preserves broad-authority consent for fee-only rechecks and removes it when no longer reported', async () => {
    const broadEffect = {
      type: 'operator-approval',
      standard: 'erc721-or-erc1155',
      owner: accountState.address.toLowerCase(),
      approved: true
    }
    simulateTransaction
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_simulateV1', effects: [broadEffect] })
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_simulateV1', effects: [] })
    const request = {
      handlerId: 'preserved-token-approval',
      type: 'transaction',
      account: accountState.address,
      data: { chainId: '0x1', maxFeePerGas: '0x10' },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    const existingApproval = request.approvals[0]
    existingApproval.approve()

    account.refreshTransactionSimulation(request, true, true)
    expect(request.approvals[0]).toBe(existingApproval)
    expect(existingApproval.approved).toBe(true)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals).toEqual([])
  })

  it('requires calldata-based consent when only fallback simulation is available', async () => {
    simulateTransaction.mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
    const request = {
      handlerId: 'calldata-token-approval',
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('approve', [delegate, maxTokenAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals).toHaveLength(1)
    expect(request.approvals[0]).toMatchObject({
      type: ApprovalType.TokenApprovalRisk,
      approved: false,
      data: { riskCount: 1, evidence: 'calldata', confirmLabel: 'Approve Anyway' }
    })
    expect(request.approvals[0].data.message).toMatch(/does not prove the contract standard/i)
  })

  it('does not classify contract-creation initcode as token approval calldata', async () => {
    simulateTransaction.mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
    const request = {
      handlerId: 'contract-creation-selector-collision',
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        data: tokenInterface.encodeFunctionData('approve', [delegate, maxTokenAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals).toEqual([])
  })

  it('does not double-count matching calldata and RPC-reported authority', async () => {
    simulateTransaction.mockResolvedValueOnce({
      status: 'succeeded',
      source: 'eth_simulateV1',
      effects: [
        {
          type: 'approval',
          standard: 'erc20',
          contract: tokenContract,
          owner: accountState.address,
          spender: delegate,
          amount: maxTokenAmount.toString(10)
        }
      ]
    })
    const request = {
      handlerId: 'deduplicated-token-approval',
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('approve', [delegate, maxTokenAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals[0]).toMatchObject({
      data: { riskCount: 1, evidence: 'calldata-and-rpc' }
    })
  })

  it('counts additional simulated broad effects beyond top-level intent', async () => {
    simulateTransaction.mockResolvedValueOnce({
      status: 'succeeded',
      source: 'eth_simulateV1',
      effects: [
        {
          type: 'operator-approval',
          standard: 'erc721-or-erc1155',
          contract: tokenContract,
          owner: accountState.address,
          operator: delegate,
          approved: true
        },
        {
          type: 'approval',
          standard: 'erc20',
          contract: '0x4444444444444444444444444444444444444444',
          owner: accountState.address,
          spender: delegate,
          amount: maxTokenAmount.toString(10)
        }
      ]
    })
    const request = {
      handlerId: 'combined-token-approval',
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('setApprovalForAll', [delegate, true])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals[0]).toMatchObject({
      data: { riskCount: 2, evidence: 'calldata-and-rpc' }
    })
  })

  it('preserves calldata consent for fee-only rechecks and removes it after a finite edit', async () => {
    simulateTransaction
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
    const request = {
      handlerId: 'calldata-consent-lifecycle',
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('approve', [delegate, maxTokenAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    const approval = request.approvals[0]
    approval.approve()

    account.refreshTransactionSimulation(request, true, true)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    expect(request.approvals[0]).toBe(approval)
    expect(approval.approved).toBe(true)

    request.data.data = tokenInterface.encodeFunctionData('approve', [delegate, 100])
    account.refreshTransactionSimulation(request)
    expect(request.approvals).toEqual([])
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    expect(request.approvals).toEqual([])
  })

  it('requires zero-first consent when replacing a different nonzero allowance', async () => {
    const requestedAmount = '42'
    const allowance = {
      source: 'eth_call',
      token: tokenContract,
      owner: accountState.address.toLowerCase(),
      spender: delegate,
      currentAmount: '7',
      requestedAmount
    }
    simulateTransaction
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call', allowance })
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call', allowance })
    const request = {
      handlerId: 'existing-token-allowance',
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        from: accountState.address,
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('approve', [delegate, requestedAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    const approval = request.approvals[0]
    expect(approval).toMatchObject({
      type: ApprovalType.TokenAllowanceChangeRisk,
      approved: false,
      data: {
        title: 'Existing Token Allowance',
        confirmLabel: 'Change Anyway',
        currentAmount: '7',
        requestedAmount
      }
    })
    expect(approval.data.message).toMatch(/setting the allowance to zero/i)

    approval.approve()
    account.refreshTransactionSimulation(request, true, true)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals[0]).toBe(approval)
    expect(approval.approved).toBe(true)

    request.data.data = tokenInterface.encodeFunctionData('approve', [delegate, 8])
    account.refreshTransactionSimulation(request)
    expect(request.approvals).toEqual([])
  })

  it.each([
    ['zero current allowance', '0', '42'],
    ['revocation', '7', '0'],
    ['unchanged allowance', '7', '7']
  ])('does not require zero-first consent for %s', async (_label, currentAmount, requestedAmount) => {
    simulateTransaction.mockResolvedValueOnce({
      status: 'succeeded',
      source: 'eth_call',
      allowance: {
        source: 'eth_call',
        token: tokenContract,
        owner: accountState.address,
        spender: delegate,
        currentAmount,
        requestedAmount
      }
    })
    const request = {
      handlerId: `safe-token-allowance-${currentAmount}-${requestedAmount}`,
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        from: accountState.address,
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('approve', [delegate, requestedAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals).toEqual([])
  })

  it('rejects mismatched allowance evidence and composes valid evidence with broad-authority consent', async () => {
    const requestedAmount = maxTokenAmount.toString(10)
    simulateTransaction
      .mockResolvedValueOnce({
        status: 'succeeded',
        source: 'eth_call',
        allowance: {
          source: 'eth_call',
          token: '0x4444444444444444444444444444444444444444',
          owner: accountState.address,
          spender: delegate,
          currentAmount: '7',
          requestedAmount
        }
      })
      .mockResolvedValueOnce({
        status: 'succeeded',
        source: 'eth_call',
        allowance: {
          source: 'eth_call',
          token: tokenContract,
          owner: accountState.address,
          spender: delegate,
          currentAmount: '7',
          requestedAmount
        }
      })
    const request = (handlerId) => ({
      handlerId,
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        from: accountState.address,
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('approve', [delegate, requestedAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    })
    const mismatched = request('mismatched-token-allowance')

    account.addRequest(mismatched)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    expect(mismatched.approvals.map(({ type }) => type)).toEqual([ApprovalType.TokenApprovalRisk])

    const composed = request('composed-token-allowance')
    account.addRequest(composed)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    expect(composed.approvals.map(({ type }) => type)).toEqual([
      ApprovalType.TokenApprovalRisk,
      ApprovalType.TokenAllowanceChangeRisk
    ])
  })

  it('requires fresh consent when a preserved broad-authority warning expands', async () => {
    const topLevelEffect = {
      type: 'approval',
      standard: 'erc20',
      contract: tokenContract,
      owner: accountState.address,
      spender: delegate,
      amount: maxTokenAmount.toString(10)
    }
    simulateTransaction
      .mockResolvedValueOnce({ status: 'succeeded', source: 'eth_call' })
      .mockResolvedValueOnce({
        status: 'succeeded',
        source: 'eth_simulateV1',
        effects: [
          topLevelEffect,
          {
            ...topLevelEffect,
            contract: '0x4444444444444444444444444444444444444444'
          }
        ]
      })
    const request = {
      handlerId: 'expanded-calldata-consent',
      type: 'transaction',
      account: accountState.address,
      data: {
        chainId: '0x1',
        to: tokenContract,
        data: tokenInterface.encodeFunctionData('approve', [delegate, maxTokenAmount])
      },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)
    const approval = request.approvals[0]
    approval.approve()

    account.refreshTransactionSimulation(request, true, true)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals[0]).toBe(approval)
    expect(approval).toMatchObject({
      approved: false,
      data: { riskCount: 2, evidence: 'calldata-and-rpc' }
    })
  })

  it('does not require broad-authority consent for finite, revoked, or ERC-721 token approvals', async () => {
    simulateTransaction.mockResolvedValueOnce({
      status: 'succeeded',
      source: 'eth_simulateV1',
      effects: [
        { type: 'approval', standard: 'erc20', amount: '100' },
        { type: 'approval', standard: 'erc20', amount: '0' },
        { type: 'approval', standard: 'erc721', tokenId: '42' },
        { type: 'operator-approval', standard: 'erc721-or-erc1155', approved: false }
      ]
    })
    const request = {
      handlerId: 'ordinary-token-approval',
      type: 'transaction',
      data: { chainId: '0x1' },
      approvals: [],
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    await jest.advanceTimersByTimeAsync(0)

    expect(request.approvals).toEqual([])
  })

  it('does not apply an execution check after its request is removed', async () => {
    let resolveSimulation
    simulateTransaction.mockImplementationOnce(() => new Promise((resolve) => (resolveSimulation = resolve)))
    const request = {
      handlerId: 'removed-simulation',
      type: 'transaction',
      data: { chainId: '0x1' },
      simulation: { status: 'pending' }
    }

    account.addRequest(request)
    jest.advanceTimersByTime(1)
    account.clearRequest(request.handlerId)
    resolveSimulation({ status: 'succeeded', source: 'eth_call' })
    await Promise.resolve()

    expect(account.requests[request.handlerId]).toBeUndefined()
  })
})
