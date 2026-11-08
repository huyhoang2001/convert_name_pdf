# Local Performance Baseline

Captured before the optimization changes on branch `main`, commit `abb7e6f`. The worktree already contained the reference-number report edits and unrelated untracked files; they were preserved.

## Environment

- Windows 11 Pro, build 26200; Intel Core i7-10610U (4 cores / 8 logical processors), 20.7 GB RAM.
- Node 24.21.0, npm 11.19.0, Rust/Cargo 1.99.1.
- C: is a local NTFS volume (254.9 GB); physical media type was unavailable.

## Checks

- `npm.cmd test`: 77 passed, 0 failed (9.04 s).
- `cargo test`: 29 passed, 0 failed (2.28 s test time; initial compile 40.94 s).
- `npx.cmd tsc -b --pretty false`: passed.
- `cargo check`: passed (14.57 s initial compile).
- Wordcraft asset integrity check: passed.

## Frontend artifact

Built the current source into an isolated temporary output directory; the repository `dist` directory was not overwritten. Vite transformed 516 modules.

| Artifact | Minified bytes | Gzip bytes |
|---|---:|---:|
| Initial JS entry | 6,113,020 | 1,880,610 |
| CSS | 128,910 | 23,070 |

ExcelJS is statically imported by the app shell and Signature screen and included in the initial entry. This is bundle-size evidence only; startup-to-usable-UI was not measured.

## Runtime workload limits

No synthetic PDF, XLSX, or DOCX workload timings were captured before the code changes. There are no operation median/p95, CPU, or memory figures. The native app was not launched for an interactive responsiveness measurement. Do not treat this document as proof of a runtime speedup.
