import log from 'electron-log'
import { addHexPrefix, intToHex } from '@ethereumjs/util'
import BigNumber from 'bignumber.js'

import store from '../../../main/store'
import provider from '../../../main/provider'
import Accounts from '../../../main/accounts'
import signers from '../../../main/signers'
import { signerCompatibility, maxFee } from '../../../main/transaction'
import { toRpcQuantity } from '../../../resources/domain/transaction/quantity'
import { GasFeesSource } from '../../../resources/domain/transaction'
import { ApprovalType } from '../../../resources/constants'
import { gweiToHex } from '../../util'

jest.mock('../../../main/provider', () => ({ send: jest.fn(), emit: jest.fn(), on: jest.fn() }))
jest.mock('../../../main/signers', () => ({ get: jest.fn() }))
jest.mock('../../../main/windows', () => ({ broadcast: jest.fn(), showTray: jest.fn() }))
jest.mock('../../../main/windows/nav', () => ({ on: jest.fn(), forward: jest.fn() }))
jest.mock('../../../main/externalData')
jest.mock('../../../main/transaction')

jest.mock('../../../main/store/persist')

jest.mock('../../../main/nebula', () =>
  jest.fn(() => ({ ready: () => true, ens: { lookupAddress: jest.fn() } }))
)

const account = {
  id: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
  name: 'Seed Account',
  lastSignerType: 'seed',
  address: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
  status: 'ok',
  signer: '3935336131653838663031303266613139373335616337626261373962343231',
  requests: {},
  ensName: null,
  tokens: {},
  created: '12819530:1626189153547'
}

const account2 = {
  id: '0xef8f1bbe054ad30c6af774ed7a7c70a74ef77ac5',
  name: 'Ledger Account',
  lastSignerType: 'ledger',
  address: '0xef8f1bbe054ad30c6af774ed7a7c70a74ef77ac5',
  status: 'ok',
  active: false,
  signer: '',
  requests: {},
  ensName: '',
  created: '15315799:1660153882707'
}

let request

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach((done) => {
  maxFee.mockReturnValue(2n * 10n ** 18n)

  const from = '0x22dd63c3619818fdbc262c78baee43cb61e9cccf'
  const nonce = '0xa'
  request = {
    handlerId: 1,
    origin: '0r161n',
    type: 'transaction',
    data: {
      from,
      chainId: '0x1',
      gasLimit: intToHex(21000),
      gasPrice: gweiToHex(30),
      type: '0x2',
      maxPriorityFeePerGas: gweiToHex(1),
      maxFeePerGas: gweiToHex(9),
      nonce
    },
    payload: {
      jsonrpc: '2.0',
      id: 7,
      method: 'eth_signTransaction',
      params: [{ from, nonce }]
    }
  }

  Accounts.add(account2.address, 'Test Account 2')
  Accounts.add(account.address, 'Test Account 1', account, (err, account) => {
    Accounts.setSigner(account.address, done)
  })
})

afterEach(() => {
  Object.values(Accounts.accounts).forEach((account) => {
    Object.keys(account.requests).forEach((id) => {
      Accounts.removeRequest(account, id)
    })
  })
})

it('sets the account signer', () => {
  expect(Accounts.current().address).toBe('0x22dd63c3619818fdbc262c78baee43cb61e9cccf')
})

it('rejects renaming an unknown account', () => {
  expect(() => Accounts.rename('0xmissing', 'Missing')).toThrow(/could not find account/i)
})

describe('#updatePendingFees', () => {
  beforeEach(() => {
    request.data.gasFeesSource = GasFeesSource.Frame

    store.setGasFees('ethereum', parseInt(request.data.chainId), {
      maxBaseFeePerGas: gweiToHex(9),
      maxPriorityFeePerGas: gweiToHex(2)
    })
  })

  it('updates the pending fees for a transaction', () => {
    Accounts.addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(request.data.maxFeePerGas).toBe(gweiToHex(11))
    expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(2))
  })

  it('does not update a transaction with gas fees provided by a dapp', () => {
    request.data.gasFeesSource = GasFeesSource.Dapp

    Accounts.addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(request.data.maxFeePerGas).toBe(gweiToHex(9))
    expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(1))
  })

  it('does not update a transaction if gas fees have been updated by the user', () => {
    request.feesUpdatedByUser = true

    Accounts.addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(request.data.maxFeePerGas).toBe(gweiToHex(9))
    expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(1))
  })

  it('refreshes pending wallet-call preparation only for the updated chain', () => {
    const currentAccount = Accounts.current()
    const refresh = jest.spyOn(currentAccount, 'refreshWalletCallsPreparation').mockImplementation()
    const matching = {
      handlerId: 'wallet-calls-mainnet',
      type: 'walletCalls',
      account: currentAccount.id,
      chainId: '0x1',
      status: undefined
    }
    const otherChain = { ...matching, handlerId: 'wallet-calls-other', chainId: '0xa' }
    const pending = { ...matching, handlerId: 'wallet-calls-sending', status: 'pending' }
    currentAccount.requests[matching.handlerId] = matching
    currentAccount.requests[otherChain.handlerId] = otherChain
    currentAccount.requests[pending.handlerId] = pending

    Accounts.updatePendingFees(1)

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith(matching)
    refresh.mockRestore()
  })
})

describe('#setBaseFee', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
  })

  const setBaseFee = (baseFee, requestId = 1, userUpdate = false) =>
    Accounts.setBaseFee(baseFee, requestId, userUpdate)

  it('does not set an undefined base fee', () => {
    expect(() => setBaseFee(undefined)).toThrow()
  })

  it('does not set an invalid base fee', () => {
    expect(() => setBaseFee('wrong')).toThrow()
  })

  it('does not set a negative base fee', () => {
    expect(() => setBaseFee('-0x12a05f200')).toThrow()
  })

  it('does not set a base fee for an inactive account', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setBaseFee('0x1dcd65000')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setBaseFee('0x1dcd65000', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a base fee on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setBaseFee('0x1dcd65000')).toThrow()
  })

  it('does not set a base fee on a legacy transaction', () => {
    request.data.type = '0x0'

    expect(() => setBaseFee('0x1dcd65000')).toThrow(/legacy transaction/)
  })

  it('does not set a base fee on a locked request', () => {
    request.locked = true

    expect(() => setBaseFee('0x1dcd65000')).toThrow()
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('does not set a base fee on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setBaseFee('0x1dcd65000')).toThrow()
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('applies automatic base fee update', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    const updatedBaseFee = 6 // gwei

    setBaseFee(gweiToHex(updatedBaseFee))

    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(intToHex(2e9 + updatedBaseFee * 1e9))
  })

  it('applies user-initiated base fee update', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setBaseFee(gweiToHex(6), 1, true)

    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(gweiToHex(8))
  })

  it('does not update if the base fee has not changed', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setBaseFee(gweiToHex(8))

    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(gweiToHex(10))
  })

  it('caps the base fee at 9999 gwei', () => {
    const highBaseFee = gweiToHex(10200)
    const maxBaseFee = 9999e9
    const expectedMaxFee = intToHex(maxBaseFee + parseInt(request.data.maxPriorityFeePerGas))

    setBaseFee(highBaseFee)

    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(expectedMaxFee)
  })

  it('does not exceed the max allowable fee', () => {
    const maxTotal = 2e18 // 2 ETH
    const gasLimit = 1e7
    const maxTotalFee = maxTotal / gasLimit
    const highBaseFee = intToHex(maxTotalFee + 10e9) // add 10 gwei to exceed the maximum limit

    request.data.gasLimit = intToHex(gasLimit)
    maxFee.mockReturnValue(BigInt(maxTotal))

    setBaseFee(highBaseFee)

    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(intToHex(maxTotalFee))
  })

  it('reduces an existing priority fee that already consumes the cap', () => {
    request.data.gasLimit = '0xa'
    request.data.maxPriorityFeePerGas = '0xf'
    request.data.maxFeePerGas = '0x14'
    maxFee.mockReturnValue(100n)

    setBaseFee('0x1')

    expect(Accounts.current().requests[1].data.maxPriorityFeePerGas).toBe('0xa')
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe('0xa')
  })

  it('supports fee updates when the gas limit is zero', () => {
    request.data.gasLimit = '0x0'

    expect(() => setBaseFee(gweiToHex(9999))).not.toThrow()
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(gweiToHex(10000))
  })

  it('updates the feesUpdatedByUser flag', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setBaseFee(gweiToHex(10), 1, true)

    expect(Accounts.current().requests[1].feesUpdatedByUser).toBe(true)
  })
})

describe('#setPriorityFee', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
  })

  const setPriorityFee = (fee, requestId = 1, userUpdate = false) =>
    Accounts.setPriorityFee(fee, requestId, userUpdate)

  it('does not set an undefined priority fee', () => {
    expect(() => setPriorityFee(undefined)).toThrow()
  })

  it('does not set an invalid priority fee', () => {
    expect(() => setPriorityFee('incorrect')).toThrow()
  })

  it('does not set a negative priority fee', () => {
    expect(() => setPriorityFee('-0x12a05f200')).toThrow()
  })

  it('does not set a priority fee if no account is active', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setPriorityFee('0x12a05f200')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setPriorityFee('0x12a05f200', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a priority fee on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setPriorityFee('0x12a05f200')).toThrow()
  })

  it('does not set a priority fee on a legacy transaction', () => {
    request.data.type = '0x0'

    expect(() => setPriorityFee('0x12a05f200')).toThrow(/legacy transaction/)
  })

  it('does not set a priority fee on a locked request', () => {
    request.locked = true

    expect(() => setPriorityFee('0x12a05f200')).toThrow()
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('does not set a priority fee on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setPriorityFee('0x12a05f200')).toThrow()
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('sets a valid priority fee', () => {
    const priorityFee = 2e9 // 2 gwei
    const priorityFeeChange = priorityFee - parseInt(request.data.maxPriorityFeePerGas)
    const expectedMaxFee = intToHex(priorityFeeChange + parseInt(request.data.maxFeePerGas))

    setPriorityFee(intToHex(priorityFee))

    expect(Accounts.current().requests[1].data.maxPriorityFeePerGas).toBe(intToHex(priorityFee))
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(expectedMaxFee)
  })

  it('does not update if the priority fee has not changed', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setPriorityFee(gweiToHex(2))

    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(gweiToHex(10))
    expect(Accounts.current().requests[1].data.maxPriorityFeePerGas).toBe(gweiToHex(2))
  })

  it('caps the priority fee at 9999 gwei', () => {
    const highPriorityFee = gweiToHex(10200)
    const maxPriorityFee = 9999e9
    const priorityFeeChange = maxPriorityFee - parseInt(request.data.maxPriorityFeePerGas)
    const expectedMaxFee = intToHex(priorityFeeChange + parseInt(request.data.maxFeePerGas))

    setPriorityFee(highPriorityFee)

    expect(Accounts.current().requests[1].data.maxPriorityFeePerGas).toBe(intToHex(maxPriorityFee))
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(expectedMaxFee)
  })

  it('does not exceed the max allowable fee', () => {
    const maxTotal = 2e18 // 2 ETH
    const gasLimit = 1e7
    const maxTotalFee = maxTotal / gasLimit

    request.data.gasLimit = intToHex(gasLimit)
    request.data.maxFeePerGas = gweiToHex(190)
    request.data.maxPriorityFeePerGas = gweiToHex(40)
    maxFee.mockReturnValue(BigInt(maxTotal))

    const highPriorityFee = intToHex(60e9) // add 20 gwei to the above to exceed the maximum limit
    const expectedPriorityFee =
      maxTotalFee - (parseInt(request.data.maxFeePerGas) - parseInt(request.data.maxPriorityFeePerGas))

    setPriorityFee(highPriorityFee)

    expect(Accounts.current().requests[1].data.maxPriorityFeePerGas).toBe(intToHex(expectedPriorityFee))
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe(intToHex(maxTotalFee))
  })

  it('reduces an existing base fee that already consumes the cap', () => {
    request.data.gasLimit = '0xa'
    request.data.maxPriorityFeePerGas = '0x5'
    request.data.maxFeePerGas = '0x14'
    maxFee.mockReturnValue(100n)

    setPriorityFee('0x1')

    expect(Accounts.current().requests[1].data.maxPriorityFeePerGas).toBe('0x0')
    expect(Accounts.current().requests[1].data.maxFeePerGas).toBe('0xa')
  })

  it('updates the feesUpdatedByUser flag', () => {
    setPriorityFee('0x12a05f200', 1, true)

    expect(Accounts.current().requests[1].feesUpdatedByUser).toBe(true)
  })
})

describe('#setGasPrice', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
    request.data.type = '0x0'
  })

  const setGasPrice = (price, requestId = 1, userUpdate = false) =>
    Accounts.setGasPrice(price, requestId, userUpdate)

  it('does not set an undefined gas price', () => {
    expect(() => setGasPrice(undefined)).toThrow()
  })

  it('does not set an invalid gas price', () => {
    expect(() => setGasPrice(Number.NaN)).toThrow()
  })

  it('does not set a negative gas price', () => {
    expect(() => setGasPrice('-0x23')).toThrow()
  })

  it('does not set a gas price if no account is active', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setGasPrice('0x23')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setGasPrice('0x23', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a gas price on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setGasPrice('0x23')).toThrow()
  })

  it('does not set a gas price on an EIP-1559 transaction', () => {
    request.data.type = '0x2'

    expect(() => setGasPrice('0x23')).toThrow(/EIP-1559 transaction/)
  })

  it('does not set a gas price on a locked request', () => {
    request.locked = true

    expect(() => setGasPrice('0x23')).toThrow()
    expect(Accounts.current().requests[1].data.gasPrice).toBe(request.data.gasPrice)
  })

  it('does not set a gas price on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setGasPrice('0x23')).toThrow()
    expect(Accounts.current().requests[1].data.gasPrice).toBe(request.data.gasPrice)
  })

  it('sets a valid gas price', () => {
    setGasPrice('0x23')

    expect(Accounts.current().requests[1].data.gasPrice).toBe('0x23')
  })

  it('does not update if the gas price has not changed', () => {
    request.data.gasPrice = gweiToHex(10)

    setGasPrice(gweiToHex(10))

    expect(Accounts.current().requests[1].data.gasPrice).toBe(gweiToHex(10))
  })

  it('does not exceed the max gas price', () => {
    const maxTotal = 2e18 // 2 ETH
    const gasLimit = 1e7
    const maxTotalFee = maxTotal / gasLimit
    const highPrice = intToHex(maxTotalFee + 10e9) // 250 gwei

    request.data.gasLimit = intToHex(gasLimit)
    maxFee.mockReturnValue(BigInt(maxTotal))

    setGasPrice(highPrice)

    expect(Accounts.current().requests[1].data.gasPrice).toBe(intToHex(maxTotalFee))
  })

  it('caps the gas price at 9999 gwei', () => {
    const maxPrice = gweiToHex(9999)
    const highPrice = gweiToHex(10200)

    setGasPrice(highPrice)

    expect(Accounts.current().requests[1].data.gasPrice).toBe(maxPrice)
  })

  it('limits an exact total above the safe-integer range', () => {
    const gasLimit = 12_500_000n
    const requestedPrice = 9_999n * 1_000_000_000n
    request.data.gasLimit = toRpcQuantity(gasLimit)
    request.data.gasPrice = toRpcQuantity(requestedPrice - 2n)
    maxFee.mockReturnValue(requestedPrice * gasLimit - 1n)

    setGasPrice(toRpcQuantity(requestedPrice))

    expect(Accounts.current().requests[1].data.gasPrice).toBe(toRpcQuantity(requestedPrice - 1n))
  })

  it('updates the feesUpdatedByUser flag', () => {
    request.data.gasPrice = gweiToHex(30)

    setGasPrice(gweiToHex(45), 1, true)

    expect(Accounts.current().requests[1].feesUpdatedByUser).toBe(true)
  })
})

describe('#setGasLimit', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
  })

  const setGasLimit = (limit, requestId = 1, userUpdate = false) =>
    Accounts.setGasLimit(limit, requestId, userUpdate)

  it('does not set an undefined gas limit', () => {
    expect(() => setGasLimit(undefined)).toThrow()
  })

  it('does not set an invalid gas limit', () => {
    expect(() => setGasLimit(Number.NaN)).toThrow()
  })

  it('does not set a negative gas limit', () => {
    expect(() => setGasLimit('-0x61a8')).toThrow()
  })

  it('does not set a gas limit if no account is active', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setGasLimit('0x61a8')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setGasLimit('0x61a8', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a gas limit on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setGasLimit('0x61a8')).toThrow()
  })

  it('does not set a gas limit on a locked request', () => {
    request.locked = true

    expect(() => setGasLimit('0x61a8')).toThrow()
    expect(Accounts.current().requests[1].data.gasLimit).toBe(request.data.gasLimit)
  })

  it('does not set a gas limit on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setGasLimit('0x61a8')).toThrow()
    expect(Accounts.current().requests[1].data.gasLimit).toBe(request.data.gasLimit)
  })

  it('sets a valid gas limit', () => {
    const simulation = jest.spyOn(Accounts.current(), 'refreshTransactionSimulation')

    setGasLimit('0x61a8', 1, true)

    expect(Accounts.current().requests[1].data.gasLimit).toBe('0x61a8')
    expect(simulation).toHaveBeenCalledWith(Accounts.current().requests[1], true, false)
  })

  it('does not exceed the max fee for pre-EIP-1559 transactions', () => {
    const maxTotalFee = 2e18 // 2 ETH
    const gasPrice = 400e9 // 400 gwei
    const maxLimit = maxTotalFee / gasPrice
    const gasLimit = intToHex(maxLimit + 1e5) // add 10000 to exceed the maximum limit

    request.data.type = '0x0'
    request.data.gasPrice = intToHex(gasPrice)
    maxFee.mockReturnValue(BigInt(maxTotalFee))

    setGasLimit(gasLimit)

    expect(Accounts.current().requests[1].data.gasLimit).toBe(intToHex(maxLimit))
  })

  it('does not exceed the max fee for post-EIP-1559 transactions', () => {
    const maxTotalFee = 2e18 // 2 ETH
    const maxFeePerGas = 400e9 // 400 gwei
    const maxLimit = maxTotalFee / maxFeePerGas
    const gasLimit = intToHex(maxLimit + 1e5) // add 10000 to exceed the maximum limit

    request.data.type = '0x2'
    request.data.maxFeePerGas = intToHex(maxFeePerGas)
    maxFee.mockReturnValue(BigInt(maxTotalFee))

    setGasLimit(gasLimit)

    expect(Accounts.current().requests[1].data.gasLimit).toBe(intToHex(maxLimit))
  })

  it('caps the gas limit at 12.5e6', () => {
    const maxLimit = intToHex(12.5e6)
    const highLimit = intToHex(13e6)

    setGasLimit(highLimit)

    expect(Accounts.current().requests[1].data.gasLimit).toBe(maxLimit)
  })

  it('supports gas-limit updates with a zero fee', () => {
    request.data.type = '0x0'
    request.data.gasPrice = '0x0'

    expect(() => setGasLimit('0x61a8')).not.toThrow()
    expect(Accounts.current().requests[1].data.gasLimit).toBe('0x61a8')
  })

  it('updates the feesUpdatedByUser flag', () => {
    setGasLimit('0x61a8', 1, true)

    expect(Accounts.current().requests[1].feesUpdatedByUser).toBe(true)
  })
})

describe('#adjustNonce', () => {
  let onChainNonce

  beforeEach(() => {
    provider.send = jest.fn((payload, cb) => {
      expect(payload).toEqual(
        expect.objectContaining({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_getTransactionCount',
          params: ['0x22dd63c3619818fdbc262c78baee43cb61e9cccf', 'pending']
        })
      )

      cb({ result: onChainNonce })
    })

    onChainNonce = '0x0'
    Accounts.addRequest(request, jest.fn())
  })

  const adjustNonce = (nonceAdjust, requestId = 1) => Accounts.adjustNonce(requestId, nonceAdjust)

  it('does not allow an invalid adjustment', () => {
    adjustNonce(2)

    expect(Accounts.current().requests[1].data.nonce).toBe(request.data.nonce)
  })

  it('does not adjust a request if no account is active', () => {
    adjustNonce(1)

    expect(Accounts.current().requests[1].data.nonce).toBe(request.data.nonce)
  })

  it('adjusts the provided nonce up one increment', () => {
    const expectedNonce = addHexPrefix((parseInt(request.data.nonce) + 1).toString(16))

    adjustNonce(1)

    expect(Accounts.current().requests[1].data.nonce).toBe(expectedNonce)
  })

  it('adjusts the provided nonce down one increment', () => {
    const expectedNonce = addHexPrefix((parseInt(request.data.nonce) - 1).toString(16))

    adjustNonce(-1)

    expect(Accounts.current().requests[1].data.nonce).toBe(expectedNonce)
  })

  it('gets the latest nonce from the chain', () => {
    onChainNonce = '0x5'

    delete request.data.nonce

    adjustNonce(1)

    expect(Accounts.current().requests[1].data.nonce).toBe(onChainNonce)
  })

  it('gets the latest nonce from the chain and adjusts it down one increment', () => {
    onChainNonce = '0x5'
    const expectedNonce = addHexPrefix((parseInt(onChainNonce) - 1).toString(16))

    delete request.data.nonce

    adjustNonce(-1)

    expect(Accounts.current().requests[1].data.nonce).toBe(expectedNonce)
  })
})

describe('#resetNonce', () => {
  beforeEach(() => {
    provider.send = jest.fn((payload, cb) => {
      expect(payload).toEqual(
        expect.objectContaining({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_getTransactionCount',
          params: ['0x22dd63c3619818fdbc262c78baee43cb61e9cccf', 'pending']
        })
      )
      cb({ result: '0x3' })
    })
    request.data.nonce = '0x5'
    Accounts.addRequest(request, jest.fn())
  })

  const resetNonce = (requestId = 1) => Accounts.resetNonce(requestId)

  it('it will un-set the nonce when not present inside the tx request payload', () => {
    delete request.payload.params[0].nonce
    resetNonce()
    expect(request.data.nonce).toBe(undefined)
  })

  it('it will revert to the nonce inside the tx request payload when present', () => {
    request.payload.params[0].nonce = '0x' + BigNumber(request.data.nonce).minus(1).toString(16)
    resetNonce()
    expect(request.data.nonce).toBe(request.payload.params[0].nonce)
  })
})

describe('#resolveRequest', () => {
  it('does nothing with an unknown request', () => {
    Accounts.addRequest(request, () => {
      throw new Error('unexpected callback!')
    })

    Accounts.resolveRequest({ payload: {}, handlerId: '-1' })

    expect(Object.keys(Accounts.current().requests)).toHaveLength(1)
  })

  it('resolves a request with a callback', (done) => {
    Accounts.addRequest(request, () => done())

    Accounts.resolveRequest(request)

    try {
      expect(Object.keys(Accounts.current().requests)).toHaveLength(0)
    } catch (e) {
      done(e)
    }
  })

  it('resolves a request with no callback', () => {
    Accounts.addRequest(request)

    Accounts.resolveRequest(request)

    expect(Object.keys(Accounts.current().requests)).toHaveLength(0)
  })
})

describe('#updateRequest', () => {
  it('reruns simulation only after an accepted transaction action update', () => {
    const activeAccount = Accounts.current()
    const update = jest.fn().mockReturnValue(true)
    const simulation = jest.spyOn(activeAccount, 'refreshTransactionSimulation')
    request.recognizedActions = [{ id: 'erc20:approve', update }]
    activeAccount.requests[request.handlerId] = request

    Accounts.updateRequest(request.handlerId, { amount: '42' }, 'erc20:approve')

    expect(update).toHaveBeenCalledWith(request, { amount: '42' })
    expect(simulation).toHaveBeenCalledWith(request)
  })

  it('does not simulate a rejected, locked, or submitted transaction update', () => {
    const activeAccount = Accounts.current()
    const update = jest.fn().mockReturnValue(false)
    const simulation = jest.spyOn(activeAccount, 'refreshTransactionSimulation')
    request.recognizedActions = [{ id: 'erc20:approve', update }]
    activeAccount.requests[request.handlerId] = request

    Accounts.updateRequest(request.handlerId, { amount: '-1' }, 'erc20:approve')
    request.locked = true
    Accounts.updateRequest(request.handlerId, { amount: '1' }, 'erc20:approve')
    request.locked = false
    request.status = 'pending'
    Accounts.updateRequest(request.handlerId, { amount: '1' }, 'erc20:approve')

    expect(update).toHaveBeenCalledTimes(1)
    expect(simulation).not.toHaveBeenCalled()
  })

  it('contains transaction action update failures without mutation or simulation', () => {
    const activeAccount = Accounts.current()
    const update = jest.fn(() => {
      throw new Error('invalid action state')
    })
    const simulation = jest.spyOn(activeAccount, 'refreshTransactionSimulation')
    request.recognizedActions = [{ id: 'erc20:approve', update }]
    activeAccount.requests[request.handlerId] = request

    expect(() => Accounts.updateRequest(request.handlerId, { amount: '42' }, 'erc20:approve')).not.toThrow()
    expect(simulation).not.toHaveBeenCalled()
  })

  it('updates only the amount fields of an active permit request', () => {
    const activeAccount = Accounts.current()
    const update = jest.spyOn(activeAccount, 'update')
    const permitRequest = {
      handlerId: 'permit-update',
      type: 'signErc20Permit',
      account: activeAccount.address,
      typedMessage: {
        data: {
          domain: { chainId: 1, verifyingContract: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          message: { owner: activeAccount.address, spender: account2.address, value: '1' }
        }
      },
      permit: { owner: activeAccount.address, spender: { address: account2.address }, value: '1' },
      tokenData: { symbol: 'TKN' }
    }
    activeAccount.requests[permitRequest.handlerId] = permitRequest

    Accounts.updateRequest(
      permitRequest.handlerId,
      {
        amount: '42',
        account: account2.address,
        permit: { owner: account2.address },
        typedMessage: { data: { domain: { chainId: 999 } } },
        tokenData: { symbol: 'EVIL' }
      },
      null
    )

    expect(permitRequest.typedMessage.data.message.value).toBe('42')
    expect(permitRequest.typedMessage.data.domain.chainId).toBe(1)
    expect(permitRequest.permit.value).toBe('42')
    expect(permitRequest.permit.owner).toBe(activeAccount.address)
    expect(permitRequest.account).toBe(activeAccount.address)
    expect(permitRequest.tokenData.symbol).toBe('TKN')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('ignores invalid and submitted permit amount updates without mutation', () => {
    const activeAccount = Accounts.current()
    const update = jest.spyOn(activeAccount, 'update')
    const permitRequest = {
      handlerId: 'invalid-permit-update',
      type: 'signErc20Permit',
      typedMessage: { data: { message: { value: '1' } } },
      permit: { value: '1' }
    }
    activeAccount.requests[permitRequest.handlerId] = permitRequest
    update.mockClear()

    Accounts.updateRequest(permitRequest.handlerId, { amount: '1e2' }, null)
    permitRequest.status = 'pending'
    Accounts.updateRequest(permitRequest.handlerId, { amount: '42' }, null)

    expect(permitRequest.typedMessage.data.message.value).toBe('1')
    expect(permitRequest.permit.value).toBe('1')
    expect(update).not.toHaveBeenCalled()
  })

  it('does not partially mutate malformed permit request state', () => {
    const activeAccount = Accounts.current()
    const update = jest.spyOn(activeAccount, 'update')
    const permitRequest = {
      handlerId: 'malformed-permit-update',
      type: 'signErc20Permit',
      typedMessage: { data: { message: { value: '1' } } }
    }
    activeAccount.requests[permitRequest.handlerId] = permitRequest
    update.mockClear()

    Accounts.updateRequest(permitRequest.handlerId, { amount: '42' }, null)

    expect(permitRequest.typedMessage.data.message.value).toBe('1')
    expect(update).not.toHaveBeenCalled()
  })

  it('adds, confirms, and removes unlimited permit consent in main-owned state', () => {
    const activeAccount = Accounts.current()
    const permitRequest = {
      handlerId: 'permit-approval-lifecycle',
      type: 'signErc20Permit',
      typedMessage: { data: { message: { value: '1' } } },
      permit: { value: '1' },
      approvals: []
    }
    activeAccount.requests[permitRequest.handlerId] = permitRequest
    const max = (2n ** 256n - 1n).toString(10)

    Accounts.updateRequest(permitRequest.handlerId, { amount: max }, null)

    expect(permitRequest.approvals).toHaveLength(1)
    expect(permitRequest.approvals[0]).toMatchObject({
      type: ApprovalType.TokenPermitRisk,
      approved: false
    })

    Accounts.confirmRequestApproval(permitRequest.handlerId, ApprovalType.TokenPermitRisk, {})
    expect(permitRequest.approvals[0].approved).toBe(true)

    Accounts.updateRequest(permitRequest.handlerId, { amount: '0' }, null)
    expect(permitRequest.approvals).toEqual([])
  })

  it('does not confirm a permit approval after submission starts', () => {
    const activeAccount = Accounts.current()
    const approve = jest.fn()
    const permitRequest = {
      handlerId: 'submitted-permit-approval',
      type: 'signErc20Permit',
      status: 'pending',
      approvals: [{ type: ApprovalType.TokenPermitRisk, approved: false, approve }]
    }
    activeAccount.requests[permitRequest.handlerId] = permitRequest

    Accounts.confirmRequestApproval(permitRequest.handlerId, ApprovalType.TokenPermitRisk, {})

    expect(approve).not.toHaveBeenCalled()
  })
})

describe('#addRequestForAccount', () => {
  it('admits through the explicit account while another account remains current', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const explicitRequest = { ...request, handlerId: 'explicit-request', account: account2.address }
    const add = jest.spyOn(targetAccount, 'addRequest').mockImplementation((candidate) => {
      targetAccount.requests[candidate.handlerId] = candidate
    })

    expect(Accounts.addRequestForAccount(account2.address.toUpperCase(), explicitRequest)).toBe(true)
    expect(Accounts.current().id).toBe(account.address)
    expect(add).toHaveBeenCalledWith(explicitRequest, undefined)
    add.mockRestore()
  })

  it.each([
    ['unknown account', '0x3333333333333333333333333333333333333333', account2.address, /locate/],
    ['wrong owner', account2.address, account.address, /belong/]
  ])('rejects %s before account admission', (_label, accountId, owner, message) => {
    const targetAccount = Accounts.accounts[account2.address]
    const add = jest.spyOn(targetAccount, 'addRequest')

    expect(() =>
      Accounts.addRequestForAccount(accountId, {
        ...request,
        handlerId: `rejected-${_label}`,
        account: owner
      })
    ).toThrow(message)
    expect(add).not.toHaveBeenCalled()
    add.mockRestore()
  })

  it('rejects duplicate handlers and account insertion that does not store the exact request', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const duplicate = { ...request, handlerId: 'duplicate-request', account: account2.address }
    targetAccount.requests[duplicate.handlerId] = duplicate

    expect(() => Accounts.addRequestForAccount(account2.address, duplicate)).toThrow(/already in use/)

    delete targetAccount.requests[duplicate.handlerId]
    const add = jest.spyOn(targetAccount, 'addRequest').mockImplementation(() => {})
    expect(() => Accounts.addRequestForAccount(account2.address, duplicate)).toThrow(/did not admit/)
    add.mockRestore()
  })

  it('clears a partially stored request before propagating an insertion failure', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const partial = { ...request, handlerId: 'partial-request', account: account2.address }
    const add = jest.spyOn(targetAccount, 'addRequest').mockImplementation((candidate) => {
      targetAccount.requests[candidate.handlerId] = candidate
      throw new Error('request UI failed')
    })
    const clear = jest.spyOn(targetAccount, 'clearRequest').mockImplementation((handlerId) => {
      delete targetAccount.requests[handlerId]
    })

    expect(() => Accounts.addRequestForAccount(account2.address, partial)).toThrow(/request UI failed/)
    expect(clear).toHaveBeenCalledWith(partial.handlerId)
    expect(targetAccount.requests[partial.handlerId]).toBeUndefined()
    add.mockRestore()
    clear.mockRestore()
  })

  it('reports both insertion and cleanup failures', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const partial = { ...request, handlerId: 'unclean-request', account: account2.address }
    const add = jest.spyOn(targetAccount, 'addRequest').mockImplementation((candidate) => {
      targetAccount.requests[candidate.handlerId] = candidate
      throw new Error('request UI failed')
    })
    const clear = jest.spyOn(targetAccount, 'clearRequest').mockImplementation(() => {
      throw new Error('request cleanup failed')
    })

    expect(() => Accounts.addRequestForAccount(account2.address, partial)).toThrow(
      /admission failed: request UI failed; cleanup failed: request cleanup failed/
    )
    add.mockRestore()
    clear.mockRestore()
  })
})

describe('#rejectRequest', () => {
  it('uses the main-process payload rather than renderer-returned request data', () => {
    const response = jest.fn()
    Accounts.addRequest(request, response)

    Accounts.rejectRequest(
      { ...request, payload: { id: 'tampered', jsonrpc: '2.0' } },
      { code: 4001, message: 'User rejected the request' }
    )

    expect(response).toHaveBeenCalledWith({
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      error: { code: 4001, message: 'User rejected the request' }
    })
    expect(Object.keys(Accounts.current().requests)).toHaveLength(0)
  })

  it('rejects from the explicit account while another account remains current', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const response = jest.fn()
    const explicit = {
      ...request,
      handlerId: 'explicit-rejection',
      account: account2.address,
      data: { ...request.data, from: account2.address }
    }
    targetAccount.addRequest(explicit, response)

    expect(
      Accounts.rejectRequestForAccount(account2.address.toUpperCase(), explicit.handlerId, {
        code: 4001,
        message: 'User rejected the request'
      })
    ).toBe(true)

    expect(Accounts.current().id).toBe(account.address)
    expect(response).toHaveBeenCalledWith({
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      error: { code: 4001, message: 'User rejected the request' }
    })
    expect(targetAccount.requests[explicit.handlerId]).toBeUndefined()
  })

  it('does not reject a request through the wrong account identity', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const response = jest.fn()
    const explicit = {
      ...request,
      handlerId: 'wrong-account-rejection',
      account: account2.address,
      data: { ...request.data, from: account2.address }
    }
    targetAccount.addRequest(explicit, response)

    expect(() =>
      Accounts.rejectRequestForAccount(account.address, explicit.handlerId, {
        code: 4001,
        message: 'User rejected the request'
      })
    ).toThrow(/locate account request/i)
    expect(response).not.toHaveBeenCalled()
    expect(targetAccount.requests[explicit.handlerId]).toBe(explicit)
  })
})

describe('#removeRequest', () => {
  beforeEach(() => {
    account.clearRequest = jest.fn()
    Accounts.addRequest(request)
  })

  it('should remove a request for the provided handlerId from the account', () => {
    Accounts.removeRequest(account, request.handlerId)

    expect(account.clearRequest).toHaveBeenCalledWith(request.handlerId)
  })
})

describe('#clearRequestsByOrigin', () => {
  beforeEach(() => {
    Accounts.addRequest(request)
    Accounts.addRequest({ ...request, handlerId: '2' })
    Accounts.addRequest({ ...request, handlerId: '3', origin: '07h3r' })
  })

  it('should remove any request from a given origin', () => {
    Accounts.clearRequestsByOrigin(account.id, request.origin)
    expect(Object.keys(Accounts.accounts[account.id].requests)).toHaveLength(1)
  })
})

describe('#rejectUnapprovedRequestsForOriginChain', () => {
  it('rejects only untouched requests for the switching origin and old chain', () => {
    const activeAccount = Accounts.current()
    const responses = {
      transaction: jest.fn(),
      sign: jest.fn(),
      walletCalls: jest.fn()
    }
    const requestFor = (handlerId, overrides) => ({
      ...request,
      handlerId,
      payload: { ...request.payload, id: handlerId },
      ...overrides
    })

    Accounts.addRequest(requestFor('old-transaction', {}), responses.transaction)
    Accounts.addRequest(
      requestFor('old-sign', {
        type: 'sign',
        data: { context: { requestChainId: 1 } }
      }),
      responses.sign
    )
    Accounts.addRequest(
      requestFor('old-wallet-calls', {
        type: 'walletCalls',
        account: activeAccount.id,
        chainId: '0x1',
        calls: [{ data: '0x', value: '0x0' }],
        preparation: { status: 'pending' },
        simulation: { status: 'pending', calls: [] }
      }),
      responses.walletCalls
    )
    Accounts.addRequest(
      requestFor('other-chain', {
        type: 'signTypedData',
        context: { requestChainId: 5 }
      })
    )
    Accounts.addRequest(
      requestFor('already-approved', {
        status: 'pending',
        locked: true
      })
    )
    Accounts.addRequest(
      requestFor('other-origin', {
        origin: '07h3r'
      })
    )
    Accounts.addRequest(
      requestFor('active-switch', {
        type: 'switchChain',
        chain: { id: 5, type: 'ethereum' },
        sourceChainId: 1
      })
    )

    activeAccount.rejectUnapprovedRequestsForOriginChain(request.origin, 1, 'active-switch')

    expect(Object.keys(activeAccount.requests).sort()).toEqual(
      ['active-switch', 'already-approved', 'other-chain', 'other-origin'].sort()
    )
    expect(responses.transaction).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 4901, message: expect.stringContaining('chain 1') } })
    )
    expect(responses.sign).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 4901, message: expect.stringContaining('chain 1') } })
    )
    expect(responses.walletCalls).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 4901, message: expect.stringContaining('chain 1') } })
    )
  })
})

describe('#signTransactionForAccount', () => {
  it('signs through the pinned account even when another account is current', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const callback = jest.fn()
    const sign = jest
      .spyOn(targetAccount, 'signTransaction')
      .mockImplementation((_transaction, cb) => cb(null, '0xsigned'))
    const transaction = { ...request.data, from: account2.address }

    Accounts.signTransactionForAccount(account2.address.toUpperCase(), transaction, callback)

    expect(Accounts.current().id).toBe(account.address)
    expect(sign).toHaveBeenCalledWith(transaction, callback)
    expect(callback).toHaveBeenCalledWith(null, '0xsigned')
    sign.mockRestore()
  })

  it.each([
    ['unknown account', '0x3333333333333333333333333333333333333333', account.address, /locate/],
    ['wrong transaction owner', account2.address, account.address, /does not match/]
  ])('rejects %s without invoking an account signer', (_label, accountId, from, message) => {
    const targetAccount = Accounts.accounts[account2.address]
    const callback = jest.fn()
    const sign = jest.spyOn(targetAccount, 'signTransaction')

    Accounts.signTransactionForAccount(accountId, { ...request.data, from }, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toEqual(
      expect.objectContaining({ message: expect.stringMatching(message) })
    )
    expect(sign).not.toHaveBeenCalled()
    sign.mockRestore()
  })
})

describe('#claimWalletCallsRequest', () => {
  const readyRequest = (handlerId = 'wallet-calls-claim') => {
    const call = {
      to: '0x3333333333333333333333333333333333333333',
      data: '0xabcd',
      value: '0x0'
    }
    return {
      handlerId,
      type: 'walletCalls',
      account: account2.address,
      origin: 'example.test',
      payload: { id: 1, jsonrpc: '2.0', method: 'wallet_sendCalls', params: [] },
      version: '2.0.0',
      batchId: 'batch-id',
      chainId: '0x1',
      atomic: false,
      calls: [call],
      simulation: {
        status: 'succeeded',
        source: 'eth_simulateV1',
        calls: [{ status: 'succeeded', source: 'eth_simulateV1', gasUsed: '0x1' }]
      },
      preparation: {
        status: 'succeeded',
        calls: [
          {
            transaction: {
              from: account2.address,
              chainId: '0x1',
              nonce: '0x5',
              type: '0x2',
              gasLimit: '0x5208',
              ...call,
              maxFeePerGas: '0x10',
              maxPriorityFeePerGas: '0x1',
              gasFeesSource: GasFeesSource.Frame
            },
            maxFee: '0x52080'
          }
        ],
        maxFee: '0x52080'
      }
    }
  }

  it('claims from the explicit account while another account remains current', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const request = readyRequest()
    targetAccount.requests[request.handlerId] = request

    const snapshot = Accounts.claimWalletCallsRequest(account2.address.toUpperCase(), request.handlerId)

    expect(Accounts.current().id).toBe(account.address)
    expect(snapshot).toMatchObject({ account: account2.address, id: request.batchId })
    expect(request).toMatchObject({ locked: true, status: 'pending' })
  })

  it.each([
    ['invalid account identity', undefined, 'wallet-calls-claim', /invalid/i],
    ['invalid handler identity', account2.address, '', /invalid/i],
    ['unknown account', '0x3333333333333333333333333333333333333333', 'wallet-calls-claim', /locate/i]
  ])('rejects %s', (_label, accountId, handlerId, message) => {
    expect(() => Accounts.claimWalletCallsRequest(accountId, handlerId)).toThrow(message)
  })

  it('atomically claims and detaches the lifecycle responder from the explicit account', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const request = readyRequest('wallet-calls-with-response')
    const responder = jest.fn()
    responder.walletCallsLifecycle = true
    responder.accept = jest.fn()
    request.res = responder
    targetAccount.requests[request.handlerId] = request

    const claimed = Accounts.claimWalletCallsRequestWithResponse(
      account2.address.toUpperCase(),
      request.handlerId
    )

    expect(Accounts.current().id).toBe(account.address)
    expect(claimed.snapshot).toMatchObject({ account: account2.address, id: request.batchId })
    expect(claimed.responder).toBe(responder)
    expect(request.res).toBeUndefined()
    expect(request).toMatchObject({ locked: true, status: 'pending' })
  })

  it('does not claim a request without its specialized lifecycle responder', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const request = readyRequest('wallet-calls-no-response')
    request.res = jest.fn()
    targetAccount.requests[request.handlerId] = request

    expect(() => Accounts.claimWalletCallsRequestWithResponse(account2.address, request.handlerId)).toThrow(
      /response is no longer available/i
    )
    expect(request.locked).toBeUndefined()
    expect(request.status).toBeUndefined()
  })

  it('settles and expires only the claimed request on its explicit account', () => {
    jest.useFakeTimers()
    try {
      const targetAccount = Accounts.accounts[account2.address]
      const request = readyRequest('wallet-calls-settlement')
      targetAccount.requests[request.handlerId] = request
      Accounts.claimWalletCallsRequest(account2.address, request.handlerId)

      expect(Accounts.settleWalletCallsRequest(account2.address, request.handlerId)).toBe(true)
      expect(Accounts.current().id).toBe(account.address)
      expect(request).toMatchObject({ status: 'success', notice: 'Batch Submitted', mode: 'monitor' })

      jest.advanceTimersByTime(3299)
      expect(targetAccount.requests[request.handlerId]).toBe(request)
      jest.advanceTimersByTime(1)
      expect(targetAccount.requests[request.handlerId]).toBeUndefined()
    } finally {
      jest.useRealTimers()
    }
  })

  it('rejects an outcome for an unclaimed wallet-call request', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const request = readyRequest('wallet-calls-unclaimed-outcome')
    targetAccount.requests[request.handlerId] = request

    expect(() =>
      Accounts.settleWalletCallsRequest(account2.address, request.handlerId, new Error('failed'))
    ).toThrow(/not awaiting an execution outcome/i)
    expect(request.status).toBeUndefined()
  })

  it('restores the pending request when publishing its outcome fails', () => {
    const targetAccount = Accounts.accounts[account2.address]
    const request = readyRequest('wallet-calls-outcome-store-failure')
    targetAccount.requests[request.handlerId] = request
    Accounts.claimWalletCallsRequest(account2.address, request.handlerId)
    const expected = JSON.parse(JSON.stringify(request))
    const update = jest.spyOn(targetAccount, 'update').mockImplementationOnce(() => {
      throw new Error('account store unavailable')
    })

    expect(() => Accounts.settleWalletCallsRequest(account2.address, request.handlerId)).toThrow(
      /store unavailable/
    )
    expect(request).toEqual(expected)
    update.mockRestore()
  })
})

describe('#signerCompatibility', () => {
  let activeSigner

  const lockedSeedSigner = {
    id: '13',
    type: 'seed',
    addresses: [account.id],
    status: 'locked'
  }

  beforeEach(() => {
    store.navDash = jest.fn()

    activeSigner = {
      id: '12',
      addresses: [account.id],
      summary: jest.fn()
    }

    store.newSigner(lockedSeedSigner)

    signers.get.mockImplementation((id) => {
      if (id === activeSigner.id) return activeSigner
      if (id === lockedSeedSigner.id) return lockedSeedSigner
    })

    Accounts.accounts[account.id].lastSignerType = 'seed'
    Accounts.accounts[account.id].signer = activeSigner.id
    Accounts.addRequest(request)
  })

  afterEach(() => {
    store.removeSigner(activeSigner.id)
    store.removeSigner(lockedSeedSigner.id)

    Accounts.removeRequests([request.handlerId])
  })

  const signerTypes = ['trezor', 'ledger', 'lattice']

  signerTypes.forEach((signerType) => {
    it(`should open the signer menu when a ${signerType} signer is not available`, () => {
      const cb = jest.fn()

      activeSigner.status = 'disconnected'
      activeSigner.type = signerType
      store.newSigner(activeSigner)

      Accounts.accounts[account.id].signer = undefined
      Accounts.accounts[account.id].lastSignerType = signerType

      Accounts.signerCompatibility(request.handlerId, cb)

      expect(cb).toHaveBeenCalledWith(new Error('Signer unavailable'))
      expect(store.navDash).toHaveBeenCalledWith({
        data: {
          signer: activeSigner.id
        },
        view: 'expandedSigner'
      })
    })
  })

  it('should not open the signer menu if the current signer is ready', () => {
    const cb = jest.fn()
    const compatibility = { signer: activeSigner.id, tx: 'sometx', compatible: true }

    activeSigner.status = 'ok'
    signerCompatibility.mockReturnValue(compatibility)

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(store.navDash).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(null, compatibility)
  })

  it('should open the signer panel for a signer that is not ready', () => {
    const cb = jest.fn()

    activeSigner.status = 'locked'

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(store.navDash).toHaveBeenCalledWith({
      data: {
        signer: activeSigner.id
      },
      view: 'expandedSigner'
    })
  })

  it('should return an error when the signer is not ready', () => {
    const cb = jest.fn()

    activeSigner.status = 'locked'

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(cb).toHaveBeenCalledWith(new Error('Signer unavailable'))
  })

  it('should return an error when there is no signer', () => {
    const cb = jest.fn()

    Accounts.accounts[account.id].signer = undefined

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(store.navDash).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(new Error('No signer'))
  })
})
