import fs from 'fs'
import path from 'path'
import { parse } from '@babel/parser'

import { rendererActionNames, rendererIpcChannels } from '../../../main/ipc/schemas'
import { requestEventChannels, requestInvokeChannels } from '../../../resources/bridge/protocol'

type Node = { type?: string; [key: string]: unknown }

const root = path.resolve(__dirname, '../../..')
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx'])

const sourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(file)
    return extensions.has(path.extname(entry.name)) ? [file] : []
  })

const staticString = (node: Node | null | undefined) => {
  if (node?.type === 'StringLiteral') return node.value as string
  if (node?.type === 'TemplateLiteral' && (node.expressions as unknown[]).length === 0) {
    return (node.quasis as Array<{ value: { cooked: string } }>)[0]?.value.cooked
  }
}

const callsIn = (directories: string[]) => {
  const calls: Array<{ args: Node[]; callee: Node; file: string; line: number }> = []
  directories.flatMap(sourceFiles).forEach((file) => {
    const extension = path.extname(file)
    const plugins =
      extension === '.ts' ? ['typescript'] : ['jsx', ...(extension === '.tsx' ? ['typescript'] : [])]
    const ast = parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: plugins as Parameters<typeof parse>[1]['plugins']
    })

    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) return value.forEach(visit)
      const node = value as Node
      if (node.type === 'CallExpression') {
        calls.push({
          args: node.arguments as Node[],
          callee: node.callee as Node,
          file: path.relative(root, file),
          line: (node.loc as { start: { line: number } }).start.line
        })
      }
      Object.entries(node).forEach(([key, child]) => {
        if (!['loc', 'start', 'end'].includes(key)) visit(child)
      })
    }
    visit(ast)
  })
  return calls
}

const memberCall = (call: { callee: Node }, object: string, property: string) => {
  const callee = call.callee
  const target = callee.object as Node
  const method = callee.property as Node
  return (
    callee.type === 'MemberExpression' &&
    target?.type === 'Identifier' &&
    target.name === object &&
    method?.type === 'Identifier' &&
    method.name === property
  )
}

test('main renderer handlers and schemas have an exact inventory match', () => {
  const calls = callsIn([path.join(root, 'main')])
  const events = calls
    .filter((call) => ['onRenderer', 'onceRenderer'].includes((call.callee.name as string) || ''))
    .map((call) => staticString(call.args[0]))
    .filter((channel): channel is string => Boolean(channel))
  const invokes = calls
    .filter((call) => call.callee.type === 'Identifier' && call.callee.name === 'handleRenderer')
    .map((call) => staticString(call.args[0]))
    .filter((channel): channel is string => Boolean(channel))

  expect([...new Set(events)].sort()).toEqual([...rendererIpcChannels.event].sort())
  expect([...new Set(invokes)].sort()).toEqual([...rendererIpcChannels.invoke].sort())
  expect([...requestEventChannels].sort()).toEqual([...rendererIpcChannels.event].sort())
  expect([...requestInvokeChannels].sort()).toEqual([...rendererIpcChannels.invoke].sort())
})

test('every static renderer event, invoke, and store action has a schema', () => {
  const calls = callsIn([path.join(root, 'app'), path.join(root, 'resources')])
  const linkCalls = calls.filter(
    (call) => memberCall(call, 'link', 'send') || memberCall(call, 'link', 'invoke')
  )
  const dynamicCalls = linkCalls.filter((call) => !staticString(call.args[0]))
  const allowedDynamicCalls = new Set(['app/dash/Chains/Chain/ChainNew/index.js:SpreadElement'])

  expect(dynamicCalls.map(({ args, file }) => `${file}:${args[0]?.type}`)).toEqual([...allowedDynamicCalls])

  const staticCalls = linkCalls.filter((call) => staticString(call.args[0]))
  const eventChannels = staticCalls
    .filter((call) => memberCall(call, 'link', 'send'))
    .map((call) => staticString(call.args[0]) as string)
  const invokeChannels = staticCalls
    .filter((call) => memberCall(call, 'link', 'invoke'))
    .map((call) => staticString(call.args[0]) as string)
  const actions = staticCalls
    .filter((call) => memberCall(call, 'link', 'send') && staticString(call.args[0]) === 'tray:action')
    .map((call) => staticString(call.args[1]))
    .filter((action): action is string => Boolean(action))
  const dynamicActions = staticCalls
    .filter(
      (call) =>
        memberCall(call, 'link', 'send') &&
        staticString(call.args[0]) === 'tray:action' &&
        !staticString(call.args[1])
    )
    .map(({ args, file }) => `${file}:${args[1]?.type}`)

  expect([...new Set(eventChannels)].sort()).toEqual([...rendererIpcChannels.event].sort())
  expect([...new Set([...invokeChannels, 'tray:addChain'])].sort()).toEqual(
    [...rendererIpcChannels.invoke].sort()
  )
  expect([...new Set([...actions, 'setPrimaryCustom', 'setSecondaryCustom'])].sort()).toEqual(
    [...rendererActionNames].sort()
  )
  expect(dynamicActions).toEqual(['app/dash/Chains/Chain/Connection/index.js:Identifier'])
})
