import { NodeUsbTransport } from '@trezor/transport'

type NodeUsbTransportParams = ConstructorParameters<typeof NodeUsbTransport>[0]
type ResettableUsbApi = {
  resetDevice: (path: string) => Promise<void>
}

type NodeUsbTransportInternals = {
  api?: Partial<ResettableUsbApi>
}

export function suppressLinuxUsbDeviceResets(
  transport: NodeUsbTransportInternals,
  platform: NodeJS.Platform = process.platform
) {
  if (platform !== 'linux') return false

  const resettableApi = transport.api

  if (!resettableApi || typeof resettableApi.resetDevice !== 'function') {
    throw new Error('Trezor NodeUsb transport does not expose the expected reset hook')
  }

  // A stalled node-usb reset can hold Linux's usbfs mutex while Electron submits
  // another transfer, freezing the main process in an uninterruptible ioctl.
  resettableApi.resetDevice = async () => {}

  return true
}

export class FrameNodeUsbTransport extends NodeUsbTransport {
  constructor(params: NodeUsbTransportParams) {
    super(params)

    suppressLinuxUsbDeviceResets(this as unknown as NodeUsbTransportInternals)
  }
}
