# B6H Word workspace handover

The Word workspace uses the local DOCX Editor engine for OOXML editing. The supplied `doc.ico` is in `public/doc.ico`; the existing B6H shell, tools, themes, and languages remain in place. The Templates home background is white, and the editor has a compact toolbar, rulers, navigation/heading outline, centered paper, document tabs, and a live page indicator.

## Run locally

On Windows, install the project dependencies and start the Tauri development app:

```powershell
npm.cmd install
npm.cmd run dev
```

The machine needs the usual Tauri 2 Windows build prerequisites, Rust, and WebView2. Set the Templates and Word folders in **Settings → Word & Templates**. Defaults are `%USERPROFILE%\Documents\B6H\Templates` and `%USERPROFILE%\Documents\B6H\Word`; only the Templates folder root is scanned.

The app continues using `%APPDATA%\SAFE PDF RENAME\settings.json` and `word-library.json`. It backs up each existing data file before its first Tauri write. Online chat uses Windows Credential Manager; the old encrypted key file is ignored and left untouched. `%APPDATA%\safe-pdf-rename` is not merged.

## DOCX behavior

DOCX files are opened locally without Mammoth conversion. Before editing an imported file, B6H compares a no-change engine save against the source package. If structure, formatting, section settings, or untouched package parts change, or a used font is unavailable, the document stays read-only with the reason shown in the editor. The sample `(một người kí) chứng thực chữ ký.docx` passed this gate with Times New Roman available.

An imported source or Template is never overwritten. Its first Save writes a new managed copy at `<documentsDirectory>/<captured Template name>/<DD>/<MM>/<Document name>.docx`. Later saves update that copy; Save As creates another. The Rust layer validates DOCX packages and names, applies file-size limits, and uses exclusive creation / hash checks. Save and autosave errors leave editor content available for retry. Dirty tabs and window close offer Save, Don't Save, and Cancel.

DOCX is the only advertised format. The supplied sample verified the no-change package gate and a changed new copy: A4 page size, asymmetric margins, Times New Roman, Vietnamese text, paragraph formatting, and source SHA-256 remained correct. Basic text editing and the Save/autosave path were exercised. Files with unsupported package constructs are kept read-only whenever the no-change check detects changes. There is no collaboration, comments workflow, or page-number field insertion. The live page indicator is editor status only.

## Verification

Run the automated checks from the repository root:

```powershell
npm.cmd test
npm.cmd run web:build
& "$env:USERPROFILE\.cargo\bin\cargo.exe" test --manifest-path src-tauri/Cargo.toml
npm.cmd run native:smoke
```

Latest results:

- React and shared TypeScript tests: **28 passed**.
- TypeScript check and Vite frontend build: **passed**. Vite reports the editor bundle is large (~6 MB minified); it is a warning, not a build failure.
- Rust tests: **22 passed**.
- Existing native smoke: **passed**; PDF source hashes stayed unchanged, Backup preceded Output, and workbook flows passed.
- Word native smoke: `node scripts/word-fidelity-smoke.mjs` **passed** in the running Tauri app against the supplied DOCX. It verified both language labels, Word folder settings continuity, toolbar/rulers/page status, the no-change preservation gate, an edited new copy, A4 geometry, unchanged source hash, Save As, autosave, Save as Template, duplicate rejection/replacement backup, and the dirty-tab Cancel / Don't Save prompt. It writes only to the configured Word test folders.

To rerun the Word smoke, start the app with a disposable profile and WebView debugging enabled, then set its Word folders to a disposable path containing `b6h-word-verification` before running the script:

```powershell
$env:APPDATA = Join-Path $env:TEMP 'b6h-word-verification-manual'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
npm.cmd run dev
```

In **Settings → Word & Templates**, point both folders to disposable directories, then run `node scripts/word-fidelity-smoke.mjs` from another PowerShell window. The script locates the supplied sample by its filename prefix in `%USERPROFILE%\Downloads` and refuses to run unless the Templates folder is disposable.

## Source map and limitations

- `src/word/WordWorkspace.tsx`, `DocumentEditor.tsx`: Templates home, editor tabs, save/close flows, and editor integration.
- `src/word/docx.ts`: local fonts, blank A4 document, OOXML preservation gates, and base64 conversion.
- `src-tauri/src/word.rs`: scoped Word file operations, DOCX validation, and local font loading.
- `tests/word-roundtrip.test.mjs`, `scripts/word-fidelity-smoke.mjs`: DOCX safety and local app checks.

The native OS file chooser was not automated. No Microsoft Word/LibreOffice visual render comparison was run, so pixel-identical layout should not be claimed. Portable self-update replacement and clean-machine WebView2 behavior need packaged-app verification later. No `.exe` was packaged, and there was no GitHub update, commit, push, tag, or release.

The source is ready for your own verification. I will stop here and wait for your result.
