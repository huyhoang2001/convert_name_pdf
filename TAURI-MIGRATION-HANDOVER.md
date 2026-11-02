# B6H Tauri 2 migration handover

## Run locally

On Windows, install Node.js, Rust's stable MSVC toolchain, Visual Studio C++ build tools, and the WebView2 runtime. From this repository:

```powershell
npm ci
npm run dev
```

`npm run dev` starts Vite and the Tauri desktop window. On this machine, Cargo is at `C:\Users\hinmae\.cargo\bin`; add that directory to `PATH` if `cargo` is not found. The first native build takes longer because it compiles Tauri and WebView dependencies.

Run the checks with:

```powershell
npm test
npm run web:build
cd src-tauri
cargo test --lib
cargo check
```

For the native bridge smoke test, start `npm run dev` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and a disposable `APPDATA`/`LOCALAPPDATA` directory, then run `npm run native:smoke` in another terminal. The script creates its own temporary PDFs and workbook.

No desktop package has been made. The app source is React + Tauri; the obsolete Electron source and its tests have been removed. Node.js remains a build and test tool, not a desktop runtime.

## Bridge mapping

The React entry point installs the typed `window.pdfApp` adapter in `src/desktop/api.ts`. The UI, CSS, translations, and pure TypeScript logic remain in `src/`. All file access and network requests used by the desktop bridge go through Tauri commands in `src-tauri/src/lib.rs`.

| Desktop concern | Tauri implementation |
| --- | --- |
| Folder/file dialogs, file drop | Tauri dialog plugin, native window drag/drop event |
| Destinations, language, theme, register labels, translation cache | `storage.rs` commands; `%APPDATA%\SAFE PDF RENAME` |
| PDF scan, preview, run, report, open result | `pdf.rs` and guarded commands in `lib.rs` |
| Count scan and report | `count.rs` |
| Translation, signature, Copies workbook import/create/save/export | `workbook.rs` using `umya-spreadsheet` |
| Online chat and key status | `chat.rs`, Windows credential store, streamed Tauri events |
| Check/update status and portable replacement | `update.rs`, Tauri events, `update-helper.vbs` |
| Native menu and window controls | Tauri menu in `lib.rs` |

The Rust PDF workflow uses one-use preview tokens, checks source size and timestamps again before copying, creates new output files exclusively, and finishes verified Backup copies before starting Output. Translation, Signature, and Copies workbook saves overwrite the imported workbook without making a backup copy. Rebuilt register sheets format the full generated data matrix using explicit row/column bounds, auto-fit columns before row heights, and retain table filters without applying an Excel table style; merged title rows do not limit the fitted range. Unrelated worksheets are preserved. Existing JSON settings/register files keep their shape; before the first Tauri write to each file, the original is copied to a `.json.b6h-electron-backup` sibling. The older `%APPDATA%\safe-pdf-rename` directory is not merged.

The old encrypted `openrouter-key.bin` is left untouched as user data and is ignored by Tauri. Online chat keys are stored in Windows Credential Manager, read back to verify the save, and reported as saved only after verification succeeds. The app can also use `OPENROUTER_API_KEY` from the environment or adjacent `.env` when no Settings key exists.

## Verification performed

| Check | Result |
| --- | --- |
| React and shared TypeScript tests | 28 passed, 0 failed |
| Rust unit and cross-runtime tests | 22 passed, 0 failed |
| TypeScript and Vite frontend build | Passed; Vite reported a large bundle warning |
| Tauri release executable build | Passed; `src-tauri/target/release/b6h.exe` built without an Electron runtime |
| Native Tauri development launch | Previously launched and responded on Windows; both languages, all seven screens, native menu, and folder dialog visually checked. A fresh isolated launch was blocked by WebView2 error `0x8007139F` in the automation session. |
| Disposable PDF workflow through running WebView | Scan, mapping, missing number, copy, report, source hashes, Backup before Output timestamps, and one-use token passed |
| ExcelJS → Rust → ExcelJS translation workbook | Register import/edit/save passed through the running app and Rust test; unrelated sheet value, formula, font/fill colors, merged cells, and protection passed |
| Signature and Copies workbooks | Create, import, edit, save, and refresh passed through the running app with disposable files |
| Copies workbook | Total formula/amount words passed in Rust test |
| Legacy JSON continuity | First-write backup and preservation of unrelated fields passed in Rust test |
| Count report | English/Vietnamese missing number output passed in Rust test; save and reopen passed in native smoke test |
| Chat/update rejection paths | Unsafe chat request rejected by the running app; malformed chat requests, version comparison, and invalid executable check passed in Rust tests |

Live OpenRouter responses were not tested because a key has not been configured for these checks. Native OS drag/drop and every keyboard shortcut were not automated in this pass. Portable update replacement and clean-machine WebView2 behavior remain unverified. Workbook validation covers representative ExcelJS files, not every advanced Excel feature; since workbook saves overwrite the imported file without a backup, keep a separate copy before saving any critical workbook.

Stop after local verification. Packaging, GitHub changes, commits, tags, and release work are outside this handover.
