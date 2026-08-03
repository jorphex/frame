import { nodeWorkerEnvironment } from '../../../main/worker/environment'

describe('node worker environment', () => {
  it('inherits the parent environment and applies worker overrides', () => {
    const environment = nodeWorkerEnvironment({ FRAME_WORKER_TEST: 'worker' })

    expect(environment.PATH).toBe(process.env.PATH)
    expect(environment.FRAME_WORKER_TEST).toBe('worker')
  })

  it('cannot be configured to launch the Electron application', () => {
    const environment = nodeWorkerEnvironment({ ELECTRON_RUN_AS_NODE: '0' })

    expect(environment.ELECTRON_RUN_AS_NODE).toBe('1')
  })
})
