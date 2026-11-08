# B6H — Data and Application Performance Optimization Specification (LOCAL ONLY)

> **For an AI coding agent implementing changes directly in:** https://github.com/huyhoang2001/convert_name_pdf.git  
> **Status:** Implementation specification; **not a benchmark result or a claim of completed optimization**.  
> **Absolute boundary:** Analyze, edit code, and test **locally only**. **DO NOT package, build a portable `.exe`/installer, push to GitHub, create tags, bump versions, create releases, deploy, or publish.** Wait for the owner's independent testing and explicit authorization in a subsequent request.

## 1. Mission and non-negotiable invariants

Improve **PDF/Excel/Word data processing, application startup, and React/Tauri responsiveness** without changing any observable behavior: business rules, safety-critical sequencing, results, document content and formatting, UI/UX, data structures, IPC contracts, settings, backward compatibility, and error handling. Do not rewrite the architecture or swap libraries merely in pursuit of speculative speed. Measure baseline and rerun regression tests.

**Required invariants:**

- Preserve every workflow, selector, sidebar, tab, navigation route, Vietnamese/English labels, visual design, colors, theme, keyboard shortcuts, loading/error/confirmation behavior, display ordering, and continuity of open documents.
- Preserve the names, types, shapes and meaning of JSON fields, records, persisted settings, Tauri commands and request/response payloads; no unsolicited migration, deletion of user data, or changes to storage directories.
- PDF: never mutate original files; preview and user confirmation before execution; create/verify Backup before Output; never overwrite existing results; preserve duplicate/missing-number logic, errors and reports.
- Excel: retain every worksheet, cell, formula, style, merged range, metadata, number/date/time format, name/order and Vietnamese Unicode value; preserve the temporary-file/safe-replace policy and existing write scope.
- Word: preserve content/formatting, unsaved changes, open tabs, and selection/caret state where previously preserved; keep Templates, Recent, Settings, and save destinations working.
- Retain correct behavior under permission errors, locked files, symlinks/path traversal, corrupt inputs, I/O interruptions, concurrent operations, cancellation and Windows Unicode paths.
- Correctness and safety win over speed. If an optimization is not proven safe, report it rather than apply it.

## 2. Repository inspection targets (verify against local checkout)

| Location | Inspection focus | Guardrail |
|---|---|---|
| `src-tauri/src/pdf.rs` | scan/preview/run/copy; repeated enumeration, metadata, allocations, workers | Already has bounded parallel copy; do not replace blindly |
| `src-tauri/src/workbook.rs` | XLSX read/parse, mapping, sheet rebuild, serialize/write | Review `umya-spreadsheet` and temp-file semantics |
| `src-tauri/src/word.rs` | Word open/save, filesystem, lifecycle | Preserve Word output |
| `src-tauri/src/storage.rs` | settings and JSON I/O, caching and locks | Preserve paths/schemas |
| `src-tauri/src/lib.rs` | Tauri commands, `spawn_blocking`, IPC, lock duration | Some PDF/Word calls are offloaded; examine Excel |
| `src/ui.tsx` and `src/**` | render/state, selectors, large tables, Word mounting, lazy imports | Profile first |
| `vite.config.ts`, `package.json`, `package-lock.json` | chunking, imports, bundle size, reproducible dependencies | Distinguish dev from production |
| `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` | profiles, flags, assets, initialization | **No packaging/releasing** |
| `tests/`, Rust tests | regression, golden cases, microbenchmarks | Add focused test coverage |

These are starting points, not a substitute for following the actual call graph. Never assume paths, functions or APIs still match this document; document local differences before proceeding.

## 3. Mandatory workflow: baseline → minimal change → equivalence proof

### 3.1. Baseline and working tree safety

1. Record `git status --short`, branch, HEAD, Node/npm/Rust/Tauri versions, Windows version, CPU/RAM/disk type. **Do not reset, clean, stash, or overwrite pre-existing user changes.** If the working tree is dirty, isolate your edits and document boundaries.
2. Read README, scripts, lockfiles, existing tests, and the complete PDF/Excel/Word call graph. Map frontend ↔ IPC ↔ storage ↔ filesystem operations.
3. Run available tests **before** modifying code. Record pass/fail/skip counts; clearly distinguish pre-existing failures from regressions.
4. Use synthetic or properly anonymized fixtures in isolated temp directories; never experiment on real client files.

### 3.2. Workload matrix and repeatable measurement

Keep hardware, input fixtures, toolchain, power settings and storage environment consistent. Run **at least 5 measured iterations** (preferably 10) after warm-up; report median and p95, optionally min/max and variance. Keep cold and warm conditions separate. Account for OS file cache, antivirus, HDD/SSD/network drives and external interference; one-off speedups are not evidence.

| Scenario | Minimum workload | Measure |
|---|---|---|
| Local startup | run development/local application, no packaging | process start → visible window → usable UI; JS init, peak RAM |
| PDF scan | 100 / 1,000 / 10,000 files, Unicode names and group variations | scan latency, files/s, CPU, RAM, UI responsiveness |
| PDF preview/run | duplicates, gaps, invalid paths, locked files, varied file sizes | preview, verify, Backup, Output times separately; hash/file count |
| Excel import | small/medium/large multi-sheet files with formulas/styles | read, parse, mapping, IPC, display |
| Excel save/refresh | edited and unchanged workbooks | read/rebuild/write/rename; document preservation |
| Word | multiple DOCX documents/tabs, route switching, save | first open, reopen, switch, save, RAM |
| React/IPC | large tables, editing, sorting/filtering and selectors | render counts, commits, payload bytes, IPC latency |

Instrument stages using `std::time::Instant` in Rust and `performance.mark/measure` in frontend code. Enable timing logs in dev/tests only; **never log confidential file contents or sensitive data**. Store before/after evidence locally, for example `docs/performance/BASELINE.md`, `AFTER.md`, and `RESULTS.md`. Do not publish them.

### 3.3. Behavior equivalence tests

- Golden fixtures: identical inputs must produce equivalent business results, filenames, ordering, error semantics, row/column/cell structures. For copied PDFs, compare SHA-256 byte-for-byte when appropriate. For XLSX/DOCX, do not rely exclusively on ZIP byte equality (timestamps/order may differ); systematically compare content, formulas, formatting, relationships, merged regions, embedded resources and required metadata.
- UI: comparable screenshots at the same viewport/theme/language, keyboard shortcuts, navigation, focus, open tabs, loading/error states; manual verification is acceptable where no E2E harness exists.
- Include concurrency, repetition, interruption, locked files, denied permissions, invalid paths, old settings and import/export round trips.
- Accept an optimization only when relevant equivalence tests pass **and** measured gains are reproducible.

## 4. Module-by-module optimization candidates — only after profiling

### 4.1. PDF: `pdf.rs`

- Time directory enumeration, filename/group parsing, metadata access, preview construction, checksum/verification, Backup copy and Output copy separately.
- Eliminate redundant traversals/metadata reads **only if** change detection and safety revalidation remain correct at the necessary point in time. Scoped caches must have proper invalidation; never skip the final pre-run validation.
- Assess allocations, vector reservation and avoidable string clones in scan/preview; preserve deterministic sorting and behavior.
- Benchmark 1/2/3/4 workers across SSD/HDD and input sizes. Keep concurrency bounded; more workers are not automatically faster and must not weaken resource limits or operation ordering.
- Do not introduce a supposedly faster copy method that loses atomicity, verification, overwrite protection or error reporting.

### 4.2. Excel: `workbook.rs` — high priority

- Profile XLSX read → sheet parse → header normalization → mapping/lookup → row reconciliation → cell/style writes → ZIP serialization → temporary write → safe replace.
- Consider scoped lookup maps and caches for repeated header/ID calculations **only when** ordering, Unicode comparisons, duplicates and match priorities remain exactly the same.
- Reduce unnecessary JSON cloning and temporary allocations; do not change `serde_json` schema or frontend payloads.
- Avoid redundant read/write **within one operation** if safe. Do not cache a workbook across independent operations where Excel/another process can change it. Any proposed long-lived cache needs fingerprint/revalidation/concurrency tests and must remain off by default.
- Evaluate converting blocking Excel Tauri commands to `async fn` + `tauri::async_runtime::spawn_blocking`, preserving command names, JSON contracts, `State` ownership, error mapping, concurrency and locks.
- Do not swap `umya-spreadsheet`/ZIP engines or use “fast save” paths that can drop formatting or formulas without exhaustive round-trip coverage.

### 4.3. Word and Templates

- Profile template/recent scanning, DOCX opening/saving, and editor initialization; separate filesystem, parser/editor and render time.
- Assess dynamic `import()` and route-level lazy loading so Word editor/WASM/assets load when first needed. Preserve module/asset URLs, SRI integrity and CSP for the **Tauri local origin**. Never remove integrity checks or weaken CSP to mask load errors.
- Navigating away from Word must not destroy mounted documents/tabs when currently preserved; retain unsaved edits, undo history, Ctrl+O, multi-tab behavior, save paths and template-copy workflow.
- Prefetch only when it does not delay first usable UI or produce observable regressions.

### 4.4. React and frontend

- Use React Profiler/timelines to locate expensive renders. Apply `memo`, `useMemo`, and `useCallback` selectively, with correct dependencies and no stale state.
- Move heavy filtering, sorting or aggregation off keystroke hot paths only when users see identical ordering and updates.
- Virtualize large tables **only if** keyboard navigation, focus, selection, clipboard behavior, row heights, scroll position and accessibility remain equivalent; otherwise skip it.
- Reduce IPC round trips or intermediate payloads only if requests/results, loading states, errors, cancellation and consistency stay intact.
- Analyze locally generated Vite chunks for waterfalls; do not assume code splitting is always faster. Do not compare development HMR timings with production startup as though they were equivalent.

### 4.5. Rust / Tauri / storage / startup

- Profile the critical path to a usable UI: config loading, menu/plugin registration, filesystem checks, synchronous calls. Defer non-critical work until after first paint **only if** behavior remains unchanged.
- Reduce long lock hold times around disk/CPU work without changing ordering or introducing races. Use bounded blocking work and avoid resource oversubscription.
- Inspect Cargo profiles, feature flags and Vite output for analysis/local frontend verification only. Do not remove devtools/menu behavior or mutate release behavior as part of a performance shortcut.
- Do not change app version, updater endpoints, release workflows, signing, installer, icons, or distribution settings.

## 5. Execution order and rollback rules

1. Produce a prioritized bottleneck list backed by numbers: specific file/function, root cause, proposed change and risk.
2. Make **small, independently reviewable modifications**, starting with low-risk/high-impact areas. Avoid unrelated cleanups and broad refactors.
3. Add regression coverage **before** modifying important data paths.
4. Run focused tests and microbenchmarks after each change. If results regress, revert **only changes introduced by the agent**, not pre-existing user work.
5. Rerun end-to-end measurements and report backend, UI and startup outcomes separately, including RAM/CPU costs.
6. A target percentage never justifies weaker safety or incorrect results.

## 6. Local commands and prohibited operations

Illustrative Windows PowerShell commands — **inspect actual package scripts first**:

```powershell
# Local baseline and regression
npm.cmd ci
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run dev

# Rust checks/tests (not packaging)
cd src-tauri
cargo test
cargo check
```

`npm.cmd run web:build` may be used **only if needed for local Vite production-frontend analysis**; it does **not** package the desktop application. If the owner's “skip packaging” requirement is interpreted as no build commands at all, skip it and label production bundle validation as unverified. **Never execute** `tauri build`, `npm run tauri build`, `cargo tauri build`, portable/NSIS/MSIX packaging, signing or publishing. **Never execute** `git push`, `git tag`, `gh release`, workflow dispatch or create commits without permission. Read-only `git status`, `git diff`, `git log` are allowed.

Do not execute any script that implicitly publishes or packages. Do not edit release CI/workflows or bump versions.

## 7. Definition of done and benchmark targets

**Mandatory:** all previously passing tests still pass, new tests pass, UI/UX and business results remain identical, data/API remain compatible, no loss/unauthorized overwrite, no introduced races/corruption, prolonged UI blocking or significant memory regressions. Report pre-existing test failures separately.

**Illustrative, not guaranteed targets:** startup ≥30% faster, PDF scan 20–40% faster, Excel import/save 20–35% faster **where genuine bottlenecks exist**. Do not cherry-pick runs or present estimates as achieved results. If measured gain is uncertain, keep the safe implementation and document what was not improved.

**Speedup formula:** `(median_before - median_after) / median_before * 100%`. Report median, p95, sample size, hardware, workload and conditions, with stability and CPU/RAM effects.

## 8. Required local handoff artifacts

- Per-file/function change log: bottleneck, change, justification, safety analysis, tests, risks.
- Before/after benchmark matrix: workload, measurement method, median/p95, iterations, measured CPU/RAM if available and confidence notes.
- Output of `npm test`, TypeScript, `cargo test`, `cargo check` and relevant manual checks; identify blocked/skipped checks and reasons.
- Description of the actual code edits, ideas intentionally not implemented, and targeted rollback instructions.
- List of locally changed files and final `git status --short`.
- Remaining failures, limitations, regression risks and **manual acceptance tests the owner should run**.
- Explicit final line: **“Local optimization/testing only. No packaging, GitHub push, version bump, tag, or release performed.”**

## 9. Stop point and owner's approval

Stop after source modifications and feasible **local-only** testing. Do not produce packaged `.exe`, publish to GitHub, change version or create a release. Packaging, push and release must be handled as a **separate phase** only after the owner independently tests and explicitly requests it. If tests fail or evidence is inconclusive, **do not claim completion**; state the exact status and limitations.

## 10. Ready-to-use agent prompt

> Read `B6H-Local-Performance-Optimization.en.md` and its Vietnamese counterpart in full. Inspect the current repository and obtain a repeatable baseline before editing. Implement small, safe, measured performance improvements across PDF/Excel/Word and React/Tauri. Preserve 100% of business behavior, data, file outputs, settings, APIs, UI/UX and workflows. Add regression tests and perform local tests. Report every change, before/after benchmarks, pass/fail status and unresolved risks. **LOCAL ONLY: no packaging, no GitHub push, no version bump, no tags, no releases, and no automatic commits. Stop so I can personally test and authorize the next phase.**
