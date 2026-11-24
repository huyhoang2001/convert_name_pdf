# B6H

B6H is a Windows desktop app for local PDF, spreadsheet, document, calendar, and task workflows. It uses a React and TypeScript interface with a Tauri 2 and Rust backend. The UI is available in English and Vietnamese, with light and dark themes.

## Workspaces

| Workspace | What it does |
| --- | --- |
| Home | Opens the app’s workspace selector. |
| Calendar & To-do | Manages tasks and events in Board, Calendar, and Timeline views. |
| Copies | Maintains certified-copy registers and Excel workbooks. |
| Count number | Scans numbered files and reports gaps by group. |
| Rename PDFs | Previews numbered PDF renames and creates verified Backup and Output copies. |
| Settings | Configures language, theme, folders, register labels, chat access, and Word options. |
| Signature authentication | Maintains signature records and Excel registers. |
| Translation | Creates, imports, edits, and saves translation Excel registers. |
| Word & Templates | Opens DOCX files, edits documents, manages templates, and saves managed copies. |

The sidebar keeps Home first and Calendar & To-do immediately after it; the remaining workspaces are sorted alphabetically. Choose a workspace in the sidebar; use the sidebar control at the bottom to expand or collapse it.

## Calendar & To-do guide

### Views and navigation

- **Board** groups tasks by To Do, In Progress, In Review, and Done. Move a task with its status control or by dragging it between columns. Each column keeps its cards inside the column and scrolls when needed.
- **Calendar** shows tasks and events by date. Month cells show up to three items at once; week and day cells show up to eight. Additional items can be reached by scrolling within the date cell. The item scrollbar is visually hidden.
- **Timeline** places tasks and events on a date grid and shows workflow status and stage progress.
- Use **Today**, the previous/next controls beside the mini-calendar, and the Day, Week, or Month scale control to navigate. The mini-calendar can be hidden and restored without losing access to period navigation.
- Search and the toolbar filters narrow the displayed records. Category checkboxes in the sidebar are for selecting categories to recolor; use the toolbar category filter to filter records.

### Tasks and events

Use **+ Task/Event** to open the editor, then choose the Task or Event tab. Add a title, notes, category, dates, times, reminder, recurrence, priority, and checklist entries as needed. Save to keep the record. Empty, untouched drafts can be closed without a discard prompt; edited drafts ask before discarding.

Task statuses progress through To Do, In Progress, In Review, and Done. Priority is independent of status. A task or event can be reopened by changing its status; this updates the same record rather than creating a duplicate. Start date and time become locked after completion, while end date and time remain editable.

When a task is marked Done, B6H records the completion time and status transition history. A completed task remains in the Board’s Done column for 72 hours from its latest completion, then is hidden from the Board without being deleted. Reopening and completing it again starts a new 72-hour period. Completed tasks and events remain available in Calendar and Timeline history. Legacy completed records without a trustworthy completion timestamp use a separately identified observation time for the initial Board visibility window.

Unfinished tasks and events keep their workflow status after the due date. B6H shows localized due-today, due-soon, and overdue warnings on Board cards, Calendar, Timeline, and item details. Date-only deadlines become overdue at local midnight after the due date; timed events become overdue at their existing end time. The Board’s Overdue filter and count include unresolved items carried forward from earlier year partitions without moving or duplicating their records. Mark an item Done or reschedule its due date to clear its overdue warning.

### Categories and backups

Create categories in the mini-calendar sidebar. The category list keeps its heading and add controls visible and scrolls its rows after five. The Accent palette sets the color for new categories or recolors selected categories. Rename preserves a category’s color; confirmed deletion removes the category and leaves its associated records uncategorized. The toolbar category filter remains separate from category recoloring selection.

Use **Export backup** and **Import backup** in the Calendar toolbar to save or restore Calendar JSON data, including category colors and task/event metadata. Keep a backup before replacing data with an imported file.

## Signature Authentication guide

Signature registers retain their imported STT values and gaps. Auto mode continues above the highest established STT; Manual mode can enter an unused number, including a gap. New records appear in STT order, fill an empty canonical Excel slot when available, and keep confirmed duplicates beside their group. After adding a record, the table scrolls to and highlights it. A duplicate prompts before insertion, and matching rows stay grouped and highlighted. Authenticated-document text preserves line breaks and is written in uppercase. Previously used documents can be selected from suggestions; search matches are highlighted in the table. Excel output uses 14-point register text and `dd/mm/yyyy` dates.

## Safety and local data

B6H stores settings and application data under `%APPDATA%\SAFE PDF RENAME`. Calendar data is JSON (`calendar.json`); no database engine is required. Calendar range queries limit the records sent to the interface while preserving older records in the JSON file. Existing records are not removed when they leave the Board’s 72-hour Done window.

PDF scanning examines files directly inside the selected folder. Rename PDFs requires a preview and confirmation, verifies Backup copies before creating Output copies, and does not overwrite existing output files. Original PDFs are not renamed or deleted. Spreadsheet saves can update the selected workbook, so keep a separate copy of important workbooks.

The in-app help works offline by default. Optional online help uses OpenRouter. Configure a key in Settings; it is stored in Windows Credential Manager. During development, `OPENROUTER_API_KEY` may be read from the environment or a `.env` file. Questions sent to online help are sent to OpenRouter.

## Install and use

Download the current-user Windows x64 installer from [GitHub Releases](https://github.com/huyhoang2001/convert_name_pdf/releases/latest). Verify its SHA-256 checksum against the sidecar published with the installer before running it. The installer and uninstaller use the B6H logo and install without administrator access. The lightweight Setup downloads Microsoft's WebView2 bootstrapper if WebView2 is missing, so internet access may be required.

The current maintenance release is B6H v3.0.4. See the release notes for its component changes.
The v3.0.7 main release is a candidate; see its planned changes in `RELEASE_NOTES.md`.

The free installer is not signed with a commercial Authenticode certificate. Windows may show an unknown-publisher or SmartScreen warning; verify the download came from this repository's official release and matches its SHA-256 before choosing to run it. See [installation and updates](docs/INSTALLATION.md) for details. B6H checks the latest stable GitHub release for cryptographically signed modular updates.

## Development on Windows

### Requirements

- Node.js 24 and npm
- Rust stable MSVC toolchain (Rust 1.90 or newer)
- Visual Studio C++ build tools
- Microsoft Edge WebView2 Runtime

### Install and run

From the repository root in PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

The Tauri development command starts the frontend and desktop application. For browser-only frontend work, `npm.cmd run web:dev` starts Vite.

### Checks

```powershell
npm.cmd test
npm.cmd run web:build
cargo test --manifest-path src-tauri/Cargo.toml -- --test-threads=1
```

`npm.cmd test` runs the Node test suite. `npm.cmd run web:build` checks the bundled Wordcraft assets, type-checks TypeScript, and builds the frontend. `cargo test` runs Rust tests. The `native:smoke` and `wordcraft:webview2-smoke` scripts are available for local Windows smoke checks where their platform requirements are met.

`npm.cmd run wordcraft:build` validates and reuses the existing `public/wordcraft` runtime without compiling or synchronizing it. Source-to-runtime provenance is recorded only after a source build passes bundle validation; existing runtime assets without that evidence remain unlinked. Ordinary `build`, `web:dev`, and Tauri frontend hooks do not compile Wordcraft. `npm.cmd run wordcraft:source-build` fingerprints the current checkout, bridge patch, recipe, and toolchain before reusing or rebuilding in `wordcraft-upstream/target`.

Wordcraft Cargo cache builds stop before compilation when the target plus a conservative 3 GiB growth allowance would exceed `B6H_WORDCRAFT_TARGET_LIMIT_GIB` (default 16 GiB). Inspect cache categories with `npm.cmd run wordcraft:cache`; it is dry-run only. `npm.cmd run wordcraft:cache -- --apply` offers only Cargo incremental directories and requires an interactive typed confirmation. Dependency artifacts, fingerprints, build scripts, and runtime assets are never selected for cleanup.

## Project layout

| Path | Role |
| --- | --- |
| `src/ui.tsx`, `src/main.tsx` | App shell, sidebar, workspace routing, and React entry point. |
| `src/CalendarWorkspace.tsx`, `src/calendar.css` | Calendar and task UI, calendar state, and styling. |
| `src/desktop/api.ts` | Typed frontend bridge to Tauri commands and desktop APIs. |
| `src/word/` | Word editing, DOCX handling, templates, and document utilities. |
| `src/locales/` | English and Vietnamese interface strings. |
| `src-tauri/src/` | Rust commands and native PDF, spreadsheet, storage, chat, and update logic. |
| `public/wordcraft/` | Bundled Wordcraft editor assets and hosting/attribution notes. |
| `tests/` | Node-based unit and regression tests. |
| `docs/performance/` | Local performance baselines and optimization results. |

Calendar data uses the existing JSON storage path and Tauri commands for full reads/writes, range queries, and incremental saves. Backup import/export uses the Calendar JSON data format; optional category colors and completion metadata are retained when present, while older files remain supported.

The generated architecture map is in `graphify-out/graph.html`; the plain-language report is `graphify-out/GRAPH_REPORT.md`, and `graphify-out/callflow.html` shows module call flows. On this Windows host, refresh the code map with `python -m graphify extract . --code-only --cargo --force --mode deep --no-gitignore --out .` and `python -m graphify cluster-only . --no-label`. The source scope is controlled by `.graphifyignore`. These generated files are for development and are not needed to run B6H.

## Release workflow

The Windows Installer + Modular Update workflow is defined in `.github/workflows/release.yml`. It runs regression checks, builds the logo-branded x64 Setup with the production update trust root, and creates a draft release. The release maintainer attaches the Ed25519-signed catalog and update artifacts before publishing. See [developer release maintenance](docs/DEVELOPER_RELEASES.md). The Setup is intentionally unsigned by Authenticode; its SHA-256 is published beside it.
