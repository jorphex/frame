import Restore from 'react-restore'

import store from '../../../../../../main/store'
import { screen, render } from '../../../../../componentSetup'
import TxRequestComponent from '../../../../../../app/tray/Account/Requests/TransactionRequest'
import { TxMain } from '../../../../../../app/tray/Account/Requests/TransactionRequest/TxMainNew'
import { getSimulationPresentation } from '../../../../../../app/tray/Account/Requests/TransactionRequest/TxMainNew/overview'
import { canApproveTransaction } from '../../../../../../app/tray/Footer/RequestCommand'
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
