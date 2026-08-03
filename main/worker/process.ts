import { ChildProcess, fork } from 'child_process'
import { EventEmitter } from 'events'
import log from 'electron-log'

import { nodeWorkerEnvironment } from './environment'

// message from a worker process to the parent
export interface WorkerProcessMessage {
  event: string
  payload?: unknown
}

// message from a parent process to a worker
export interface WorkerProcessCommand {
  command: string
  args?: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isWorkerProcessMessage(value: unknown): value is WorkerProcessMessage {
  return isRecord(value) && typeof value['event'] === 'string'
}

export function isWorkerProcessCommand(value: unknown): value is WorkerProcessCommand {
  return (
    isRecord(value) &&
    typeof value['command'] === 'string' &&
    (value['args'] === undefined || Array.isArray(value['args']))
  )
}

export interface WorkerOptions {
  modulePath: string
  name: string
  args?: string[]
  env?: Partial<NodeJS.ProcessEnv>
  timeout?: number
}

export default class WorkerProcess extends EventEmitter {
  private readonly abortController
  private readonly worker: ChildProcess
  private readonly name: string

  constructor(opts: WorkerOptions) {
    super()

    this.name = opts.name
    this.abortController = new AbortController()
    const { signal } = this.abortController

    log.verbose('creating worker with path:', opts.modulePath + ' ' + (opts.args || []).join(' '))

    this.worker = fork(opts.modulePath, opts.args, {
      signal,
      env: nodeWorkerEnvironment(opts.env)
    })

    log.info(`created ${this.name} worker, pid: ${this.worker.pid}`)

    if (opts.timeout) {
      setTimeout(() => {
        log.warn(`worker process ${this.name} timed out`)
        this.abortController.abort()
      }, opts.timeout)
    }

    this.worker.on('message', (value: unknown) => {
      if (!isWorkerProcessMessage(value)) {
        log.warn(`worker process ${this.name} sent a malformed message`)
        return
      }
      this.emit(value.event, value.payload)
    })

    this.worker.once('error', (err) => {
      log.warn(`worker process ${this.name} raised error: ${err}`)
      this.kill()
    })

    this.worker.once('exit', (code) => {
      log.verbose(`worker process ${this.name} exited with code: ${code}`)
      this.kill()
    })
  }

  send(command: string, ...args: unknown[]) {
    this.worker.send({ command, args })
  }

  kill(signal?: NodeJS.Signals) {
    this.emit('exit')

    this.removeAllListeners()
    this.worker.kill(signal)
  }
}
