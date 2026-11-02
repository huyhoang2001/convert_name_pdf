# Implementation Specification: Word and Templates with React + Tauri

## 1. Goal

Add a **Word** area to the existing desktop application using **React + TypeScript + Tauri 2**. Users manage Templates from a configured folder, create documents from copies, edit them in a multi-tab editor, and save them under the configured Documents folder.

This is a local-first desktop MVP. It does not implicitly include a server, cloud sync, invitations, online collaboration, or every Microsoft Word feature. Advertise only formats verified with the selected editing engine.

## 2. Recommended technical decisions

| Layer | Recommended choice | Responsibility |
|---|---|---|
| Desktop shell | Tauri 2 + Rust | Desktop window, packaging, system commands, and file-access boundary |
| UI | React + TypeScript | Sidebar, Templates home, tabs, toolbar, editor, and UI state |
| Editor | Tiptap/ProseMirror behind an adapter interface | Content editing, document schema, formatting commands, and import/export within verified capabilities |
| File/folder selection | Tauri dialog plugin | Native OS dialogs for Import, Open, folder selection, and Save As |
| File persistence | Rust commands using filesystem APIs | Template scanning, copying, reading/writing, and path handling |
| Settings | Existing app Settings; otherwise Tauri Store plugin | Persist `templatesDirectory`, `documentsDirectory`, and UI preferences |

### 2.1. Editor selection note

- The editor reference shows paper pages, an outline, a toolbar, and multiple tabs. If real pagination and DOCX import/export are required, run an engine spike before committing to an engine or license. Some Tiptap DOCX/pagination capabilities may require a commercial package.
- Put a `DocumentEngine` adapter in React so the UI does not depend directly on one engine. At minimum, define: `open`, `createFromTemplate`, `save`, `saveAs`, `export`, `getCapabilities`, and `dispose`.
- If Tiptap is selected for the MVP, persist the working document as versioned internal schema JSON; treat DOCX as a separate import/export format. Never change a file extension unless the file contents have actually been converted.
- Before enabling a format, create a matrix for opening, editing, saving, import/export, and known limitations. Test fonts, tables, images, lists, page breaks, headers/footers, Vietnamese text, and embedded content.

## 3. User workflow

**Sidebar → Word → Templates → select a Template → create a copy → open an editor tab → name/save → continue editing and autosave**

1. Select **Word** in the sidebar to open the Templates home.
2. The app scans the configured Templates folder and shows usable templates plus error/unsupported states.
3. Select a Template, review its details/preview, and choose **Create document**.
4. The app creates a new working document; it never edits the original Template file.
5. Open the working copy in a new tab. The user names it before its first save.
6. Save it under `documentsDirectory` using the structure in Section 6.
7. Later saves update the current document. **Save As…** creates a separate file.

## 4. UI layout and behavior

### 4.1. Sidebar and Templates home (reference image 1)

- Add **Word** as a top-level item in the existing sidebar. Optional shortcuts include **Templates**, **Recent documents**, and **Word settings**; if app-wide Settings already exists, link to its relevant section.
- Selecting Word opens the Templates home with a title/description and **Create Template** and **Import Template** actions.
- Use horizontally scrollable card rows for **Template topics** and **Document types**. Cards may show counts and filter the list when selected.
- **Recent files** shows filename, extension, size when available, and last opened/edited time. Do not show cloud sync status without a sync service.
- Selecting a Template opens details/preview with an explicit **Create document from Template** action. A card click alone must not create or edit a file.
- If users copy files directly into the Templates folder, **Refresh** must update the list.
- Treat the screenshot as visual direction. Use clear Word/Templates labels rather than copying demo content.

### 4.2. Multi-tab editor workspace (reference image 2)

- The app-level tab strip sits above the toolbar. Highlight the active tab; show a shortened name and unsaved indicator on other tabs; provide a close action. The `+` action opens the create/open flow.
- The document title row shows the name, save state, and document actions.
- Toolbar commands depend on engine capabilities: Undo/Redo, paragraph style, font/size, bold/italic/underline, color, alignment, lists, links, tables, and images.
- The workspace may contain an outline on the left, the page/editing area in the center, and a right-side panel when a corresponding feature exists. Panels can collapse; the editor area scrolls independently and supports zoom.
- The status bar may show page/current-page count when pagination exists, word count, language, view mode, and zoom.
- Sharing, version history, comments, and collaboration controls become active only when their corresponding backend and scope exist. Do not show fake buttons.

### 4.3. Tabs, shortcuts, and navigation

- Support multiple documents in one window. Each tab retains its own content, save state, undo/redo history, caret/scroll position, and editor state.
- `Ctrl+O` on Windows/Linux and `Cmd+O` on macOS opens the OS file picker. Also provide an **Open file** button.
- If the selected path is already open, activate its existing tab instead of opening a duplicate.
- Closing a dirty tab prompts **Save / Don’t Save / Cancel**. Check all tabs on application exit.
- Navigating to Templates/Recent/Settings must not destroy or remount open editors. Keep tab state in the application shell.
- The MVP shows one active tab at a time. Split-screen viewing can be considered later.

## 5. Settings and Template sources

Persist at least:

```ts
type WordSettings = {
  templatesDirectory: string;
  documentsDirectory: string;
  scanTemplatesOnLaunch: boolean;
};
```

- Use native OS folder dialogs. Persist settings through the existing app settings mechanism; if none exists, use the Tauri Store plugin and verify values after restart.
- `templatesDirectory` is the user-managed Template source. Users may import through a dialog or copy files there themselves.
- By default, Import copies the selected file into the configured Templates folder. For duplicate names, offer **Rename / Replace / Cancel**; never replace silently.
- The MVP scans the root directory. If recursive scanning is later added, document it explicitly and do not follow symlinks outside the selected folder.
- Continue scanning other Templates when one file fails; show the filename and a useful reason.
- List only formats the engine recognizes and supports according to the tested capability matrix. Inspect file type when feasible instead of trusting the extension alone.

## 6. Save paths and filenames

Default path pattern:

```text
<documentsDirectory>/<Template Name>/<DD>/<MM>/<Document Name>.<extension>
```

For a document created from the `Report` Template on 30 October and named `October Report`:

```text
<documentsDirectory>/Report/30/10/October Report.docx
```

- `DD` and `MM` use the local date at document creation/first save and are zero-padded to two digits.
- Capture the Template folder name at document creation and store it in separate metadata so later Template renames do not reorganize existing documents.
- The user may name the document at creation or rename it before the first save. Sanitize invalid characters and preserve an extension matching the actual format.
- The date folders are fixed for that document. A rename after the first save updates the filename in the current folder and does not move it to another date.
- If the target filename exists, ask **Overwrite / Rename / Cancel**; do not overwrite by default.
- If `documentsDirectory` changes, an open document continues saving to its current path; the new setting applies to newly created documents.
- Save safely through a temporary file and replacement where supported. On permission, disk-full, or unavailable-path errors, retain editor content and allow retry/Save As…
- Local metadata may store `documentId`, `templateId`, original Template name, format, creation date, and current path. Avoid embedding app-specific metadata into DOCX if it could affect compatibility.

## 7. React/Tauri boundary and security

- React calls a typed service layer. Do not use Node.js `fs` or allow arbitrary filesystem access from the frontend.
- Keep Rust commands narrowly scoped: read/update Settings, list Templates, import/copy a Template, create a copy, read/write a document, and open dialogs.
- Use the dialog plugin for native file dialogs. Prefer Rust commands for document file operations and path validation; avoid broad filesystem permissions for the whole frontend.
- Configure minimal Tauri capabilities per window/plugin. Normalize and validate paths; handle duplicate paths, large files, I/O errors, and unusual filenames.
- Never execute shell commands from filenames, paths, or document content. Do not log contract text. Keep original Template files immutable.
- Show progress and `loading`, `saved`, `saving`, and `save failed` states. Errors must not discard editor content.

Suggested Rust/React API (names may follow the repository conventions):

```text
get_word_settings() -> WordSettings
set_word_settings(settings) -> Result
list_templates() -> Vec<TemplateEntry>
import_template(source_path) -> TemplateEntry
create_document_from_template(template_id) -> WorkingDocument
read_document(path) -> DocumentPayload
write_document(path, payload) -> SaveResult
```

## 8. File formats and limitations

- Do not claim support for every Word extension. Publish formats the engine actually opens/edits/saves, with known limitations.
- Evaluate DOCX, DOC, DOCM, DOTX, DOTM, RTF, ODT, and TXT at minimum; enable only verified formats. DOC/DOCM or macros may require conversion or another engine.
- With Tiptap, internal schema JSON and DOCX are distinct representations. Test DOCX round-trips with real files; import/export may alter layout or omit content that the schema does not support.
- Never store JSON under a `.docx` extension. If the source format cannot be saved safely, explain that and offer a supported export format.
- Out of MVP: exact compatibility with every Word document, macro execution, Track Changes, digital signatures, online co-editing, and server-side version history.

## 9. Implementation sequence for the coding agent

1. **Inspect the repository:** read `AGENTS.md`, `package.json`, Tauri/Rust configuration, router/sidebar, Settings, persistence, and current build conventions. Preserve existing stack and business logic outside the Word scope.
2. **Engine spike:** open, edit, save, and round-trip a sanitized DOCX sample set; measure capabilities, limitations, licensing, and package size. Finalize the capability matrix before advertising formats.
3. **Tauri foundation:** add minimal plugins/capabilities, typed Rust commands, path selection, Settings persistence, and file error handling.
4. **Templates home:** Word sidebar, folder scan/import, topics/types, recent list, empty/error states, and preview.
5. **Editor shell:** tab strip, toolbar, outline, editing area, status bar, Ctrl/Cmd+O, and tab state management.
6. **Document flow:** immutable copy creation, naming, DD/MM save paths, Save/Save As, autosave, duplicate handling, and unsaved-change prompts.
7. **Local verification:** run the Tauri app in dev mode and verify the complete flow on the target Windows environment and supported-format samples. Build the Windows package only after the user confirms local testing is successful; publishing/pushing is outside this specification.

## 10. Out of scope for the first release

Cloud sync, accounts/backend, invitations, co-editing, share links, Track Changes, comments, server-side version history, plugin marketplace, OCR, and guarantees of full compatibility with every Office format.

## 11. Acceptance criteria

- Selecting Word in the sidebar opens a Templates home based on image 1, with Import/Create, topics, document types, and recent files.
- Templates load from the configured Settings folder; files copied there directly appear after Refresh.
- Import stores a copy in the Templates folder according to the selected policy; one unreadable file does not stop the scan.
- Creating from a Template opens a copy in an editor tab; editing it never changes the Template file.
- The editor follows image 2's structure: tab strip, toolbar, editing area, collapsible outline/panels, and status bar according to engine capabilities.
- Multiple documents can stay open; `Ctrl+O`/`Cmd+O` opens the file picker and activates an existing tab for an already-open path; each tab retains independent state.
- First save creates `<documentsDirectory>/<Template>/<DD>/<MM>/<Name>.<extension>` using the local date; later saves update the same file.
- Duplicate names, unavailable paths, and write errors are reported clearly without data loss or silent overwrite.
- Settings persist after restart. Closing dirty tabs/windows offers Save / Don’t Save / Cancel.
- Every advertised format has documented open/edit/save test results and limitations.
- Sharing/history/comment controls are not presented as working features without the required backend.

## Technical references

- [Tauri 2 — Dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri 2 — File System plugin](https://v2.tauri.app/plugin/file-system/)
- [Tauri 2 — Store plugin](https://v2.tauri.app/plugin/store/)
- [Tauri 2 — Plugin permissions](https://v2.tauri.app/learn/security/using-plugin-permissions/)
- [Tiptap — Document import/export overview](https://tiptap.dev/docs/conversion/getting-started/overview)
- [Tiptap — Pages overview](https://tiptap.dev/docs/pages/getting-started/overview)
