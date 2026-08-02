import {
  MAX_UPSTREAM_SUBSCRIPTION_ID_BYTES,
  TransportSubscriptionRegistry
} from '../../../main/api/subscriptionRegistry'

it('creates opaque aliases and enforces exact owner checks', () => {
  const registry = new TransportSubscriptionRegistry()
  const firstOwner = {}
  const secondOwner = {}
  const subscription = registry.register({
    upstreamId: 'upstream-id',
    originId: 'origin-id',
    chainId: '0x1',
    internal: false,
    owner: firstOwner
  })

  expect(subscription.id).toMatch(/^0x[0-9a-f]{32}$/)
  expect(subscription.id).not.toBe(subscription.upstreamId)
  expect(registry.getOwned(subscription.id, ({ owner }) => owner === firstOwner)).toBe(subscription)
  expect(registry.getOwned(subscription.id, ({ owner }) => owner === secondOwner)).toBeUndefined()
})

it('routes upstream ids by chain and keeps internal subscriptions separate', () => {
  const registry = new TransportSubscriptionRegistry()
  const mainnet = registry.register({
    upstreamId: 'shared-id',
    originId: 'origin-1',
    chainId: '0x1',
    internal: false,
    owner: 'mainnet'
  })
  const optimism = registry.register({
    upstreamId: 'shared-id',
    originId: 'origin-2',
    chainId: '0xa',
    internal: false,
    owner: 'optimism'
  })
  const internal = registry.register({
    upstreamId: 'shared-id',
    originId: 'origin-3',
    chainId: '0x1',
    internal: true,
    owner: 'internal'
  })

  expect(registry.forEvent('shared-id', '0x1')).toEqual([mainnet])
  expect(registry.forEvent('shared-id', '0xa')).toEqual([optimism])
  expect(registry.forEvent('shared-id')).toEqual([internal])
})

it('removes both alias and upstream routing state', () => {
  const registry = new TransportSubscriptionRegistry()
  const owner = {}
  const subscription = registry.register({
    upstreamId: 'upstream-id',
    originId: 'origin-id',
    chainId: '0x1',
    internal: false,
    owner
  })

  expect(registry.remove(subscription.id)).toBe(true)
  expect(registry.remove(subscription.id)).toBe(false)
  expect(registry.forOwner(owner)).toEqual([])
  expect(registry.forEvent('upstream-id', '0x1')).toEqual([])
})

it('rejects empty and oversized upstream subscription ids', () => {
  const registry = new TransportSubscriptionRegistry()
  const input = { originId: 'origin-id', chainId: '0x1', internal: false, owner: {} }

  expect(registry.register({ ...input, upstreamId: '' })).toBeUndefined()
  expect(
    registry.register({ ...input, upstreamId: 'x'.repeat(MAX_UPSTREAM_SUBSCRIPTION_ID_BYTES + 1) })
  ).toBeUndefined()
})
