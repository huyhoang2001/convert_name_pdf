# Graph Report - convert_name_pdf-main  (2026-11-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1679 nodes · 4248 edges · 84 communities (55 shown, 29 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 180 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f0ce2c4b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- workbook.rs
- calendar_shards.rs
- storage.rs
- modular_update.rs
- update_runner.rs
- HelpChatbot.tsx
- CalendarWorkspace.tsx
- chat.rs
- word.rs
- ui.tsx
- WordWorkspace.tsx
- SignaturePage.tsx
- ref_node_fs
- build-wordcraft.mjs
- pdf.rs
- ref_node_assert
- update.rs
- CopiesPage.tsx
- lib.rs
- App
- tauri.conf.json
- docx.ts
- Value
- with
- AppHandle
- update-e2e.mjs
- package.json
- printing.rs
- scripts
- pageNumbers.ts
- dependencies
- StorageManager.tsx
- WordcraftEditor.tsx
- count.rs
- RulerControls.tsx
- wordcraft-cache.mjs
- compilerOptions
- main.tsx
- SignaturePage.tsx
- performance-benchmark.mjs
- ReadPageOverview.tsx
- exceljs
- wordcraft-webview2-smoke.mjs
- Frog Reaction Sticker Set
- word-fidelity-smoke.mjs
- default.json
- ReadPageOverview.tsx
- Direct-Child PDF Scanning
- IBM Plex Sans
- build.rs
- Application Icon
- B6H Business Rules Document
- main.rs
- Filename and Path Validation
- scripts
- B6H HTML Entry Point
- update.rs
- getUint8ArrayMemory0
- Direct-Child PDF Scanning
- get_update_runtime_status
- signature-fee.d.ts
- Application Icon
- Application Icon
- Abstract Teal-and-Gold Interlocking Loop Logo
- Square Application Logo
- Yellow and Teal Interlocking Rings Logo
- Abstract Interlocking Loop Mark
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
1. `App()` - 64 edges
2. `import()` - 50 edges
3. `load()` - 34 edges
4. `changes()` - 34 edges
5. `replace()` - 34 edges
6. `full()` - 33 edges
7. `save_signature()` - 30 edges
8. `base()` - 30 edges
9. `data()` - 29 edges
10. `item()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `saveTranslationFile()` --calls--> `formatSignatureNumber()`  [EXTRACTED]
  src/ui.tsx → src/signatureText.mjs
- `run_pdf()` --references--> `RunResult`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/pdf.rs
- `download_online_update()` --references--> `PackageInfo`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs
- `install_update_from_file()` --references--> `PackageInfo`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs
- `benchmark_legacy_and_shards()` --calls--> `query_calendar_at()`  [INFERRED]
  src-tauri/src/storage/calendar_shards.rs → src-tauri/src/storage.rs

## Import Cycles
- 1-file cycle: `src-tauri/src/storage.rs -> src-tauri/src/storage.rs`

## Hyperedges (group relationships)
- **Frog Character Pose and Expression Variations** — public_frog_directions_frog_character, public_frog_directions_pose_variations, public_frog_directions_facial_expressions [EXTRACTED 1.00]
- **Safe PDF Run Pipeline** — readme_preview_before_run, readme_backup_first_rule, readme_original_file_preservation, readme_duplicate_preflight [EXTRACTED 1.00]
- **Windows Portable Release Pipeline** — github_workflows_release_tag_version_check, github_workflows_release_npm_tests, github_workflows_release_portable_build, github_workflows_release_github_release [EXTRACTED 1.00]

## Communities (84 total, 29 thin omitted)

### Community 0 - "workbook.rs"
Cohesion: 0.06
Nodes (110): append_copies(), append_register(), apply_row_locators(), auto_fit_uses_full_matrix_when_first_row_is_merged(), C_ALIASES, C_KEYS, C_VI, cell() (+102 more)

### Community 1 - "calendar_shards.rs"
Cohesion: 0.08
Nodes (101): append(), base(), benchmark_index_delta_saves(), benchmark_legacy_and_shards(), board_done_window_is_72_hours_and_history_stays_queryable(), board_includes_active_events_across_years_and_upgrades_old_summaries(), build_shards(), byte_rollover_and_recent_done_keep_cross_year_access() (+93 more)

### Community 2 - "storage.rs"
Cohesion: 0.05
Nodes (102): check_destination(), apply_category_changes(), apply_completion_transition(), BOARD_DONE_MS, board_done_visible(), board_visibility_uses_exact_elapsed_72_hours(), calendar_accepts_optional_category_colors_and_legacy_data(), calendar_accepts_unicode_and_valid_records() (+94 more)

### Community 3 - "modular_update.rs"
Cohesion: 0.05
Nodes (85): discover_online_updates(), get_staged_updates(), get_update_history(), run(), activation_readiness_and_interrupted_startup_restore_safe_generations(), ActivationJournal, active_asset(), active_asset_at() (+77 more)

### Community 4 - "update_runner.rs"
Cohesion: 0.07
Nodes (39): apply(), clear_install(), clear_readiness_markers(), clear_recovery(), commit_transaction(), copy_tree(), file_version(), finish_commit() (+31 more)

### Community 5 - "HelpChatbot.tsx"
Cohesion: 0.08
Nodes (45): react-markdown@^10.1.0, remark-gfm@^4.0.1, react-markdown, remark-gfm, answerQuestion(), blockedQuestion(), copiesFields, indexedFaqs (+37 more)

### Community 6 - "CalendarWorkspace.tsx"
Cohesion: 0.07
Nodes (47): boardDoneVisible(), dateNumber(), Item, itemsByDate(), itemStart(), keyFromNumber(), lastDayOfMonth(), recurrenceDates() (+39 more)

### Community 7 - "chat.rs"
Cohesion: 0.07
Nodes (40): accepted_request(), ask(), blocked(), cancel(), cancellation_before_request_registration_is_retained_once(), CancellationRegistry, CANCELLATIONS, CancelRegistration (+32 more)

### Community 8 - "word.rs"
Cohesion: 0.11
Nodes (45): open_recent_word_location(), remove_word_draft(), set_word_template_pinned(), update_recent_word_document(), bad_docx_is_rejected(), create_template(), document_path(), documents_use_template_and_day_month_folder() (+37 more)

### Community 9 - "ui.tsx"
Cohesion: 0.07
Nodes (32): react, ChatKeySettings(), ChatKeyStatus, CopiesSheet, folderPathsFromDrop(), DropEvent, DropPosition, Props (+24 more)

### Community 10 - "WordWorkspace.tsx"
Cohesion: 0.09
Nodes (31): markWorkspaceUnsaved(), workspaces, RecentDocument, SaveWordInput, SaveWordResult, TemplateEntry, wordBridge, WordDraft (+23 more)

### Community 11 - "SignaturePage.tsx"
Cohesion: 0.14
Nodes (31): formatRegisterDate(), parseRegisterDate(), canEnterSignatureFee(), emptyRow(), headerKeys, keys, nextAutoNumber(), SearchText() (+23 more)

### Community 12 - "ref_node_fs"
Cohesion: 0.08
Nodes (21): args, result, root, target, backup, call(), evaluate(), files (+13 more)

### Community 13 - "build-wordcraft.mjs"
Cohesion: 0.10
Nodes (33): addImportVersions(), addVersion(), built, checkPath, deployed, directoryBytes(), executableHash(), filesUnder() (+25 more)

### Community 14 - "pdf.rs"
Cohesion: 0.12
Nodes (25): preview(), absolute_dir(), backup_precedes_output_and_sources_survive(), build(), copy_phase(), copy_verified(), Destinations, FileEntry (+17 more)

### Community 15 - "ref_node_assert"
Cohesion: 0.09
Nodes (19): saveCalendarBackup(), CopiesRandomData, randomCopiesDetails(), formatFooterDate(), msUntilNextLocalDay(), substituteMissingFonts(), copiedStyles(), PageSize (+11 more)

### Community 16 - "update.rs"
Cohesion: 0.11
Nodes (19): get_language(), mark_update_started(), language(), API, BUSY, check(), check_inner(), compares_release_versions_and_rejects_invalid_executables() (+11 more)

### Community 17 - "CopiesPage.tsx"
Cohesion: 0.15
Nodes (25): @tanstack/react-virtual, blankCopiesRow(), copiesSuggestions(), decrementCopiesCount(), isCopiesSaveShortcut, isRegisterSaveShortcut(), amount(), blankSheet() (+17 more)

### Community 18 - "lib.rs"
Cohesion: 0.08
Nodes (22): activate_update(), cancel_calendar_rebuild(), clear_translation_cache(), get_chatbot_visible(), get_signature_stt_mode(), get_theme(), get_translation_stt_mode(), mark_runtime_ready() (+14 more)

### Community 19 - "App"
Cohesion: 0.09
Nodes (16): App(), clearTranslationCache(), commitTranslationRow(), confirmTranslationDuplicate(), displayReport(), doPreview(), nextPage(), refreshTranslationData() (+8 more)

### Community 20 - "tauri.conf.json"
Cohesion: 0.07
Nodes (28): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+20 more)

### Community 21 - "docx.ts"
Cohesion: 0.17
Nodes (25): attr(), blankWordDocument(), canonical(), checkDocxOpen(), checkDocxOutput(), checkDocxRoundTrip(), checkDocxSave(), descendants() (+17 more)

### Community 22 - "Value"
Cohesion: 0.07
Nodes (26): calendar_rebuild_status(), default_destinations(), export_translation_workbook(), get_calendar_data(), get_destinations(), get_recent_word_documents(), get_translations(), get_word_local_fonts() (+18 more)

### Community 23 - "with"
Cohesion: 0.08
Nodes (25): B6H_UPDATE_TRUST_ROOTS, jobs, release, name, on, push, permissions, contents (+17 more)

### Community 24 - "AppHandle"
Cohesion: 0.14
Nodes (24): check_for_updates(), clear_copies_cache(), clear_signature_cache(), download_online_update(), export_copies_workbook(), get_selector_settings(), import_copies_workbook(), import_translation_workbook() (+16 more)

### Community 25 - "update-e2e.mjs"
Cohesion: 0.08
Nodes (18): baseEnv, data, distribution, exe, install, local, profile, root (+10 more)

### Community 26 - "package.json"
Cohesion: 0.11
Nodes (23): author, description, devDependencies, fflate@0.8.3, @tauri-apps/cli@^2.12.4, @types/node@latest, @types/react@latest, @types/react-dom@latest (+15 more)

### Community 27 - "printing.rs"
Cohesion: 0.13
Nodes (18): open_word_printer_properties(), print_word_manual_pass(), print_word_pdf(), decode_pdf(), duplex_for_mode(), installed_printer_capabilities_have_the_bridge_shape(), MAX_PRINT_PDF_BYTES, open_properties() (+10 more)

### Community 28 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:frontend-update, build:installer, build:installer:core-test, build:installer:offline, build:installer:test, build:update-runner (+14 more)

### Community 29 - "pageNumbers.ts"
Cohesion: 0.22
Nodes (17): attr(), Attribute, changePageNumbers(), insertPageNumberField(), is(), Node, pageField(), PageNumberChange (+9 more)

### Community 30 - "dependencies"
Cohesion: 0.11
Nodes (17): dependencies, @docx-editor.dev/core@^2.33.0, @docx-editor.dev/editor-api@2.33.0, @docx-editor.dev/i18n@^2.33.0, @docx-editor.dev/react@^2.33.0, @floating-ui/react@^0.27.20, page-mascot@^0.1.0, react@latest (+9 more)

### Community 31 - "StorageManager.tsx"
Cohesion: 0.17
Nodes (12): Dirs, Feedback, StorageManager(), T, checkMessageKey, DestinationKind, Key, StorageField (+4 more)

### Community 32 - "WordcraftEditor.tsx"
Cohesion: 0.25
Nodes (12): fontConfiguration(), decodeDocx(), encodeDocx(), FailureKind, Pending, WordcraftEditor, advanceWordcraftStage(), MAX_WORDCRAFT_DOCX_BYTES (+4 more)

### Community 33 - "count.rs"
Cohesion: 0.17
Nodes (8): Group, report(), reports_missing_numbers_in_both_languages(), Scan, scan(), count_scan(), scan(), label()

### Community 34 - "RulerControls.tsx"
Cohesion: 0.27
Nodes (13): @docx-editor.dev/core, Alignment, alignments, Guide, measure(), RulerControls(), moveTabStop(), putTabStop() (+5 more)

### Community 35 - "wordcraft-cache.mjs"
Cohesion: 0.18
Nodes (12): applyCleanup(), assertIdle(), candidates, categoryFor(), limitGiB, main(), root, scanCache() (+4 more)

### Community 36 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 37 - "main.tsx"
Cohesion: 0.18
Nodes (7): @tauri-apps/api@^2.12.4, @tauri-apps/plugin-dialog@^2.8.4, @tauri-apps/api, @tauri-apps/plugin-dialog, desktopApi, listenForFolderDrops(), workbookFilter

### Community 38 - "SignaturePage.tsx"
Cohesion: 0.19
Nodes (10): unsavedWorkspaces(), HistoryEntry, OnlineUpdate, Progress, RuntimeStatus, Update, UpdateManager(), activate() (+2 more)

### Community 39 - "performance-benchmark.mjs"
Cohesion: 0.19
Nodes (10): call(), evaluate(), ExcelJS, invoke(), measure(), page, pending, require (+2 more)

### Community 40 - "ReadPageOverview.tsx"
Cohesion: 0.39
Nodes (11): args, catalog(), filesUnder(), keygen(), keyId(), option(), pack(), safePath() (+3 more)

### Community 41 - "exceljs"
Cohesion: 0.24
Nodes (6): exceljs@^4.4.0, exceljs, ExcelJS, translationHeaders, applyRegisterExcelFormatting(), exportTranslations()

### Community 42 - "wordcraft-webview2-smoke.mjs"
Cohesion: 0.22
Nodes (9): appData, evaluate(), page, pending, projectRoot, send(), smokeDir, socket (+1 more)

### Community 43 - "Frog Reaction Sticker Set"
Cohesion: 0.20
Nodes (10): Blushing Happiness, Dizziness, Frog Reaction Sticker Set, Happy Expression, Laughter, Love Expression, Sleepiness, Sparkling Delight (+2 more)

### Community 44 - "word-fidelity-smoke.mjs"
Cohesion: 0.31
Nodes (7): evaluate(), invoke(), page, pending, send(), socket, wait()

### Community 45 - "default.json"
Cohesion: 0.28
Nodes (8): amountInWords(), englishOnes, englishTens, englishTriplet(), englishUnits, vietnameseOnes, vietnameseTriplet(), vietnameseUnits

### Community 46 - "ReadPageOverview.tsx"
Cohesion: 0.47
Nodes (6): readPageColumns(), shouldShowPrintOverview(), clonePreviewPage(), copyCanvases(), Preview(), ReadPageOverview()

### Community 47 - "Direct-Child PDF Scanning"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 48 - "IBM Plex Sans"
Cohesion: 0.33
Nodes (6): get_signature_settings(), import_signature_workbook(), new_signature_workbook(), refresh_signature_workbook(), save_signature_workbook(), signature_settings()

### Community 49 - "build.rs"
Cohesion: 0.40
Nodes (5): GitHub Release Publication, npm Test Suite, Portable App Build, Release Tag Version Check, Windows Portable Release Workflow

### Community 50 - "Application Icon"
Cohesion: 0.83
Nodes (4): Frog Direction Sprite Sheet, Frog Facial Expressions, Green Frog Character, Frog Pose Variations

### Community 52 - "main.rs"
Cohesion: 0.50
Nodes (4): Overlapping Circular Motif, Dark Green Square Background, Square 142x142 Logo Icon, Teal and Gold Palette

### Community 53 - "Filename and Path Validation"
Cohesion: 0.50
Nodes (3): create_word_template(), import_word_template(), list_word_templates()

### Community 55 - "B6H HTML Entry Point"
Cohesion: 0.67
Nodes (3): B6H HTML Entry Point, src/main.tsx Module Entry, React Root Element

### Community 57 - "getUint8ArrayMemory0"
Cohesion: 0.67
Nodes (3): Interlocking Circular Motif, Abstract Orbital Logo, Teal and Yellow Palette

## Knowledge Gaps
- **43 isolated node(s):** `BOARD_DONE_MS`, `b6h`, `b6h-update-runner`, `Blushing Happiness`, `Dizziness` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 460 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App()` connect `App` to `HelpChatbot.tsx`, `main.tsx`, `CalendarWorkspace.tsx`, `SignaturePage.tsx`, `ui.tsx`, `exceljs`, `SignaturePage.tsx`, `WordWorkspace.tsx`, `CopiesPage.tsx`, `scripts`, `StorageManager.tsx`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `load()` (e.g. with `signature_save_does_not_replace_a_workbook_locked_without_delete_access()` and `signature_save_rejects_partially_occupied_manual_stt()`) actually correct?**
  _`load()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BOARD_DONE_MS`, `b6h`, `b6h-update-runner` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `workbook.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06116129032258064 - nodes in this community are weakly interconnected._
- **Why does `react` connect `ui.tsx` to `WordcraftEditor.tsx`, `RulerControls.tsx`, `HelpChatbot.tsx`, `CalendarWorkspace.tsx`, `main.tsx`, `SignaturePage.tsx`, `WordWorkspace.tsx`, `SignaturePage.tsx`, `ReadPageOverview.tsx`, `CopiesPage.tsx`, `package.json`, `dependencies`, `StorageManager.tsx`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `calendar_shards.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.0805984555984556 - nodes in this community are weakly interconnected._
- **Why does `@docx-editor.dev/core` connect `RulerControls.tsx` to `wordcraft-webview2-smoke.mjs`, `WordWorkspace.tsx`, `docx.ts`, `package.json`, `pageNumbers.ts`, `dependencies`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._