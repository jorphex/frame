import store from '../../../main/store'
import walletCallBatchLedger from '../../../main/provider/walletCallLedger'

jest.mock('../../../main/store', () => {
  let batches = {}
  const store = jest.fn(() => JSON.parse(JSON.stringify(batches)))
  store.setWalletCallBatches = jest.fn((value) => {
    batches = JSON.parse(JSON.stringify(value))
  })
  store.resetWalletCallBatches = () => {
    batches = {}
  }
  return store
})

const account = '0x1111111111111111111111111111111111111111'

beforeEach(() => {
  store.mockClear()
  store.setWalletCallBatches.mockClear()
  store.resetWalletCallBatches()
})

it('loads and saves wallet-call batches only through the Frame store action', () => {
  const created = walletCallBatchLedger.create({
    id: 'batch-id',
    origin: 'example.test',
    account,
    chainId: '0x1',
    callCount: 1
  })
  created.commit()

  expect(store).toHaveBeenCalledWith('main.walletCallBatches')
  expect(store.setWalletCallBatches).toHaveBeenCalledTimes(1)
  expect(walletCallBatchLedger.getStatus('example.test', account, 'batch-id')).toMatchObject({
    id: 'batch-id',
    status: 100
  })
})
