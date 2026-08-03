import { z } from 'zod'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        yearn: z.object({ catalogCache: z.unknown().nullable(), workflows: z.unknown() }).passthrough()
      })
      .passthrough()
  })
  .passthrough()

const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial
  return {
    ...parsed.data,
    main: {
      ...parsed.data.main,
      yearn: { ...parsed.data.main.yearn, catalogCache: null, workflows: {} }
    }
  }
}

export default { version: 49, migrate }
