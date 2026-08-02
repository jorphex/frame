import { ipcRenderer } from 'electron'
import { MAX_MESSAGE_LENGTH } from '../protocol'
let i = 0
const newId = () => ++i

const defined = (value) => value !== undefined && value !== null

const handlers = Object.create(null)

ipcRenderer.on('main:rpc', (sender, id, ...args) => {
  if (!Number.isSafeInteger(id) || id < 1 || !Object.hasOwn(handlers, id)) {
    return console.log('Message from main RPC had no handler')
  }
  const handler = handlers[id]
  delete handlers[id]
  try {
    if (args.length > 8) throw new Error('Invalid main RPC response')
    let wireSize = 0
    args = args.map((arg) => {
      if (!defined(arg)) return arg
      if (typeof arg !== 'string') throw new Error('Invalid main RPC response')
      wireSize += arg.length
      if (wireSize > MAX_MESSAGE_LENGTH) throw new Error('Invalid main RPC response')
      return JSON.parse(arg)
    })
  } catch {
    handler('Invalid main RPC response')
    return
  }
  handler(...args)
})

export default (...args) => {
  const cb = args.pop()
  if (typeof cb !== 'function') throw new Error('Main RPC requires a callback')
  const id = newId()
  handlers[id] = cb
  args = args.map((arg) => (defined(arg) ? JSON.stringify(arg) : arg))
  ipcRenderer.send('main:rpc', JSON.stringify(id), ...args)
}
