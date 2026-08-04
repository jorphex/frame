<p align="center">
  <img src="asset/png/FrameLogo512.png" alt="Frame" width="150" />
</p>

<h1 align="center">Frame</h1>

<p align="center">
  A system-wide EVM wallet and signing firewall for browsers, native applications, and command-line tools.
</p>

<p align="center">
  <a href="https://github.com/jorphex/frame/releases">Desktop releases</a> ·
  <a href="https://github.com/jorphex/frame-extension/releases">Browser companion</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="SUPPORTED_EIPS.md">Standards</a> ·
  <a href="RPC_COMPATIBILITY.md">RPC compatibility</a>
</p>

> [!WARNING]
> This is a community-maintained wallet preview with no independent security audit. The current release target is Linux x64. Back up your Frame profile, verify release checksums, and test with accounts that do not hold valuable assets before relying on a release. Use at your own risk.

Frame runs as a desktop wallet and exposes one consistent approval and signing interface to the rest of the system. Dapps can connect through the paired browser companion or directly through Frame's local EIP-1193/JSON-RPC provider. Accounts and chains are routed independently, so applications do not have to share one global network selection.

## Current Release

Frame `0.7.0` is published as a Linux x64 AppImage and deb pre-release in the
[desktop releases](https://github.com/jorphex/frame/releases). Browser dapps
require the separately packaged Frame Companion `0.13.0` pre-release from the
[companion releases](https://github.com/jorphex/frame-extension/releases).

| Component or platform                  | Current status                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Linux x64 AppImage and deb             | Current qualified release target                                              |
| Trezor Safe 7 over USB                 | Physically tested for address verification, signing, broadcast, and reconnect |
| Trezor Model One over USB              | Physically tested with documented typed-data and testnet limitations          |
| Ledger and GridPlus Lattice1           | Implemented with automated coverage; not physically requalified for `0.7.0`   |
| Seed phrase, private key, and keystore | Implemented with encrypted local signer workers                               |
| Watch-only addresses                   | Supported for monitoring; signing is blocked                                  |
| Chrome and Firefox companion           | Packaged and tested against the `0.7.0` desktop protocol                      |
| macOS, Windows, and Linux arm64        | Not produced or qualified by this fork                                        |
| Trezor Safe 7 Bluetooth                | Unsupported                                                                   |

See [Signer and Platform Support](HARDWARE_SUPPORT.md) for the evidence behind
each claim and all known limitations. Trezor Suite is not required for the
qualified Safe 7 USB flow.

## Features

- **System-wide provider:** HTTP and WebSocket JSON-RPC endpoints let browsers,
  native programs, and command-line tools use the same wallet.
- **Hardware-first signing:** Trezor, Ledger, and GridPlus signer adapters keep
  signing behind explicit device and capability checks.
- **Software and watch accounts:** Seed, private-key, keystore, and watch-only
  accounts coexist behind clear signing boundaries.
- **Origin permissions:** Account access and wallet-owned RPC methods are
  permission-gated for each requesting origin and selected account.
- **Transaction review:** Calldata decoding, approval-risk detection,
  configured-RPC simulation, native balance effects, logs, and bounded traces
  provide evidence before approval. Simulation is evidence, not a guarantee.
- **Clearer signatures:** Structured EIP-712 review, permit and Permit2
  detection, SIWE interpretation, hardware capability warnings, and explicit
  consent for dangerous `eth_sign` requests.
- **Multichain routing:** Each application can target an enabled chain without
  forcing every connected application onto one global network.
- **Curated Yearn Earn (development):** The current `main` branch adds locally
  allowlisted Ethereum, Base, and Katana Yearn products with positions, direct
  and product-specific workflows, exact approvals, configured-RPC simulation,
  and ordinary Frame signer review. This feature is not part of the `0.7.0`
  release and has not completed live-funds qualification.
- **Modern wallet methods:** Hardened EIP-1193 behavior, chain add/switch flows,
  paired-companion EIP-6963 discovery, and non-atomic EIP-5792 wallet calls.
- **User-controlled infrastructure:** Custom Ethereum RPC and Kubo IPFS
  endpoints remain supported.
- **Release evidence:** Locked dependencies, automated tests, CodeQL, package
  verification, SHA-256 manifests, CycloneDX SBOMs, and GitHub build provenance
  accompany the release process.

Exact support boundaries are maintained in [Supported Ethereum
Standards](SUPPORTED_EIPS.md) and [RPC Compatibility](RPC_COMPATIBILITY.md).

## Install

Download `Frame-0.7.0.AppImage` or `frame_0.7.0_amd64.deb` together with
`SHA256SUMS` from the [`0.7.0` release](https://github.com/jorphex/frame/releases/tag/v0.7.0).
Verify the files from the download directory before running either package:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

Run the AppImage without installing it:

```bash
chmod +x Frame-0.7.0.AppImage
./Frame-0.7.0.AppImage
```

Or install the deb package:

```bash
sudo apt install ./frame_0.7.0_amd64.deb
```

The Linux packages are currently unsigned. Verify their checksums and GitHub
artifact attestations against the published release before installation.

### Browser Companion

The browser companion injects Frame's EIP-1193 provider and announces it using
EIP-6963. Download the Chrome or Firefox archive from the
[`0.13.0` companion release](https://github.com/jorphex/frame-extension/releases/tag/v0.13.0),
verify its checksum, extract it, and follow the
[companion installation instructions](https://github.com/jorphex/frame-extension#install).

The first connection displays a six-digit code in Frame and the extension.
Compare both codes before approving the pairing. Older store extensions do not
implement the authenticated protocol used by this desktop release.

## Run From Source

The repository pins Node and npm versions. On Ubuntu or Debian, install the
native build prerequisites first:

```bash
sudo apt-get update
sudo apt-get install build-essential libudev-dev
```

Then install the pinned toolchain and dependencies:

```bash
git clone https://github.com/jorphex/frame.git
cd frame
nvm install
nvm use
npm install --global npm@11.12.0
npm run setup:ci
npm run prod
```

`npm run setup:ci` uses the committed lockfile, permits only reviewed dependency
install scripts, installs Electron, and rebuilds the native HID module.

To produce the qualified Linux package formats locally:

```bash
npm run compile
npm run bundle
npm run package:linux:x64
```

Release candidates require the complete checks documented in
[Release Procedure](RELEASE.md); a successful local package command alone is
not release qualification.

## Local Provider

Frame listens only on the loopback interface:

```text
http://127.0.0.1:1248
ws://127.0.0.1:1248
```

Applications can send standard JSON-RPC requests to these endpoints and route
an enabled EVM chain using Frame's documented request metadata. Wallet-owned
methods, subscriptions, origin handling, limits, and known local-process trust
boundaries are documented in [RPC Compatibility](RPC_COMPATIBILITY.md).

## IPFS Configuration

Frame reads decentralized dapp and token content through a Kubo RPC endpoint.
Set `FRAME_IPFS_API_URL` to use a different endpoint and set
`NEBULA_AUTH_TOKEN` when it requires HTTP Basic authentication. The existing
hosted endpoint remains the default.

Kubo RPC is an administrative interface. Keep a local endpoint bound to
localhost, or place a remote endpoint behind TLS, authentication, and a
restricted proxy. Do not expose it directly to the public internet. Archived
dapp downloads are bounded and activated only after their complete UnixFS
directory CID matches the ENS manifest.

## Security

Do not report wallet secrets or vulnerability details in a public issue. Follow
the private-reporting process in [Security Policy](SECURITY.md). The
[Threat Model](THREAT_MODEL.md) documents local RPC, renderer, persistence,
signer, network, and release boundaries.

Published packages do not inherit support guarantees from the original Frame
maintainers. Only the newest release in this repository is considered for
community security fixes.

## Direction

The current development branch contains the first headlessly qualified Yearn
Earn milestone; its exact scope and deferred live qualification are documented
in [Yearn Earn](YEARN_EARN.md). Near-term desktop work focuses on account-code
reliability and local address-book support. Broader UI qualification,
smart-account support, and a future mobile client with WalletConnect built
around shared wallet-core logic remain later work. Roadmap items are directional
and are not release support claims.

## Documentation

- [Security Policy](SECURITY.md)
- [Threat Model](THREAT_MODEL.md)
- [Supported Ethereum Standards](SUPPORTED_EIPS.md)
- [RPC Compatibility](RPC_COMPATIBILITY.md)
- [Signer and Platform Support](HARDWARE_SUPPORT.md)
- [Yearn Earn](YEARN_EARN.md)
- [Linux Release Qualification](QUALIFICATION.md)
- [Release Procedure](RELEASE.md)

## Origin And License

This repository is a community-maintained continuation of the GPL-licensed
[Frame wallet](https://github.com/floating/frame) originally developed by Frame
Labs. It is not an official Frame Labs release and is not supported by the
original maintainers.

Frame is distributed under the [GNU General Public License v3.0](LICENSE).
Modified versions and binaries must continue to satisfy the GPL's source,
license, notice, and corresponding-source requirements.
