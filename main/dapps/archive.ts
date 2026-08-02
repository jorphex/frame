import tar from 'tar-fs'
import { Readable } from 'stream'
import { finished } from 'stream/promises'

type DappArchiveExtractOptions = NonNullable<Parameters<typeof tar.extract>[1]> & {
  chown: false
}

// Kubo wraps exported content in a CID-named directory. Extract beneath the
// private staging root so archive paths cannot affect another cached dapp.
function createDappArchiveExtractor(stagingPath: string) {
  const options: DappArchiveExtractOptions = {
    strip: 1,
    chown: false,
    ignore: (_name, header) => !header || (header.type !== 'file' && header.type !== 'directory')
  }

  return tar.extract(stagingPath, options)
}

export async function extractDappArchive(archive: AsyncIterable<Uint8Array>, stagingPath: string) {
  const source = Readable.from(archive)
  const extractor = createDappArchiveExtractor(stagingPath)

  source.on('error', (error) => extractor.destroy(error))
  source.pipe(extractor)

  try {
    await finished(extractor, { cleanup: true, readable: false })
  } finally {
    source.destroy()
    extractor.destroy()
  }
}
