import signatureTypes from './types'
import { SignTypedDataVersion, MessageTypeProperty } from '@metamask/eth-sig-util'

import type { TypedMessage, TypedSignatureRequestType } from '../accounts/types'

const matchesMsgType = (properties: MessageTypeProperty[], required: MessageTypeProperty[]) =>
  properties.length === required.length &&
  required.every(({ name, type }) =>
    Boolean(properties.find((item) => item.name === name && item.type === type))
  )

const matchesMessage = (message: Record<string, unknown>, required: MessageTypeProperty[]) =>
  required.every(({ name }) => message[name] !== undefined)

const matchesDomainFilter = (domain: object, domainFilter: string[]) =>
  domainFilter.every((property) => property in domain)

export const identify = ({ data }: TypedMessage<SignTypedDataVersion>): TypedSignatureRequestType => {
  const identified = Object.entries(signatureTypes).find(([, { domainFilter, types: requiredTypes }]) => {
    if (!('types' in data && 'message' in data)) return

    return Object.entries(requiredTypes).every(
      ([name, properties]) =>
        data.types[name] &&
        matchesMsgType(data.types[name], properties) &&
        matchesMessage(data.message, properties) &&
        matchesDomainFilter(data.domain, domainFilter)
    )
  })

  return identified ? (identified[0] as TypedSignatureRequestType) : 'signTypedData'
}

export { isSignatureRequest } from '../../resources/domain/request'
