import { getAddress } from 'ethers'
import { z } from 'zod'

export const ADDRESS_BOOK_FORMAT = 'frame-address-book'
export const ADDRESS_BOOK_VERSION = 1
export const MAX_ADDRESS_BOOK_ENTRIES = 1_000
export const MAX_ADDRESS_BOOK_FILE_BYTES = 1024 * 1024

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const KEY = /^0x[0-9a-f]{40}$/
const normalizedText = (value: string) => value.trim().replace(/\s+/g, ' ')
const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })

export const AddressBookAddressInputSchema = z
  .string()
  .trim()
  .regex(ADDRESS, 'Enter a valid Ethereum address')
  .refine((value) => {
    try {
      getAddress(value)
      return true
    } catch {
      return false
    }
  }, 'Address checksum is invalid')

export const AddressBookNameInputSchema = z
  .string()
  .transform(normalizedText)
  .pipe(z.string().min(1, 'Name is required').max(80, 'Name must be 80 characters or fewer'))
  .refine((value) => !hasControlCharacters(value), 'Name contains unsupported characters')

export const AddressBookNoteInputSchema = z
  .string()
  .transform(normalizedText)
  .pipe(z.string().max(280, 'Note must be 280 characters or fewer'))
  .refine((value) => !hasControlCharacters(value), 'Note contains unsupported characters')

export const AddressBookEntrySchema = z
  .object({
    address: AddressBookAddressInputSchema.refine(
      (value) => value === getAddress(value),
      'Address must use its normalized checksum'
    ),
    name: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => value === normalizedText(value)),
    note: z
      .string()
      .max(280)
      .refine((value) => value === normalizedText(value)),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative()
  })
  .strict()
  .refine(({ createdAt, updatedAt }) => updatedAt >= createdAt, 'Updated time precedes creation time')

export const AddressBookSchema = z
  .record(z.string().regex(KEY), AddressBookEntrySchema)
  .refine((book) => Object.keys(book).length <= MAX_ADDRESS_BOOK_ENTRIES, 'Address book is too large')
  .refine(
    (book) => Object.entries(book).every(([key, entry]) => key === entry.address.toLowerCase()),
    'Address book key does not match its entry'
  )

export const AddressBookSaveRequestSchema = z
  .object({
    mode: z.enum(['add', 'edit']),
    address: AddressBookAddressInputSchema,
    name: AddressBookNameInputSchema,
    note: AddressBookNoteInputSchema
  })
  .strict()

const AddressBookExportEntrySchema = z
  .object({
    address: AddressBookAddressInputSchema,
    name: AddressBookNameInputSchema,
    note: AddressBookNoteInputSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative()
  })
  .strict()
  .refine(({ createdAt, updatedAt }) => updatedAt >= createdAt, 'Updated time precedes creation time')

export const AddressBookExportSchema = z
  .object({
    format: z.literal(ADDRESS_BOOK_FORMAT),
    version: z.literal(ADDRESS_BOOK_VERSION),
    exportedAt: z.string().datetime(),
    entries: z.array(AddressBookExportEntrySchema).max(MAX_ADDRESS_BOOK_ENTRIES)
  })
  .strict()

export type AddressBookEntry = z.infer<typeof AddressBookEntrySchema>
export type AddressBook = z.infer<typeof AddressBookSchema>
export type AddressBookSaveRequest = z.infer<typeof AddressBookSaveRequestSchema>
export type AddressBookExport = z.infer<typeof AddressBookExportSchema>

export interface LocalAddressIdentity {
  label: string
  source: 'Saved contact' | 'Frame account'
}

const normalizeAddress = (address: string) => getAddress(address.trim())
const entryKey = (address: string) => normalizeAddress(address).toLowerCase()
const normalizedNameKey = (name: string) => normalizedText(name).toLowerCase()

const normalizedEntry = (
  input: Pick<AddressBookEntry, 'address' | 'name' | 'note' | 'createdAt' | 'updatedAt'>
): AddressBookEntry =>
  AddressBookEntrySchema.parse({
    ...input,
    address: normalizeAddress(input.address),
    name: normalizedText(input.name),
    note: normalizedText(input.note)
  })

const duplicateName = (book: AddressBook, name: string, excludedKey?: string) => {
  const target = normalizedNameKey(name)
  return Object.entries(book).find(
    ([key, entry]) => key !== excludedKey && normalizedNameKey(entry.name) === target
  )
}

export function saveAddressBookEntry(
  current: unknown,
  request: unknown,
  now = Date.now()
): { addressBook: AddressBook; entry: AddressBookEntry } {
  const addressBook = AddressBookSchema.parse(current)
  const parsed = AddressBookSaveRequestSchema.parse(request)
  const address = normalizeAddress(parsed.address)
  const key = address.toLowerCase()
  const existing = addressBook[key]

  if (parsed.mode === 'add' && existing) throw new Error('Address is already in your address book')
  if (parsed.mode === 'edit' && !existing) throw new Error('Address-book entry no longer exists')
  if (!existing && Object.keys(addressBook).length >= MAX_ADDRESS_BOOK_ENTRIES) {
    throw new Error(`Address book cannot exceed ${MAX_ADDRESS_BOOK_ENTRIES} entries`)
  }
  if (duplicateName(addressBook, parsed.name, key)) {
    throw new Error('Name is already used by another address')
  }

  const entry = normalizedEntry({
    address,
    name: parsed.name,
    note: parsed.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  })
  return { addressBook: { ...addressBook, [key]: entry }, entry }
}

export function removeAddressBookEntry(current: unknown, address: unknown): AddressBook {
  const addressBook = AddressBookSchema.parse(current)
  const parsedAddress = AddressBookAddressInputSchema.parse(address)
  const key = entryKey(parsedAddress)
  if (!addressBook[key]) throw new Error('Address-book entry no longer exists')

  const next = { ...addressBook }
  delete next[key]
  return next
}

export function lookupAddressBookEntry(current: unknown, address: unknown): AddressBookEntry | undefined {
  const parsedBook = AddressBookSchema.safeParse(current)
  const parsedAddress = AddressBookAddressInputSchema.safeParse(address)
  if (!parsedBook.success || !parsedAddress.success) return
  return parsedBook.data[entryKey(parsedAddress.data)]
}

export function resolveLocalAddressIdentity(
  addressBook: unknown,
  accounts: unknown,
  address: unknown
): LocalAddressIdentity | undefined {
  const saved = lookupAddressBookEntry(addressBook, address)
  if (saved) return { label: saved.name, source: 'Saved contact' }

  const parsedAddress = AddressBookAddressInputSchema.safeParse(address)
  if (!parsedAddress.success || !accounts || typeof accounts !== 'object' || Array.isArray(accounts)) return

  const accountMap = accounts as Record<string, unknown>
  const key = entryKey(parsedAddress.data)
  const account =
    accountMap[key] || Object.entries(accountMap).find(([candidate]) => candidate.toLowerCase() === key)?.[1]
  if (!account || typeof account !== 'object' || Array.isArray(account)) return

  const name = (account as { name?: unknown }).name
  if (typeof name !== 'string' || !normalizedText(name)) return
  return { label: normalizedText(name), source: 'Frame account' }
}

export function createAddressBookExport(current: unknown, now = Date.now()): AddressBookExport {
  const addressBook = AddressBookSchema.parse(current)
  return AddressBookExportSchema.parse({
    format: ADDRESS_BOOK_FORMAT,
    version: ADDRESS_BOOK_VERSION,
    exportedAt: new Date(now).toISOString(),
    entries: Object.values(addressBook).sort(
      (left, right) => left.name.localeCompare(right.name) || left.address.localeCompare(right.address)
    )
  })
}

export function importAddressBookExport(
  current: unknown,
  imported: unknown
): { addressBook: AddressBook; imported: number; skipped: number } {
  let addressBook = AddressBookSchema.parse(current)
  const parsed = AddressBookExportSchema.parse(imported)
  let importedCount = 0
  let skipped = 0

  parsed.entries.forEach((candidate) => {
    const entry = normalizedEntry(candidate)
    const key = entry.address.toLowerCase()
    if (
      addressBook[key] ||
      duplicateName(addressBook, entry.name) ||
      Object.keys(addressBook).length >= MAX_ADDRESS_BOOK_ENTRIES
    ) {
      skipped += 1
      return
    }
    addressBook = { ...addressBook, [key]: entry }
    importedCount += 1
  })

  return { addressBook, imported: importedCount, skipped }
}
