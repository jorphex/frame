import Account from '../../../../main/accounts/Account'
import { utils } from 'ethers'
import reveal from '../../../../main/reveal'
import { fetchContract } from '../../../../main/contracts'
import { simulateTransaction } from '../../../../main/transaction/simulation'
import { ApprovalType } from '../../../../resources/constants'

jest.mock('../../../../main/reveal')
jest.mock('../../../../main/transaction/simulation', () => ({ simulateTransaction: jest.fn() }))
jest.mock('../../../../main/contracts', () => {
  const real = jest.requireActual('../../../../main/contracts')

  return {
    ...real,
    fetchContract: jest.fn()
  }
})

jest.mock('../../../../main/provider', () => ({ on: jest.fn() }))
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

beforeEach(() => {
  jest.clearAllTimers()
  simulateTransaction.mockImplementation(() => new Promise(() => {}))
  account = new Account(accountState, accounts)
  fetchContract.mockResolvedValueOnce(undefined)
})

describe('#addRequest', () => {
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
