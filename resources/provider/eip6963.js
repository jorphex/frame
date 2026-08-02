export const EIP6963_ANNOUNCE_EVENT = 'eip6963:announceProvider'
export const EIP6963_REQUEST_EVENT = 'eip6963:requestProvider'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const FRAME_PROVIDER_METADATA = Object.freeze({
  name: 'Frame Safe 7 Fork',
  icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiIgdmlld0JveD0iMCAwIDk2IDk2Ij48cGF0aCBmaWxsPSIjZjRmOGZiIiBzdHJva2U9IiMxZDJhMmMiIHN0cm9rZS13aWR0aD0iNCIgZD0iTTcgMmg0MGw4IDhoMjdhMTIgMTIgMCAwIDEgMTIgMTJ2MzVsOCA4djIwYTkgOSAwIDAgMS05IDlINTdsLTgtOEgxNUExMiAxMiAwIDAgMSAzIDc0VjUxbC04LThWMTRBMTIgMTIgMCAwIDEgNyAyWiIvPjxyZWN0IHdpZHRoPSI0NCIgaGVpZ2h0PSI0NCIgeD0iMjciIHk9IjI3IiByeD0iMiIgZmlsbD0iIzFkMmEyYyIvPjwvc3ZnPg==',
  rdns: 'io.github.jorphex.frame'
})

export function installEip6963Provider(target, provider) {
  const uuid = target.crypto?.randomUUID?.()
  if (typeof uuid !== 'string' || !UUID_V4.test(uuid)) {
    throw new Error('EIP-6963 requires a UUIDv4 identity')
  }
  if (typeof target.CustomEvent !== 'function') throw new Error('EIP-6963 requires CustomEvent')

  const info = Object.freeze({ uuid, ...FRAME_PROVIDER_METADATA })
  const detail = Object.freeze({ info, provider })
  const announce = () => {
    target.dispatchEvent(new target.CustomEvent(EIP6963_ANNOUNCE_EVENT, { detail }))
  }

  target.addEventListener(EIP6963_REQUEST_EVENT, announce)
  announce()

  let installed = true
  return {
    detail,
    dispose() {
      if (!installed) return
      installed = false
      target.removeEventListener(EIP6963_REQUEST_EVENT, announce)
    }
  }
}
