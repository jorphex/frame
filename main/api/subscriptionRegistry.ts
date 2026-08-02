import crypto from 'crypto'

export const MAX_UPSTREAM_SUBSCRIPTION_ID_BYTES = 256

export const isValidUpstreamSubscriptionId = (value: unknown): value is string =>
  typeof value === 'string' &&
  !!value &&
  Buffer.byteLength(value, 'utf8') <= MAX_UPSTREAM_SUBSCRIPTION_ID_BYTES

export interface TransportSubscription<Owner> {
  id: string
  upstreamId: string
  originId: string
  chainId: string
  internal: boolean
  owner: Owner
}

interface SubscriptionInput<Owner> {
  upstreamId: string
  originId: string
  chainId: string
  internal: boolean
  owner: Owner
}

const upstreamKey = (id: string, chainId: string | undefined, internal: boolean) =>
  internal ? `internal:${id}` : `chain:${chainId}:${id}`

export class TransportSubscriptionRegistry<Owner> {
  private byId = new Map<string, TransportSubscription<Owner>>()
  private byUpstream = new Map<string, Set<string>>()

  register(input: SubscriptionInput<Owner>) {
    if (!isValidUpstreamSubscriptionId(input.upstreamId)) return

    let id: string
    do {
      id = `0x${crypto.randomBytes(16).toString('hex')}`
    } while (this.byId.has(id))

    const subscription = Object.freeze({ id, ...input })
    this.byId.set(id, subscription)
    const key = upstreamKey(input.upstreamId, input.chainId, input.internal)
    const aliases = this.byUpstream.get(key) ?? new Set<string>()
    aliases.add(id)
    this.byUpstream.set(key, aliases)
    return subscription
  }

  getOwned(id: string, owns: (subscription: TransportSubscription<Owner>) => boolean) {
    const subscription = this.byId.get(id)
    return subscription && owns(subscription) ? subscription : undefined
  }

  remove(id: string) {
    const subscription = this.byId.get(id)
    if (!subscription) return false

    this.byId.delete(id)
    const key = upstreamKey(subscription.upstreamId, subscription.chainId, subscription.internal)
    const aliases = this.byUpstream.get(key)
    aliases?.delete(id)
    if (!aliases?.size) this.byUpstream.delete(key)
    return true
  }

  forOwner(owner: Owner) {
    return [...this.byId.values()].filter((subscription) => subscription.owner === owner)
  }

  forEvent(upstreamId: string, chainId?: string) {
    const key = upstreamKey(upstreamId, chainId, chainId === undefined)
    const aliases = this.byUpstream.get(key)
    if (!aliases) return []
    return [...aliases].flatMap((id) => {
      const subscription = this.byId.get(id)
      return subscription ? [subscription] : []
    })
  }
}
