# Graph Report - convert_name_pdf-main  (2026-11-16)

## Corpus Check
- 118 files · ~98,729 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: .ico 12, (none) 4, .css 3)

## Summary
- 1348 nodes · 3232 edges · 79 communities (53 shown, 26 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 132 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- calendar_shards.rs
- chat.rs
- WordWorkspace.tsx
- Value
- lib.rs
- workbook.rs
- pdf.rs
- storage.rs
- HelpChatbot.tsx
- pdf.rs
- lib.rs
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
- AppHandle
- Portable Update Rollback
- B6H Business Rules Document
- chatbotEngine.ts
- dependencies
- Frog Reaction Sticker Set
- performance-benchmark.mjs
- __wbg_get_imports
- ReadPageOverview.tsx
- printDocument.ts
- pageNumbers.ts
- scripts
- wordcraft-build-state.mjs
- default.json
- State
- SignaturePage.tsx
- Frog Direction Sprite Sheet
- ReadPageOverview.tsx
- Square 142x142 Logo Icon
- B6H HTML Entry Point
- Filename and Path Validation
- update.rs
- default.json
- dependencies
- Direct-Child PDF Scanning
- IBM Plex Sans
- build.rs
- Application Icon
- count.rs
- main.rs
- Filename and Path Validation
- copies-template_fe8154a9.md
- update.rs
- build.rs
- b6h
- Interlocking Circular Logo
- Two-Tone Circular Swirl App Icon
- Application Icon
- Abstract Teal-and-Gold Interlocking Loop Logo
- Logo with interlocking cyan and yellow circular forms on a dark green background
- Teal and Yellow Loop Logo
- Square Application Logo
- Yellow and Teal Interlocking Rings Logo
- Abstract Interlocking Loop Mark
- Store Logo Icon
- KeyStatus
- ref_node_fs
- TemplateEntry

## God Nodes (most connected - your core abstractions)
1. `App()` - 49 edges
2. `changes()` - 34 edges
3. `replace()` - 34 edges
4. `full()` - 33 edges
5. `base()` - 30 edges
6. `import()` - 29 edges
7. `data()` - 29 edges
8. `item()` - 28 edges
9. `query()` - 24 edges
10. `CopiesPage()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `ChatKeySettings()`  [EXTRACTED]
  src/ui.tsx → src/ChatKeySettings.tsx
- `get_chat_key_status()` --references--> `KeyStatus`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/chat.rs
- `remove_chat_key()` --references--> `KeyStatus`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/chat.rs
- `save_chat_key()` --references--> `KeyStatus`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/chat.rs
- `preview()` --references--> `PreviewInput`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/pdf.rs

## Import Cycles
- 1-file cycle: `src-tauri/src/storage.rs -> src-tauri/src/storage.rs`

## Hyperedges (group relationships)
- **Frog Character Pose and Expression Variations** — public_frog_directions_frog_character, public_frog_directions_pose_variations, public_frog_directions_facial_expressions [EXTRACTED 1.00]
- **Safe PDF Run Pipeline** — readme_preview_before_run, readme_backup_first_rule, readme_original_file_preservation, readme_duplicate_preflight [EXTRACTED 1.00]
- **Windows Portable Release Pipeline** — github_workflows_release_tag_version_check, github_workflows_release_npm_tests, github_workflows_release_portable_build, github_workflows_release_github_release [EXTRACTED 1.00]

## Communities (79 total, 26 thin omitted)

### Community 0 - "calendar_shards.rs"
Cohesion: 0.08
Nodes (100): append(), base(), benchmark_index_delta_saves(), benchmark_legacy_and_shards(), board_done_window_is_72_hours_and_history_stays_queryable(), board_includes_active_events_across_years_and_upgrades_old_summaries(), build_shards(), byte_rollover_and_recent_done_keep_cross_year_access() (+92 more)

### Community 1 - "chat.rs"
Cohesion: 0.05
Nodes (97): apply_category_changes(), apply_completion_transition(), BOARD_DONE_MS, board_done_visible(), board_visibility_uses_exact_elapsed_72_hours(), calendar_accepts_optional_category_colors_and_legacy_data(), calendar_accepts_unicode_and_valid_records(), calendar_category_counts() (+89 more)

### Community 2 - "WordWorkspace.tsx"
Cohesion: 0.05
Nodes (69): RecentDocument, SaveWordInput, SaveWordResult, TemplateEntry, wordBridge, WordDraft, WordFont, WordPayload (+61 more)

### Community 3 - "Value"
Cohesion: 0.07
Nodes (28): calendar_rebuild_status(), default_destinations(), get_calendar_data(), get_destinations(), get_recent_word_documents(), get_selector_settings(), get_signature_settings(), get_translations() (+20 more)

### Community 4 - "lib.rs"
Cohesion: 0.07
Nodes (75): append_copies(), append_register(), apply_row_locators(), auto_fit_uses_full_matrix_when_first_row_is_merged(), C_ALIASES, C_KEYS, C_VI, cell() (+67 more)

### Community 5 - "workbook.rs"
Cohesion: 0.07
Nodes (47): boardDoneVisible(), dateNumber(), Item, itemsByDate(), itemStart(), keyFromNumber(), lastDayOfMonth(), recurrenceDates() (+39 more)

### Community 6 - "pdf.rs"
Cohesion: 0.10
Nodes (23): accepted_request(), ask(), blocked(), cancel(), cancellation_before_request_registration_is_retained_once(), CancellationRegistry, CANCELLATIONS, CancelRegistration (+15 more)

### Community 7 - "storage.rs"
Cohesion: 0.08
Nodes (44): react-markdown@^10.1.0, remark-gfm@^4.0.1, react-markdown, remark-gfm, answerQuestion(), blockedQuestion(), copiesFields, indexedFaqs (+36 more)

### Community 8 - "HelpChatbot.tsx"
Cohesion: 0.12
Nodes (41): bad_docx_is_rejected(), create_template(), document_path(), documents_use_template_and_day_month_folder(), docx_bytes(), draft_ids_cannot_escape_app_data(), draft_path(), draft_replaces_atomically_and_reopens() (+33 more)

### Community 9 - "pdf.rs"
Cohesion: 0.13
Nodes (24): absolute_dir(), backup_precedes_output_and_sources_survive(), build(), copy_phase(), copy_verified(), Destinations, FileEntry, fmt() (+16 more)

### Community 10 - "lib.rs"
Cohesion: 0.07
Nodes (5): count_scan(), install_menu(), run(), save_language(), scan()

### Community 11 - "App"
Cohesion: 0.15
Nodes (25): classifyChatError(), blankCopiesRow(), copiesSuggestions(), decrementCopiesCount(), isCopiesSaveShortcut, amount(), blankSheet(), CopiesApi (+17 more)

### Community 12 - "CopiesPage.tsx"
Cohesion: 0.07
Nodes (29): RELEASE_TAG, release_tag, jobs, release, name, on, push, workflow_dispatch (+21 more)

### Community 13 - "tauri.conf.json"
Cohesion: 0.09
Nodes (18): App(), clearTranslationCache(), displayReport(), doPreview(), importTranslations(), nextPage(), refreshTranslationData(), rememberTranslation() (+10 more)

### Community 14 - "word.rs"
Cohesion: 0.17
Nodes (15): isRegisterSaveShortcut(), canEnterSignatureFee(), emptyRow(), headerKeys, keys, money(), nextAutoNumber(), SignatureApi (+7 more)

### Community 15 - "package.json"
Cohesion: 0.09
Nodes (25): react, ChatKeySettings(), ChatKeyStatus, CopiesSheet, DropEvent, DropPosition, Props, SignatureSheet (+17 more)

### Community 16 - "ui.tsx"
Cohesion: 0.12
Nodes (25): addImportVersions(), addVersion(), built, checkPath, deployed, directoryBytes(), executableHash(), filesUnder() (+17 more)

### Community 17 - "compilerOptions"
Cohesion: 0.16
Nodes (14): decode_pdf(), duplex_for_mode(), installed_printer_capabilities_have_the_bridge_shape(), MAX_PRINT_PDF_BYTES, printer_capabilities(), printers(), refeed_preferences(), refeed_preferences_accept_only_supported_orientations() (+6 more)

### Community 18 - "printDocument.ts"
Cohesion: 0.12
Nodes (15): applyCleanup(), assertIdle(), candidates, categoryFor(), limitGiB, main(), root, scanCache() (+7 more)

### Community 19 - "wordcraft-web-481e7f4e00a43446.js"
Cohesion: 0.12
Nodes (21): author, description, devDependencies, @tauri-apps/cli@^2.12.4, @types/node@latest, @types/react@latest, @types/react-dom@latest, typescript@latest (+13 more)

### Community 20 - "main.tsx"
Cohesion: 0.10
Nodes (19): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+11 more)

### Community 21 - "performance-benchmark.mjs"
Cohesion: 0.22
Nodes (17): attr(), Attribute, changePageNumbers(), insertPageNumberField(), is(), Node, pageField(), PageNumberChange (+9 more)

### Community 22 - "dependencies"
Cohesion: 0.21
Nodes (11): Dirs, Feedback, StorageManager(), T, checkMessageKey, DestinationKind, Key, StorageField (+3 more)

### Community 23 - "AppHandle"
Cohesion: 0.17
Nodes (19): check_for_updates(), clear_copies_cache(), clear_signature_cache(), export_copies_workbook(), import_copies_workbook(), import_signature_workbook(), import_translation_workbook(), install_update_from_file() (+11 more)

### Community 24 - "Portable Update Rollback"
Cohesion: 0.24
Nodes (14): @docx-editor.dev/core@^2.33.0, @docx-editor.dev/core, Alignment, alignments, Guide, measure(), RulerControls(), moveTabStop() (+6 more)

### Community 25 - "B6H Business Rules Document"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 26 - "chatbotEngine.ts"
Cohesion: 0.19
Nodes (6): react-dom@latest, react-dom, @tauri-apps/api, desktopApi, listenForFolderDrops(), workbookFilter

### Community 27 - "dependencies"
Cohesion: 0.11
Nodes (17): dependencies, @docx-editor.dev/editor-api@2.33.0, @docx-editor.dev/i18n@^2.33.0, @docx-editor.dev/react@^2.33.0, exceljs@^4.4.0, @floating-ui/react@^0.27.20, page-mascot@^0.1.0, react@latest (+9 more)

### Community 28 - "Frog Reaction Sticker Set"
Cohesion: 0.19
Nodes (10): call(), evaluate(), ExcelJS, invoke(), measure(), page, pending, require (+2 more)

### Community 29 - "performance-benchmark.mjs"
Cohesion: 0.18
Nodes (10): backup, call(), evaluate(), files, invoke(), output, page, pending (+2 more)

### Community 30 - "__wbg_get_imports"
Cohesion: 0.17
Nodes (12): scripts, build, dev, native:smoke, tauri:build, test, web:build, web:dev (+4 more)

### Community 31 - "ReadPageOverview.tsx"
Cohesion: 0.20
Nodes (5): saveCalendarBackup(), folderPathsFromDrop(), formatFooterDate(), msUntilNextLocalDay(), nextWordZoom()

### Community 32 - "printDocument.ts"
Cohesion: 0.22
Nodes (9): appData, evaluate(), page, pending, projectRoot, send(), smokeDir, socket (+1 more)

### Community 33 - "pageNumbers.ts"
Cohesion: 0.36
Nodes (8): excludedDirectories, filesUnder(), fingerprintInputs(), inventory(), matchesInventory(), publishDirectory(), selectAction(), selectBuildAction()

### Community 34 - "scripts"
Cohesion: 0.27
Nodes (10): copiedStyles(), PageSize, PageSnapshot, printDocxPages(), PrintPageSource, printPageStyles(), releaseEditorFocus(), snapshotPage() (+2 more)

### Community 35 - "wordcraft-build-state.mjs"
Cohesion: 0.20
Nodes (10): Blushing Happiness, Dizziness, Frog Reaction Sticker Set, Happy Expression, Laughter, Love Expression, Sleepiness, Sparkling Delight (+2 more)

### Community 36 - "default.json"
Cohesion: 0.28
Nodes (8): amountInWords(), englishOnes, englishTens, englishTriplet(), englishUnits, vietnameseOnes, vietnameseTriplet(), vietnameseUnits

### Community 37 - "State"
Cohesion: 0.22
Nodes (8): open_external_word_document(), open_path(), open_recent_word_document(), preview(), read_report(), run_pdf(), save_count_report(), save_word_document()

### Community 38 - "SignaturePage.tsx"
Cohesion: 0.31
Nodes (5): exceljs, ExcelJS, translationHeaders, applyRegisterExcelFormatting(), exportTranslations()

### Community 39 - "Frog Direction Sprite Sheet"
Cohesion: 0.24
Nodes (7): evaluate(), invoke(), page, pending, send(), socket, wait()

### Community 40 - "ReadPageOverview.tsx"
Cohesion: 0.47
Nodes (6): readPageColumns(), shouldShowPrintOverview(), clonePreviewPage(), copyCanvases(), Preview(), ReadPageOverview()

### Community 41 - "Square 142x142 Logo Icon"
Cohesion: 0.31
Nodes (7): @tanstack/react-virtual@^3.14.22, @tanstack/react-virtual, formatRegisterDate(), formatFee(), TranslationRegisterTable(), TranslationRegisterTableProps, TranslationTableRow

### Community 42 - "B6H HTML Entry Point"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 43 - "Filename and Path Validation"
Cohesion: 0.40
Nodes (5): GitHub Release Publication, npm Test Suite, Portable App Build, Release Tag Version Check, Windows Portable Release Workflow

### Community 44 - "update.rs"
Cohesion: 0.12
Nodes (15): language(), API, BUSY, check(), check_inner(), compares_release_versions_and_rejects_invalid_executables(), confirm(), install_file() (+7 more)

### Community 45 - "default.json"
Cohesion: 0.83
Nodes (4): Frog Direction Sprite Sheet, Frog Facial Expressions, Green Frog Character, Frog Pose Variations

### Community 47 - "Direct-Child PDF Scanning"
Cohesion: 0.50
Nodes (4): Overlapping Circular Motif, Dark Green Square Background, Square 142x142 Logo Icon, Teal and Gold Palette

### Community 48 - "IBM Plex Sans"
Cohesion: 0.67
Nodes (3): B6H HTML Entry Point, src/main.tsx Module Entry, React Root Element

### Community 50 - "Application Icon"
Cohesion: 0.67
Nodes (3): Interlocking Circular Motif, Abstract Orbital Logo, Teal and Yellow Palette

### Community 51 - "count.rs"
Cohesion: 0.18
Nodes (6): Group, report(), reports_missing_numbers_in_both_languages(), Scan, scan(), label()

### Community 72 - "KeyStatus"
Cohesion: 0.19
Nodes (15): entry(), environment_key(), KeyStatus, missing_key_status(), remove(), reports_environment_fallback(), resolve(), save() (+7 more)

### Community 73 - "ref_node_fs"
Cohesion: 0.40
Nodes (3): CopiesRandomData, randomCopiesDetails(), data

### Community 74 - "TemplateEntry"
Cohesion: 0.50
Nodes (3): create_word_template(), import_word_template(), list_word_templates()

## Knowledge Gaps
- **42 isolated node(s):** `BOARD_DONE_MS`, `b6h`, `Blushing Happiness`, `Dizziness`, `Happy Expression` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 383 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `package.json` to `WordWorkspace.tsx`, `workbook.rs`, `storage.rs`, `ReadPageOverview.tsx`, `Square 142x142 Logo Icon`, `App`, `word.rs`, `wordcraft-web-481e7f4e00a43446.js`, `dependencies`, `Portable Update Rollback`, `chatbotEngine.ts`, `dependencies`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `changes()` (e.g. with `apply_category_changes()` and `apply_completion_transition()`) actually correct?**
  _`changes()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BOARD_DONE_MS`, `b6h`, `Blushing Happiness` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `calendar_shards.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08290241868223519 - nodes in this community are weakly interconnected._
- **Why does `App()` connect `tauri.conf.json` to `WordWorkspace.tsx`, `workbook.rs`, `SignaturePage.tsx`, `storage.rs`, `Square 142x142 Logo Icon`, `App`, `word.rs`, `package.json`, `dependencies`, `chatbotEngine.ts`, `ReadPageOverview.tsx`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `replace()` (e.g. with `normalize_legacy_completions()` and `preserve_locked_starts()`) actually correct?**
  _`replace()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `chat.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05457875457875458 - nodes in this community are weakly interconnected._