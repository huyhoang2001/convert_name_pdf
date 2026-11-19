# Graph Report - convert_name_pdf-main  (2026-11-19)

## Corpus Check
- 142 files · ~125,165 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: .ico 12, (none) 5, .css 3)

## Summary
- 1718 nodes · 4355 edges · 88 communities (61 shown, 27 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 180 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8563ae79`
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
- native-smoke.mjs
- build-wordcraft.mjs
- pdf.rs
- ref_node_assert
- printing.rs
- CopiesPage.tsx
- approved_url
- App
- tauri.conf.json
- docx.ts
- user_dir
- with
- lib.rs
- update-e2e.mjs
- package.json
- settings
- scripts
- pageNumbers.ts
- RulerControls.tsx
- StorageManager.tsx
- WordcraftEditor.tsx
- save_selector_settings
- dependencies
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
- destination_path
- Direct-Child PDF Scanning
- updates_dir
- build.rs
- Application Icon
- B6H Business Rules Document
- main.rs
- write_json
- B6H HTML Entry Point
- update.rs
- getUint8ArrayMemory0
- Direct-Child PDF Scanning
- wordcraft-assets.test.mjs
- signature-fee.d.ts
- Application Icon
- Application Icon
- discover_online_updates
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
- mark_runtime_ready
- update_history
- printDocument.ts
- active_asset_at

## God Nodes (most connected - your core abstractions)
1. `App()` - 64 edges
2. `import()` - 51 edges
3. `load()` - 35 edges
4. `replace()` - 34 edges
5. `changes()` - 34 edges
6. `full()` - 33 edges
7. `base()` - 30 edges
8. `save_signature()` - 30 edges
9. `data()` - 29 edges
10. `item()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `run_pdf()` --references--> `RunResult`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/pdf.rs
- `install_update_from_file()` --references--> `PackageInfo`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs
- `download_online_update()` --references--> `PackageInfo`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs
- `activate_update()` --calls--> `schedule_package()`  [EXTRACTED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs
- `rollback_update()` --calls--> `schedule_rollback()`  [EXTRACTED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs

## Import Cycles
- 1-file cycle: `src-tauri/src/storage.rs -> src-tauri/src/storage.rs`

## Hyperedges (group relationships)
- **Frog Character Pose and Expression Variations** — public_frog_directions_frog_character, public_frog_directions_pose_variations, public_frog_directions_facial_expressions [EXTRACTED 1.00]
- **Safe PDF Run Pipeline** — readme_preview_before_run, readme_backup_first_rule, readme_original_file_preservation, readme_duplicate_preflight [EXTRACTED 1.00]
- **Windows Portable Release Pipeline** — github_workflows_release_tag_version_check, github_workflows_release_npm_tests, github_workflows_release_portable_build, github_workflows_release_github_release [EXTRACTED 1.00]

## Communities (88 total, 27 thin omitted)

### Community 0 - "workbook.rs"
Cohesion: 0.06
Nodes (114): append_copies(), append_register(), apply_row_locators(), auto_fit_uses_full_matrix_when_first_row_is_merged(), C_ALIASES, C_KEYS, C_VI, cell() (+106 more)

### Community 1 - "calendar_shards.rs"
Cohesion: 0.07
Nodes (121): calendar_date(), append(), base(), benchmark_index_delta_saves(), benchmark_legacy_and_shards(), board_done_window_is_72_hours_and_history_stays_queryable(), board_includes_active_events_across_years_and_upgrades_old_summaries(), build_shards() (+113 more)

### Community 2 - "storage.rs"
Cohesion: 0.07
Nodes (47): default_destinations(), get_translations(), reset_chat_session(), save_translations(), apply_category_changes(), apply_completion_transition(), BOARD_DONE_MS, board_done_visible() (+39 more)

### Community 3 - "modular_update.rs"
Cohesion: 0.09
Nodes (22): cancel_update_import(), discover_online_updates(), cancel_import(), CANCEL_IMPORT, Catalog, CatalogPackage, CatalogSequence, clear_staging() (+14 more)

### Community 4 - "update_runner.rs"
Cohesion: 0.07
Nodes (39): apply(), clear_install(), clear_readiness_markers(), clear_recovery(), commit_transaction(), copy_tree(), file_version(), finish_commit() (+31 more)

### Community 5 - "HelpChatbot.tsx"
Cohesion: 0.08
Nodes (45): react-markdown@^10.1.0, remark-gfm@^4.0.1, react-markdown, remark-gfm, answerQuestion(), blockedQuestion(), copiesFields, indexedFaqs (+37 more)

### Community 6 - "CalendarWorkspace.tsx"
Cohesion: 0.06
Nodes (56): boardDoneVisible(), classifyDeadline(), countOverdue(), dateNumber(), deadlineClockChanged(), DeadlineWarning, Item, itemDeadline() (+48 more)

### Community 7 - "chat.rs"
Cohesion: 0.07
Nodes (40): accepted_request(), ask(), blocked(), cancel(), cancellation_before_request_registration_is_retained_once(), CancellationRegistry, CANCELLATIONS, CancelRegistration (+32 more)

### Community 8 - "word.rs"
Cohesion: 0.06
Nodes (64): get_language(), mark_update_started(), open_recent_word_location(), remove_word_draft(), set_word_template_pinned(), update_recent_word_document(), language(), API (+56 more)

### Community 9 - "ui.tsx"
Cohesion: 0.07
Nodes (33): react, ChatKeySettings(), ChatKeyStatus, CopiesSheet, folderPathsFromDrop(), DropEvent, DropPosition, Props (+25 more)

### Community 10 - "WordWorkspace.tsx"
Cohesion: 0.09
Nodes (32): markWorkspaceUnsaved(), workspaces, RecentDocument, SaveWordInput, SaveWordResult, TemplateEntry, wordBridge, WordDraft (+24 more)

### Community 11 - "SignaturePage.tsx"
Cohesion: 0.13
Nodes (31): @tanstack/react-virtual@^3.14.22, @tanstack/react-virtual, formatRegisterDate(), parseRegisterDate(), canEnterSignatureFee(), emptyRow(), headerKeys, keys (+23 more)

### Community 12 - "native-smoke.mjs"
Cohesion: 0.15
Nodes (10): backup, call(), evaluate(), files, invoke(), output, page, pending (+2 more)

### Community 13 - "build-wordcraft.mjs"
Cohesion: 0.10
Nodes (33): addImportVersions(), addVersion(), built, checkPath, deployed, directoryBytes(), executableHash(), filesUnder() (+25 more)

### Community 14 - "pdf.rs"
Cohesion: 0.08
Nodes (33): Group, report(), reports_missing_numbers_in_both_languages(), Scan, scan(), count_scan(), preview(), scan() (+25 more)

### Community 15 - "ref_node_assert"
Cohesion: 0.13
Nodes (9): saveCalendarBackup(), formatFooterDate(), msUntilNextLocalDay(), substituteMissingFonts(), displayWordPath(), nextWordZoom(), configuration, rows (+1 more)

### Community 16 - "printing.rs"
Cohesion: 0.13
Nodes (18): open_word_printer_properties(), print_word_manual_pass(), print_word_pdf(), decode_pdf(), duplex_for_mode(), installed_printer_capabilities_have_the_bridge_shape(), MAX_PRINT_PDF_BYTES, open_properties() (+10 more)

### Community 17 - "CopiesPage.tsx"
Cohesion: 0.12
Nodes (28): blankCopiesRow(), copiesSuggestions(), decrementCopiesCount(), isCopiesSaveShortcut, isRegisterSaveShortcut(), amount(), blankSheet(), CopiesApi (+20 more)

### Community 18 - "approved_url"
Cohesion: 0.33
Nodes (5): approved_url(), github_release(), GitHubAsset, GitHubRelease, update_client()

### Community 19 - "App"
Cohesion: 0.09
Nodes (17): App(), changeTranslationSttMode(), clearTranslationCache(), commitTranslationRow(), confirmTranslationDuplicate(), displayReport(), doPreview(), nextPage() (+9 more)

### Community 20 - "tauri.conf.json"
Cohesion: 0.07
Nodes (28): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+20 more)

### Community 21 - "docx.ts"
Cohesion: 0.17
Nodes (26): attr(), blankWordDocument(), canonical(), checkDocxOpen(), checkDocxOutput(), checkDocxRoundTrip(), checkDocxSave(), descendants() (+18 more)

### Community 22 - "user_dir"
Cohesion: 0.19
Nodes (13): calendar_rebuild_status(), cancel_calendar_rebuild(), query_calendar_data(), save_calendar_changes(), save_calendar_data(), calendar_data(), calendar_rebuild_status(), process_lock() (+5 more)

### Community 23 - "with"
Cohesion: 0.07
Nodes (33): B6H_TEST_SKIP_RUNONCE, B6H_UPDATE_TRUST_ROOTS, CARGO_TARGET_DIR, if, runs-on, steps, jobs, frontend-only (+25 more)

### Community 24 - "lib.rs"
Cohesion: 0.08
Nodes (52): activate_update(), check_for_updates(), clear_copies_cache(), clear_signature_cache(), create_word_template(), download_online_update(), export_copies_workbook(), export_translation_workbook() (+44 more)

### Community 25 - "update-e2e.mjs"
Cohesion: 0.08
Nodes (18): baseEnv, data, distribution, exe, install, local, profile, root (+10 more)

### Community 26 - "package.json"
Cohesion: 0.11
Nodes (23): author, description, devDependencies, fflate@0.8.3, @tauri-apps/cli@^2.12.4, @types/node@latest, @types/react@latest, @types/react-dom@latest (+15 more)

### Community 27 - "settings"
Cohesion: 0.08
Nodes (36): clear_translation_cache(), get_chatbot_visible(), get_destinations(), get_signature_stt_mode(), get_theme(), get_translation_stt_mode(), get_word_settings(), reset_destination() (+28 more)

### Community 28 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:frontend-update, build:installer, build:installer:core-test, build:installer:offline, build:installer:test, build:update-runner (+14 more)

### Community 29 - "pageNumbers.ts"
Cohesion: 0.22
Nodes (17): attr(), Attribute, changePageNumbers(), insertPageNumberField(), is(), Node, pageField(), PageNumberChange (+9 more)

### Community 30 - "RulerControls.tsx"
Cohesion: 0.27
Nodes (13): @docx-editor.dev/core, Alignment, alignments, Guide, measure(), RulerControls(), moveTabStop(), putTabStop() (+5 more)

### Community 31 - "StorageManager.tsx"
Cohesion: 0.21
Nodes (11): Dirs, Feedback, StorageManager(), T, checkMessageKey, DestinationKind, Key, StorageField (+3 more)

### Community 32 - "WordcraftEditor.tsx"
Cohesion: 0.33
Nodes (9): FailureKind, Pending, WordcraftEditor, advanceWordcraftStage(), MAX_WORDCRAFT_DOCX_BYTES, wordcraftBytes(), wordcraftMessage(), WordcraftStage (+1 more)

### Community 33 - "save_selector_settings"
Cohesion: 0.25
Nodes (8): save_selector_settings(), save_signature_settings(), copies_business_settings_are_validated_as_bounded_strings(), copies_defaults(), copies_defaults_fill_legacy_settings_but_keep_explicit_blanks(), save_selector_settings(), save_signature_settings(), validate_labels()

### Community 34 - "dependencies"
Cohesion: 0.11
Nodes (17): dependencies, @docx-editor.dev/core@^2.33.0, @docx-editor.dev/editor-api@2.33.0, @docx-editor.dev/i18n@^2.33.0, @docx-editor.dev/react@^2.33.0, exceljs@^4.4.0, @floating-ui/react@^0.27.20, page-mascot@^0.1.0 (+9 more)

### Community 35 - "wordcraft-cache.mjs"
Cohesion: 0.13
Nodes (14): root, server, applyCleanup(), assertIdle(), candidates, categoryFor(), limitGiB, main() (+6 more)

### Community 36 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 37 - "main.tsx"
Cohesion: 0.18
Nodes (7): react-dom@latest, @tauri-apps/api@^2.12.4, react-dom, @tauri-apps/api, desktopApi, listenForFolderDrops(), workbookFilter

### Community 38 - "SignaturePage.tsx"
Cohesion: 0.11
Nodes (24): unsavedWorkspaces(), actionKeys, activeVersion(), AvailableUpdate, componentKeys, HistoryEntry, OnlineUpdate, Progress (+16 more)

### Community 39 - "performance-benchmark.mjs"
Cohesion: 0.19
Nodes (10): call(), evaluate(), ExcelJS, invoke(), measure(), page, pending, require (+2 more)

### Community 40 - "ReadPageOverview.tsx"
Cohesion: 0.39
Nodes (11): args, catalog(), filesUnder(), keygen(), keyId(), option(), pack(), safePath() (+3 more)

### Community 41 - "exceljs"
Cohesion: 0.27
Nodes (5): exceljs, ExcelJS, translationHeaders, applyRegisterExcelFormatting(), exportTranslations()

### Community 42 - "wordcraft-webview2-smoke.mjs"
Cohesion: 0.22
Nodes (9): appData, evaluate(), page, pending, projectRoot, send(), smokeDir, socket (+1 more)

### Community 43 - "Frog Reaction Sticker Set"
Cohesion: 0.20
Nodes (10): Blushing Happiness, Dizziness, Frog Reaction Sticker Set, Happy Expression, Laughter, Love Expression, Sleepiness, Sparkling Delight (+2 more)

### Community 44 - "word-fidelity-smoke.mjs"
Cohesion: 0.27
Nodes (7): evaluate(), invoke(), page, pending, send(), socket, wait()

### Community 45 - "default.json"
Cohesion: 0.28
Nodes (8): amountInWords(), englishOnes, englishTens, englishTriplet(), englishUnits, vietnameseOnes, vietnameseTriplet(), vietnameseUnits

### Community 46 - "destination_path"
Cohesion: 0.40
Nodes (5): check_destination(), open_destination(), check_directory(), check_directory_reports_states_and_leaves_no_residue(), destination_path()

### Community 47 - "Direct-Child PDF Scanning"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 48 - "updates_dir"
Cohesion: 0.16
Nodes (25): get_staged_updates(), get_update_runtime_status(), run(), append_history(), discover_online_updates(), download_online_update(), import_package(), imports_existing_signed_packages_into_isolated_staging() (+17 more)

### Community 49 - "build.rs"
Cohesion: 0.40
Nodes (5): GitHub Release Publication, npm Test Suite, Portable App Build, Release Tag Version Check, Windows Portable Release Workflow

### Community 50 - "Application Icon"
Cohesion: 0.83
Nodes (4): Frog Direction Sprite Sheet, Frog Facial Expressions, Green Frog Character, Frog Pose Variations

### Community 52 - "main.rs"
Cohesion: 0.50
Nodes (4): Overlapping Circular Motif, Dark Green Square Background, Square 142x142 Logo Icon, Teal and Gold Palette

### Community 53 - "write_json"
Cohesion: 0.25
Nodes (17): activation_readiness_and_interrupted_startup_restore_safe_generations(), ActivationJournal, checked_runtime_file(), Manifest, ManifestFile, mark_ready_at(), prune_generations(), queue_recovery_notice() (+9 more)

### Community 55 - "B6H HTML Entry Point"
Cohesion: 0.67
Nodes (3): B6H HTML Entry Point, src/main.tsx Module Entry, React Root Element

### Community 57 - "getUint8ArrayMemory0"
Cohesion: 0.67
Nodes (3): Interlocking Circular Motif, Abstract Orbital Logo, Teal and Yellow Palette

### Community 59 - "wordcraft-assets.test.mjs"
Cohesion: 0.14
Nodes (9): args, result, root, target, output, root, checker, root (+1 more)

### Community 64 - "discover_online_updates"
Cohesion: 0.23
Nodes (10): compares_component_versions_without_accepting_malformed_values(), core_satisfies(), isolated_test_key_is_not_a_production_trust_root(), key_for(), read_manifest(), rejects_incompatible_core_and_contract_versions(), signed_catalog_rejects_modified_bytes_and_untrusted_signature(), validate_catalog() (+2 more)

### Community 87 - "mark_runtime_ready"
Cohesion: 0.25
Nodes (6): mark_runtime_ready(), atomic_write(), core_readiness_requires_the_active_transaction_identity(), mark_runtime_ready(), readiness_nonce(), replace_state()

### Community 89 - "update_history"
Cohesion: 0.50
Nodes (4): get_update_history(), read_json(), update_history(), UpdateHistoryEntry

### Community 90 - "printDocument.ts"
Cohesion: 0.27
Nodes (10): copiedStyles(), PageSize, PageSnapshot, printDocxPages(), PrintPageSource, printPageStyles(), releaseEditorFocus(), snapshotPage() (+2 more)

### Community 91 - "active_asset_at"
Cohesion: 0.50
Nodes (5): active_asset(), active_asset_at(), rejects_windows_unsafe_paths(), RuntimeAsset, safe_path()

## Knowledge Gaps
- **43 isolated node(s):** `b6h`, `BOARD_DONE_MS`, `b6h-update-runner`, `Blushing Happiness`, `Dizziness` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 467 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `ui.tsx` to `WordcraftEditor.tsx`, `dependencies`, `HelpChatbot.tsx`, `CalendarWorkspace.tsx`, `main.tsx`, `SignaturePage.tsx`, `WordWorkspace.tsx`, `SignaturePage.tsx`, `CopiesPage.tsx`, `package.json`, `RulerControls.tsx`, `StorageManager.tsx`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `b6h`, `BOARD_DONE_MS`, `b6h-update-runner` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `workbook.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.059593023255813955 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `calendar_shards.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06615776081424936 - nodes in this community are weakly interconnected._
- **Why does `@docx-editor.dev/core` connect `RulerControls.tsx` to `dependencies`, `wordcraft-webview2-smoke.mjs`, `WordWorkspace.tsx`, `docx.ts`, `package.json`, `pageNumbers.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Should `storage.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.07003367003367003 - nodes in this community are weakly interconnected._