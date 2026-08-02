import Restore from 'react-restore'

import store from '../../../../../../main/store'
import { screen, render } from '../../../../../componentSetup'
import TxRequestComponent from '../../../../../../app/tray/Account/Requests/TransactionRequest'
import { TxMain } from '../../../../../../app/tray/Account/Requests/TransactionRequest/TxMainNew'
import {
  getAllowancePresentation,
  getAccessListPresentation,
  getDelegationPresentation,
  getSimulationEffectsPresentation,
  getSimulationPresentation
} from '../../../../../../app/tray/Account/Requests/TransactionRequest/TxMainNew/overview'
import {
  SimulationAllowance,
  SimulationDelegation,
  SimulationEffects
} from '../../../../../../app/tray/Account/Requests/TransactionRequest/ViewData/effects'
import { ViewData } from '../../../../../../app/tray/Account/Requests/TransactionRequest/ViewData'
import {
  canApproveTransaction,
  getRequiredRequestApproval
} from '../../../../../../app/tray/Footer/RequestCommand'
import TxApproval from '../../../../../../app/tray/Footer/RequestCommand/TxApproval'
import link from '../../../../../../resources/link'
import { TxClassification } from '../../../../../../main/accounts/types'

jest.mock('../../../../../../main/store/persist')
jest.mock('../../../../../../resources/link', () => ({ rpc: jest.fn() }))

const TxRequest = Restore.connect(TxRequestComponent, store)

const account = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5'

function addRequest(req) {
  store.updateAccount({
    id: account,
    name: 'Test Account',
    requests: {
      [req.handlerId]: req
    }
  })
}

describe('confirm', () => {
  it('renders a confirming transaction', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      status: 'confirming',
      data: {
        chainId: '0x89'
      },
      classification: TxClassification.NATIVE_TRANSFER
    }

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

    const notice = screen.getByRole('status')
    expect(notice.textContent).toBe('confirming')
  })

  it('renders a transaction notice', () => {
    const req = {
      handlerId: 'test-req',
      type: 'transaction',
      status: 'confirming',
      notice: 'insufficient funds for gas',
      recipientType: 'external',
      data: {
        chainId: '0x89'
      },
      classification: TxClassification.NATIVE_TRANSFER
    }

    addRequest(req)

    render(<TxRequest req={req} step='confirm' />)

    const notice = screen.getByRole('alert')
    expect(notice.textContent).toMatch(/insufficient funds for gas/i)
  })

  it('shows a qualified RPC execution warning', () => {
    const req = {
      handlerId: 'test-simulation',
      type: 'transaction',
      data: { chainId: '0x89' },
      simulation: { status: 'reverted', source: 'eth_simulateV1' },
      classification: TxClassification.NATIVE_TRANSFER
    }

    addRequest(req)
    render(<TxRequest req={req} step='confirm' />)

    expect(screen.getByText('RPC reports execution will revert via eth_simulateV1')).toBeTruthy()
  })
})

describe('simulation review', () => {
  it('qualifies success and failure as configured-RPC results', () => {
    expect(getSimulationPresentation({ status: 'succeeded', source: 'eth_call' })).toEqual({
      className: '_txMainTagGood',
      label: 'RPC execution check passed via eth_call'
    })
    expect(getSimulationPresentation({ status: 'failed', source: 'eth_simulateV1' })).toEqual({
      className: '_txMainTagBad',
      label: 'RPC execution check failed via eth_simulateV1'
    })
  })

  it('blocks approval only while the execution check is pending', () => {
    expect(canApproveTransaction(true, { status: 'pending' })).toBe(false)
    expect(canApproveTransaction(true, { status: 'reverted' })).toBe(true)
    expect(canApproveTransaction(true, { status: 'failed' })).toBe(true)
    expect(canApproveTransaction(true)).toBe(true)
    expect(canApproveTransaction(false, { status: 'succeeded' })).toBe(false)
  })

  it('renders and confirms an outcome-specific simulation override', async () => {
    const req = { handlerId: 'simulation-override' }
    const approval = {
      type: 'approveSimulationOverride',
      data: {
        title: 'RPC Reports Revert',
        message: 'The configured RPC reports a revert.',
        confirmLabel: 'Sign Anyway'
      }
    }

    const { user } = render(<TxApproval req={req} approval={approval} />)

    expect(screen.getByText('RPC Reports Revert')).toBeTruthy()
    expect(screen.getByText('The configured RPC reports a revert.')).toBeTruthy()
    await user.click(screen.getByText('Sign Anyway'))
    expect(link.rpc).toHaveBeenCalledWith(
      'confirmRequestApproval',
      req,
      approval.type,
      {},
      expect.any(Function)
    )
  })

  it('renders and confirms broad token authority consent', async () => {
    const req = { handlerId: 'broad-token-approval' }
    const approval = {
      type: 'approveBroadTokenAuthority',
      data: {
        title: 'Broad Token Approval',
        message:
          'Top-level calldata requests one broad token permission. The selector matches maximum approve(address,uint256) or enabled setApprovalForAll(address,bool), but does not prove the contract standard or successful execution.',
        confirmLabel: 'Approve Anyway'
      }
    }

    const { user } = render(<TxApproval req={req} approval={approval} />)

    expect(screen.getByText('Broad Token Approval')).toBeTruthy()
    expect(screen.getByText(approval.data.message)).toBeTruthy()
    await user.click(screen.getByText('Approve Anyway'))
    expect(link.rpc).toHaveBeenCalledWith(
      'confirmRequestApproval',
      req,
      approval.type,
      {},
      expect.any(Function)
    )
  })

  it('selects an unconfirmed permit warning only before submission', () => {
    const approval = { type: 'approveUnlimitedTokenPermit', approved: false }
    const approved = { type: 'alreadyApproved', approved: true }

    expect(getRequiredRequestApproval({ type: 'signErc20Permit', approvals: [approved, approval] })).toBe(
      approval
    )
    expect(
      getRequiredRequestApproval({ type: 'signErc20Permit', status: 'pending', approvals: [approval] })
    ).toBe(false)
  })

  it('advances through composed signature approvals in order', () => {
    const signatureRisk = { type: 'approveDangerousSignature', approved: false }
    const permitRisk = { type: 'approveUnlimitedTokenPermit', approved: false }
    const req = { type: 'signErc20Permit', approvals: [signatureRisk, permitRisk] }

    expect(getRequiredRequestApproval(req)).toBe(signatureRisk)
    signatureRisk.approved = true
    expect(getRequiredRequestApproval(req)).toBe(permitRisk)
    permitRisk.approved = true
    expect(getRequiredRequestApproval(req)).toBeUndefined()
  })

  it('renders and confirms unlimited permit consent through the shared warning UI', async () => {
    const req = { handlerId: 'unlimited-token-permit', type: 'signErc20Permit' }
    const approval = {
      type: 'approveUnlimitedTokenPermit',
      approved: false,
      data: {
        title: 'Unlimited Token Permit',
        message:
          'This EIP-2612 signature authorizes the displayed spender to use the maximum uint256 token amount.',
        confirmLabel: 'Sign Permit Anyway'
      }
    }

    const { user } = render(<TxApproval req={req} approval={approval} />)

    expect(screen.getByText('Unlimited Token Permit')).toBeTruthy()
    expect(screen.getByText(approval.data.message)).toBeTruthy()
    await user.click(screen.getByText('Sign Permit Anyway'))
    expect(link.rpc).toHaveBeenCalledWith(
      'confirmRequestApproval',
      req,
      approval.type,
      {},
      expect.any(Function)
    )
  })

  it('qualifies RPC-reported effects and highlights broad approvals', () => {
    const account = '0x1111111111111111111111111111111111111111'
    const token = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const max = (2n ** 256n - 1n).toString(10)
    const simulation = {
      status: 'succeeded',
      source: 'eth_simulateV1',
      effectsTruncated: true,
      effects: [
        {
          type: 'transfer',
          standard: 'erc20',
          token,
          from: account,
          to: '0x2222222222222222222222222222222222222222',
          amount: '10'
        },
        {
          type: 'approval',
          standard: 'erc20',
          token,
          owner: account,
          spender: '0x3333333333333333333333333333333333333333',
          amount: max
        }
      ]
    }

    expect(getSimulationEffectsPresentation(simulation, account)).toEqual({
      broadApproval: true,
      label: '2 RPC-reported token effects (truncated)'
    })

    render(<SimulationEffects account={account} simulation={simulation} />)

    expect(screen.getByText('RPC-Reported Effects')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/not a verified or complete balance diff/i)
    expect(screen.getByText('ERC-20 Send')).toBeTruthy()
    expect(screen.getByText('ERC-20 Unlimited Approval')).toBeTruthy()
    expect(screen.getAllByText(token)).toHaveLength(2)
    expect(screen.getByRole('alert').textContent).toMatch(/preview truncated/i)
  })

  it('does not claim effects for an eth_call fallback', () => {
    const simulation = { status: 'succeeded', source: 'eth_call' }

    expect(getSimulationEffectsPresentation(simulation, '0x1')).toBeNull()
    render(<SimulationEffects account='0x1' simulation={simulation} />)
    expect(screen.queryByText('RPC-Reported Effects')).toBeNull()
  })

  it.each([
    ['0', '42', '_txMainTagWarning', 'no current token allowance'],
    ['7', '0', '_txMainTagGood', 'existing token allowance will be revoked'],
    ['7', '7', '_txMainTagGood', 'allowance already matches request'],
    ['7', '42', '_txMainTagBad', 'a different nonzero token allowance']
  ])('summarizes current allowance %s and request %s', (currentAmount, requestedAmount, className, label) => {
    expect(getAllowancePresentation({ allowance: { currentAmount, requestedAmount } })).toEqual({
      className,
      label: `RPC reports ${label}`
    })
  })

  it('renders qualified current allowance details in raw units', () => {
    const allowance = {
      source: 'eth_call',
      token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      owner: account,
      spender: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      currentAmount: '7',
      requestedAmount: '42'
    }

    render(<SimulationAllowance simulation={{ status: 'succeeded', allowance }} />)

    expect(screen.getByText('RPC-Reported Current Allowance')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/not independently verified/i)
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('omits allowance presentation when no valid evidence is attached', () => {
    expect(getAllowancePresentation({ status: 'succeeded' })).toBeNull()
    render(<SimulationAllowance simulation={{ status: 'succeeded' }} />)
    expect(screen.queryByText('RPC-Reported Current Allowance')).toBeNull()
  })

  it('prominently summarizes and details a configured-RPC delegation report', () => {
    const delegate = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const simulation = {
      status: 'succeeded',
      delegation: { status: 'delegated', source: 'eth_getCode', account: account.toLowerCase(), delegate }
    }

    expect(getDelegationPresentation(simulation)).toEqual({
      className: '_txMainTagBad',
      label: `RPC reports delegated account: ${delegate}`
    })
    render(<SimulationDelegation simulation={simulation} />)

    expect(screen.getByText('Account Delegation Check')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/transactions execute with the delegate's code/i)
    expect(screen.getByText(account.toLowerCase())).toBeTruthy()
    expect(screen.getByText(delegate)).toBeTruthy()
    expect(screen.getByText('eth_getCode')).toBeTruthy()
  })

  it('shows an unavailable delegation check without claiming delegation', () => {
    const simulation = {
      status: 'succeeded',
      delegation: {
        status: 'unavailable',
        source: 'eth_getCode',
        account: account.toLowerCase(),
        reason: 'RPC returned invalid account code'
      }
    }

    expect(getDelegationPresentation(simulation)).toEqual({
      className: '_txMainTagWarning',
      label: 'Account delegation check unavailable'
    })
    render(<SimulationDelegation simulation={simulation} />)
    expect(screen.getByRole('note').textContent).toMatch(/could not determine/i)
    expect(screen.queryByText(/delegates execution to/i)).toBeNull()
  })

  it('summarizes and renders a complete ordered access list', () => {
    const firstAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const secondAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const firstKey = `0x${'11'.repeat(32)}`
    const secondKey = `0x${'22'.repeat(32)}`
    const accessList = [
      { address: firstAddress, storageKeys: [firstKey, secondKey] },
      { address: secondAddress, storageKeys: [] }
    ]

    expect(getAccessListPresentation({ accessList })).toEqual({
      className: '_txMainTagWarning',
      label: 'Access list: 2 addresses, 2 storage keys'
    })
    render(
      <ViewData
        req={{
          account,
          data: { chainId: '0x1', type: '0x2', accessList },
          simulation: { status: 'succeeded' }
        }}
      />
    )

    const rendered = document.querySelector('.simpleJsonStructuredValue').textContent
    expect(rendered.indexOf(firstAddress)).toBeLessThan(rendered.indexOf(secondAddress))
    expect(rendered.indexOf(firstKey)).toBeLessThan(rendered.indexOf(secondKey))
    expect(rendered).toBe(JSON.stringify(accessList, null, 2))
  })
})

describe('replacement status', () => {
  it('maps the shared fee assessment to the existing transaction-card notice', () => {
    const req = { data: { nonce: '0x7', gasPrice: '0x6e' } }
    const requests = {
      existing: { mode: 'monitor', status: 'sent', data: { nonce: '0x7', gasPrice: '0x64' } }
    }

    expect(new TxMain({}).getReplacementStatus(req, requests)).toEqual({
      replacement: true,
      possible: false,
      reason: 'gas-price-too-low',
      notice: 'gas price too low'
    })
  })
})
