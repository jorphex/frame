// Flex is a reverse RPC interface for calling into the renderer's chromium process and recieving callbacks/events

const EventEmitter = require('events')
const { v4: uuid } = require('uuid')
const log = require('electron-log')

const windows = require('../windows')
const { onRenderer } = require('../ipc/renderer')

const defined = (value) => value !== undefined && value !== null

class Flex extends EventEmitter {
  setReady() {
    this.ready = true
    this.emit('ready')
  }

  rpc(...args) {
    const cb = args.pop()
    if (typeof cb !== 'function') throw new Error('Flex methods require a callback')
    const id = uuid()
    handlers[id] = cb
    args = args.map((arg) => (defined(arg) ? JSON.stringify(arg) : arg))
    windows.send('tray', 'main:flex', JSON.stringify(id), ...args)
  }
}

const flex = new Flex()

flex.setMaxListeners(128)

const handlers = {}

onRenderer('tray:flex:res', (sender, id, ...args) => {
  if (!handlers[id]) return log.warn('Message from main RPC had no handler')
  args = args.map((arg) => (defined(arg) ? JSON.parse(arg) : arg))
  handlers[id](...args)
  delete handlers[id]
})

onRenderer('tray:flex:event', (sender, eventName, ...args) => {
  args = args.map((arg) => (defined(arg) ? JSON.parse(arg) : arg))
  flex.emit(eventName, ...args)
})

onRenderer('tray:ready', () => flex.setReady())

// If flex is already ready, trigger new 'ready' listeners
flex.on('newListener', (e, listener) => {
  if (e === 'ready' && flex.ready) listener()
})

module.exports = flex
