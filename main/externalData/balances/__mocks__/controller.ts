import EventEmitter from 'events'

class MockBalancesController extends EventEmitter {
  isRunning = jest.fn()
  updateKnownTokenBalances = jest.fn()
  updateChainBalances = jest.fn()
  scanForTokenBalances = jest.fn()
  close = jest.fn()
}

const controller = new MockBalancesController()

export const emit = controller.emit.bind(controller)
export const isRunning = controller.isRunning
export const updateKnownTokenBalances = controller.updateKnownTokenBalances
export const updateChainBalances = controller.updateChainBalances
export const scanForTokenBalances = controller.scanForTokenBalances
export const close = controller.close

export default jest.fn(() => controller)
