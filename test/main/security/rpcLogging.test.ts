import { summarizeRpcEndpoint, summarizeRpcError } from '../../../main/security/rpcLogging'

describe('RPC log summaries', () => {
  it.each([
    'https://user:password@example.test/project-secret?apiKey=query-secret#fragment-secret',
    'wss://path-secret.rpc.example.test/v3/path-secret',
    'not-a-url-with-secret'
  ])('does not expose any part of a configured endpoint: %s', (endpoint) => {
    const serialized = JSON.stringify(summarizeRpcEndpoint(endpoint))

    expect(serialized).not.toContain(endpoint)
    expect(serialized).not.toMatch(/user|password|example|project|secret|apiKey/i)
    expect(serialized).toContain('configured')
  })

  it('retains only the RPC transport needed for diagnostics', () => {
    expect(summarizeRpcEndpoint('https://example.test/secret')).toEqual({
      configured: true,
      transport: 'https'
    })
    expect(summarizeRpcEndpoint('wss://example.test/secret')).toEqual({
      configured: true,
      transport: 'wss'
    })
    expect(summarizeRpcEndpoint('')).toEqual({ configured: false })
  })

  it('drops error messages, stacks, causes, and unsafe codes', () => {
    const error = Object.assign(new Error('request failed for https://example.test/api-secret'), {
      code: 'ECONNREFUSED',
      cause: new Error('query-secret')
    })
    const serialized = JSON.stringify(summarizeRpcError(error))

    expect(summarizeRpcError(error)).toEqual({ name: 'Error', code: 'ECONNREFUSED' })
    expect(serialized).not.toMatch(/request|https|example|secret|stack|cause/i)
    expect(summarizeRpcError({ name: 'Error', code: 'unsafe secret value' })).toEqual({ name: 'Error' })
  })
})
