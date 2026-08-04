import {
  ADDRESS_BOOK_FORMAT,
  ADDRESS_BOOK_VERSION,
  MAX_ADDRESS_BOOK_FILE_BYTES
} from '../../../resources/domain/addressBook'
import { createAddressBookFileService } from '../../../main/addressBook/files'

jest.mock('electron', () => ({ app: { on: jest.fn(), getPath: jest.fn(() => '/tmp') } }))

const address = '0x0000000000000000000000000000000000000001'
const entry = { address, name: 'Treasury', note: '', createdAt: 1, updatedAt: 1 }
const document = {
  format: ADDRESS_BOOK_FORMAT,
  version: ADDRESS_BOOK_VERSION,
  exportedAt: new Date(1).toISOString(),
  entries: [entry]
}

const dependencies = (overrides = {}) => ({
  current: () => ({}),
  importEntries: jest.fn(() => ({ imported: 1, skipped: 0 })),
  openImport: jest.fn(async () => '/tmp/contacts.json'),
  openExport: jest.fn(async () => '/tmp/contacts.json'),
  readFile: jest.fn(async () => JSON.stringify(document)),
  stat: jest.fn(async () => ({ isFile: () => true, size: 100 })),
  writeFile: jest.fn(async () => undefined),
  now: () => 1,
  ...overrides
})

test('imports a completely validated document and reports duplicate skips', async () => {
  const deps = dependencies({ importEntries: jest.fn(() => ({ imported: 1, skipped: 2 })) })
  const result = await createAddressBookFileService(deps).importFile()

  expect(result).toEqual({ success: true, imported: 1, skipped: 2 })
  expect(deps.importEntries).toHaveBeenCalledWith(document)
})

test('rejects oversized and malformed imports before mutation', async () => {
  const oversized = dependencies({
    stat: jest.fn(async () => ({ isFile: () => true, size: MAX_ADDRESS_BOOK_FILE_BYTES + 1 }))
  })
  await expect(createAddressBookFileService(oversized).importFile()).rejects.toThrow(/exceeds 1 MiB/)
  expect(oversized.importEntries).not.toHaveBeenCalled()

  const malformed = dependencies({ readFile: jest.fn(async () => '{') })
  await expect(createAddressBookFileService(malformed).importFile()).rejects.toThrow(/valid JSON/)
  expect(malformed.importEntries).not.toHaveBeenCalled()
})

test('treats canceled import and export dialogs as non-errors', async () => {
  const deps = dependencies({
    openImport: jest.fn(async () => undefined),
    openExport: jest.fn(async () => undefined)
  })
  const service = createAddressBookFileService(deps)

  await expect(service.importFile()).resolves.toEqual({ success: false, canceled: true })
  await expect(service.exportFile()).resolves.toEqual({ success: false, canceled: true })
  expect(deps.writeFile).not.toHaveBeenCalled()
})

test('exports deterministic versioned JSON without returning a filesystem path', async () => {
  const deps = dependencies({ current: () => ({ [address.toLowerCase()]: entry }) })
  const result = await createAddressBookFileService(deps).exportFile()

  expect(result).toEqual({ success: true, exported: 1 })
  expect(deps.writeFile).toHaveBeenCalledWith('/tmp/contacts.json', `${JSON.stringify(document, null, 2)}\n`)
})
