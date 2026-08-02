import {
  MAX_ERC1046_METADATA_BYTES,
  reconcileErc1046TokenData,
  resolveErc1046Metadata
} from '../../../main/provider/erc1046'

const metadata = {
  interop: { erc1046: true as const },
  name: 'Example Token',
  symbol: 'EXAMPLE',
  decimals: 6,
  description: 'A token used for tests.',
  image: 'https://images.example/token.png'
}

const dataUri = (value: unknown) => `data:application/json,${encodeURIComponent(JSON.stringify(value))}`

it('parses bounded percent-encoded ERC-1046 JSON without fetching image fields', async () => {
  await expect(resolveErc1046Metadata(dataUri(metadata))).resolves.toEqual(metadata)
})

it('parses bounded base64 ERC-1046 JSON', async () => {
  const encoded = Buffer.from(JSON.stringify(metadata)).toString('base64')

  await expect(resolveErc1046Metadata(`data:application/json;base64,${encoded}`)).resolves.toEqual(metadata)
})

it('loads a canonical IPFS path through the injected bounded reader', async () => {
  const getJson = jest.fn().mockResolvedValue(metadata)
  const cid = 'bafybeiag6x7b2xh3c23fochm565boiuygmomi3vqjxjad4wax5oldwh6bi'

  await expect(resolveErc1046Metadata(`ipfs://${cid}/metadata.json`, { getJson })).resolves.toEqual(metadata)
  expect(getJson).toHaveBeenCalledWith(`${cid}/metadata.json`)
})

it.each([
  ['an arbitrary HTTPS target', 'https://127.0.0.1:8080/metadata.json'],
  ['an IPFS URI with credentials', 'ipfs://user@bafybeigdyrzt/metadata.json'],
  ['an IPFS URI with traversal', 'ipfs://bafybeiag6x7b2xh3c23fochm565boiuygmomi3vqjxjad4wax5oldwh6bi/../x'],
  ['an IPFS URI with a query', 'ipfs://bafybeiag6x7b2xh3c23fochm565boiuygmomi3vqjxjad4wax5oldwh6bi/x?y=1'],
  ['a malformed percent escape', 'data:application/json,%zz'],
  ['a malformed base64 body', 'data:application/json;base64,***'],
  ['invalid UTF-8 JSON', `data:application/json;base64,${Buffer.from([0xff]).toString('base64')}`]
])('rejects %s', async (_name, uri) => {
  await expect(resolveErc1046Metadata(uri)).rejects.toThrow()
})

it('rejects metadata beyond the byte limit before parsing', async () => {
  const oversized = dataUri({ ...metadata, padding: 'x'.repeat(MAX_ERC1046_METADATA_BYTES) })

  await expect(resolveErc1046Metadata(oversized)).rejects.toThrow(/exceeds/)
})

it.each([
  ['missing interoperability data', { ...metadata, interop: {} }],
  ['the wrong interoperability type', { ...metadata, interop: { erc1046: false } }],
  ['invalid decimals', { ...metadata, decimals: 256 }],
  ['multiline descriptions', { ...metadata, description: 'first\nsecond' }]
])('rejects metadata with %s', async (_name, value) => {
  await expect(resolveErc1046Metadata(dataUri(value))).rejects.toThrow(/Invalid ERC-1046 metadata/)
})

it('reconciles matching URI and contract metadata', () => {
  expect(
    reconcileErc1046TokenData(metadata, {
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      totalSupply: '1000'
    })
  ).toEqual({ name: 'Example Token', symbol: 'EXAMPLE', decimals: 6, totalSupply: '1000' })
})

it('uses URI identity and the ERC-1046 decimals default when optional contract calls are unavailable', () => {
  const { decimals, ...withoutDecimals } = metadata

  expect(reconcileErc1046TokenData(withoutDecimals, { name: '', symbol: '', totalSupply: '1000' })).toEqual({
    name: 'Example Token',
    symbol: 'EXAMPLE',
    decimals: 18,
    totalSupply: '1000'
  })
})

it.each([
  ['name', { ...metadata, name: 'Spoofed' }, { ...metadata, totalSupply: '1' }],
  ['symbol', { ...metadata, symbol: 'FAKE' }, { ...metadata, totalSupply: '1' }],
  ['decimals', { ...metadata, decimals: 18 }, { ...metadata, totalSupply: '1' }],
  ['total supply', metadata, { ...metadata, totalSupply: undefined }]
])('rejects contradictory or incomplete %s metadata', (_name, uriMetadata, contractMetadata) => {
  expect(() => reconcileErc1046TokenData(uriMetadata, contractMetadata)).toThrow()
})
