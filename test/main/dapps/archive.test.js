import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'

jest.useRealTimers()

// StreamX captures timer globals at module load, so import it only after restoring real timers.
const tar = require('tar-fs')
const tarStream = require('tar-stream')
const { extractDappArchive } = require('../../../main/dapps/archive')

function asNodeArchive(archive) {
  const stream = new PassThrough()
  archive.pipe(stream)
  return stream
}

test('confines archive paths to the private staging directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-dapp-archive-'))
  const source = path.join(root, 'source')
  const staging = path.join(root, 'staging')
  const escaped = path.join(root, 'escaped.txt')

  try {
    await fs.mkdir(source)
    await fs.mkdir(staging)
    await fs.writeFile(path.join(source, 'payload.txt'), 'untrusted archive content')

    const archive = asNodeArchive(
      tar.pack(source, {
        entries: ['payload.txt'],
        map: (header) => ({ ...header, name: 'root/../../escaped.txt' })
      })
    )
    await extractDappArchive(archive, staging)

    await expect(fs.readFile(escaped)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readFile(path.join(staging, 'escaped.txt'), 'utf8')).resolves.toBe(
      'untrusted archive content'
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('extracts regular content without creating archive links', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-dapp-archive-links-'))
  const staging = path.join(root, 'staging')
  const escaped = path.join(root, 'escaped.txt')
  const archive = tarStream.pack()
  const archiveStream = asNodeArchive(archive)

  try {
    await fs.mkdir(staging)

    archive.entry({ name: 'root/content.txt' }, 'safe content')
    archive.entry({ name: 'root/symlink.txt', type: 'symlink', linkname: '../../escaped.txt' })
    archive.entry({ name: 'root/hardlink.txt', type: 'link', linkname: 'root/content.txt' })
    archive.finalize()

    await extractDappArchive(archiveStream, staging)

    await expect(fs.readFile(path.join(staging, 'content.txt'), 'utf8')).resolves.toBe('safe content')
    await expect(fs.lstat(path.join(staging, 'symlink.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.lstat(path.join(staging, 'hardlink.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.lstat(escaped)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    archive.destroy()
    archiveStream.destroy()
    await fs.rm(root, { recursive: true, force: true })
  }
})
