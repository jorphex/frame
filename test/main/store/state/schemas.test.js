import { DappSchema } from '../../../../main/store/state/types/dapp'
import { MainSchema } from '../../../../main/store/state/types/main'

describe('persisted state schema compatibility', () => {
  it('accepts notification records from before every notification key existed', () => {
    expect(MainSchema.shape.mute.parse({ gasFeeWarning: true })).toStrictEqual({ gasFeeWarning: true })
  })

  it('accepts cached dapps without a manifest', () => {
    expect(
      DappSchema.parse({
        ens: 'example.eth',
        status: 'initial',
        config: {},
        openWhenReady: false
      })
    ).toStrictEqual({
      ens: 'example.eth',
      status: 'initial',
      config: {},
      openWhenReady: false,
      checkStatusRetryCount: 0
    })
  })
})
