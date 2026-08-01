import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { pipeline } from 'stream/promises'
import tar from 'tar-fs'

import { createDappArchiveExtractor } from '../../../main/dapps/archive'

test('confines archive paths to the private staging directory', async () => {
  jest.useRealTimers()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-dapp-archive-'))
  const source = path.join(root, 'source')
  const staging = path.join(root, 'staging')
  const escaped = path.join(root, 'escaped.txt')

  try {
    await fs.mkdir(source)
    await fs.mkdir(staging)
    await fs.writeFile(path.join(source, 'payload.txt'), 'untrusted archive content')

    const archive = tar.pack(source, {
      entries: ['payload.txt'],
      map: (header) => ({ ...header, name: 'root/../../escaped.txt' })
    })
    await pipeline(archive, createDappArchiveExtractor(staging))

    await expect(fs.readFile(escaped)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readFile(path.join(staging, 'escaped.txt'), 'utf8')).resolves.toBe(
      'untrusted archive content'
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
