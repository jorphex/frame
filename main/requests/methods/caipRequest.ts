import { addHexPrefix } from '@ethereumjs/util'
import { z } from 'zod'

import { createRequestMatcher, generateError } from '../matchers'

const MAX_SAFE_CHAIN_ID = BigInt(Number.MAX_SAFE_INTEGER)
const EIP155_CHAIN_ID = /^eip155:([1-9][0-9]*)$/

export const chainIdMatcher = z
  .string()
  .refine((id) => {
    const match = EIP155_CHAIN_ID.exec(id)
    return !!match && BigInt(match[1]) <= MAX_SAFE_CHAIN_ID
  }, 'Chain ID must be a canonical, safely supported CAIP-2 eip155 reference')
  .transform((id) => addHexPrefix(BigInt(id.slice('eip155:'.length)).toString(16)))

export const sessionMatcher = z.string()

const caipRequestParams = z.object({
  chainId: chainIdMatcher,
  session: sessionMatcher,
  request: z.object({
    method: z.string(),
    params: z.any().optional()
  })
})

const LegacyCaipRequest = createRequestMatcher('caip_request', caipRequestParams)

export default function (rpcRequest: RPCRequestPayload) {
  const result = LegacyCaipRequest.safeParse(rpcRequest)

  if (result.success) {
    const legacyRequest = result.data

    const { jsonrpc, id, _origin } = rpcRequest
    const { chainId, request } = legacyRequest.params
    const { method, params } = request

    return {
      jsonrpc,
      id,
      method,
      params,
      chainId,
      _origin
    }
  }

  throw generateError(result.error, rpcRequest)
}
