import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { getVersionFromTypedData, parseTypedMessage } from '../../../main/provider/typedData'

const typedData = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' }
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' }
    ]
  },
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
  },
  primaryType: 'Mail',
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
    },
    contents: 'Hello!'
  }
}

const legacyTypedData = [
  { type: 'string', name: 'fullName', value: 'Satoshi Nakamoto' },
  { type: 'uint32', name: 'userId', value: '1212' }
]

const withField = (field, value) => ({
  ...typedData,
  types: {
    ...typedData.types,
    Mail: [...typedData.types.Mail, field]
  },
  message: {
    ...typedData.message,
    [field.name]: value
  }
})

const recursiveTypedData = {
  ...typedData,
  types: {
    EIP712Domain: typedData.types.EIP712Domain,
    Person: [
      { name: 'name', type: 'string' },
      { name: 'mother', type: 'Person' }
    ]
  },
  primaryType: 'Person',
  message: {
    name: 'Satoshi Nakamoto',
    mother: { name: 'unknown' }
  }
}

function expectInvalid(parse, message) {
  try {
    parse()
    throw new Error('Expected typed data parsing to fail')
  } catch (error) {
    expect(error).toMatchObject({ code: -32602, message: expect.stringMatching(message) })
  }
}

describe('#getVersionFromTypedData', () => {
  it('infers V1 for legacy arrays', () => {
    expect(getVersionFromTypedData(legacyTypedData)).toBe(SignTypedDataVersion.V1)
  })

  it('defaults ordinary EIP-712 data to V4', () => {
    expect(getVersionFromTypedData(typedData)).toBe(SignTypedDataVersion.V4)
  })

  it.each([
    ['dynamic arrays', withField({ name: 'values', type: 'uint256[]' }, [1, 2])],
    ['fixed arrays', withField({ name: 'values', type: 'uint256[2]' }, [1, 2])],
    ['recursive types', recursiveTypedData],
    ['recursive types with missing values', { ...recursiveTypedData, message: {} }]
  ])('infers V4 for %s', (_, value) => {
    expect(getVersionFromTypedData(value)).toBe(SignTypedDataVersion.V4)
  })

  it('infers V3 when a primary message field is undefined', () => {
    expect(
      getVersionFromTypedData({ ...typedData, message: { ...typedData.message, contents: undefined } })
    ).toBe(SignTypedDataVersion.V3)
  })

  it.each([null, 1, 'data', {}, { types: null }])(
    'does not throw while examining malformed data',
    (value) => {
      expect(() => getVersionFromTypedData(value)).not.toThrow()
    }
  )
})

describe('#parseTypedMessage', () => {
  it.each([
    [legacyTypedData, SignTypedDataVersion.V1],
    [typedData, SignTypedDataVersion.V3],
    [typedData, SignTypedDataVersion.V4]
  ])('accepts valid %s data', (data, version) => {
    expect(parseTypedMessage(data, version)).toEqual({ data, version })
  })

  it('infers and validates a version when none is requested', () => {
    expect(parseTypedMessage(typedData)).toEqual({ data: typedData, version: SignTypedDataVersion.V4 })
  })

  it.each([
    ['null', null],
    ['a primitive', 1],
    ['an empty object', {}],
    ['missing types', { ...typedData, types: undefined }],
    ['missing domain', { ...typedData, domain: undefined }],
    ['missing message', { ...typedData, message: undefined }],
    ['missing EIP712Domain', { ...typedData, types: { Mail: typedData.types.Mail } }],
    ['an unknown primary type', { ...typedData, primaryType: 'Unknown' }],
    [
      'duplicate field names',
      {
        ...typedData,
        types: { ...typedData.types, Mail: [...typedData.types.Mail, typedData.types.Mail[0]] }
      }
    ],
    [
      'an invalid field declaration',
      { ...typedData, types: { ...typedData.types, Mail: [{ name: 'value', type: '' }] } }
    ],
    ['an invalid struct identifier', { ...typedData, types: { ...typedData.types, 'Bad Type': [] } }],
    [
      'an invalid field identifier',
      { ...typedData, types: { ...typedData.types, Mail: [{ name: 'bad field', type: 'uint256' }] } }
    ],
    [
      'an integer alias',
      { ...typedData, types: { ...typedData.types, Mail: [{ name: 'value', type: 'uint' }] } }
    ],
    [
      'an invalid integer width',
      { ...typedData, types: { ...typedData.types, Mail: [{ name: 'value', type: 'uint7' }] } }
    ],
    [
      'an invalid fixed array length',
      { ...typedData, types: { ...typedData.types, Mail: [{ name: 'value', type: 'uint256[0]' }] } }
    ],
    [
      'an undeclared struct reference',
      { ...typedData, types: { ...typedData.types, Mail: [{ name: 'value', type: 'Missing' }] } }
    ]
  ])('rejects %s', (_, value) => {
    expectInvalid(() => parseTypedMessage(value, SignTypedDataVersion.V4), /Invalid params:/)
  })

  it.each([
    ['V1 with EIP-712 data', typedData, SignTypedDataVersion.V1],
    ['V3 with legacy data', legacyTypedData, SignTypedDataVersion.V3],
    ['V4 with legacy data', legacyTypedData, SignTypedDataVersion.V4]
  ])('rejects %s', (_, value, version) => {
    expectInvalid(() => parseTypedMessage(value, version), /Invalid params:/)
  })

  it.each([
    ['dynamic arrays', withField({ name: 'values', type: 'uint256[]' }, [1, 2])],
    ['fixed arrays', withField({ name: 'values', type: 'uint256[2]' }, [1, 2])],
    ['recursive types', recursiveTypedData]
  ])('rejects V3 %s', (_, value) => {
    expectInvalid(() => parseTypedMessage(value, SignTypedDataVersion.V3), /V3 typed data does not support/)
  })

  it.each([
    withField({ name: 'values', type: 'uint256[]' }, [1, 2]),
    withField({ name: 'values', type: 'uint256[2]' }, [1, 2]),
    recursiveTypedData
  ])('accepts V4-only data', (value) => {
    expect(parseTypedMessage(value, SignTypedDataVersion.V4)).toEqual({
      data: value,
      version: SignTypedDataVersion.V4
    })
  })

  it.each([
    ['an empty V1 array', []],
    ['a V1 field without a value', [{ name: 'value', type: 'uint256' }]],
    ['a V1 field with an invalid Solidity type', [{ name: 'value', type: 'uint7', value: 1 }]]
  ])('rejects %s', (_, value) => {
    expectInvalid(() => parseTypedMessage(value, SignTypedDataVersion.V1), /Invalid params:/)
  })

  it('rejects EIP-712 data that cannot be encoded', () => {
    const invalidValue = withField({ name: 'count', type: 'uint256' }, undefined)
    expectInvalid(() => parseTypedMessage(invalidValue, SignTypedDataVersion.V4), /Invalid params:/)
  })
})
