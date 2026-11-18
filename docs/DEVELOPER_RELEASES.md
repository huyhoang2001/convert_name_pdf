# Developer release maintenance

## Release signing

The public Ed25519 update trust root is `b6h-update-ed25519-2026-11`. It is compiled into both the desktop app and Core update runner through `B6H_UPDATE_TRUST_ROOTS`. The public root is not secret. The matching private key is kept outside the repository at `%LOCALAPPDATA%\B6H\release-signing\update-private.pem`, with its directory ACL restricted to the current user and SYSTEM. Never commit, upload, or include that private key in release assets. Back it up securely; losing it requires a new trusted application release before the update signing key can be rotated.

The NSIS Setup is intentionally unsigned by Authenticode. Do not add a paid signing dependency. Release notes and installation instructions disclose the expected Windows unknown-publisher or SmartScreen warning.

## Build and publish

The `v*.*.*` GitHub Actions workflow runs Node and Rust checks, reuses the checked-in Wordcraft runtime, builds the test-free Windows x64 Setup and creates a **draft** release. It checks the production app and runner for local test keys, localhost update endpoints, and fault-injection hooks, enforces the 50 MB Setup limit, records SHA-256, and confirms the expected Authenticode status.

Before publishing a release:

1. Confirm version metadata and a production trust root in both binaries.
2. Review the build and test results and verify the draft Setup, checksum, logo branding, and `NotSigned` Authenticode status.
3. For a release with no component changes beyond its bundled baseline, create and sign an empty stable catalog. For later releases, package only changed Frontend, Wordcraft, or Core payloads with `scripts/update-package.mjs`, using the production key ID and stable channel. A Core package must contain a newer matching Setup.
4. Verify each package with the matching public key, verify the catalog signature and all catalog package lengths and SHA-256 values, and attach the catalog, detached signature, sidecars, and packages to the draft release.
5. Publish the release only after the catalog and required assets are present. Verify the public release assets and online discovery from B6H.

Example empty v3.0.0 catalog command:

```powershell
node scripts/update-package.mjs catalog --empty --output .b6h-state/release/catalog.json --key "$env:LOCALAPPDATA\B6H\release-signing\update-private.pem" --key-id b6h-update-ed25519-2026-11 --channel stable --sequence 1 --base-url https://github.com/huyhoang2001/convert_name_pdf/releases/download/v3.0.0
```

The command writes `catalog.json`, `catalog.sig`, and SHA-256 sidecars. Upload only those production-signed outputs. Never upload `.b6h-state/update-test-keys`, test packages/catalogs, local test certificates, or isolated E2E outputs. Test signing remains behind the `update-test-keys` feature and is excluded from release builds.

## Local checks and preserved runtime

Use the existing checkout and Cargo targets. Do not build the large offline Setup or compile Wordcraft unless its actual inputs changed.

```powershell
npm.cmd ci
npm.cmd test
cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1
$env:B6H_TEST_SKIP_RUNONCE = '1'
cargo test --manifest-path src-tauri/update-runner/Cargo.toml --locked --offline --features update-test-keys --target x86_64-pc-windows-msvc --bin b6h-update-runner -- --test-threads=1
Remove-Item Env:B6H_TEST_SKIP_RUNONCE
npm.cmd run build:installer
```

`npm.cmd run wordcraft:build` validates and reuses the existing JavaScript/WASM runtime. `npm.cmd run build:installer` builds the external recovery runner, the frontend, the application, and the lightweight NSIS Setup. The normal release build does not enable `update-test-keys`.

Do not report SMB/UNC multi-machine behavior, clean-machine installs, or real-user migration as passed without running those scenarios. Record deployment limitations explicitly.
