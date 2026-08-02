import svg from '../../../../resources/svg'
import { render } from '../../../componentSetup'

const octiconNames = [
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-up',
  'circle-slash',
  'kebab-horizontal',
  'primitive-dot',
  'pulse',
  'server',
  'settings',
  'shield',
  'sync'
]

it.each(octiconNames)('renders the %s Octicon', (name) => {
  render(svg.octicon(name, { height: 17 }))

  expect(document.querySelector('svg').getAttribute('height')).toBe('17')
})

it('rejects unknown Octicon names', () => {
  expect(() => svg.octicon('unknown', { height: 17 })).toThrow('Unknown Octicon: unknown')
})
