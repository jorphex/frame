import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'

jest.useRealTimers()

// StreamX captures timer globals at module load, so import it only after restoring real timers.
const tar = require('tar-fs')
const { installDappArchive } = require('../../../main/dapps/cache')

const expectedCID = 'bafy-expected'
const hashDirectory = jest.fn(async () => ({
  toV1: () => ({ toString: () => expectedCID })
}))

async function createArchive(root, content) {
  const source = path.join(root, `source-${Math.random()}`)
  await fs.mkdir(source)
  await fs.writeFile(path.join(source, 'index.html'), content)
  const archive = new PassThrough()
  tar
    .pack(source, {
      entries: ['index.html'],
      map: (header) => ({ ...header, name: `bafy-root/${header.name}` })
    })
    .pipe(archive)

  return archive
}

async function stagingEntries(root) {
  return (await fs.readdir(root)).filter((entry) => entry.startsWith('.dapp-'))
}

test('publishes a verified archive only after replacing the previous cache', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-dapp-cache-'))
  const target = path.join(root, 'dapp')

  try {
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, 'index.html'), 'old content')

    await installDappArchive({
      archive: await createArchive(root, 'new content'),
      cacheRoot: root,
      contentCID: expectedCID,
      dappId: 'dapp',
      hashDirectory
    })

    await expect(fs.readFile(path.join(target, 'index.html'), 'utf8')).resolves.toBe('new content')
    await expect(stagingEntries(root)).resolves.toEqual([])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('preserves the previous cache when downloaded content has the wrong CID', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-dapp-cache-'))
  const target = path.join(root, 'dapp')

  try {
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, 'index.html'), 'trusted content')

    await expect(
      installDappArchive({
        archive: await createArchive(root, 'untrusted content'),
        cacheRoot: root,
        contentCID: 'bafy-published',
        dappId: 'dapp',
        hashDirectory
      })
    ).rejects.toThrow('Downloaded dapp CID mismatch')

    await expect(fs.readFile(path.join(target, 'index.html'), 'utf8')).resolves.toBe('trusted content')
    await expect(stagingEntries(root)).resolves.toEqual([])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('preserves the previous cache when the archive stream fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-dapp-cache-'))
  const target = path.join(root, 'dapp')

  async function* failedArchive() {
    yield Buffer.from('partial archive')
    throw new Error('download interrupted')
  }

  try {
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, 'index.html'), 'trusted content')

    await expect(
      installDappArchive({
        archive: failedArchive(),
        cacheRoot: root,
        contentCID: expectedCID,
        dappId: 'dapp',
        hashDirectory
      })
    ).rejects.toThrow('download interrupted')

    await expect(fs.readFile(path.join(target, 'index.html'), 'utf8')).resolves.toBe('trusted content')
    await expect(stagingEntries(root)).resolves.toEqual([])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
