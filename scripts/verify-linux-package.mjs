import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const dist = path.resolve('dist')
const entries = await readdir(dist)

const findArtifact = (suffix) => {
  const matches = entries.filter((entry) => entry.endsWith(suffix))
  assert.equal(matches.length, 1, `Expected one ${suffix} artifact, found ${matches.length}`)
  return matches[0]
}

const artifacts = [findArtifact('.AppImage'), findArtifact('_amd64.deb')]
const unpackedModules = path.join(dist, 'linux-unpacked', 'resources', 'app.asar.unpacked', 'node_modules')
const nativeModules = [
  path.join(unpackedModules, 'node-hid', 'build', 'Release', 'HID_hidraw.node'),
  path.join(unpackedModules, '@trezor', 'transport', 'node_modules', 'usb', 'prebuilds', 'linux-x64', 'node.napi.glibc.node')
]

await Promise.all(nativeModules.map((modulePath) => access(modulePath)))

const packagedExecutable = path.join(dist, 'linux-unpacked', 'frame')
const packagedModuleProbe = `
const path = require('node:path')
const modules = ['node-hid', 'usb', '@trezor/transport/node_modules/usb']
const appModules = path.resolve('dist/linux-unpacked/resources/app.asar/node_modules')
for (const module of modules) require(path.join(appModules, module))
process.stdout.write(JSON.stringify({
  electron: process.versions.electron,
  abi: process.versions.modules,
  modules
}))
`
const probe = spawnSync(packagedExecutable, ['-e', packagedModuleProbe], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: 'true' }
})

assert.equal(probe.status, 0, `Packaged native-module probe failed:\n${probe.stderr}`)
const probeResult = JSON.parse(probe.stdout)
const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
assert.equal(probeResult.electron, packageJson.devDependencies.electron)
assert.deepEqual(probeResult.modules, ['node-hid', 'usb', '@trezor/transport/node_modules/usb'])
assert.match(probeResult.abi, /^\d+$/)

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
  })

const checksums = await Promise.all(
  artifacts.map(async (artifact) => `${await sha256(path.join(dist, artifact))}  ${artifact}`)
)

await writeFile(path.join(dist, 'SHA256SUMS'), `${checksums.join('\n')}\n`)
console.log(
  `Verified ${artifacts.join(' and ')} with Electron ${probeResult.electron} ABI ${probeResult.abi} hardware-wallet native modules`
)
