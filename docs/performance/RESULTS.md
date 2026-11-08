# Performance Change Summary

## Evidence and outcome

The baseline frontend entry exceeded Vite's 500 kB warning by a wide margin. Deferring ExcelJS reduced the initial entry from 6,113,020 bytes (1,880,610 gzip) to 5,170,000 bytes (1,609,420 gzip); the 939,900-byte ExcelJS chunk now loads only on export.

[Tauri's command documentation](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/calling-rust.mdx) states that synchronous commands execute on the main thread. Workbook commands synchronously read, parse, serialize, and replace XLSX files, while PDF scan/copy and several Word operations already use blocking-task offload. Workbook operations were moved to `spawn_blocking`, serialized with a FIFO async mutex, and kept behind the same command names and payloads. This supports the responsiveness change structurally; native UI responsiveness was not measured.

## Compatibility and safety

- No command name, request/response payload, saved schema, workbook formatting path, or temporary-file replacement logic changed.
- The serialization lock prevents concurrent imports/saves/exports from racing after moving work to the blocking pool.
- Existing workbook round-trip, unrelated-sheet preservation, copies-template, and file-safety tests pass.
- No changes were made to PDF safety sequencing, Word document lifecycle, or user data.

## Not measured or implemented

- No 100/1,000/10,000-file PDF benchmark; no small/medium/large workbook or Word workload benchmark; no startup-to-usable-UI, CPU, or memory measurements.
- No Word lazy-mounting change: the workspace is currently mounted from startup and preserves open tabs/drafts; changing that without a runtime profile would risk lifecycle behavior.
- No PDF, workbook parsing/cache, or React table changes without measured evidence.
- Bundle sizes are single before/after local builds, not 10-run latency samples. Runtime gains remain unverified.

## Local handoff

The engineer's changes are in `src-tauri/src/lib.rs`, `src-tauri/src/workbook.rs`, `src/ui.tsx`, and `src/SignaturePage.tsx`. The existing dirty reference-gap edits and unrelated untracked files were preserved. `npm.cmd test` (77 tests), `cargo test` (30 tests), TypeScript, `cargo check`, formatting, and Wordcraft integrity checks passed.

Local optimization/testing only. No packaging, GitHub push, version bump, tag, or release performed.
