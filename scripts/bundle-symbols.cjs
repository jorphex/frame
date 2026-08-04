'use strict'

const PARCEL_IMPORT = /\$[A-Za-z0-9]+\$import\$[A-Za-z0-9]+/g

function findUnresolvedParcelImports(source) {
  const symbols = new Set(source.match(PARCEL_IMPORT) || [])

  return [...symbols].filter((symbol) => {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp(`(?:const|let|var|function)\\s+${escaped}\\b`).test(source)
  })
}

module.exports = { findUnresolvedParcelImports }
