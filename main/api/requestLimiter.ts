export interface RateLimitOptions {
  maxRequests: number
  windowMs: number
}

export class FixedWindowRateLimiter {
  private count = 0
  private windowStartedAt: number | undefined

  constructor(private readonly options: RateLimitOptions) {
    if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) {
      throw new Error('Rate limit maxRequests must be a positive integer')
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
      throw new Error('Rate limit windowMs must be positive')
    }
  }

  allow(now = Date.now()) {
    if (
      this.windowStartedAt === undefined ||
      now < this.windowStartedAt ||
      now - this.windowStartedAt >= this.options.windowMs
    ) {
      this.windowStartedAt = now
      this.count = 0
    }

    this.count += 1
    return this.count <= this.options.maxRequests
  }
}
