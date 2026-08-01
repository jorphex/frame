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
  path.join(
    unpackedModules,
    '@trezor',
    'transport',
    'node_modules',
    'usb',
    'prebuilds',
    'linux-x64',
    'node.napi.glibc.node'
  )
]

await Promise.all(nativeModules.map((modulePath) => access(modulePath)))

const packagedExecutable = path.join(dist, 'linux-unpacked', 'frame')
const packagedModuleProbe = `
const path = require('node:path')
const modules = ['node-hid', 'usb', '@trezor/transport/node_modules/usb']
const appRoot = path.resolve('dist/linux-unpacked/resources/app.asar')
const appModules = path.join(appRoot, 'node_modules')
for (const module of modules) require(path.join(appModules, module))
const { SiweMessage } = require(path.join(appModules, 'siwe'))
const siwe = new SiweMessage(\`example.com wants you to sign in with your Ethereum account:
0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2


URI: https://example.com/login
Version: 1
Chain ID: 1
Nonce: 32891756
Issued At: 2021-09-30T16:25:24Z\`)
const modernModules = require(path.join(appRoot, 'compiled/main/nebula/modules.js'))
Promise.all([modernModules.loadKuboModule(), modernModules.loadUnixFsModule()])
  .then((loaded) => process.stdout.write(JSON.stringify({
    electron: process.versions.electron,
    abi: process.versions.modules,
    modules,
    siweDomain: siwe.domain,
    esmModules: loaded.map((module) => Object.keys(module).length)
  })))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
`
const probe = spawnSync(packagedExecutable, ['-e', packagedModuleProbe], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: 'true' },
  timeout: 30_000
})

assert.equal(probe.status, 0, `Packaged module probe failed:\n${probe.error || probe.stderr}`)
const probeResult = JSON.parse(probe.stdout)
const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
assert.equal(probeResult.electron, packageJson.devDependencies.electron)
assert.deepEqual(probeResult.modules, ['node-hid', 'usb', '@trezor/transport/node_modules/usb'])
assert.equal(probeResult.siweDomain, 'example.com')
assert.equal(probeResult.esmModules.length, 2)
assert.ok(probeResult.esmModules.every((exports) => exports > 0))
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
  `Verified ${artifacts.join(' and ')} with Electron ${probeResult.electron} ABI ${
    probeResult.abi
  } hardware-wallet native, SIWE, and IPFS ESM modules`
)
