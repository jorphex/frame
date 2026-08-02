import log from 'electron-log'
import { isWorkerProcessCommand } from './process'

export function sendMessage(event: string, payload?: unknown) {
  log.debug(
    `child process with pid ${process.pid} sending "${event}" event with payload: ${JSON.stringify(payload)}`
  )

  if (process.send) {
    process.send({ event, payload })
  } else {
    log.error(`cannot send to main process from worker! connected: ${process.connected} pid: ${process.pid}`)
  }
}

export function sendError(err: Error) {
  sendMessage('error', err.message)
}

const messageHandlers: Record<string, (...params: unknown[]) => void> = {}

function handleMessageFromParent(value: unknown) {
  if (!isWorkerProcessCommand(value)) {
    log.warn(`child process with pid ${process.pid} received a malformed message`)
    return
  }

  const message = value
  log.debug(
    `child process with pid ${process.pid} received message: ${message.command} ${JSON.stringify(
      message.args
    )}`
  )

  const args = message.args || []

  const handler = messageHandlers[message.command]
  if (handler) {
    handler(...args)
  } else {
    log.warn(`child process with pid ${process.pid} received unexpected message: ${message.command}`)
  }
}

// calling this function has the side effect of adding a message listener to the process
// so it should only be called by a child process listening to messages from a main
// process via an IPC channel
export function addCommand(command: string, handler: (...params: unknown[]) => void) {
  if (process.listenerCount('message') === 0) {
    process.on('message', handleMessageFromParent)
  }

  messageHandlers[command] = handler
}
