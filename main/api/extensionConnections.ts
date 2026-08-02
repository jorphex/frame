export interface ExtensionConnection {
  close(code?: number, reason?: string): void
  disposeSession(): void
  extensionFingerprint: string | undefined
}

const authenticatedSockets = new Map<string, Set<ExtensionConnection>>()

export function registerAuthenticatedExtension(socket: ExtensionConnection, fingerprint: string) {
  socket.extensionFingerprint = fingerprint
  const sockets = authenticatedSockets.get(fingerprint) ?? new Set<ExtensionConnection>()
  sockets.add(socket)
  authenticatedSockets.set(fingerprint, sockets)
}

export function unregisterAuthenticatedExtension(socket: ExtensionConnection) {
  if (!socket.extensionFingerprint) return
  const sockets = authenticatedSockets.get(socket.extensionFingerprint)
  sockets?.delete(socket)
  if (sockets?.size === 0) authenticatedSockets.delete(socket.extensionFingerprint)
  socket.extensionFingerprint = undefined
}

export function disconnectExtensionCredential(fingerprint: string) {
  const sockets = authenticatedSockets.get(fingerprint)
  authenticatedSockets.delete(fingerprint)
  sockets?.forEach((socket) => {
    socket.disposeSession()
    socket.close(1008, 'Extension credential revoked')
  })
}
