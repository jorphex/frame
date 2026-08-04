import { z } from 'zod'

import { AddressBookSchema } from '../../../state/types/addressBook'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        addressBook: z.unknown().optional()
      })
      .passthrough()
  })
  .passthrough()

const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial
  const addressBook = AddressBookSchema.safeParse(parsed.data.main.addressBook)

  return {
    ...parsed.data,
    main: {
      ...parsed.data.main,
      addressBook: addressBook.success ? addressBook.data : {}
    }
  }
}

export default { version: 50, migrate }
