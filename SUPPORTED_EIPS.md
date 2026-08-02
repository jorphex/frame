# Supported Ethereum Standards

This document describes behavior implemented by the current Frame desktop
repository. It is not a security audit, certification, or claim about the
separate browser extension.

## Status Definitions

- **Implemented**: Frame owns the relevant path and has automated regression
  coverage for the behavior described here.
- **Partial**: useful behavior exists, but a material part of the standard or
  its capability surface is intentionally absent.
- **Review-only**: Frame recognizes and explains the format but does not provide
  the protocol or execution system around it.
- **Awareness-only**: Frame detects existing state but cannot create or change it.
- **External**: support would live in another repository or component and was
  not evaluated here.
- **Unsupported**: Frame has no maintained implementation and must not advertise
  the capability.

## Provider And Wallet Interfaces

| Standard                                            | Status      | Current behavior and limits                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) | Implemented | The provider wrapper exposes `request`, `ProviderRpcError`, connection/account/chain events, and legacy compatibility methods. Local HTTP/WebSocket transport, embedded-dapp injection, and the separately distributed companion extension have additional boundaries documented in [RPC compatibility](RPC_COMPATIBILITY.md). |
| [EIP-1102](https://eips.ethereum.org/EIPS/eip-1102) | Implemented | Account exposure is permission-gated and `eth_requestAccounts` uses the selected Frame account.                                                                                                                                                                                                                                |
| [EIP-2255](https://eips.ethereum.org/EIPS/eip-2255) | Partial     | `wallet_getPermissions` and `wallet_requestPermissions` support only the `eth_accounts` parent capability with no caveats. Permissions are origin- and selected-account-specific, but do not yet support method, chain, expiry, or native-process identity constraints.                                                        |
| [EIP-3085](https://eips.ethereum.org/EIPS/eip-3085) | Implemented | `wallet_addEthereumChain` validates bounded canonical chain IDs and metadata, accepts credential-free HTTPS RPC/explorer/icon URLs, verifies a supplied RPC reports the requested chain, and requires user confirmation.                                                                                                       |
| [EIP-3326](https://eips.ethereum.org/EIPS/eip-3326) | Implemented | `wallet_switchEthereumChain` validates the destination, requires origin-specific confirmation, cancels stale requests, and switches only the requesting origin.                                                                                                                                                                |
| [EIP-747](https://eips.ethereum.org/EIPS/eip-747)   | Partial     | `wallet_watchAsset` accepts checksummed ERC-20 contracts only. Frame acknowledges a valid request before its bounded metadata lookup and later user review, so the boolean result does not report the eventual add/reject decision. NFT asset suggestions are unsupported.                                                     |
| [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) | External    | Browser-wide multi-provider discovery belongs to the separate Frame browser-extension repository and was not evaluated here. This repository's embedded-dapp injector exposes only the legacy `window.ethereum` convention and does not implement EIP-6963 announce/request events.                                            |

## Signing And Account Intent

| Standard                                            | Status      | Current behavior and limits                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712)   | Implemented | Frame validates and reviews V3/V4 structured data, including complete nested fields and domain-chain risks. Legacy `eth_signTypedData` V1 arrays are supported as a separately identified compatibility format, not as EIP-712. Hardware capability differs by signer. |
| [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612) | Review-only | EIP-712 permit messages are detected, decoded, and checked for owner, spender, amount, expiry, nonce, and unlimited authority. Frame does not implement token permit contracts.                                                                                        |
| [ERC-4361](https://eips.ethereum.org/EIPS/eip-4361) | Review-only | `personal_sign` messages matching Sign-In with Ethereum are parsed and reviewed with origin, account, chain, time, and malformed-message warnings. Frame does not authenticate a relying-party session or verify server-issued nonces.                                 |
| [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) | Unsupported | Contract-account signature validation and Safe signing flows are not implemented.                                                                                                                                                                                      |
| [ERC-6492](https://eips.ethereum.org/EIPS/eip-6492) | Unsupported | Counterfactual smart-account signature validation is not implemented.                                                                                                                                                                                                  |

Raw `eth_sign` remains available for compatibility but is treated as dangerous
and requires explicit risk consent. See [RPC compatibility](RPC_COMPATIBILITY.md)
for the exact method surface.

## Transactions And Execution

| Standard                                            | Status         | Current behavior and limits                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [EIP-155](https://eips.ethereum.org/EIPS/eip-155)   | Implemented    | Legacy transactions are chain-bound before signing.                                                                                                                                                                                                                                                                           |
| [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) | Partial        | Frame handles legacy, type-1, and type-2 envelopes and rejects explicit unsupported or unknown envelope types instead of rewriting them.                                                                                                                                                                                      |
| [EIP-2930](https://eips.ethereum.org/EIPS/eip-2930) | Implemented    | Ordered access lists are strictly validated, bounded, simulated, shown in full, and preserved through supported signer paths. Trezor type-1 signing is rejected because the installed Connect API has no matching request; Trezor type 2 supports access lists.                                                               |
| [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) | Implemented    | Type-2 signing, exact quantity handling, fee-history estimation, editing, replacement fee handling, and fee safety checks are implemented. Older hardware may use the existing legacy fallback only when no access list was supplied. Live speed-up/cancellation behavior still requires broader client and L2 qualification. |
| [EIP-4844](https://eips.ethereum.org/EIPS/eip-4844) | Unsupported    | Type-3 transactions and blob-specific fields are rejected before approval.                                                                                                                                                                                                                                                    |
| [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792) | Partial        | Version `2.0.0` non-atomic `wallet_sendCalls`, status lookup/viewing, and conservative capability reporting are implemented. Batches are simulated and executed sequentially with crash-safe status; atomic execution and optional capabilities are not advertised.                                                           |
| [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) | Awareness-only | Frame detects the exact delegation designator through the configured RPC, warns for ordinary transactions, and blocks sequential wallet-call batches from delegated accounts. Type-4 transactions and authorization lists are rejected; Frame cannot create, replace, or revoke delegation.                                   |
| [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) | Unsupported    | User operations, bundlers, entry points, paymasters, and smart-account lifecycle are not implemented.                                                                                                                                                                                                                         |

## Evidence Boundary

Configured RPC execution checks use `eth_simulateV1` when available and a
bounded `eth_call` fallback otherwise. Standard token/NFT event logs are shown as
RPC-reported effects, not complete or verified balance changes. Hardware support
claims and physical-test status are maintained separately in
[HARDWARE_SUPPORT.md](HARDWARE_SUPPORT.md).

## Chain-Agnostic Compatibility

| Standard                                                               | Status      | Current behavior and limits                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CAIP-2](https://standards.chainagnostic.org/CAIPs/caip-2)             | Partial     | Historical Frame request envelopes accept only canonical, positive, safely representable `eip155` references and map them to Frame's chain routing. Other namespaces are unsupported.                                                                           |
| [CAIP-27](https://standards.chainagnostic.org/CAIPs/caip-27)           | Unsupported | The current draft specifies `wallet_invokeMethod` with session/scope authorization. Frame implements older `caip_request` and `wallet_request` compatibility envelopes instead; they are permission-gated but must not be described as current CAIP-27 support. |
| [EIP-155 namespace](https://namespaces.chainagnostic.org/eip155/caip2) | Partial     | Decimal EIP-155 references are bounded to JavaScript's safely supported chain-ID range before conversion to Frame's canonical hexadecimal routing value.                                                                                                        |
