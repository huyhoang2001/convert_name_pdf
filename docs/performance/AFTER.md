# Local Performance Results After Changes

All checks and builds were run locally. No desktop package, version change, GitHub push, tag, or release was produced.

## Changes

- XLSX import, refresh, save, create, export, and register-cache clear commands now execute through Tauri's async command path and `spawn_blocking`.
- A FIFO async mutex serializes those workbook operations, preserving the prior single-operation behavior while work runs off the UI/main thread. Tauri-managed state is retrieved inside the blocking closure through `AppHandle`.
- Translation and Signature exports load ExcelJS only when an export is requested. The import stays local and uses the existing dependency.
- PDF logic and Word mounting were left unchanged because no workload or startup profile justified changes there.

## Checks

- `npm.cmd test`: 77 passed, 0 failed (12.52 s).
- `cargo test`: 30 passed, 0 failed (2.20 s test time).
- `npx.cmd tsc -b --pretty false`: passed.
- `cargo check`: passed.
- `cargo fmt --check`: passed.
- Wordcraft asset integrity check: passed.

## Frontend artifact

Built the changed source into a second isolated temporary output directory. Vite transformed 516 modules.

| Artifact | Minified bytes | Gzip bytes |
|---|---:|---:|
| Initial JS entry | 5,170,000 | 1,609,420 |
| Deferred ExcelJS chunk | 939,900 | 271,220 |
| CSS | 128,910 | 23,070 |

Compared with the baseline, the initial entry is 943,020 bytes smaller (15.4%) and 271,190 gzip bytes smaller (14.4%). ExcelJS is still downloaded locally when a register export is used. These are artifact-size measurements, not app-startup timings.

## Runtime workload limits

The PDF/XLSX/DOCX synthetic workload matrix and a native-app responsiveness run remain unmeasured. Workbook file-operation durations are expected to remain similar; the change moves them off the UI/main thread. No numeric runtime speedup is claimed.
