import { fetchWithTimeout, readJsonWithLimit } from '../../../resources/utils/fetch'

describe('fetch utilities', () => {
  let fetchMock

  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fetch request'))
  })

  afterEach(() => {
    fetchMock.mockRestore()
    jest.useRealTimers()
  })

  it('aborts requests when the timeout expires', async () => {
    fetchMock.mockImplementationOnce((url, { signal }) => {
      return new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new globalThis.DOMException('This operation was aborted', 'AbortError')),
          { once: true }
        )
      })
    })

    const response = fetchWithTimeout('https://rpc.example', {}, 100)
    jest.advanceTimersByTime(100)

    await expect(response).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('decodes a bounded streamed JSON response across UTF-8 chunks', async () => {
    const encoded = new globalThis.TextEncoder().encode(JSON.stringify({ name: 'Framé' }))
    const multibyteCharacter = encoded.indexOf(0xc3)
    const response = new globalThis.Response(
      new globalThis.ReadableStream({
        start(controller) {
          controller.enqueue(encoded.slice(0, multibyteCharacter + 1))
          controller.enqueue(encoded.slice(multibyteCharacter + 1))
          controller.close()
        }
      })
    )

    await expect(readJsonWithLimit(response, encoded.byteLength)).resolves.toEqual({ name: 'Framé' })
  })

  it('cancels a streamed response as soon as it exceeds the byte limit', async () => {
    const cancel = jest.fn()
    const response = new globalThis.Response(
      new globalThis.ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(5))
          controller.enqueue(new Uint8Array(6))
        },
        cancel
      })
    )

    await expect(readJsonWithLimit(response, 10)).rejects.toThrow(/exceeds 10 bytes/)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('rejects an oversized declared content length before reading the body', async () => {
    const response = new globalThis.Response('{}', { headers: { 'content-length': '11' } })

    await expect(readJsonWithLimit(response, 10)).rejects.toThrow(/exceeds 10 bytes/)
    expect(response.bodyUsed).toBe(true)
  })
})
