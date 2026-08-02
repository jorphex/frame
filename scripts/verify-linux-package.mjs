import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const dist = path.resolve('dist')
const artifactWaitTimeout = 30_000
const artifactPollInterval = 250

const findArtifact = async (suffix) => {
  const deadline = Date.now() + artifactWaitTimeout

  while (Date.now() < deadline) {
    const entries = await readdir(dist)
    const matches = entries.filter((entry) => entry.endsWith(suffix))
    assert.ok(matches.length <= 1, `Expected one ${suffix} artifact, found ${matches.length}`)
    if (matches.length === 1) return matches[0]
    await delay(artifactPollInterval)
  }

  assert.fail(`Timed out waiting ${artifactWaitTimeout}ms for one ${suffix} artifact`)
}

const artifacts = await Promise.all([findArtifact('.AppImage'), findArtifact('_amd64.deb')])
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
const ledgerPackages = [
  '@ledgerhq/hw-app-eth',
  '@ledgerhq/hw-transport',
  '@ledgerhq/hw-transport-node-hid-noevents',
  '@ledgerhq/hw-transport-node-hid-singleton'
]
const appRoot = path.resolve('dist/linux-unpacked/resources/app.asar')
const appModules = path.join(appRoot, 'node_modules')
for (const module of modules) require(path.join(appModules, module))
const ledgerModules = ledgerPackages.map((module) => require(path.join(appModules, module)))
const ledgerVersions = Object.fromEntries(
  ledgerPackages.map((module) => [module, require(path.join(appModules, module, 'package.json')).version])
)
const { SiweMessage } = require(path.join(appModules, 'siwe'))
const ethers = require(path.join(appModules, 'ethers'))
const sigUtil = require(path.join(appModules, '@metamask/eth-sig-util'))
const tarFs = require(path.join(appModules, 'tar-fs'))
const tarStream = require(path.join(appModules, 'tar-stream'))
const electronLog = require(path.join(appModules, 'electron-log'))
const siwe = new SiweMessage(\`example.com wants you to sign in with your Ethereum account:
0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2


URI: https://example.com/login
Version: 1
Chain ID: 1
Nonce: 32891756
Issued At: 2021-09-30T16:25:24Z\`)
const signaturePrivateKey = Buffer.from('46'.repeat(32), 'hex')
const signatureAddress = '0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f'
const signatureData = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    Mail: [
      { name: 'recipient', type: 'address' },
      { name: 'contents', type: 'string' }
    ]
  },
  primaryType: 'Mail',
  domain: { name: 'Frame', version: '1', chainId: 1, verifyingContract: signatureAddress },
  message: { recipient: signatureAddress, contents: 'hello' }
}
const signature = sigUtil.signTypedData({
  privateKey: signaturePrivateKey,
  data: signatureData,
  version: sigUtil.SignTypedDataVersion.V4
})
const signatureHash = sigUtil.TypedDataUtils.eip712Hash(
  signatureData,
  sigUtil.SignTypedDataVersion.V4
).toString('hex')
const recoveredSignatureAddress = sigUtil.recoverTypedSignature({
  data: signatureData,
  signature,
  version: sigUtil.SignTypedDataVersion.V4
})
const modernModules = require(path.join(appRoot, 'compiled/main/nebula/modules.js'))
const fetchUtils = require(path.join(appRoot, 'compiled/resources/utils/fetch.js'))
const signerCrypto = require(path.join(appRoot, 'compiled/main/signers/hot/crypto.js'))
const { Wallet } = require(path.join(appModules, '@ethereumjs/wallet'))
const walletAddress = Wallet.fromPrivateKey(Buffer.from('46'.repeat(32), 'hex')).getAddressString()
const signerSecret = 'packaged-software-signer-probe'
const encryptedSignerSecret = signerCrypto.encryptSecret(signerSecret, 'package-test-password')
const decryptedSignerSecret = signerCrypto.decryptSecret(encryptedSignerSecret, 'package-test-password')
const tamperedSignerSecret = structuredClone(encryptedSignerSecret)
tamperedSignerSecret.ciphertext = \`\${tamperedSignerSecret.ciphertext[0] === '0' ? '1' : '0'}\${tamperedSignerSecret.ciphertext.slice(1)}\`
let signerTamperingRejected = false
try {
  signerCrypto.decryptSecret(tamperedSignerSecret, 'package-test-password')
} catch {
  signerTamperingRejected = true
}
Promise.all([
  Promise.all([modernModules.loadKuboModule(), modernModules.loadUnixFsModule()]),
  fetchUtils.readJsonWithLimit(new Response('{"runtime":"native"}'), 64)
])
  .then(([loaded, fetchProbe]) => process.stdout.write(JSON.stringify({
    electron: process.versions.electron,
    abi: process.versions.modules,
    modules,
    ledgerApis: ledgerModules.map((module) => typeof module.default),
    ledgerVersions,
    siweDomain: siwe.domain,
    ethersVersion: ethers.version,
    ethersBrowserProvider: typeof ethers.BrowserProvider,
    signatureVersion: require(path.join(appModules, '@metamask/eth-sig-util/package.json')).version,
    archiveVersions: {
      'tar-fs': require(path.join(appModules, 'tar-fs/package.json')).version,
      'tar-stream': require(path.join(appModules, 'tar-stream/package.json')).version
    },
    archiveApis: [typeof tarFs.extract, typeof tarStream.extract],
    electronLogVersion: require(path.join(appModules, 'electron-log/package.json')).version,
    electronLogApis: [
      typeof electronLog.info,
      typeof electronLog.error,
      typeof electronLog.transports.console,
      typeof electronLog.transports.file,
      typeof electronLog.transports.file.resolvePathFn
    ],
    signature,
    signatureHash,
    recoveredSignatureAddress,
    walletAddress,
    signerEncryptionVersion: encryptedSignerSecret.version,
    signerSecretRoundTrip: decryptedSignerSecret.plaintext === signerSecret,
    signerTamperingRejected,
    fetchType: typeof fetch,
    fetchProbe,
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
assert.ok(probeResult.ledgerApis.every((api) => api === 'function'))
assert.deepEqual(probeResult.ledgerVersions, {
  '@ledgerhq/hw-app-eth': packageJson.dependencies['@ledgerhq/hw-app-eth'],
  '@ledgerhq/hw-transport': packageJson.dependencies['@ledgerhq/hw-transport'],
  '@ledgerhq/hw-transport-node-hid-noevents':
    packageJson.dependencies['@ledgerhq/hw-transport-node-hid-noevents'],
  '@ledgerhq/hw-transport-node-hid-singleton':
    packageJson.dependencies['@ledgerhq/hw-transport-node-hid-singleton']
})
assert.equal(probeResult.siweDomain, 'example.com')
assert.equal(probeResult.ethersVersion, packageJson.dependencies.ethers)
assert.equal(probeResult.ethersBrowserProvider, 'function')
assert.equal(probeResult.signatureVersion, packageJson.dependencies['@metamask/eth-sig-util'])
assert.deepEqual(probeResult.archiveVersions, {
  'tar-fs': packageJson.dependencies['tar-fs'],
  'tar-stream': packageJson.devDependencies['tar-stream']
})
assert.deepEqual(probeResult.archiveApis, ['function', 'function'])
assert.equal(probeResult.electronLogVersion, packageJson.dependencies['electron-log'])
assert.deepEqual(probeResult.electronLogApis, Array(5).fill('function'))
assert.equal(probeResult.signatureHash, 'd07e8b0969c3d3ba7934bcf9134d586ce1c14c96c4396824a3c6b0137c1e4943')
assert.equal(
  probeResult.signature,
  '0xd5a81e21c610fc88fa3acf615af9881b4b23c52ff4c6a4094b6cfb4af09dde5e35a4e4d8d365477faea588b3fdc54ea3792b14c607f1d69a39e5c6ca8e2d5e2a1c'
)
assert.equal(probeResult.recoveredSignatureAddress, '0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f')
assert.equal(probeResult.walletAddress, '0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f')
assert.equal(probeResult.signerEncryptionVersion, 2)
assert.equal(probeResult.signerSecretRoundTrip, true)
assert.equal(probeResult.signerTamperingRejected, true)
assert.equal(probeResult.fetchType, 'function')
assert.deepEqual(probeResult.fetchProbe, { runtime: 'native' })
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
  } hardware-wallet native, Ledger ${
    probeResult.ledgerVersions['@ledgerhq/hw-app-eth']
  }, SIWE, EIP-712, electron-log 5, native fetch, tar-fs 3, ethers 6, EthereumJS wallet, software-signer encryption, and IPFS ESM modules`
)
