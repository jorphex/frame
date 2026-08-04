import { suppressLinuxUsbDeviceResets } from '../../../../main/signers/trezor/nodeUsbTransport'

describe('Linux Trezor NodeUsb transport', () => {
  it('suppresses device-level resets on Linux', async () => {
    const resetDevice = jest.fn().mockResolvedValue(undefined)
    const transport = { api: { resetDevice } }

    expect(suppressLinuxUsbDeviceResets(transport, 'linux')).toBe(true)

    await transport.api.resetDevice('trezor-path')

    expect(resetDevice).not.toHaveBeenCalled()
  })

  it('preserves upstream reset behavior on other platforms', async () => {
    const resetDevice = jest.fn().mockResolvedValue(undefined)
    const transport = { api: { resetDevice } }

    expect(suppressLinuxUsbDeviceResets(transport, 'darwin')).toBe(false)

    await transport.api.resetDevice('trezor-path')

    expect(resetDevice).toHaveBeenCalledWith('trezor-path')
  })

  it('fails closed when the upstream Linux reset hook changes', () => {
    expect(() => suppressLinuxUsbDeviceResets({}, 'linux')).toThrow(
      'Trezor NodeUsb transport does not expose the expected reset hook'
    )
  })
})
