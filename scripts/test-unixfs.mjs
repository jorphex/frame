import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { hashDirectory } = require('../compiled/main/dapps/verify')

const fixtureCid = 'bafybeib4nfqoovh6nwreq3nsmtakyapnsbxuk7vn643la45zvl4jkw6mgq'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-unixfs-test-'))

try {
  await fs.mkdir(path.join(root, 'assets'))
  await fs.mkdir(path.join(root, '.well-known'))
  await fs.writeFile(path.join(root, 'index.html'), '<h1>Frame fixture</h1>\n')
  await fs.writeFile(path.join(root, 'assets', 'app.js'), 'console.log("frame")\n')
  await fs.writeFile(path.join(root, '.well-known', 'frame.json'), '{"frame":true}\n')

  assert.equal((await hashDirectory(root)).toV1().toString(), fixtureCid)

  await fs.writeFile(path.join(root, '.well-known', 'frame.json'), '{"frame":false}\n')
  assert.notEqual((await hashDirectory(root)).toV1().toString(), fixtureCid)

  await fs.symlink(path.join(root, 'index.html'), path.join(root, 'linked-index.html'))
  await assert.rejects(hashDirectory(root), /symbolic link/)

  console.log('Verified complete UnixFS v0 directory hashing, hidden files, and symlink rejection')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
