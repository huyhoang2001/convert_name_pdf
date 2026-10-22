# React Desktop for Windows --- AI Coding Agent Specification

## 1. Project objective

Build a traditional Windows desktop application that replaces the
interactive console UI of `doi_ten_moi_2210.bat` with a React UI while
preserving the existing PDF rename/copy algorithm and safety behavior.

The first supported tool is the supplied `doi_ten_moi_2210.bat` ("SAFE
PDF RENAME - V10 FREE NAME NUMBER RULE").

Deliver a working Windows desktop project using Electron + React +
Node.js, with a build configuration that can package the app as a
Windows installer or `.exe`.

## 2. Non-negotiable requirements

1.  **Preserve algorithm semantics.** Do not casually rewrite the
    numbering, grouping, gap detection, merge offsets, naming rules,
    backup, output, or log behavior. Extract/refactor the embedded
    PowerShell core as needed, but retain its logic and validate parity
    against the original `.bat`.
2.  **Replace console prompts with UI.** No `Read-Host`, `Pause`,
    `Clear-Host`, or interactive console prompts in the normal desktop
    workflow.
3.  **Never mutate or delete source PDFs.** The original `.bat` copies
    source files into Backup and Output folders; it does not rename or
    delete source files. Keep that behavior.
4.  **Preview before execution.** Show the selected source group(s),
    proposed output filenames, missing sequence numbers,
    duplicate-number warnings, and any preflight errors before allowing
    execution.
5.  **Explicit execution.** Do not perform file copies just because a
    folder is selected or a preview is generated. Require the user to
    press a clearly labeled Run button.
6.  **Safe process execution.** Do not build shell command strings from
    user-controlled input. Invoke PowerShell using a fixed executable
    and argument array; validate all paths and values. Never expose
    arbitrary command execution in the UI.
7.  **Accurate progress and errors.** Show scan, validation, backup,
    output-copy, and report-writing stages. Report errors to the user
    and preserve a detailed log.
8.  **No network requirement.** The core workflow should work offline.
9.  **Windows first.** Support modern 64-bit Windows. Handle paths with
    spaces and Unicode/Vietnamese names correctly.

## 3. Recommended technology

-   Electron (desktop window and main process)
-   React + Vite (renderer/UI)
-   Node.js (orchestration, file dialogs, process lifecycle)
-   PowerShell (the existing algorithm)
-   TypeScript is preferred for the Electron bridge and React
    application.
-   A maintained Electron packaging tool such as `electron-builder` for
    Windows packaging.
-   Unit tests for naming/numbering rules and integration tests in
    temporary directories.

Use a secure Electron configuration: - `contextIsolation: true` -
`nodeIntegration: false` - expose a narrow API through `preload` using
`contextBridge` - validate IPC payloads in the main process - do not
expose `child_process`, filesystem APIs, or unrestricted shell execution
to the renderer.

## 4. Suggested project structure

``` text
react-desktop/
  electron/
    main.ts
    preload.ts
    ipc/
      pdfRenameHandlers.ts
  src/
    app/
      App.tsx
    components/
      FolderPicker.tsx
      GroupTable.tsx
      RenameOptions.tsx
      PreviewTable.tsx
      ProgressPanel.tsx
      RunSummary.tsx
      LogViewer.tsx
    services/
      pdfRenameApi.ts
    styles/
      windows.css
  backend/
    pdf-rename/
      pdf-rename.ps1
      contract.schema.json
  tests/
    unit/
    integration/
  package.json
  electron-builder.yml
  README.md
```

The exact file layout may vary, but keep UI, Electron IPC, and
PowerShell core separated.

## 5. Existing `.bat` behavior to preserve

### 5.1 Scan scope and eligible filenames

-   Scan **only PDF files directly inside the selected root folder**. Do
    not recurse into parent or child folders.
-   Extension matching is case-insensitive (`.pdf` and `.PDF` both
    count).
-   A filename is eligible when its stem is either:
    -   digits only, e.g. `1.pdf`, `20.pdf`, `200.PDF`; or
    -   `<prefix>_<digits>`, where the final underscore separates the
        numeric suffix, e.g. `12_118.pdf`, `SCC_2020_001.pdf`,
        `ABC_XYZ_001.PDF`.
-   For prefixed names, the source prefix includes the final underscore.
    For number-only names, the source prefix is empty and should be
    displayed as `[SO THUAN: 1.pdf, 2.pdf, ...]` or a localized
    equivalent.
-   Ignore PDFs that do not match either naming form; show the number of
    ignored files in the UI if practical.
-   Sort groups by prefix and files within a group by numeric value,
    then filename.
-   For each group, calculate minimum number, maximum number, and PDF
    count.
-   If there are no eligible PDFs, show a clear empty state and do not
    create Backup/Output folders.

### 5.2 Group selection

-   Show each discovered prefix as a selectable group, with MIN, MAX,
    and PDF count.
-   Support selecting one group ("SINGLE" mode).
-   If more than one group exists, offer "MERGE ALL GROUPS" ("MERGE"
    mode).
-   Merge order must match the displayed group order (prefix-sorted
    order), not an arbitrary filesystem order.
-   In merge mode, each group consumes its full numeric span
    (`max - min + 1`) when calculating the next group's starting number.
    This preserves gaps between groups and the original offset behavior.

### 5.3 New-name input rules

Accept a free-form base name, with or without a trailing `.pdf`
extension. Remove one final `.pdf` suffix case-insensitively before
parsing.

-   Digits only, e.g. `123`: use number-only naming, producing
    `123.pdf`, `124.pdf`, etc. The new prefix is empty.
-   Pattern `<prefix>_<digits>`, e.g. `123_123` or `SCC_2020_005`:
    preserve the prefix including the final underscore and use the
    supplied number as the start.
-   Any other non-empty input, e.g. `HoSo`, `ABC-XYZ`, or `SCC_2020_`:
    use that prefix; append `_` if it does not already end with `_`;
    start numbering at 1.
-   Format generated non-negative numbers with at least three digits
    (`001`, `002`, `123`); numbers 1000 and above are not truncated.
    Number-only inputs use the same formatting rule.
-   Reject empty input, a numeric start that cannot fit in a signed
    64-bit integer, invalid Windows filename characters
    (`\\ / : * ? " < > |`), and prefixes ending in a space or period.
-   Validate generated names and paths, not just the user's raw input.

### 5.4 Number mapping and missing numbers

-   For single-group mode, map each source number `N` to
    `newStart + (N - groupMin)`.
-   For merge mode, process groups in displayed order. Start each group
    at `newStart + cumulativeSpanOffset`; within a group map `N` to
    `groupStart + (N - groupMin)`.
-   The cumulative offset increases by each group's full span
    (`groupMax - groupMin + 1`), not by its file count.
-   Compute missing numbers within each group's inclusive MIN--MAX
    range. In merge mode, report missing numbers using the corresponding
    mapped target number.
-   Detect duplicate numeric values within a source group and duplicate
    target filenames across the complete mapping. These are preflight
    errors and must block copying.
-   Preserve the existing delta summary semantics (`N`, `N+K`, `N-K`)
    for single mode and per-group delta detail for merge mode.

### 5.5 Backup, output, and logging

-   Generate date suffix using local date format `dd_MM_yyyy`.
-   Choose the first available matching numbered pair:
    -   `01_backup_dd_MM_yyyy` and `01_output_dd_MM_yyyy`
    -   then `02_...`, etc.
-   Only use an index if **both** corresponding directories do not
    already exist. Never overwrite an existing file or folder.
-   Create the Output directory to store the report. Do not copy PDFs if
    preflight has errors.
-   If preflight passes, create Backup and copy each original PDF into
    it using the original filename. Verify the backup exists and has the
    same byte length as the source.
-   Only if every backup copy succeeds, copy each source PDF into Output
    under its mapped target filename. Verify existence and byte length.
    Do not delete or modify source files.
-   If any backup copy fails, do not start copying PDFs to Output.
    Record the failure.
-   If an output copy fails, remove only the partial target file created
    by that failed operation, record the error, and continue/finish
    according to a clearly documented policy consistent with the current
    script.
-   Write `Kết quả đổi tên.txt` in Output, encoded UTF-8 without BOM if
    preserving the current report format.
-   The report should contain original MIN/MAX, total PDFs, unique
    source numbers, missing-number count/list, representative successful
    mappings, source group/prefix, new prefix, original user input,
    delta summary, merge details, and errors.
-   The UI should show the report and provide "Open Output Folder" and
    "Open Report" actions. Opening paths must use safe, validated OS
    APIs.

## 6. Desktop UI requirements --- traditional Windows style

Use a compact, practical Windows utility layout rather than a
marketing-style dashboard.

### Main window

-   Standard title bar and resizable window.
-   Suggested title: `SAFE PDF RENAME`.
-   Neutral light theme, familiar form controls, restrained borders,
    clear labels, keyboard navigation, and visible focus indicators.
-   Support Vietnamese UI text and Unicode filenames.
-   Suggested default window size: approximately 1000 × 700, with a
    sensible minimum size.

### Main screen layout

1.  **Folder section**
    -   Read-only path field.
    -   `Browse...` button using a native directory picker.
    -   `Scan Folder` button.
    -   Explain that only PDFs directly inside this folder are scanned.
    -   For the first version, default to the folder containing the
        packaged tool only if that folder is a valid, writable
        user-selected working folder; otherwise require the user to
        choose a folder. Do not assume the app installation directory is
        writable.
2.  **Source groups section**
    -   Table columns: Select, Source Prefix, MIN, MAX, PDF Count.
    -   Single-group selection.
    -   Separate `Merge All Groups` option only when at least two groups
        are present.
    -   Show an empty state when no eligible files are found.
3.  **New name section**
    -   Text field for the desired starting name.
    -   Inline examples of the three naming rules.
    -   Inline validation messages; do not use repeated modal dialogs
        for ordinary validation.
4.  **Preview section**
    -   Table columns: Source File, Target File, Source Number, Target
        Number, Group.
    -   Show total mappings and missing numbers.
    -   Make it clear that Preview does not copy, rename, or delete any
        files.
    -   For large directories, paginate or virtualize rows and avoid
        rendering an unbounded table in one pass.
5.  **Actions**
    -   `Preview` (safe, no writes except optional transient application
        state).
    -   `Run` (disabled until validation/preflight passes and preview is
        current).
    -   `Cancel` while running, if cancellation can be implemented
        safely.
    -   `Open Output Folder`, `Open Backup Folder`, and `Open Report`
        after a run.
    -   Require a confirmation before starting file copies, summarizing
        source folder, file count, output naming, and backup
        destination.
6.  **Progress and results**
    -   Stage indicator: Scanning → Preview/Validation → Backup → Output
        Copy → Report.
    -   Progress count where determinable.
    -   Scrollable log panel with timestamp, level, and message.
    -   Final summary with success/warning/error status and paths.
    -   Never claim a file operation succeeded until the backend
        verifies it.

## 7. Backend integration contract

Refactor the embedded PowerShell section into a non-interactive
PowerShell script or module while retaining its core algorithms. The
`.bat` can remain as a compatibility launcher if desired, but the
desktop app should call the non-interactive backend directly.

Recommended backend operations:

### `scan`

Input:

``` json
{
  "operation": "scan",
  "rootPath": "C:\\path\\to\\pdfs"
}
```

Output (illustrative schema; values are runtime data):

``` json
{
  "ok": true,
  "rootPath": "C:\\path\\to\\pdfs",
  "groups": [
    {
      "prefix": "SCC_2020_",
      "min": 1,
      "max": 12,
      "pdfCount": 10,
      "files": [
        {
          "fileName": "SCC_2020_001.pdf",
          "number": 1,
          "sourcePath": "C:\\path\\to\\pdfs\\SCC_2020_001.pdf"
        }
      ]
    }
  ],
  "ignoredPdfCount": 0,
  "warnings": []
}
```

### `preview`

Input:

``` json
{
  "operation": "preview",
  "rootPath": "C:\\path\\to\\pdfs",
  "mode": "SINGLE",
  "selectedPrefixes": ["SCC_2020_"],
  "newName": "HoSo"
}
```

Output should include: - normalized name/prefix and starting number -
source-to-target mappings - missing-number list and count - group-level
merge details - duplicate source-number and duplicate target-name
errors - target path length errors - proposed Backup/Output paths - a
unique scan/version token or equivalent to prevent running a stale
preview after files have changed

### `run`

Input:

``` json
{
  "operation": "run",
  "rootPath": "C:\\path\\to\\pdfs",
  "mode": "SINGLE",
  "selectedPrefixes": ["SCC_2020_"],
  "newName": "HoSo",
  "previewToken": "opaque-token-from-preview"
}
```

Output/events should report: - stage transitions - per-file
backup/output progress - warnings and errors - final report path and
Backup/Output paths - final counts

Use newline-delimited JSON (one JSON object per line) on stdout for
machine-readable events, or use separate structured result files. Send
diagnostic text to stderr. Do not mix free-form console prompts or
`Write-Host` output into the JSON stream.

The contract above is illustrative; define and document the final schema
consistently. Validate all incoming fields in Node.js and again where
needed in PowerShell. Treat renderer input as untrusted.

### Process lifecycle

-   Spawn PowerShell using `child_process.spawn` with a fixed
    executable, fixed script path, and argument array; do not
    interpolate the user's name or path into a shell command string.
-   Use
    `-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script>`
    only as needed for the packaged script. Explain the execution-policy
    choice in README and avoid changing machine-wide policy.
-   Handle stdout/stderr incrementally, UTF-8 output, process exit
    codes, unexpected termination, and cancellation.
-   Prevent concurrent runs against the same root folder.
-   On cancellation or failure, report exactly which files were
    completed. Do not delete backups or unrelated files as automatic
    cleanup.
-   Do not expose arbitrary PowerShell commands through IPC.

## 8. Safety and correctness details

-   Resolve the selected root path to an absolute path and ensure it
    exists and is a directory.
-   Use literal paths; handle spaces, Vietnamese characters, and Unicode
    normalization carefully.
-   Before a run, rescan or verify the preview token and source file
    metadata (at minimum existence and size; timestamps or hashes may be
    added) so a stale preview cannot silently process changed files.
-   Reject source/output path collisions and duplicate destination
    names.
-   Never overwrite a destination. Use create-new semantics where
    possible.
-   Use exclusive file creation or equivalent checks to avoid races;
    document remaining race limitations.
-   Avoid following reparse points or symlinks outside the selected root
    when scanning. The algorithm scans only direct children.
-   Do not assume a file extension indicates a valid PDF; the existing
    script uses extension and filename parsing rather than validating
    PDF contents. Preserve that behavior unless a separate explicit
    PDF-validation option is added.
-   A file-size comparison matches the original script's verification
    behavior; stronger verification (e.g. SHA-256) may be added without
    changing naming semantics.
-   Keep logs free of secrets. Paths and filenames are expected to
    appear in local logs.

## 9. Test plan and acceptance criteria

Create temporary test folders and test these cases without using the
user's real PDFs.

### Scanning

-   `1.pdf`, `20.pdf`, `200.PDF` form the number-only group.
-   `12_118.pdf`, `SCC_2020_001.pdf`, `ABC_XYZ_001.PDF` parse using the
    final underscore.
-   Unmatched names such as `notes.pdf` are ignored.
-   PDFs in nested folders are not scanned.
-   Empty folder produces a useful empty state and no output folders.

### Naming

-   `123` produces `123.pdf`, `124.pdf`, etc.
-   `123_` produces `123_001.pdf`, `123_002.pdf`, etc.
-   `123_123` starts from `123_123.pdf`.
-   `HoSo.pdf` produces `HoSo_001.pdf`, etc.
-   `ABC-XYZ` produces `ABC-XYZ_001.pdf`, etc.
-   `SCC_2020_` produces `SCC_2020_001.pdf`, etc.
-   Invalid characters, trailing period/space, empty input, and integer
    overflow are rejected.

### Mapping and merge

-   Single-group offset uses `newStart + (sourceNumber - minOriginal)`.
-   Missing numbers are correctly identified over the full MIN--MAX
    span.
-   Merge uses display-sorted group order and advances by each group's
    numeric span, not PDF count.
-   Duplicate source numbers and duplicate target filenames block
    copying.

### File safety

-   Preview performs no copies.
-   Run creates numbered Backup and Output directories without
    overwriting existing directories.
-   Originals remain unchanged and present.
-   Backup byte lengths match sources.
-   Output filenames match preview.
-   If any backup copy fails, no output PDFs are copied.
-   Preflight errors prevent backup/output PDF copies.
-   Report is written in UTF-8 and includes errors and summary.
-   Paths with spaces, Vietnamese characters, and long names are handled
    or rejected with clear errors.
-   The app cannot execute arbitrary commands via renderer IPC.

### UI and packaging

-   Keyboard navigation and visible focus.
-   Scan, preview, run, progress, logs, and final summary work.
-   Cancel and app-close behavior are defined during a run.
-   `npm run dev` launches the app.
-   `npm run build` builds the frontend and Electron application.
-   Packaging command produces a Windows distributable.
-   README explains prerequisites, development, build, packaging,
    backup/output behavior, and troubleshooting.

## 10. Implementation sequence

1.  Inspect and document the exact behavior of the supplied `.bat`.
2.  Create regression fixtures and tests for filename parsing, grouping,
    numbering, missing values, merge offsets, and preflight.
3.  Extract the PowerShell core into a non-interactive script while
    preserving algorithm behavior.
4.  Implement `scan` and structured output.
5.  Implement `preview` and deterministic mapping; confirm parity with
    the original script on fixtures.
6.  Implement safe `run`, Backup/Output copying, verification, and
    report generation.
7.  Build the Electron main/preload IPC boundary and validate every
    request.
8.  Implement the traditional Windows-style React UI.
9.  Add progress, logs, cancellation handling, and stale-preview
    protection.
10. Run all tests in temporary directories.
11. Build and test the Windows package on a Windows machine.

## 11. Definition of done

The work is complete when a user can select a folder, scan eligible
PDFs, choose a group or merge all groups, enter a new naming pattern,
inspect an accurate preview, confirm the run, and receive verified
Backup/Output folders plus a Vietnamese result report---all from a
traditional Windows desktop UI, without interactive console prompts and
without altering the original PDFs.

Do not replace the existing algorithm with a superficially similar
implementation. Use regression tests to demonstrate that the desktop
version preserves the supplied script's behavior.
