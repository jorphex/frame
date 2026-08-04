import bundleSymbols from '../../../scripts/bundle-symbols.cjs'

const { findUnresolvedParcelImports } = bundleSymbols

test('rejects the unresolved Parcel import that blanks renderer bundles', () => {
  const symbol = '$3d8cd672992bcf76$import$427c002623b9e71c'

  expect(findUnresolvedParcelImports(`const exported = ${symbol};`)).toEqual([symbol])
  expect(findUnresolvedParcelImports(`var ${symbol} = {}; const exported = ${symbol};`)).toEqual([])
})
