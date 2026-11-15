# Graph Report - try 1  (2026-11-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1325 nodes · 3165 edges · 71 communities (48 shown, 23 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6af6d522`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- calendar_shards.rs
- chat.rs
- WordWorkspace.tsx
- CopiesPage.tsx
- lib.rs
- workbook.rs
- pdf.rs
- storage.rs
- HelpChatbot.tsx
- ui.tsx
- README.md
- App
- CopiesPage.tsx
- tauri.conf.json
- word.rs
- package.json
- ui.tsx
- compilerOptions
- printDocument.ts
- wordcraft-web-481e7f4e00a43446.js
- main.tsx
- performance-benchmark.mjs
- dependencies
- calendar_shards.rs
- Portable Update Rollback
- B6H Business Rules Document
- chatbotEngine.ts
- compilerOptions
- Frog Reaction Sticker Set
- performance-benchmark.mjs
- __wbg_get_imports
- ReadPageOverview.tsx
- printDocument.ts
- pageNumbers.ts
- scripts
- wordcraft-build-state.mjs
- default.json
- Windows Portable Release Workflow
- SignaturePage.tsx
- Frog Direction Sprite Sheet
- ReadPageOverview.tsx
- Square 142x142 Logo Icon
- B6H HTML Entry Point
- Filename and Path Validation
- Abstract Orbital Logo
- default.json
- dependencies
- Direct-Child PDF Scanning
- IBM Plex Sans
- build.rs
- Application Icon
- Interlocking Circular Mark
- main.rs
- scripts
- copies-template_fe8154a9.md
- getUint8ArrayMemory0
- build.rs
- signature-fee.d.ts
- Interlocking Circular Logo
- Two-Tone Circular Swirl App Icon
- Application Icon
- Abstract Teal-and-Gold Interlocking Loop Logo
- Logo with interlocking cyan and yellow circular forms on a dark green background
- Teal and Yellow Loop Logo
- Square Application Logo
- Yellow and Teal Interlocking Rings Logo
- Abstract Interlocking Loop Mark

## God Nodes (most connected - your core abstractions)
1. `App()` - 49 edges
2. `changes()` - 34 edges
3. `replace()` - 34 edges
4. `full()` - 33 edges
5. `base()` - 30 edges
6. `data()` - 29 edges
7. `item()` - 28 edges
8. `query()` - 24 edges
9. `CopiesPage()` - 23 edges
10. `CalendarWorkspace()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `run_pdf()` --references--> `RunResult`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/pdf.rs
- `benchmark_legacy_and_shards()` --calls--> `query_calendar_at()`  [INFERRED]
  src-tauri/src/storage/calendar_shards.rs → src-tauri/src/storage.rs
- `benchmark_legacy_and_shards()` --calls--> `save_calendar_changes_at()`  [INFERRED]
  src-tauri/src/storage/calendar_shards.rs → src-tauri/src/storage.rs
- `changes()` --calls--> `apply_category_changes()`  [INFERRED]
  src-tauri/src/storage/calendar_shards.rs → src-tauri/src/storage.rs
- `changes()` --calls--> `apply_completion_transition()`  [INFERRED]
  src-tauri/src/storage/calendar_shards.rs → src-tauri/src/storage.rs

## Import Cycles
- 1-file cycle: `src-tauri/src/storage.rs -> src-tauri/src/storage.rs`

## Hyperedges (group relationships)
- **Frog Character Pose and Expression Variations** — public_frog_directions_frog_character, public_frog_directions_pose_variations, public_frog_directions_facial_expressions [EXTRACTED 1.00]
- **Safe PDF Run Pipeline** — readme_preview_before_run, readme_backup_first_rule, readme_original_file_preservation, readme_duplicate_preflight [EXTRACTED 1.00]
- **Windows Portable Release Pipeline** — github_workflows_release_tag_version_check, github_workflows_release_npm_tests, github_workflows_release_portable_build, github_workflows_release_github_release [EXTRACTED 1.00]

## Communities (71 total, 23 thin omitted)

### Community 0 - "calendar_shards.rs"
Cohesion: 0.08
Nodes (102): append(), base(), benchmark_index_delta_saves(), benchmark_legacy_and_shards(), board_done_window_is_72_hours_and_history_stays_queryable(), board_includes_active_events_across_years_and_upgrades_old_summaries(), build_shards(), byte_rollover_and_recent_done_keep_cross_year_access() (+94 more)

### Community 1 - "chat.rs"
Cohesion: 0.05
Nodes (95): cancel_calendar_rebuild(), check_destination(), apply_category_changes(), apply_completion_transition(), BOARD_DONE_MS, board_done_visible(), board_visibility_uses_exact_elapsed_72_hours(), calendar_accepts_optional_category_colors_and_legacy_data() (+87 more)

### Community 2 - "WordWorkspace.tsx"
Cohesion: 0.05
Nodes (69): RecentDocument, SaveWordInput, SaveWordResult, TemplateEntry, wordBridge, WordDraft, WordFont, WordPayload (+61 more)

### Community 3 - "CopiesPage.tsx"
Cohesion: 0.06
Nodes (56): react-markdown@^10.1.0, remark-gfm@^4.0.1, react-markdown, remark-gfm, answerQuestion(), blockedQuestion(), copiesFields, indexedFaqs (+48 more)

### Community 4 - "lib.rs"
Cohesion: 0.06
Nodes (68): calendar_rebuild_status(), check_for_updates(), clear_copies_cache(), clear_signature_cache(), clear_translation_cache(), count_scan(), create_word_template(), default_destinations() (+60 more)

### Community 5 - "workbook.rs"
Cohesion: 0.06
Nodes (63): open_recent_word_location(), open_word_printer_properties(), print_word_manual_pass(), print_word_pdf(), remove_word_draft(), set_word_template_pinned(), update_recent_word_document(), decode_pdf() (+55 more)

### Community 6 - "pdf.rs"
Cohesion: 0.08
Nodes (51): append_copies(), append_register(), auto_fit_uses_full_matrix_when_first_row_is_merged(), C_ALIASES, C_KEYS, C_VI, cell(), copies_import_supports_old_address_row_and_save_keeps_other_sheets() (+43 more)

### Community 7 - "storage.rs"
Cohesion: 0.06
Nodes (48): saveCalendarBackup(), boardDoneVisible(), dateNumber(), Item, itemsByDate(), itemStart(), keyFromNumber(), lastDayOfMonth() (+40 more)

### Community 8 - "HelpChatbot.tsx"
Cohesion: 0.09
Nodes (24): accepted_request(), ask(), blocked(), cancel(), cancellation_before_request_registration_is_retained_once(), CancellationRegistry, CANCELLATIONS, CancelRegistration (+16 more)

### Community 9 - "ui.tsx"
Cohesion: 0.12
Nodes (25): preview(), absolute_dir(), backup_precedes_output_and_sources_survive(), build(), copy_phase(), copy_verified(), Destinations, FileEntry (+17 more)

### Community 10 - "README.md"
Cohesion: 0.11
Nodes (18): get_language(), mark_update_started(), run(), language(), API, BUSY, check(), check_inner() (+10 more)

### Community 11 - "App"
Cohesion: 0.09
Nodes (18): formatFee(), TranslationRegisterTable(), App(), clearTranslationCache(), displayReport(), doPreview(), importTranslations(), nextPage() (+10 more)

### Community 12 - "CopiesPage.tsx"
Cohesion: 0.07
Nodes (29): RELEASE_TAG, release_tag, jobs, release, name, on, push, workflow_dispatch (+21 more)

### Community 13 - "tauri.conf.json"
Cohesion: 0.18
Nodes (22): blankCopiesRow(), copiesSuggestions(), decrementCopiesCount(), isCopiesSaveShortcut, amount(), blankSheet(), CopiesApi, CopiesFile (+14 more)

### Community 14 - "word.rs"
Cohesion: 0.13
Nodes (21): react, classifyChatError(), isRegisterSaveShortcut(), DropEvent, DropPosition, Props, RegisterFolderDropTarget(), SheetPager() (+13 more)

### Community 15 - "package.json"
Cohesion: 0.10
Nodes (22): ChatKeyStatus, CopiesSheet, SignatureSheet, copiesBusinessFields, copiesSettingFields, copiesSettingHeaders, CountResult, Destinations (+14 more)

### Community 16 - "ui.tsx"
Cohesion: 0.12
Nodes (21): author, description, devDependencies, @tauri-apps/cli@^2.12.4, @types/node@latest, @types/react@latest, @types/react-dom@latest, typescript@latest (+13 more)

### Community 17 - "compilerOptions"
Cohesion: 0.13
Nodes (22): addImportVersions(), addVersion(), built, checkPath, deployed, executableHash(), filesUnder(), imports() (+14 more)

### Community 18 - "printDocument.ts"
Cohesion: 0.10
Nodes (20): 10. Acceptance test matrix, 11. Definition of Done, 12. Agent execution and reporting contract, 1. Objective and non-negotiable constraints, 2. Repository reconnaissance (mandatory before code changes), 3.1 Navigation/layout behavior, 3.2 Per-selector panel, 3. Proposed UI hierarchy (+12 more)

### Community 19 - "wordcraft-web-481e7f4e00a43446.js"
Cohesion: 0.10
Nodes (19): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+11 more)

### Community 20 - "main.tsx"
Cohesion: 0.22
Nodes (17): attr(), Attribute, changePageNumbers(), insertPageNumberField(), is(), Node, pageField(), PageNumberChange (+9 more)

### Community 21 - "performance-benchmark.mjs"
Cohesion: 0.11
Nodes (17): dependencies, @docx-editor.dev/editor-api@2.33.0, @docx-editor.dev/i18n@^2.33.0, @docx-editor.dev/react@^2.33.0, exceljs@^4.4.0, @floating-ui/react@^0.27.20, page-mascot@^0.1.0, react@latest (+9 more)

### Community 22 - "dependencies"
Cohesion: 0.17
Nodes (12): ChatKeySettings(), Dirs, Feedback, StorageManager(), T, checkMessageKey, DestinationKind, Key (+4 more)

### Community 23 - "calendar_shards.rs"
Cohesion: 0.20
Nodes (16): entry(), environment_key(), KeyStatus, missing_key_status(), remove(), reports_environment_fallback(), resolve(), save() (+8 more)

### Community 24 - "Portable Update Rollback"
Cohesion: 0.18
Nodes (6): Group, report(), reports_missing_numbers_in_both_languages(), Scan, scan(), label()

### Community 25 - "B6H Business Rules Document"
Cohesion: 0.29
Nodes (12): Alignment, alignments, Guide, measure(), RulerControls(), moveTabStop(), putTabStop(), removeTabStop() (+4 more)

### Community 26 - "chatbotEngine.ts"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 27 - "compilerOptions"
Cohesion: 0.18
Nodes (7): @tauri-apps/api@^2.12.4, @tauri-apps/plugin-dialog@^2.8.4, @tauri-apps/api, @tauri-apps/plugin-dialog, desktopApi, listenForFolderDrops(), workbookFilter

### Community 28 - "Frog Reaction Sticker Set"
Cohesion: 0.19
Nodes (10): call(), evaluate(), ExcelJS, invoke(), measure(), page, pending, require (+2 more)

### Community 29 - "performance-benchmark.mjs"
Cohesion: 0.18
Nodes (10): backup, call(), evaluate(), files, invoke(), output, page, pending (+2 more)

### Community 30 - "__wbg_get_imports"
Cohesion: 0.27
Nodes (10): copiedStyles(), PageSize, PageSnapshot, printDocxPages(), PrintPageSource, printPageStyles(), releaseEditorFocus(), snapshotPage() (+2 more)

### Community 31 - "ReadPageOverview.tsx"
Cohesion: 0.18
Nodes (10): 1. Overview & Design Objectives, 2. Calendar Grid Display Rules (Grid View Level), 3.1. Layering & Positioning, 3.2. Popover Component Architecture, 3. Overlay Inspector Popover Rules, 4. Design System Technical Specifications, Case 1: Single Standard Event, Case 2: Exactly 2 Overlapping Tasks (2-Layer Cascading Stack) (+2 more)

### Community 32 - "printDocument.ts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, native:smoke, tauri:build, test, web:build, web:dev (+3 more)

### Community 33 - "pageNumbers.ts"
Cohesion: 0.33
Nodes (5): excludedDirectories, filesUnder(), fingerprintInputs(), inventory(), matchesInventory()

### Community 34 - "scripts"
Cohesion: 0.24
Nodes (8): @docx-editor.dev/core@^2.33.0, @docx-editor.dev/core, evaluate(), page, pending, send(), socket, waitFor()

### Community 35 - "wordcraft-build-state.mjs"
Cohesion: 0.20
Nodes (10): Blushing Happiness, Dizziness, Frog Reaction Sticker Set, Happy Expression, Laughter, Love Expression, Sleepiness, Sparkling Delight (+2 more)

### Community 36 - "default.json"
Cohesion: 0.27
Nodes (7): evaluate(), invoke(), page, pending, send(), socket, wait()

### Community 37 - "Windows Portable Release Workflow"
Cohesion: 0.31
Nodes (5): exceljs, ExcelJS, translationHeaders, applyRegisterExcelFormatting(), exportTranslations()

### Community 38 - "SignaturePage.tsx"
Cohesion: 0.47
Nodes (6): readPageColumns(), shouldShowPrintOverview(), clonePreviewPage(), copyCanvases(), Preview(), ReadPageOverview()

### Community 39 - "Frog Direction Sprite Sheet"
Cohesion: 0.29
Nodes (3): checker, root, source

### Community 40 - "ReadPageOverview.tsx"
Cohesion: 0.40
Nodes (4): @tanstack/react-virtual, formatRegisterDate(), TranslationRegisterTableProps, TranslationTableRow

### Community 41 - "Square 142x142 Logo Icon"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 42 - "B6H HTML Entry Point"
Cohesion: 0.40
Nodes (5): GitHub Release Publication, npm Test Suite, Portable App Build, Release Tag Version Check, Windows Portable Release Workflow

### Community 43 - "Filename and Path Validation"
Cohesion: 0.50
Nodes (3): CopiesRandomData, randomCopiesDetails(), data

### Community 44 - "Abstract Orbital Logo"
Cohesion: 0.83
Nodes (4): Frog Direction Sprite Sheet, Frog Facial Expressions, Green Frog Character, Frog Pose Variations

### Community 46 - "dependencies"
Cohesion: 0.50
Nodes (4): Overlapping Circular Motif, Dark Green Square Background, Square 142x142 Logo Icon, Teal and Gold Palette

### Community 47 - "Direct-Child PDF Scanning"
Cohesion: 0.67
Nodes (3): B6H HTML Entry Point, src/main.tsx Module Entry, React Root Element

### Community 49 - "build.rs"
Cohesion: 0.67
Nodes (3): Interlocking Circular Motif, Abstract Orbital Logo, Teal and Yellow Palette

## Knowledge Gaps
- **42 isolated node(s):** `BOARD_DONE_MS`, `b6h`, `Blushing Happiness`, `Dizziness`, `Happy Expression` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 376 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `word.rs` to `WordWorkspace.tsx`, `CopiesPage.tsx`, `SignaturePage.tsx`, `storage.rs`, `ReadPageOverview.tsx`, `tauri.conf.json`, `package.json`, `ui.tsx`, `performance-benchmark.mjs`, `dependencies`, `B6H Business Rules Document`, `compilerOptions`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `changes()` (e.g. with `apply_category_changes()` and `apply_completion_transition()`) actually correct?**
  _`changes()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BOARD_DONE_MS`, `b6h`, `Blushing Happiness` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `calendar_shards.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.07933550690886508 - nodes in this community are weakly interconnected._
- **Why does `App()` connect `App` to `WordWorkspace.tsx`, `CopiesPage.tsx`, `Windows Portable Release Workflow`, `storage.rs`, `tauri.conf.json`, `word.rs`, `package.json`, `dependencies`, `compilerOptions`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `replace()` (e.g. with `normalize_legacy_completions()` and `preserve_locked_starts()`) actually correct?**
  _`replace()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `chat.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05311250713877784 - nodes in this community are weakly interconnected._