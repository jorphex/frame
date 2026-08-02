# Threat Model

## Purpose

Frame is a desktop EVM wallet and account router. It accepts requests from local
HTTP/WebSocket clients and the Frame browser extension, presents approvals, and
routes approved signing operations to software or hardware signers.

This document describes the current implementation. It is not an audit or a
claim that every listed risk has been mitigated.

The current standards and wallet-method surface are documented in
[`SUPPORTED_EIPS.md`](SUPPORTED_EIPS.md) and
[`RPC_COMPATIBILITY.md`](RPC_COMPATIBILITY.md).

## Assets

- Software-signer seed and private-key material.
- Hardware-wallet requests, passphrases, pairing responses, and signatures.
- User approval intent, selected accounts, permissions, and connected origins.
- Transaction, typed-data, and personal-message contents.
- Network configuration, account metadata, and application update integrity.

## Trust Boundaries

### Host And Local Clients

Frame binds HTTP and WebSocket JSON-RPC to `127.0.0.1:1248`. Loopback prevents
direct remote connections but does not authenticate another process running as
the same user. HTTP permits any CORS origin, and native clients can choose their
`Origin` header. Origin labels and permission prompts reduce accidental access;
they are not proof of process identity.

Protected RPC methods require an account permission. Requests from the companion
extension have separate recognition logic. The current model does not fully
isolate permissions by process identity, transport, account, chain, method, or
expiry. Request bodies, HTTP connections, WebSocket clients, and request rates
have explicit ceilings. Header and request-body receive times are bounded; HTTP
subscription polls complete within 15 seconds. These availability controls do
not authenticate callers or make asserted origins trustworthy.

The operating system account is therefore a major trust boundary. Frame is not
expected to protect wallet data from malware, debuggers, or an administrator that
can read the user's files or process memory.

### Persisted State And Software Signers

Application state is stored in Electron's per-user data directory with mode
`0600`. Software signer files are stored below its `signers` directory with mode
`0600`. New seed and private-key material is password-encrypted in a versioned
envelope using scrypt-derived AES-256-GCM with authenticated metadata. Material
is decrypted only in a child process while the signer is unlocked.

Legacy AES-256-CBC signer payloads remain decryptable. After a successful unlock,
the worker validates that the decrypted seed or keys derive the signer's stored
addresses before returning a new authenticated envelope. Frame retains the first
legacy signer JSON as a mode-`0600` `.legacy-v1.bak` recovery copy, then atomically
replaces the active JSON. Recovery copies are ignored by signer scanning and are
removed with the signer.

Current limitations:

- retained legacy recovery ciphertext is not authenticated and remains protected
  by the old signer password;
- encryption is not bound to an OS keychain or hardware-backed secret;
- metadata, addresses, permissions, and network settings are not encrypted;
- decrypted material exists in process memory while unlocked; and
- overwriting a file before deletion is not a secure-erasure guarantee on modern
  filesystems or solid-state storage.

Users should prefer hardware signers and maintain independent backups. Encryption
migrations must remain versioned, address-verified, atomic, tested without real
wallet data, and recoverable without silently weakening encryption.

### Hardware Signers

Private keys are expected to remain on the hardware device. Frame still controls
the request shown to the device and depends on vendor libraries, firmware, USB
drivers, and the user comparing device output with the intended action. Blind or
incomplete device displays remain a risk.

Frame does not protect against compromised device firmware, malicious vendor
software, physical coercion, or a user approving unexpected data. Support claims
require physical-device testing and are listed in
[`HARDWARE_SUPPORT.md`](HARDWARE_SUPPORT.md).

### Renderer And IPC

Frame windows currently enable context isolation and renderer sandboxing, disable
Node integration and webviews, and deny navigation and popup creation. Production
renderers use Content Security Policy. A preload bridge and main-process IPC still
form a privileged boundary: exposed methods and payloads must be treated as
untrusted, validated, and limited to the sender that needs them.

Some renderer policies allow broad network or image sources. Embedded dapp views
load separately partitioned content and depend on session checks and request
filtering. A renderer compromise must not be assumed harmless.

### Networks And Third Parties

RPC endpoints, explorers, IPFS gateways, ABI sources, token metadata, pricing
services, update hosting, and signer-vendor services may be unavailable,
incorrect, or malicious. Transaction execution checks, reported token effects,
allowance reads, and EIP-7702 account-delegation checks come from the configured
RPC and are not independently verified. Decoding is explanatory and does not
prove contract behavior. Users must verify chain, recipient, value, calldata,
and signing details on the hardware device whenever possible.

Frame recognizes the exact EIP-7702 delegation indicator returned by
`eth_getCode`, requires an additional approval for ordinary transactions from a
reported delegated account, and blocks sequential wallet-call batches from one.
Externally supplied type-4 transactions and authorization lists are rejected;
Frame does not create or sign EIP-7702 authorizations. Delegation state can
change after review, and a faulty or malicious RPC can omit or falsify it.

Externally supplied transaction envelopes are restricted to fields and types
Frame explicitly supports. Access lists have bounded entry and storage-key
counts, require exact address/key widths, retain order and duplicates, and are
shown in full during review. Signer adapters must preserve those exact bytes;
unsupported hardware transaction types fail instead of being silently converted.

This fork does not initialize or ship a hosted crash-telemetry client. Uncaught
main-process errors are written to the local Electron log and may display a local
dialog, but Frame does not transmit crash events, instance identifiers, network
configuration, or token metadata to the upstream project's Sentry service.

### Builds And Updates

Dependencies are locked and install scripts are allowlisted. CI actions are
pinned, Linux packages include checksums and an SBOM, and the manual workflow
creates a draft release for review. Linux artifacts are not currently signed,
and byte-for-byte reproducible builds have not been established. macOS and
Windows signing are not configured for this fork.

The updater derives its release repository from package metadata and requires a
user action before download/install. Release credentials, GitHub administration,
CI runners, npm packages, and maintainer workstations remain supply-chain trust
boundaries. See [`RELEASE.md`](RELEASE.md).

## Primary Abuse Cases

- A local process impersonates a trusted origin and requests account access or a
  signature.
- A dapp disguises an approval, typed-data signature, or transaction intent.
- Malformed or oversized RPC/IPC input exhausts resources or reaches an unsafe
  code path.
- A compromised renderer invokes an overpowered preload or IPC method.
- An attacker copies or modifies encrypted software-signer files.
- A dependency, release workflow, updater feed, or binary is compromised.
- Hardware and application displays disagree and the user approves the device.
- Persisted-state migration corrupts permissions, accounts, or signer metadata.

## Security Invariants For New Work

- Never log or persist plaintext seeds, private keys, passwords, or passphrases.
- Never sign or broadcast without an explicit, origin-bound approval unless a
  separately reviewed policy explicitly permits it.
- Normalize and validate every external request before permission checks and UI.
- Preserve chain binding, transaction type, and access list, and display the
  actual payload sent to the signer.
- Keep renderer privileges minimal and validate IPC payloads and senders.
- Fail closed when origin, chain, signer capability, simulation, or decoding is
  ambiguous.
- Preserve user data through tested, versioned migrations with rollback guidance.
- Keep pull-request CI unable to publish or access release credentials.
- Do not claim hardware or platform support based only on mocks or compilation.

## Out Of Scope

- Recovery from a compromised operating system, maintainer account, or hardware
  wallet firmware.
- Loss caused by exposing a seed phrase, private key, password, or passphrase.
- Smart-contract correctness or economic safety of a transaction the user
  knowingly approves.
- Availability or correctness of user-selected RPC and third-party services.
- Physical attacks and coercion.

These exclusions do not make related reports unhelpful. Boundary bypasses that
let an attacker act without the documented access or approval are in scope.
