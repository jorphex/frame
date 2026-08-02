type RestorePathKey = string | number

type RestoreNormalizePath<Path extends string> = Path extends `${infer Head}[${infer Index}]${infer Tail}`
  ? RestoreNormalizePath<`${Head}.${Index}${Tail}`>
  : Path

type RestoreDefinedProperty<Value, Key extends RestorePathKey> = string extends Key
  ? Value[Extract<keyof Value, string>]
  : number extends Key
    ? Value extends readonly (infer Item)[]
      ? Item
      : [Extract<keyof Value, number>] extends [never]
        ? Value[Extract<keyof Value, string>]
        : Value[Extract<keyof Value, number>]
    : Key extends keyof Value
      ? Value[Key]
      : Key extends `${infer Index extends number}`
        ? Value extends readonly (infer Item)[]
          ? Item
          : Index extends keyof Value
            ? Value[Index]
            : unknown
        : unknown

type RestoreProperty<Value, Key extends RestorePathKey> = unknown extends Value
  ? unknown
  : | RestoreDefinedProperty<Exclude<Value, null | undefined>, Key>
    | (undefined extends Value ? undefined : never)

interface FrameStoreState {
  main: {
    accounts: Record<
      string,
      Omit<Account, 'requests'> & {
        requests: Record<string, import('../../main/accounts/types').AnyAccountRequest>
      }
    >
    accountsMeta: Record<string, { name: string; lastUpdated?: number }>
    balances: Record<string, import('../../main/store/state').Balance[]>
    tokens: {
      custom: import('../../main/store/state').Token[]
      known: Record<string, import('../../main/store/state').Token[]>
    }
    rates: Record<string, { usd: import('../../main/store/state').Rate }>
    inventory: Record<string, Inventory>
    signers: Record<string, import('../../main/signers/Signer').default>
    lattice: Record<
      string,
      {
        deviceName: string
        tag: string
        privKey: string
        paired: boolean
      }
    >
    latticeSettings: {
      accountLimit: number
      derivation: import('../../main/signers/Signer/derive').Derivation
      endpointMode: string
      endpointCustom: string
    }
    ledger: {
      derivation: import('../../main/signers/Signer/derive').Derivation
      liveAccountLimit: number
    }
    trezor: {
      derivation: import('../../main/signers/Signer/derive').Derivation
    }
    frames: Record<string, Frame>
    focusedFrame: string
    dapps: Record<
      string,
      import('../../main/store/state').Dapp & {
        colors?: { background?: string }
      }
    >
  }
  windows: {
    panel: { nav: import('../../main/windows/nav/breadcrumb').Breadcrumb[] }
  }
}

type RestorePathValue<Value, Path extends string> = string extends Path
  ? unknown
  : RestoreNormalizePath<Path> extends `${infer Head}.${infer Tail}`
    ? RestorePathValue<RestoreProperty<Value, Head>, Tail>
    : RestoreProperty<Value, RestoreNormalizePath<Path>>

type RestoreSegmentsValue<Value, Segments extends readonly RestorePathKey[]> = Segments extends readonly []
  ? Value
  : Segments extends readonly [infer Head, ...infer Tail]
    ? Head extends RestorePathKey
      ? Tail extends readonly RestorePathKey[]
        ? RestoreSegmentsValue<
            Head extends string
              ? string extends Head
                ? RestoreProperty<Value, Head>
                : RestorePathValue<Value, Head>
              : RestoreProperty<Value, Head>,
            Tail
          >
        : unknown
      : unknown
    : unknown

interface Observer<Returned = unknown> {
  returned: Returned
  remove: () => void
}

interface RestoreUpdate {
  path: string
  value: unknown
}

interface RestoreAction {
  name: string
  count: number
  deferred?: boolean
  internal?: boolean
  updates: RestoreUpdate[]
}

type RestoreCombinedPathValue<State, Segments extends readonly RestorePathKey[]> = RestoreSegmentsValue<
  State,
  Segments
> &
  RestoreSegmentsValue<FrameStoreState, Segments>

interface CallableStore<State> {
  (): State
  <Path extends string>(path: Path): RestorePathValue<State, Path> & RestorePathValue<FrameStoreState, Path>
  <First extends RestorePathKey, Second extends RestorePathKey>(
    first: First,
    second: Second
  ): RestoreCombinedPathValue<State, [First, Second]>
  <First extends RestorePathKey, Second extends RestorePathKey, Third extends RestorePathKey>(
    first: First,
    second: Second,
    third: Third
  ): RestoreCombinedPathValue<State, [First, Second, Third]>
  <
    First extends RestorePathKey,
    Second extends RestorePathKey,
    Third extends RestorePathKey,
    Fourth extends RestorePathKey
  >(
    first: First,
    second: Second,
    third: Third,
    fourth: Fourth
  ): RestoreCombinedPathValue<State, [First, Second, Third, Fourth]>
  <
    First extends RestorePathKey,
    Second extends RestorePathKey,
    Third extends RestorePathKey,
    Fourth extends RestorePathKey,
    Fifth extends RestorePathKey
  >(
    first: First,
    second: Second,
    third: Third,
    fourth: Fourth,
    fifth: Fifth
  ): RestoreCombinedPathValue<State, [First, Second, Third, Fourth, Fifth]>
  <
    First extends RestorePathKey,
    Second extends RestorePathKey,
    Third extends RestorePathKey,
    Fourth extends RestorePathKey,
    Fifth extends RestorePathKey,
    Sixth extends RestorePathKey
  >(
    first: First,
    second: Second,
    third: Third,
    fourth: Fourth,
    fifth: Fifth,
    sixth: Sixth
  ): RestoreCombinedPathValue<State, [First, Second, Third, Fourth, Fifth, Sixth]>
}

interface StoreApi<State> {
  replaceState: (replacement: unknown) => void
  feed: (handler: (state: State, actionBatch: RestoreAction[], pending: number) => void) => Observer
  remove: (id: string) => void
  report: (id: string) => void
}

interface StoreBase<State> extends CallableStore<State> {
  [actionName: string]: unknown
  observer: <Returned>(cb: () => Returned, id?: string, alternateRun?: () => Returned) => Observer<Returned>
  api: StoreApi<State>
}

type RestoreActionMethods<Actions, State> =
  Actions extends Record<string, unknown>
    ? {
        [Name in keyof Actions]: Actions[Name] extends (update: unknown, ...args: infer Arguments) => unknown
          ? (...args: Arguments) => StoreBase<State>
          : Actions[Name] extends Record<string, unknown>
            ? RestoreActionMethods<Actions[Name], State>
            : never
      }
    : Record<never, never>

type Store<State = unknown, Actions = unknown> = StoreBase<State> & RestoreActionMethods<Actions, State>

declare module 'react-restore' {
  export function create<State, Actions extends Record<string, unknown> = Record<string, never>>(
    state: State,
    actions?: Actions
  ): Store<State, Actions>
}
