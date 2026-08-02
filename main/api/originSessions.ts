import { requireStoreAction } from '../store/action'

export const ORIGIN_SESSION_TIMEOUT_MS = 60 * 1000

export class OriginSessionMonitor {
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly endSession: (originId: string) => void,
    private readonly timeoutMs = ORIGIN_SESSION_TIMEOUT_MS
  ) {}

  extend(originId: string) {
    if (!originId) return

    const existing = this.timers.get(originId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.timers.delete(originId)
      this.endSession(originId)
    }, this.timeoutMs)
    timer.unref()
    this.timers.set(originId, timer)
  }

  clear() {
    this.timers.forEach((timer) => clearTimeout(timer))
    this.timers.clear()
  }
}

export default new OriginSessionMonitor((originId) => {
  requireStoreAction('endOriginSession')(originId)
})
