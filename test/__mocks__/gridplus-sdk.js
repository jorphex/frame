const Client = jest.fn()

module.exports = {
  Client,
  Constants: {
    SIGNING: {
      HASHES: { KECCAK256: 1 },
      CURVES: { SECP256K1: 0 },
      ENCODINGS: { EVM: 4 }
    }
  },
  Utils: {
    fetchCalldataDecoder: jest.fn()
  }
}
