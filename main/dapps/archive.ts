import tar from 'tar-fs'

// Kubo wraps exported content in a CID-named directory. Extract beneath the
// private staging root so archive paths cannot affect another cached dapp.
export function createDappArchiveExtractor(stagingPath: string) {
  return tar.extract(stagingPath, { strip: 1 })
}
