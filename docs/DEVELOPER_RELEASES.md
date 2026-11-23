# Developer release maintenance

## Signing identity

Production update signing uses the existing Ed25519 identity `b6h-update-ed25519-2026-11`. Its public key is compiled into B6H and the Update Runner; the matching public key must remain unchanged. The local private key is stored at `%LOCALAPPDATA%\B6H\release-signing\update-private.pem`. Do not print, commit, or attach private key material to release assets. Stable releases must fail closed if the existing key is unavailable or does not match the compiled trust root; never generate a replacement or use test keys.

The production signer runs only when a repository owner manually dispatches the release workflow against a version tag and sets `authorize_production_signing` to `true`. Ordinary tag pushes do not invoke the signer. The job uses the protected `b6h-production-release` GitHub Environment. A repository owner must configure that environment in **Settings > Environments**, require the appropriate release reviewer, and add the existing PEM as environment secret `B6H_UPDATE_SIGNING_KEY_B64` for `huyhoang2001/convert_name_pdf`. On the trusted Windows machine, encode the local key directly into `gh secret set` without displaying it:

```powershell
$keyPath = Join-Path $env:LOCALAPPDATA 'B6H\release-signing\update-private.pem'
[Convert]::ToBase64String([IO.File]::ReadAllBytes($keyPath)) | gh secret set B6H_UPDATE_SIGNING_KEY_B64 --env b6h-production-release --repo huyhoang2001/convert_name_pdf
Remove-Variable keyPath
```

The workflow requires the explicit dispatch input, then verifies the imported key against the compiled public trust root before any build. The secret is held only by the protected environment and ephemeral runner files; the workflow removes those files at job end. Do not paste the secret into chat, logs, workflow files, or repository files. Local signing remains available using the same protected key when explicitly authorized.

The NSIS Setup is intentionally unsigned by Authenticode. Do not add a paid signing dependency. Release notes and installation instructions disclose the expected Windows unknown-publisher or SmartScreen warning.

## Incremental release flow

Commit the intended application changes first. Run `npm.cmd run release:prepare`, review the generated component versions, `README.md`, and `RELEASE_NOTES.md`, then commit that preparation and push a matching next unused `vX.Y.Z` tag. Tag pushes do not start production signing. For an automated release, manually dispatch this workflow against that tag and explicitly set `authorize_production_signing` to `true`; the job is skipped for other refs or without that authorization. The release planner compares with the previous stable tag; docs and release-tool changes alone do not create a release. The signing preflight still fails before compilation if the protected signing secret is missing or does not match.

The workflow tests release tooling, validates only changed components, builds the Frontend payload only for Frontend changes, and builds Core plus its lightweight x64 Setup only for Core changes. Wordcraft runtime validation reuses checked-in assets and compiles Wordcraft only when its actual source inputs require it. It does not build the large Offline Installer. Unchanged signed catalog entries and their immutable original URLs are retained; changed components receive newer package versions and sequences. The workflow verifies package and catalog signatures, historic catalog packages, SHA-256 sidecars, the uploaded draft assets, and Settings online discovery from the prior compatible Setup before marking the GitHub release Latest.

Never overwrite assets on a published release or move a stable tag. An incomplete workflow leaves the release unpublished or returns it to draft. Investigate and rerun the failed tagged workflow only after correcting the cause.

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
