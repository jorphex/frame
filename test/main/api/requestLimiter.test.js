import { FixedWindowRateLimiter } from '../../../main/api/requestLimiter'

it('allows requests through the configured limit', () => {
  const limiter = new FixedWindowRateLimiter({ maxRequests: 2, windowMs: 1000 })

  expect(limiter.allow(0)).toBe(true)
  expect(limiter.allow(1)).toBe(true)
  expect(limiter.allow(2)).toBe(false)
})

it('starts a fresh window after the configured duration', () => {
  const limiter = new FixedWindowRateLimiter({ maxRequests: 1, windowMs: 1000 })

  expect(limiter.allow(1000)).toBe(true)
  expect(limiter.allow(1999)).toBe(false)
  expect(limiter.allow(2000)).toBe(true)
})

it('recovers if the wall clock moves backwards', () => {
  const limiter = new FixedWindowRateLimiter({ maxRequests: 1, windowMs: 1000 })

  expect(limiter.allow(1000)).toBe(true)
  expect(limiter.allow(999)).toBe(true)
})

it.each([
  [{ maxRequests: 0, windowMs: 1000 }, 'maxRequests'],
  [{ maxRequests: 1.5, windowMs: 1000 }, 'maxRequests'],
  [{ maxRequests: 1, windowMs: 0 }, 'windowMs']
])('rejects invalid options %j', (options, field) => {
  expect(() => new FixedWindowRateLimiter(options)).toThrow(field)
})
