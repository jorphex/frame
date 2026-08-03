import fs from 'node:fs'
import path from 'node:path'

const PURGE_MARKER = '.sensitive-log-purge-v1'

export interface LegacyLogPurgeResult {
  complete: boolean
  purged: number
}

export function purgeLegacyLogFiles(userDataPath: string): LegacyLogPurgeResult {
  const markerPath = path.join(userDataPath, PURGE_MARKER)
  let purged = 0

  try {
    if (fs.existsSync(markerPath)) return { complete: true, purged: 0 }

    const logDirectory = path.join(userDataPath, 'logs')

    if (fs.existsSync(logDirectory)) {
      if (!fs.lstatSync(logDirectory).isDirectory()) return { complete: false, purged }

      for (const entry of fs.readdirSync(logDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.log')) continue

        fs.unlinkSync(path.join(logDirectory, entry.name))
        purged += 1
      }
    }

    fs.writeFileSync(markerPath, 'Legacy logs purged before credential-safe logging.\n', {
      flag: 'wx',
      mode: 0o600
    })

    return { complete: true, purged }
  } catch {
    return { complete: false, purged }
  }
}
