# B6H

Windows desktop utility for previewing and safely copying eligible PDFs into Backup and Output folders. Original PDFs are never renamed or deleted. It scans only direct children of the chosen folder; nested folders and unrelated PDF names are ignored.

## Development

Requires 64-bit Windows, Node.js 20 or newer, and npm. Run `npm install`, then `npm run dev`. `npm test` runs isolated temporary-folder checks. `npm run build` type-checks the UI and creates a standalone Windows portable `.exe` in `portable-package/`; end users can launch that file without installing the app or Node.js.

The app uses a small Electron IPC bridge with context isolation and no renderer Node access. PDF naming, grouping, missing-number detection, and copying run in the local Node process; no network is needed at runtime. Choose a writable data folder rather than the installation folder.

## Workflow and safety

Scan, choose one group or merge all groups, enter the new base name, and preview. Group selection shows the expected sequence count and missing-number count, following `demso.bat`. Preview does not write files. Run asks for confirmation, rescans file sizes/timestamps, creates a previously unused matching Backup/Output run folder, copies and size-checks every original into Backup, then writes mapped Output copies only if backup completes. Output copy failures remove only a partial target from that failed copy; other successful files and all backups remain. A UTF-8 Vietnamese report records the completed mappings and errors.

Backup and Output locations default to `Documents/B6H/Backup` and `Documents/B6H/Output`. Edit either location on the final review page; selections are stored in the app's local user settings and restored next time. Each run creates a numbered, dated subfolder so it will not overwrite an earlier run.

The portable executable runs a packaged Electron app and does not change Windows execution policy. The original BAT invokes PowerShell with `-ExecutionPolicy Bypass` for its embedded script; this app does not invoke that BAT or PowerShell.

## Updates

Use **Window → Check for updates** to check the latest GitHub Release. When a matching portable executable is attached, the app downloads it and replaces the currently running copy after the portable launcher exits. **Window → Install update from file** accepts a replacement portable `.exe`. A rollback copy is kept until the updated app opens successfully. Settings remain under the user's AppData folder across portable updates. Name release assets `B6H-<version>.exe`; the updater also recognizes the older `SAFE-PDF-RENAME-<version>.exe` names.

## Publishing a release

The Windows portable release workflow runs when a version tag is pushed. Update the `version` in `package.json`, commit and push the changes, then push the matching tag (for example, `v1.0.2`). GitHub Actions runs `npm test`, builds the portable `.exe`, and attaches it to a GitHub Release. The tag must match the package version. The workflow uses the repository's built-in `GITHUB_TOKEN`; no extra secrets are required.

## Limits

The algorithm follows the supplied BAT's filename and numbering rules. It does not inspect PDF contents. Windows path lengths at or above 260 characters are rejected. A source can still change in the tiny interval between freshness check and copy; exclusive destination creation prevents overwriting existing files.
