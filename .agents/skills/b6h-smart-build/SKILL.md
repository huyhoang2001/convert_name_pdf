---
name: b6h-smart-build
description: Use for every B6H coding, bug fix, feature, test, local run, build, Wordcraft integration, stale output or disk-growth task, including new conversations. Select minimal validation, reuse verified Wordcraft artifacts, preserve current working-tree changes and prevent redundant Rust/WASM compilation and packaging.
compatibility: B6H React/TypeScript, Tauri/Rust, Wordcraft Rust/WASM; Windows-first.
metadata:
  version: "1.0.0"
---

# B6H Smart Build — operating contract

## Authority and scope
Activate before any B6H code edit or command that may generate artifacts. This skill governs ordinary authorized coding and local validation, not authority to change unrelated infrastructure. Use universal-safe-cleanup for disk audit and separately authorized cleanup. Never treat this skill as permission to delete files, change Cargo profiles, install dependencies, alter global settings, or package releases. If the agent host does not automatically select skills, explicitly invoke this skill in each new session; installation alone is not enforcement.

### Permanent project policy
- The canonical local B6H project root for this checkout is `C:\Users\hinam\Desktop\convert_name_pdf-main`. Resolve B6H commands, paths, metadata, and build state from this existing root.
- Never create, clone, initialize, or copy another B6H source project for a new version. Update version metadata in this same project only when the user authorizes a version update; generated executable and distribution filenames may include a release version.
- Keep `wordcraft-upstream` as the existing checkout under or beside the permanent root, resolve it configurably, and preserve its working-tree changes. Never create another upstream clone or Cargo target directory.
- Use the explicit `x86_64-pc-windows-msvc` target for Windows installer and production Core builds. Prefer the existing `npm.cmd run build:installer` entry point; do not use the un-targeted `npm.cmd run tauri:build` for production, because it populates a separate default-host release cache.

### Verified low-disk Rust development policy (2026-11-15)

- The desktop Cargo workspace root is `src-tauri/Cargo.toml`; its existing target is `src-tauri/target`. Keep the desktop library as `rlib`: `src-tauri/src/main.rs` calls `b6h_lib::run()` and no desktop consumer requires `staticlib` or `cdylib`.
- Preserve `[profile.dev]` in that manifest with `opt-level = 0`, `debug = "line-tables-only"`, `incremental = false`, `debug-assertions = true`, and `overflow-checks = true`; keep `[profile.dev.package."*"] debug = false`. This policy applies to the desktop dev profile, not the separate Wordcraft workspace or release profile.
- Before a profile/toolchain change or cold rebuild, inspect Cargo config and relevant environment overrides, measure both target directories and free space, and budget for cache invalidation plus linker temporary files. Reuse `src-tauri/target`; stop when the measured free space does not cover the estimate with margin. Do not delete old artifacts without the cleanup approval gate.
- Verified locally with `cargo build --manifest-path src-tauri/Cargo.toml --locked --offline` and `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib` (83 passed, 3 ignored). The first build after this profile change took 467 seconds; an unchanged repeat took 1.2 seconds. Re-measure on future changes rather than treating these timings as guarantees.

### Development build defaults

- Use `npm.cmd run dev` for ordinary desktop development and Vite hot reload. Its frontend hook validates/reuses Wordcraft assets; do not request a Wordcraft source build for unrelated B6H edits.
- For frontend-only update payloads, use `npm.cmd run build:frontend-update`. It must remain a frontend-only path with zero Cargo compilation, zero NSIS builds, and zero Wordcraft source compilation.
- Run tests that cover the changed behavior. Do not run the full Wordcraft native workspace suite (`cargo xtask test`, `cargo xtask ci`, or `cargo test --workspace`) for unrelated B6H work or minor UI edits. For Wordcraft Rust changes, use the narrowest affected package/test filter, such as `cargo test --manifest-path wordcraft-upstream/Cargo.toml -p <crate> --lib <test_filter>`.
- Build the Wordcraft WASM runtime with `npm.cmd run wordcraft:source-build` only when actual Wordcraft source changes need runtime verification and the reuse check determines a build is required. Group related Wordcraft edits before this expensive step when practical. Continue to reuse the existing `wordcraft-upstream/target` and verified WASM release cache.
- Require explicit owner authorization before production installer/Core packaging, production update-package generation, or signing. Use the existing explicit x64 target for authorized Windows production builds; do not accumulate default-host release artifacts as a packaging side effect of ordinary development.

### Incremental production releases

- For an authorized release, run `npm.cmd run release:prepare` after intended application changes are committed. It compares against the latest stable ancestor tag, selects changed Frontend/Core/Wordcraft components, uses the next unused maintenance version, and updates only the affected component version metadata. Review the generated release notes and diff before committing and tagging.
- A release tag must be the next unused `vX.Y.Z`, match every changed component version, and contain component changes since the previous stable tag. The workflow derives its plan from the diff; do not use commit-message markers or release tags for docs-only changes.
- `.github/workflows/release.yml` is the production release path. It builds only affected update packages, builds the lightweight Setup only for Core changes, reuses the previous compatible Setup otherwise, validates/reuses the checked-in Wordcraft runtime, merges unchanged packages from the previously signed catalog, verifies package/catalog signatures and SHA-256 values, uploads a draft, and publishes only after the uploaded assets verify.
- Production signing uses the existing trusted Ed25519 key ID `b6h-update-ed25519-2026-11`. Local signing uses `%LOCALAPPDATA%\B6H\release-signing\update-private.pem`; Actions requires the protected `b6h-production-release` environment secret `B6H_UPDATE_SIGNING_KEY_B64`. Verify the key against the compiled public trust root before builds. If that environment secret is missing or mismatched, stop before compilation and follow `docs/DEVELOPER_RELEASES.md`; never fall back to test keys.
- Preserve catalog entries for compatible unchanged components and their original immutable GitHub asset URLs. Never overwrite published release assets or create a tag that would trigger an incomplete release.

### Graphify-assisted source navigation

- Before B6H source edits, query the current `graphify-out/graph.json` for the affected component, function, module and dependencies. Check every finding against current source and trace callers, data flows, frontend/backend boundaries and relevant tests. Source is authoritative when the graph is stale or incomplete.
- After source edits, refresh the affected graph with the installed Graphify CLI; use a full source-scoped refresh before a release or after structural changes. Keep `.graphifyignore` exclusions for user data, secrets, generated bundles, Cargo targets, Wordcraft binaries and unrelated extracted tools. Do not compile Rust or Wordcraft merely to update Graphify.
- On this Windows host Graphify 0.9.105 is available through `python -m graphify` even when its script directory is absent from PATH. Inspect the installed CLI before relying on options; report unsupported analyses instead of claiming they ran.

## 1. Preflight
- Confirm canonical workspace root, branch, HEAD, working-tree changes (including nested Wordcraft repository), active processes and executable paths. Preserve tracked and untracked user work; the current local working tree, not HEAD alone, is authoritative.
- Inspect actual package scripts, Tauri hooks, Cargo workspace/configuration, Wordcraft build/sync scripts, runtime asset paths and IDE tasks before executing them. Trace transitive commands including pre/post npm scripts. Do not invent script names or assume a clean checkout.
- Resolve effective target directories and build profiles; reuse existing dependencies, stable targets and matching toolchains. Avoid new clones, worktrees and target directories. Record logical sizes of both Rust targets, frontend outputs and volume free space; note hardlinks/reparse points, scan failures and concurrent activity.
- Check whether a valid Wordcraft output already exists and whether current runtime consumes it. Do not launch a build solely to discover the answer.

## 2. Select the minimum necessary work
| Change | Default validation | Wordcraft compilation |
| --- | --- | --- |
| Docs only | Review/lint if needed | Never |
| React/TS UI, navigation, Calendar, Settings | Targeted frontend tests/typecheck; frontend build or dev smoke if necessary | Skip |
| B6H Rust/native API | Targeted Cargo check/test and integration smoke as required | Skip unless Wordcraft inputs affected |
| Wordcraft host/integration | Relevant host tests, asset compatibility/runtime smoke | Only if an actual Wordcraft build input changed or valid output is unavailable |
| Wordcraft source/dependencies/toolchain | Relevant tests and required WASM build | Required when verified inputs differ |

Review transitive hooks before selecting commands. If a general command unconditionally rebuilds Wordcraft, avoid it and use a verified narrower path where available. If no safe validation route exists, report the blocker. A request to fix a selector is not permission to redesign the build pipeline; propose that change separately unless explicitly requested. Do not skip integration tests actually needed to validate a fix.

## 3. Reuse decision before every Wordcraft build
Use actual current contents, not only Git commit, timestamps or version strings. Determine relevant source files (including modified/untracked build inputs), workspace manifests and lockfiles, local/path dependencies, source generation scripts, build flags/features, target/profile, toolchain and wasm-bindgen/wasm-opt or equivalent versions, templates and relevant environment inputs. Exclude output/cache folders and unrelated user data; do not expose secrets. A proposed persistent manifest must record a deterministic input fingerprint, output inventory with hashes, effective build recipe and successful verification state. If manifest support is absent, inspect existing evidence; do not manufacture provenance for old outputs.

- REUSE: verified input fingerprint matches, required outputs exist and integrity checks pass; do not compile, package or recopy identical files.
- SYNC ONLY: verified build output matches inputs but deployed/runtime copies differ or are missing; use reviewed synchronization only, with complete-set integrity validation.
- BUILD REQUIRED: relevant inputs changed or no valid reconstructible output is available; build the minimum necessary layer once. Missing deployment copies alone are not justification to compile.
- UNKNOWN/BLOCKED: cannot establish provenance or safe commands; explain uncertainty and obtain required scope before expensive or destructive work. If fresh compilation is necessary for verification, it must use current inputs and approved local scope.

Never silently serve stale artifacts as fresh output. Preserve last-known-good assets on failure; label them stale if current inputs differ. Do not report the affected fix verified using stale assets.

## 4. Permanent pipeline improvements (only when requested)
Audit all actual triggers and dependency edges. Separate source compilation, asset generation, asset sync, desktop compilation and distribution packaging. Put reuse checks at shared entry points including Tauri hooks, not just an optional script. Keep existing compatible entry points. Hash inputs deterministically and verify output inventories; publish the success manifest only after validation. Stage a complete asset set in bounded temporary space; validate HTML/JS/WASM imports, SRI hashes and runtime paths together, then publish safely with rollback and writer coordination. Do not mix assets from different builds. Avoid repeated copying/archiving; keep existing reusable Cargo caches and a bounded number of approved runtime generations. Do not delete old generations without cleanup approval. Detect concurrent builds and avoid duplicate work. If already valid, repeated identical requests must be no-ops for Wordcraft compilation and sync. Never change editor architecture, user JSON, document lifecycle or unrelated UI/UX.

## 5. Disk controls
Measure before and after each task and before expensive build phases. If growth exceeds 500 MiB, identify the growing paths and commands; pause further unnecessary builds while investigating. This is a reporting threshold, not a deletion authorization or guaranteed size cap. Check sufficient free space for compilation and staging; stop avoidable writes when insufficient. No automatic cargo clean, cache pruning, broad deletion, repeated installs, duplicate workspaces or release builds. Consider CARGO_INCREMENTAL=0 only as a scoped, approved experiment with build-time and disk measurements; do not alter global variables or Cargo profiles automatically. Coordinate with universal-safe-cleanup: audit and propose exact cleanup paths; retain reusable artifacts by default. Cleanup requires separate explicit scoped approval.

## 6. Verify actual runtime
If local launch is required, confirm the executable path or dev server and actual asset origin. Verify the expected change in the running app; successful compilation alone is insufficient. Check Wordcraft JS/WASM provenance and asset sync when relevant. Version metadata can remain unchanged; never bump it to prove freshness. Stop on inconsistent source/output, failed tests or unknown asset provenance; explain what remains unverified rather than launching repeated blind builds.

## 7. Acceptance checks for a pipeline update
- Unrelated frontend and backend edits trigger zero Wordcraft compilation or packaging.
- Identical repeated requests reuse valid outputs with zero redundant synchronization.
- A relevant Wordcraft input change invalidates reuse and triggers necessary compilation.
- Missing deployed assets with valid build outputs trigger sync only.
- Corrupt outputs, changed dependencies/toolchain, or stale manifests cannot be treated as valid.
- Failed build preserves previous verified output; no mixed JS/WASM/SRI generation.
- Dirty/untracked relevant source changes affect fingerprint; unrelated files do not.
- Current executable/runtime reflects the intended working tree, existing editor features remain intact.
- Record actual commands, process invocations, elapsed time, logical sizes/free space before/after; report unexecuted tests explicitly. Compare repeated runs against baseline; do not invent savings.

## 8. Completion report and restrictions
Report root/branch/HEAD, preserved working-tree state, changed files, selected validation scope, Wordcraft decision (REUSE/SYNC ONLY/BUILD REQUIRED/UNKNOWN) and evidence, commands and outcomes, runtime paths if launched, disk deltas for both targets, remaining artifacts and blockers. Distinguish tests from assumptions. Local work only: no packaging Windows applications/installers, Git commit/push/tag/release/version change without separate explicit authorization. No storage migration or SQLite. No AGENTS.md dependency. Never claim success solely because a command exited zero.
