const requestSignals = new WeakMap<RPCRequestCallback, AbortSignal>()

export function bindRequestSignal<T extends RPCRequestCallback>(
  callback: T,
  signal: AbortSignal | undefined
): T {
  if (signal) requestSignals.set(callback, signal)
  return callback
}

export function inheritRequestSignal<T extends RPCRequestCallback>(source: RPCRequestCallback, target: T): T {
  return bindRequestSignal(target, requestSignals.get(source))
}

export function getRequestSignal(callback: RPCRequestCallback) {
  return requestSignals.get(callback)
}
