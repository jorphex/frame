import { DappSchema } from '../../../../main/store/state/types/dapp'
import { MainSchema } from '../../../../main/store/state/types/main'
import { AccountMetadataSchema, AccountSchema } from '../../../../main/store/state/types/account'

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

  it('validates known account fields while preserving legacy fields', () => {
    expect(
      AccountSchema.parse({
        name: 'Hardware account',
        active: false,
        requests: {},
        balances: { lastUpdated: 123 },
        legacyMarker: 'preserved'
      })
    ).toStrictEqual({
      name: 'Hardware account',
      active: false,
      requests: {},
      balances: { lastUpdated: 123 },
      legacyMarker: 'preserved'
    })

    expect(() => AccountSchema.parse({ active: 'yes' })).toThrow()
    expect(() => AccountSchema.parse({ requests: [] })).toThrow()
    expect(() => AccountSchema.parse({ balances: { lastUpdated: -1 } })).toThrow()
  })

  it('validates account metadata and preserves future fields', () => {
    expect(
      AccountMetadataSchema.parse({ name: 'Named account', lastUpdated: 123, source: 'local' })
    ).toStrictEqual({ name: 'Named account', lastUpdated: 123, source: 'local' })

    expect(() => AccountMetadataSchema.parse({ name: 'Named account' })).toThrow()
  })

  it('accepts object dapp manifests without treating their values as trusted', () => {
    const dapp = {
      ens: 'example.eth',
      status: 'ready',
      config: {},
      openWhenReady: false,
      manifest: { version: 1, nested: { content: 'bafy-content' } }
    }

    expect(DappSchema.parse(dapp).manifest).toEqual(dapp.manifest)
    expect(() => DappSchema.parse({ ...dapp, manifest: 'bafy-manifest' })).toThrow()
  })
})
