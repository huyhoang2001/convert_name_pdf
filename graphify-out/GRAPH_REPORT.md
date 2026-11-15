# Graph Report - try 1  (2026-11-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1328 nodes · 3170 edges · 87 communities (60 shown, 27 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8f43c78e`
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
- Filename and Path Validation
- scripts
- copies-template_fe8154a9.md
- update.rs
- getUint8ArrayMemory0
- build.rs
- b6h
- signature-fee.d.ts
- Interlocking Circular Logo
- Two-Tone Circular Swirl App Icon
- Application Icon
- Abstract Teal-and-Gold Interlocking Loop Logo
- Logo with interlocking cyan and yellow circular forms on a dark green background
- Teal and Yellow Loop Logo
- Square Application Logo
- Abstract Interlocking Loop Mark
- Store Logo Icon
- clear_translations
- b6h
- Portable Update Rollback
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

## Communities (87 total, 27 thin omitted)

### Community 0 - "calendar_shards.rs"
Cohesion: 0.08
Nodes (102): append(), base(), benchmark_index_delta_saves(), benchmark_legacy_and_shards(), board_done_window_is_72_hours_and_history_stays_queryable(), board_includes_active_events_across_years_and_upgrades_old_summaries(), build_shards(), byte_rollover_and_recent_done_keep_cross_year_access() (+94 more)

### Community 1 - "chat.rs"
Cohesion: 0.06
Nodes (52): answerQuestion(), blockedQuestion(), copiesFields, indexedFaqs, moduleFaqs, normalizeQuestion(), oneEditAway(), rankFaqs() (+44 more)

### Community 2 - "WordWorkspace.tsx"
Cohesion: 0.06
Nodes (48): saveCalendarBackup(), boardDoneVisible(), dateNumber(), Item, itemsByDate(), itemStart(), keyFromNumber(), lastDayOfMonth() (+40 more)

### Community 3 - "CopiesPage.tsx"
Cohesion: 0.09
Nodes (44): append_copies(), append_register(), auto_fit_uses_full_matrix_when_first_row_is_merged(), C_ALIASES, C_KEYS, C_VI, cell(), copies_import_supports_old_address_row_and_save_keeps_other_sheets() (+36 more)

### Community 4 - "lib.rs"
Cohesion: 0.07
Nodes (40): accepted_request(), ask(), blocked(), cancel(), cancellation_before_request_registration_is_retained_once(), CancellationRegistry, CANCELLATIONS, CancelRegistration (+32 more)

### Community 5 - "workbook.rs"
Cohesion: 0.10
Nodes (45): open_recent_word_location(), remove_word_draft(), set_word_template_pinned(), update_recent_word_document(), bad_docx_is_rejected(), create_template(), document_path(), documents_use_template_and_day_month_folder() (+37 more)

### Community 6 - "pdf.rs"
Cohesion: 0.08
Nodes (38): calendar_rebuild_status(), create_word_template(), default_destinations(), get_calendar_data(), get_destinations(), get_recent_word_documents(), get_selector_settings(), get_signature_settings() (+30 more)

### Community 7 - "storage.rs"
Cohesion: 0.10
Nodes (18): get_language(), mark_update_started(), run(), language(), API, BUSY, check(), check_inner() (+10 more)

### Community 8 - "HelpChatbot.tsx"
Cohesion: 0.12
Nodes (25): preview(), absolute_dir(), backup_precedes_output_and_sources_survive(), build(), copy_phase(), copy_verified(), Destinations, FileEntry (+17 more)

### Community 9 - "ui.tsx"
Cohesion: 0.11
Nodes (27): RecentDocument, SaveWordInput, SaveWordResult, TemplateEntry, wordBridge, WordDraft, WordFont, WordPayload (+19 more)

### Community 10 - "README.md"
Cohesion: 0.08
Nodes (26): react, ChatKeySettings(), ChatKeyStatus, CopiesSheet, folderPathsFromDrop(), SignatureSheet, copiesBusinessFields, copiesSettingFields (+18 more)

### Community 11 - "App"
Cohesion: 0.07
Nodes (29): RELEASE_TAG, release_tag, jobs, release, name, on, push, workflow_dispatch (+21 more)

### Community 12 - "CopiesPage.tsx"
Cohesion: 0.15
Nodes (28): check_for_updates(), clear_copies_cache(), clear_signature_cache(), export_copies_workbook(), import_copies_workbook(), import_signature_workbook(), import_translation_workbook(), install_menu() (+20 more)

### Community 13 - "tauri.conf.json"
Cohesion: 0.17
Nodes (25): attr(), blankWordDocument(), canonical(), checkDocxOpen(), checkDocxOutput(), checkDocxRoundTrip(), checkDocxSave(), descendants() (+17 more)

### Community 14 - "word.rs"
Cohesion: 0.10
Nodes (16): App(), clearTranslationCache(), displayReport(), doPreview(), importTranslations(), nextPage(), refreshTranslationData(), rememberTranslation() (+8 more)

### Community 15 - "package.json"
Cohesion: 0.18
Nodes (22): blankCopiesRow(), copiesSuggestions(), decrementCopiesCount(), isCopiesSaveShortcut, amount(), blankSheet(), CopiesApi, CopiesFile (+14 more)

### Community 16 - "ui.tsx"
Cohesion: 0.11
Nodes (23): get_theme(), apply_completion_transition(), BOARD_DONE_MS, board_done_visible(), board_visibility_uses_exact_elapsed_72_hours(), calendar_category_counts(), CALENDAR_FILE, CALENDAR_LOCK (+15 more)

### Community 17 - "compilerOptions"
Cohesion: 0.13
Nodes (18): open_word_printer_properties(), print_word_manual_pass(), print_word_pdf(), decode_pdf(), duplex_for_mode(), installed_printer_capabilities_have_the_bridge_shape(), MAX_PRINT_PDF_BYTES, open_properties() (+10 more)

### Community 18 - "printDocument.ts"
Cohesion: 0.18
Nodes (22): save_theme(), default_destinations(), default_destinations_value(), destinations(), file(), read(), remove_saved_destination(), reset_destination() (+14 more)

### Community 19 - "wordcraft-web-481e7f4e00a43446.js"
Cohesion: 0.12
Nodes (21): author, description, devDependencies, @tauri-apps/cli@^2.12.4, @types/node@latest, @types/react@latest, @types/react-dom@latest, typescript@latest (+13 more)

### Community 20 - "main.tsx"
Cohesion: 0.13
Nodes (22): addImportVersions(), addVersion(), built, checkPath, deployed, executableHash(), filesUnder(), imports() (+14 more)

### Community 21 - "performance-benchmark.mjs"
Cohesion: 0.10
Nodes (20): 10. Acceptance test matrix, 11. Definition of Done, 12. Agent execution and reporting contract, 1. Objective and non-negotiable constraints, 2. Repository reconnaissance (mandatory before code changes), 3.1 Navigation/layout behavior, 3.2 Per-selector panel, 3. Proposed UI hierarchy (+12 more)

### Community 22 - "dependencies"
Cohesion: 0.17
Nodes (15): classifyChatError(), isRegisterSaveShortcut(), SheetPager(), canEnterSignatureFee(), emptyRow(), headerKeys, keys, money() (+7 more)

### Community 23 - "calendar_shards.rs"
Cohesion: 0.10
Nodes (19): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+11 more)

### Community 24 - "Portable Update Rollback"
Cohesion: 0.22
Nodes (17): attr(), Attribute, changePageNumbers(), insertPageNumberField(), is(), Node, pageField(), PageNumberChange (+9 more)

### Community 25 - "B6H Business Rules Document"
Cohesion: 0.15
Nodes (8): Group, report(), reports_missing_numbers_in_both_languages(), Scan, scan(), count_scan(), scan(), label()

### Community 26 - "chatbotEngine.ts"
Cohesion: 0.25
Nodes (12): fontConfiguration(), decodeDocx(), encodeDocx(), FailureKind, Pending, WordcraftEditor, advanceWordcraftStage(), MAX_WORDCRAFT_DOCX_BYTES (+4 more)

### Community 27 - "compilerOptions"
Cohesion: 0.23
Nodes (17): apply_category_changes(), calendar_size_limit_checks_the_actual_pretty_bytes_before_replacing_file(), category_rename_and_delete_include_records_outside_the_queried_range(), indexed_changes_keep_order_append_new_items_and_validate_before_writing(), json_incremental_updates_preserve_unknown_fields_and_reject_stale_writes(), json_range_queries_keep_historical_overlap_and_board_hides_expired_done(), legacy_done_observation_is_distinct_from_actual_completion(), legacy_json_is_backed_up_before_first_write() (+9 more)

### Community 28 - "Frog Reaction Sticker Set"
Cohesion: 0.12
Nodes (16): dependencies, @docx-editor.dev/editor-api@2.33.0, @docx-editor.dev/react@^2.33.0, exceljs@^4.4.0, @floating-ui/react@^0.27.20, page-mascot@^0.1.0, react@latest, react-markdown@^10.1.0 (+8 more)

### Community 29 - "performance-benchmark.mjs"
Cohesion: 0.15
Nodes (9): react-dom@latest, @tauri-apps/api@^2.12.4, @tauri-apps/plugin-dialog@^2.8.4, react-dom, @tauri-apps/api, @tauri-apps/plugin-dialog, desktopApi, listenForFolderDrops() (+1 more)

### Community 30 - "__wbg_get_imports"
Cohesion: 0.19
Nodes (12): Dirs, Feedback, StorageManager(), T, checkMessageKey, DestinationKind, Key, StorageField (+4 more)

### Community 31 - "ReadPageOverview.tsx"
Cohesion: 0.29
Nodes (12): Alignment, alignments, Guide, measure(), RulerControls(), moveTabStop(), putTabStop(), removeTabStop() (+4 more)

### Community 32 - "printDocument.ts"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 33 - "pageNumbers.ts"
Cohesion: 0.19
Nodes (10): call(), evaluate(), ExcelJS, invoke(), measure(), page, pending, require (+2 more)

### Community 34 - "scripts"
Cohesion: 0.18
Nodes (10): backup, call(), evaluate(), files, invoke(), output, page, pending (+2 more)

### Community 35 - "wordcraft-build-state.mjs"
Cohesion: 0.27
Nodes (10): copiedStyles(), PageSize, PageSnapshot, printDocxPages(), PrintPageSource, printPageStyles(), releaseEditorFocus(), snapshotPage() (+2 more)

### Community 36 - "default.json"
Cohesion: 0.18
Nodes (10): 1. Overview & Design Objectives, 2. Calendar Grid Display Rules (Grid View Level), 3.1. Layering & Positioning, 3.2. Popover Component Architecture, 3. Overlay Inspector Popover Rules, 4. Design System Technical Specifications, Case 1: Single Standard Event, Case 2: Exactly 2 Overlapping Tasks (2-Layer Cascading Stack) (+2 more)

### Community 37 - "Windows Portable Release Workflow"
Cohesion: 0.18
Nodes (11): scripts, build, dev, native:smoke, tauri:build, test, web:build, web:dev (+3 more)

### Community 38 - "SignaturePage.tsx"
Cohesion: 0.33
Nodes (5): excludedDirectories, filesUnder(), fingerprintInputs(), inventory(), matchesInventory()

### Community 39 - "Frog Direction Sprite Sheet"
Cohesion: 0.24
Nodes (11): reset_chat_session(), chat_path(), chat_session(), chat_session_at(), chatbot_session_replaces_and_resets_only_its_unarchived_file(), malformed_chat_session_is_reported_without_deleting_it(), reset_chat_session(), reset_chat_session_at() (+3 more)

### Community 40 - "ReadPageOverview.tsx"
Cohesion: 0.24
Nodes (8): @docx-editor.dev/core@^2.33.0, @docx-editor.dev/core, evaluate(), page, pending, send(), socket, waitFor()

### Community 41 - "Square 142x142 Logo Icon"
Cohesion: 0.20
Nodes (10): Blushing Happiness, Dizziness, Frog Reaction Sticker Set, Happy Expression, Laughter, Love Expression, Sleepiness, Sparkling Delight (+2 more)

### Community 42 - "B6H HTML Entry Point"
Cohesion: 0.27
Nodes (7): evaluate(), invoke(), page, pending, send(), socket, wait()

### Community 43 - "Filename and Path Validation"
Cohesion: 0.31
Nodes (5): exceljs, ExcelJS, translationHeaders, applyRegisterExcelFormatting(), exportTranslations()

### Community 44 - "Abstract Orbital Logo"
Cohesion: 0.31
Nodes (9): cancel_calendar_rebuild(), calendar_data(), calendar_rebuild_status(), process_lock(), cancel_calendar_rebuild(), query_calendar_data(), save_calendar_changes(), save_calendar_data() (+1 more)

### Community 45 - "default.json"
Cohesion: 0.47
Nodes (6): readPageColumns(), shouldShowPrintOverview(), clonePreviewPage(), copyCanvases(), Preview(), ReadPageOverview()

### Community 46 - "dependencies"
Cohesion: 0.36
Nodes (6): @tanstack/react-virtual, formatRegisterDate(), formatFee(), TranslationRegisterTable(), TranslationRegisterTableProps, TranslationTableRow

### Community 47 - "Direct-Child PDF Scanning"
Cohesion: 0.29
Nodes (3): checker, root, source

### Community 48 - "IBM Plex Sans"
Cohesion: 0.40
Nodes (5): calendar_date(), date_part(), history_range_query_keeps_items_that_overlap_window(), overlaps_range(), recurrence_overlaps_range()

### Community 49 - "build.rs"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 50 - "Application Icon"
Cohesion: 0.53
Nodes (6): calendar_accepts_optional_category_colors_and_legacy_data(), calendar_accepts_unicode_and_valid_records(), calendar_rejects_duplicate_ids_and_invalid_status(), calendar_rejects_invalid_or_unknown_category_colors(), valid(), validate_calendar()

### Community 51 - "Interlocking Circular Mark"
Cohesion: 0.40
Nodes (5): GitHub Release Publication, npm Test Suite, Portable App Build, Release Tag Version Check, Windows Portable Release Workflow

### Community 52 - "main.rs"
Cohesion: 0.50
Nodes (3): CopiesRandomData, randomCopiesDetails(), data

### Community 53 - "Filename and Path Validation"
Cohesion: 0.40
Nodes (4): DropEvent, DropPosition, Props, RegisterFolderDropTarget()

### Community 54 - "scripts"
Cohesion: 0.40
Nodes (5): check_destination(), open_destination(), check_directory(), check_directory_reports_states_and_leaves_no_residue(), destination_path()

### Community 56 - "update.rs"
Cohesion: 0.50
Nodes (3): @docx-editor.dev/i18n@^2.33.0, @docx-editor.dev/i18n, viDocx

### Community 57 - "getUint8ArrayMemory0"
Cohesion: 0.83
Nodes (4): Frog Direction Sprite Sheet, Frog Facial Expressions, Green Frog Character, Frog Pose Variations

### Community 59 - "b6h"
Cohesion: 0.50
Nodes (4): Overlapping Circular Motif, Dark Green Square Background, Square 142x142 Logo Icon, Teal and Gold Palette

### Community 61 - "Interlocking Circular Logo"
Cohesion: 0.67
Nodes (3): B6H HTML Entry Point, src/main.tsx Module Entry, React Root Element

### Community 63 - "Application Icon"
Cohesion: 0.67
Nodes (3): Interlocking Circular Motif, Abstract Orbital Logo, Teal and Yellow Palette

## Knowledge Gaps
- **42 isolated node(s):** `BOARD_DONE_MS`, `b6h`, `Blushing Happiness`, `Dizziness`, `Happy Expression` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 377 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `README.md` to `chat.rs`, `WordWorkspace.tsx`, `ui.tsx`, `default.json`, `dependencies`, `package.json`, `wordcraft-web-481e7f4e00a43446.js`, `Filename and Path Validation`, `dependencies`, `chatbotEngine.ts`, `Frog Reaction Sticker Set`, `performance-benchmark.mjs`, `__wbg_get_imports`, `ReadPageOverview.tsx`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `changes()` (e.g. with `apply_category_changes()` and `apply_completion_transition()`) actually correct?**
  _`changes()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BOARD_DONE_MS`, `b6h`, `Blushing Happiness` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `calendar_shards.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.07933550690886508 - nodes in this community are weakly interconnected._
- **Why does `App()` connect `word.rs` to `chat.rs`, `WordWorkspace.tsx`, `ui.tsx`, `README.md`, `Filename and Path Validation`, `dependencies`, `package.json`, `Filename and Path Validation`, `dependencies`, `performance-benchmark.mjs`, `__wbg_get_imports`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `replace()` (e.g. with `normalize_legacy_completions()` and `preserve_locked_starts()`) actually correct?**
  _`replace()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `chat.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.061754385964912284 - nodes in this community are weakly interconnected._