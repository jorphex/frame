import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

import { createDappArchiveExtractor } from './archive'
import { hashDirectory } from './verify'

type DirectoryHash = {
  toV1: () => { toString: () => string }
}

type InstallOptions = {
  archive: AsyncIterable<Uint8Array>
  cacheRoot: string
  contentCID: string
  dappId: string
  hashDirectory?: (directory: string) => Promise<DirectoryHash>
  onCleanupError?: (error: unknown) => void
}

async function pathExists(target: string) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export async function installDappArchive({
  archive,
  cacheRoot,
  contentCID,
  dappId,
  hashDirectory: calculateHash = hashDirectory,
  onCleanupError = () => {}
}: InstallOptions) {
  const targetPath = path.join(cacheRoot, dappId)
  const nonce = crypto.randomBytes(6).toString('hex')
  const stagingPath = path.join(cacheRoot, `.${dappId}-${nonce}`)
  const backupPath = path.join(cacheRoot, `.${dappId}-previous-${nonce}`)

  await fs.mkdir(cacheRoot, { recursive: true })

  try {
    await fs.mkdir(stagingPath)
    await pipeline(Readable.from(archive), createDappArchiveExtractor(stagingPath))

    const stagedCID = (await calculateHash(stagingPath)).toV1().toString()
    if (stagedCID !== contentCID) {
      throw new Error(`Downloaded dapp CID mismatch: expected ${contentCID}, received ${stagedCID}`)
    }

    const targetExists = await pathExists(targetPath)
    if (targetExists) await fs.rename(targetPath, backupPath)

    try {
      await fs.rename(stagingPath, targetPath)
    } catch (error) {
      if (targetExists) await fs.rename(backupPath, targetPath)
      throw error
    }

    if (targetExists) {
      await fs.rm(backupPath, { recursive: true, force: true }).catch(onCleanupError)
    }
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true })
    throw error
  }
}
