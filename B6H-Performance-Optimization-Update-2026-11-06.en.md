# B6H — Data Processing Performance Optimization Update (Local Implementation and Testing Only)

**Repository:** https://github.com/huyhoang2001/convert_name_pdf  
**Specification date:** 2026-11-06  
**Audience:** AI coding agent implementing changes in the existing repository  
**Status:** Implementation specification; **not a measured benchmark or an already optimized codebase**.

## 1. Objective and non-negotiable invariants

Improve PDF, Excel, Word, React responsiveness, IPC, and desktop startup performance **without altering observable application behavior or outputs**. Follow: baseline → evidence-based optimization → equivalence testing → repeat measurements → report. Do not rewrite the architecture in the absence of a demonstrated bottleneck.

**Preserve exactly:**

- Business rules, calculations, numbering and naming rules, workflow ordering, validations, messaging and error handling.
- UI/UX: layout, colors, Vietnamese/English strings, navigation, tabs, shortcuts, focus, progress/cancellation and save interactions.
- Data formats and contracts: JSON, settings, Excel workbook/sheets/formulas/styles/metadata, DOCX, directory naming, Tauri command names, request/response schemas and public fields.
- PDF safeguards: scan only directly selected-folder files where current behavior says so; preview and confirmation; verified Backup before Output; never rename/delete originals; never overwrite destinations; preserve collision and post-preview-change checks.
- Durable/atomic writes, existing error behavior, backups, legacy settings compatibility, configured user folders, unsaved Word changes and tab retention.
- Existing update, offline/online help and credential flows; do not modify security behavior merely to improve a benchmark.

**Never trade correctness for speed:** do not remove checks, silently reorder results, reduce numeric accuracy, suppress errors, introduce stale caches, or replace Excel/Word/PDF engines without rigorous compatibility evidence.

## 2. Strict scope — LOCAL ONLY

**Allowed:** inspect and modify local source; add benchmarks/tests; run the app in dev mode; run repository-specific tests/typechecks/lint/Rust checks; run a **local frontend-only production build for bundle analysis and compatibility** when necessary (this is not a desktop release).

**PROHIBITED in this phase:**

1. No desktop `.exe`, MSI, installer, portable app bundling or release packaging.
2. No `git push`, pull requests, remote changes, GitHub Actions updates or GitHub uploads.
3. No commits, tags, releases, version bumps in npm/Cargo/Tauri or release changelogs.
4. No code signing, publishing artifacts or uploading private datasets/benchmarks/customer files.
5. No production updater/signing/installer changes without separate user authorization.
6. Do not overwrite real user workbooks/files; use copies or synthetic fixtures in local temporary paths.

**Stop condition:** finish local tests, write the report, then stop. The owner will verify the app and separately authorize any future packaging, GitHub update, versioning or release.

## 3. Current implementation — verify HEAD before touching code

The repository uses React + TypeScript + Vite and Tauri 2/Rust, with Rename PDFs, Count number, Translation, Signature authentication, Copies and Word & Templates. Read `README.md`, `package.json`, `vite.config.ts`, `src/`, `src-tauri/`, `tests/` and relevant workflows. Record the local HEAD SHA; do not assume the repository still matches a previous review.

**Previously observed implementation details to re-verify against HEAD:**

- `src-tauri/src/workbook.rs` uses `umya-spreadsheet`; XLSX read/write, mapping and JSON construction may be expensive.
- Excel **already had** a `run_workbook()` mechanism/asynchronous command orchestration in the latest reviewed code. **Do not blindly propose migrating all Excel commands to `spawn_blocking`.** Inspect and profile the existing mechanism.
- `src-tauri/src/pdf.rs` had bounded parallel copy (approximately 3 workers maximum) and safe Backup/Output phases. **Do not remove/rewrite them without evidence.**
- Heavy Word/PDF commands already used offloading mechanisms in reviewed paths.
- The Word editor libraries are present and `vite.config.ts` has `optimizeDeps.exclude`; that option **does not prove** production code splitting or lazy loading.

If files/functions have moved, trace actual call paths instead of creating duplicate implementations.

## 4. Mandatory baseline and validation process

### 4.1. Reproducible environment

1. Inspect `git status` and identify pre-existing user changes; **never reset, stash, delete or overwrite user work**.
2. Record SHA, Windows version, CPU, RAM, SSD/HDD, Node/npm, Rust/Tauri and WebView2 versions, lockfile state.
3. Read actual test/dev scripts; never assume script names exist.
4. Build **non-sensitive** fixtures: 100/1,000/10,000 PDFs (collisions, changed-after-preview files, malformed files, permissions); small/medium/large XLSX (multiple sheets, formulas, styles, merged cells, Unicode); small/large DOCX with unsaved tabs.
5. Run identical fixtures and environments before/after; at least five measured runs after warm-up. Report median, p95 where sample size is meaningful, variation, CPU/RAM and I/O.
6. Separate cold and warm startup measurements.
7. Instrument phases and end-to-end timing; subjective UI impressions do not count as evidence.

### 4.2. Required measurements

| Workload | Timing / diagnostics | Equivalence assertion |
|---|---|---|
| Startup | Launch → interactive UI; CPU/RAM | Separate cold and warm |
| PDF scan | 100/1,000/10,000 files; enumeration, metadata, parsing, IPC | Same entries, ordering and results |
| PDF preview/run | Preview, Backup, verification, Output and errors | Byte-identical copies and overwrite prevention |
| Excel import | Read/parse/map/JSON/IPC | Equivalent JSON, sheets and records |
| Excel save | Read → modify → serialize → temporary write → replace | Preserve formulas, styles and unaffected sheets |
| Word | First/next open, save, tab switches, RAM | Content, formatting and unsaved state |
| React | Render commits, rerenders, filter/sort/edit | Same UI and keyboard behavior |
| IPC | Call count, payload size, serialization duration | Unchanged public contracts |

If a workload cannot be run, mark it **NOT MEASURED** and explain why.

## 5. Optimization package A — Excel (`workbook.rs`, command bridge, Excel UI)

First identify cost centers with timing spans: XLSX opening, sheet parsing, header normalization, row mapping, JSON construction, IPC serialization, cell updates, XLSX serialization, temporary writes, sync and replacement.

**Only optimize with measured evidence and equivalence tests:**

- Build column/header lookup maps once per import/save instead of repeated linear searches per row.
- Reduce redundant type conversions, allocations and `String`/`serde_json::Value` cloning; use safe borrowed references where practical.
- Reuse data within a **single request** without adding a potentially stale cross-request workbook cache. Any proposed cross-request cache needs proper file invalidation, external-edit tests, memory bounds and a safe fallback.
- Modify only required cells/sheets **when** the engine preserves observable workbook semantics; otherwise keep the existing write behavior.
- Inspect `run_workbook()` blocking, contention and lock durations; do not add threads without proof.
- Preserve temporary-file and atomic replacement guarantees and existing permissions/errors.

**Regression coverage:** multiple sheets, formulas, merged cells, Unicode, leading-zero identifiers, numeric/date formats, hidden sheets when supported, permission errors, malformed input, external file edits and repeated saves. Compare logical values, supported formatting and metadata; do not rely only on XLSX ZIP byte hashes, since ZIP metadata/order can differ.

## 6. Optimization package B — PDF (`pdf.rs` and PDF frontend)

- Profile `scan`, filename parsing, grouping/sorting, preview, `copy_phase()`, verify and Output separately.
- Identify repeated filesystem/metadata reads; remove only those not required for time-of-use safety.
- Benchmark 1/2/3/4 workers across SSD/HDD and file sizes; do not increase concurrency by assumption.
- Bound memory and queue sizes; avoid loading full large PDFs into RAM unnecessarily; preserve byte-identical output.
- Preserve user confirmation, observable progress/cancellation, overwrite checks and failure semantics.
- Test per-file copy errors, collisions, disappearing/modified sources after preview, permission denied, safe disk-full simulation, cancellation and partial-failure recovery.

## 7. Optimization package C — Word / Templates

- Profile JS/CSS/WASM fetch/initialization, DOCX decoding, editor creation, new tab, save, tab switching and multi-tab RAM.
- Analyze a **local production frontend bundle**: `optimizeDeps.exclude` impacts dev prebundling and is **not** production lazy loading.
- Use dynamic `import()` / `React.lazy()` only if it meaningfully reduces critical path **without losing editor mount state, selection, undo history, unsaved edits, tab names or shortcuts**.
- Preserve WebView2/Tauri asset, WASM, worker, CSP and SRI behavior. Never disable integrity checks to make the editor load.
- Do not switch engines or change DOCX conversion/template layout/folder paths/naming behavior.
- Test multiple tabs, navigating away/back, Ctrl+O, unsaved edits, large documents, fonts/layout, save/rename and malformed files.

## 8. Optimization package D — React / TypeScript

- Use React Profiler on cell editing, filtering, sorting, workspace switches, scan progress and opening Word.
- Apply `memo`, `useMemo`, `useCallback`, state selectors or virtualization only for measured costly rerenders.
- Preserve observable DOM, focus/tab order, keyboard shortcuts, accessibility, row heights, scrolling, sort/filter logic and displayed text.
- If virtualization is used, verify selection, keyboard navigation, copy, export/print and off-screen records.
- Debounce only operations that do not change required immediate behavior; never debounce data persistence or validation in a way that loses data.

## 9. Optimization package E — IPC, Rust and startup

- Measure IPC call count, payload size, serialization, mutex contention, allocations and filesystem I/O.
- Keep Tauri names, input/output schemas, errors, states and event sequencing. Avoid incompatible streaming/API migrations.
- Avoid holding locks during lengthy I/O; reduce unnecessary clones; use `spawn_blocking` only for truly blocking commands not already offloaded.
- Profile startup critical path: settings, UI mount, imports, initial route, Word assets and scans. Defer only work not required for the first interactive screen.
- Do not modify updater, credential access, CSP, SRI or security policies to improve benchmark numbers.

## 10. Phased implementation plan

**P0 — Audit:** inspect HEAD and dirty working tree; trace commands, confirm Excel `run_workbook()` and PDF workers, capture baseline and risk register.

**P1 — Excel:** implement 1–3 profiling-supported changes; regression-test each; rerun benchmarks.

**P2 — PDF:** optimize scan/preview first, preserve safety checks, benchmark concurrency before any worker change.

**P3 — React + Word:** low-risk render/startup changes while retaining full tab state and UX.

**P4 — IPC + startup:** targeted reductions, cross-module tests, error-path checks.

**P5 — Full local validation:** run existing tests, typecheck, lint where available, `cargo check`/`cargo test` as applicable, execute Windows local app and complete manual end-to-end scenarios.

Use local diffs/reports as checkpoints, **not commits/tags**. If a change yields no real improvement or causes regression, revert **only the agent's change**; do not reset the owner's work.

## 11. Acceptance criteria

- Baseline tests and new regression tests pass; observable behavior, errors, UI/UX and edge cases remain equivalent.
- PDF copy remains byte-identical; Excel/DOCX preserve required contents, structure and formatting without data loss.
- No significant RAM/CPU inflation or UI stalls in exchange for throughput without a documented trade-off.
- Provide workload/hardware/run count, median (and meaningful p95), variability and `100*(before-after)/before` time reduction.
- Do **not** claim 20–40% or 30% improvements without measurements. Report zero or negative gains accurately.
- No new desktop installer/EXE, pushes, commits, tags, version changes or releases.

## 12. Required agent report

```text
B6H LOCAL PERFORMANCE OPTIMIZATION REPORT
A. Starting HEAD SHA / git status / hardware and software environment
B. Verified architecture and actual execution paths
C. Baseline per workload (n, median, p95, CPU/RAM)
D. Profiler-backed bottlenecks
E. Files/functions changed; reasoning for behavioral equivalence
F. Before → after table; percentage change; variation
G. Commands and results for all tests; manual Windows scenarios
H. Remaining issues, trade-offs, unmeasured workloads
I. Confirmation: local only; no packaging/push/commit/version/release
J. Instructions for the owner to reproduce tests locally
```

If Windows/dependencies are unavailable, never claim success: mark affected checks **BLOCKED**, describe the exact blocker and provide reproducible Windows commands for the owner.

## 13. Copy/paste implementation instruction for AI agent

> Read `B6H-Performance-Optimization-Update-2026-11-06.en.md` and its `.vi.md` counterpart fully; inspect the repository HEAD before editing. Capture performance baselines, profile bottlenecks, then implement evidence-based optimizations one phase at a time. Preserve 100% of business semantics, outputs, UI/UX, data schemas, Tauri contracts and PDF/Excel/Word safety features. Add regression coverage, measure before/after, test locally on Windows and deliver the Section 12 report. Work locally only: no desktop packaging, no push, no commits/tags, no version bumps and no release. Stop after local validation for owner acceptance.
