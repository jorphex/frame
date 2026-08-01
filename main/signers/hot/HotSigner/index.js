const path = require('path')
const fs = require('fs')
const { ensureDirSync, removeSync } = require('fs-extra')
const { fork } = require('child_process')
const { app } = require('electron')
const log = require('electron-log')
const { v4: uuid } = require('uuid')

const Signer = require('../../Signer').default
const store = require('../../../store').default
// Mock windows module during tests
const windows = app ? require('../../../windows') : { broadcast: () => {} }
// Mock user data dir during tests
const USER_DATA = app
  ? app.getPath('userData')
  : path.resolve(path.dirname(require.main.filename), '../.userData')
const SIGNERS_PATH = path.resolve(USER_DATA, 'signers')

class HotSigner extends Signer {
  constructor(signer, workerPath) {
    super()
    this.status = 'locked'
    this.addresses = signer ? signer.addresses : []
    this._worker = fork(workerPath)
    this._getToken()
    this.ready = false
  }

  save(data, { backupLegacy = false } = {}) {
    // Construct signer
    const { id, addresses, type, network } = this
    const signer = { id, addresses, type, network, ...data }

    // Ensure signers directory exists
    ensureDirSync(SIGNERS_PATH)

    const signerPath = path.resolve(SIGNERS_PATH, `${id}.json`)
    const backupPath = path.resolve(SIGNERS_PATH, `${id}.legacy-v1.bak`)
    const temporaryPath = path.resolve(SIGNERS_PATH, `${id}.${uuid()}.tmp`)

    if (backupLegacy && fs.existsSync(signerPath)) {
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(signerPath, backupPath, fs.constants.COPYFILE_EXCL)
      }
      fs.chmodSync(backupPath, 0o600)
    }

    let descriptor
    try {
      descriptor = fs.openSync(temporaryPath, 'wx', 0o600)
      fs.writeFileSync(descriptor, JSON.stringify(signer))
      fs.fsyncSync(descriptor)
      fs.closeSync(descriptor)
      descriptor = undefined
      fs.renameSync(temporaryPath, signerPath)
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor)
        } catch {}
      }
      try {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
      } catch {}
      throw error
    }

    // Log
    log.debug('Signer saved to disk')
  }

  delete() {
    const signerPaths = [
      path.resolve(SIGNERS_PATH, `${this.id}.json`),
      path.resolve(SIGNERS_PATH, `${this.id}.legacy-v1.bak`)
    ]

    signerPaths.filter(fs.existsSync).forEach((signerPath) => {
      const size = fs.statSync(signerPath).size
      const descriptor = fs.openSync(signerPath, 'r+')
      const buffer = Buffer.alloc(Math.min(Math.max(size, 1), 64 * 1024))
      try {
        for (let offset = 0; offset < size; offset += buffer.length) {
          fs.writeSync(descriptor, buffer, 0, Math.min(buffer.length, size - offset), offset)
        }
        fs.fsyncSync(descriptor)
      } finally {
        fs.closeSync(descriptor)
      }
      removeSync(signerPath)
    })

    // Log
    log.info('Signer erased from disk')
  }

  lock(cb) {
    this._callWorker({ method: 'lock' }, () => {
      this.status = 'locked'
      this.update()
      log.info('Signer locked')
      cb(null)
    })
  }

  unlock(password, data, cb) {
    const params = { password, ...data }
    this._callWorker({ method: 'unlock', params }, (err, result) => {
      if (err) return cb(err)
      this.status = 'ok'
      this.update()
      log.info('Signer unlocked')
      cb(null, result)
    })
  }

  persistEncryptionMigration(field, encryptedSecret, cb) {
    if (!encryptedSecret) return cb(null)

    const previousSecret = this[field]
    this[field] = encryptedSecret

    try {
      this.save({ backupLegacy: true })
      log.info('Signer encryption upgraded')
      cb(null)
    } catch (error) {
      this[field] = previousSecret
      log.error('Unable to persist signer encryption upgrade', error)
      this.lock(() => cb(new Error('Unable to upgrade signer encryption')))
    }
  }

  close() {
    if (this.ready) this._worker.disconnect()
    else this.once('ready', () => this._worker.disconnect())
    store.removeSigner(this.id)
    log.info('Signer closed')
  }

  update() {
    // Get derived ID
    const derivedId = this.fingerprint()

    // On new ID ->
    if (!this.id) {
      // Update id
      this.id = derivedId
      // Write to disk
      this.save()
    } else if (this.id !== derivedId) {
      // On changed ID
      // Erase from disk
      this.delete(this.id)
      // Remove from store
      store.removeSigner(this.id)
      // Update id
      this.id = derivedId
      // Write to disk
      this.save()
    }

    store.updateSigner(this.summary())
    log.info('Signer updated')
  }

  signMessage(index, message, cb) {
    const payload = { method: 'signMessage', params: { index, message } }
    this._callWorker(payload, cb)
  }

  signTypedData(index, typedMessage, cb) {
    const payload = { method: 'signTypedData', params: { index, typedMessage } }
    this._callWorker(payload, cb)
  }

  signTransaction(index, rawTx, cb) {
    const payload = { method: 'signTransaction', params: { index, rawTx } }
    this._callWorker(payload, cb)
  }

  verifyAddress(index, address, display, cb = () => {}) {
    const payload = { method: 'verifyAddress', params: { index, address } }
    this._callWorker(payload, (err, verified) => {
      if (err || !verified) {
        if (!err) {
          store.notify('hotSignerMismatch')
          err = new Error('Unable to verify address')
        }
        this.lock(() => {
          if (err) {
            log.error('HotSigner verifyAddress: Unable to verify address')
          } else {
            log.error('HotSigner verifyAddress: Address mismatch')
          }
          log.error(err)
        })
        cb(err)
      } else {
        log.info('Hot signer verify address matched')
        cb(null, verified)
      }
    })
  }

  _getToken() {
    const listener = ({ type, token }) => {
      if (type === 'token') {
        this._token = token
        this._worker.removeListener('message', listener)
        this.ready = true
        this.emit('ready')
      }
    }
    this._worker.addListener('message', listener)
  }

  _callWorker(payload, cb) {
    if (!this._worker) throw Error('Worker not running')
    // If token not yet received -> retry in 100 ms
    if (!this._token) return setTimeout(() => this._callWorker(payload, cb), 100)
    // Generate message id
    const id = uuid()
    // Handle response
    const listener = (response) => {
      if (response.type === 'rpc' && response.id === id) {
        const error = response.error ? new Error(response.error) : null
        cb(error, response.result)
        this._worker.removeListener('message', listener)
      }
    }
    this._worker.addListener('message', listener)
    // Make RPC call
    this._worker.send({ id, token: this._token, ...payload })
  }
}

module.exports = HotSigner
