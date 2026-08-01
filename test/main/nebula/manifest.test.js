import { resolveManifest } from '../../../main/nebula/manifest'

test('resolves each referenced manifest while preserving Frame metadata shapes', async () => {
  const getJson = jest.fn((cid) => {
    const content = {
      root: {
        name: 'Frame Dapp',
        updated: '2026-08-01T00:00:00.000Z',
        version: '1.2.3',
        content: 'bafy-content',
        icon: 'icon',
        contracts: 'contracts',
        tokens: 'tokens'
      },
      icon: { icon: { content: 'bafy-icon', type: 'png' } },
      contracts: { contracts: [{ name: 'Example', metadata: '{"compiler":"solc"}' }] },
      tokens: { tokens: [{ chainId: 1, address: '0x1' }] }
    }
    return Promise.resolve(content[cid])
  })

  await expect(resolveManifest({ getJson }, 'root')).resolves.toEqual({
    name: 'Frame Dapp',
    updated: '2026-08-01T00:00:00.000Z',
    version: '1.2.3',
    content: 'bafy-content',
    icon: { content: 'bafy-icon', type: 'png' },
    contracts: [{ name: 'Example', metadata: Buffer.from('{"compiler":"solc"}') }],
    tokens: [{ chainId: 1, address: '0x1' }]
  })
  expect(getJson.mock.calls.map(([cid]) => cid)).toEqual(['root', 'icon', 'contracts', 'tokens'])
})

test('ignores invalid scalar and reference fields from untrusted JSON', async () => {
  const getJson = jest.fn().mockResolvedValue({
    name: 7,
    updated: null,
    version: {},
    content: ['bafy-content'],
    icon: { cid: 'icon' },
    contracts: false,
    tokens: 1
  })

  await expect(resolveManifest({ getJson }, 'root')).resolves.toEqual({})
  expect(getJson).toHaveBeenCalledTimes(1)
})
