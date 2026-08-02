import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createBuildIdentity } from './build-identity.mjs'
import { readWorkingSourceIdentity } from './source-identity.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const destination = path.resolve('compiled/main/build-identity.json')
const temporary = `${destination}.${process.pid}.tmp`
const identity = createBuildIdentity(readWorkingSourceIdentity(), packageJson.version)

await mkdir(path.dirname(destination), { recursive: true })
await writeFile(temporary, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 })
await rename(temporary, destination)
console.log(`Recorded build identity ${identity.sourceCommit}${identity.sourceDirty ? ' (dirty)' : ''}`)
