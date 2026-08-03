import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { purgeLegacyLogFiles } from '../../../main/security/logSanitization'

let userDataPath: string

beforeEach(() => {
  userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-log-purge-'))
})

afterEach(() => {
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

it('purges legacy logs once without touching other user data', () => {
  const logDirectory = path.join(userDataPath, 'logs')
  fs.mkdirSync(logDirectory)
  fs.writeFileSync(path.join(logDirectory, 'main.log'), 'https://rpc.example.test/api-secret')
  fs.writeFileSync(path.join(logDirectory, 'main.old.log'), 'older secret')
  fs.writeFileSync(path.join(logDirectory, 'keep.txt'), 'not a log')
  fs.writeFileSync(path.join(userDataPath, 'config.json'), '{"wallet":"preserved"}')

  expect(purgeLegacyLogFiles(userDataPath)).toEqual({ complete: true, purged: 2 })
  expect(fs.existsSync(path.join(logDirectory, 'main.log'))).toBe(false)
  expect(fs.existsSync(path.join(logDirectory, 'main.old.log'))).toBe(false)
  expect(fs.readFileSync(path.join(logDirectory, 'keep.txt'), 'utf8')).toBe('not a log')
  expect(fs.readFileSync(path.join(userDataPath, 'config.json'), 'utf8')).toBe('{"wallet":"preserved"}')
  expect(fs.statSync(path.join(userDataPath, '.sensitive-log-purge-v1')).mode & 0o777).toBe(0o600)

  fs.writeFileSync(path.join(logDirectory, 'main.log'), 'credential-safe current log')
  expect(purgeLegacyLogFiles(userDataPath)).toEqual({ complete: true, purged: 0 })
  expect(fs.readFileSync(path.join(logDirectory, 'main.log'), 'utf8')).toBe('credential-safe current log')
})

it('does not follow a symlink used in place of the log directory', () => {
  const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-external-logs-'))
  const externalLog = path.join(externalDirectory, 'main.log')
  fs.writeFileSync(externalLog, 'must remain')
  fs.symlinkSync(externalDirectory, path.join(userDataPath, 'logs'))

  try {
    expect(purgeLegacyLogFiles(userDataPath)).toEqual({ complete: false, purged: 0 })
    expect(fs.readFileSync(externalLog, 'utf8')).toBe('must remain')
    expect(fs.existsSync(path.join(userDataPath, '.sensitive-log-purge-v1'))).toBe(false)
  } finally {
    fs.rmSync(externalDirectory, { recursive: true, force: true })
  }
})
