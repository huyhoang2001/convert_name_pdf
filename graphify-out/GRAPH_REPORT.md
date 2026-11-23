# Graph Report - B6H_ew  (2026-11-23)

## Corpus Check
- 163 files · ~135,803 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: .ico 12, (none) 5, .css 3)

## Summary
- 1855 nodes · 4639 edges · 109 communities (73 shown, 36 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f73ac61a`
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
- update.rs
- ui.tsx
- env
- word.rs
- RulerControls.tsx
- check_inner
- count.rs
- ref_node_fs
- pdf.rs
- CopiesPage.tsx
- build-wordcraft.mjs
- App
- settings
- runtime_status
- WordWorkspace.tsx
- tauri.conf.json
- AppHandle
- verify-online-discovery.mjs
- package.json
- scripts
- update-e2e.mjs
- UpdateManager.tsx
- exceljs
- State
- RegisterFolderDropTarget.tsx
- updates_dir
- signed_generation
- ref_node_fs
- pageNumbers.ts
- conciseTranslationLanguagePair
- release-plan.mjs
- performance-benchmark.mjs
- update-package.mjs
- compilerOptions
- dependencies
- Frog Reaction Sticker Set
- discover_online_updates
- user_dir
- Value
- ensure_home_favorites
- signed_generation
- build.rs
- Application Icon
- B6H Business Rules Document
- main.rs
- printDocument.ts
- wordcraft-webview2-smoke.mjs
- B6H HTML Entry Point
- update.rs
- getUint8ArrayMemory0
- Direct-Child PDF Scanning
- word-fidelity-smoke.mjs
- signature-fee.d.ts
- printing.rs
- Application Icon
- Application Icon
- lib.rs
- SignaturePage.tsx
- [2.0.22] - 2026-11-17
- Abstract Interlocking Loop Mark
- Translation STT parity implementation
- Báo cáo nguyên nhân và sửa lỗi Translation STT, ngôn ngữ, autocomplete
- adjacentTabId
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
- default.json
- update_history
- copiesWords.ts
- ref_node_assert
- query_calendar_at
- AGENTS.md
- copies-template_fe8154a9.md
- RELEASE_NOTES.md
- b6h
- b6h-update-runner
- defaultHomeFavorites
- main.tsx
- ReadPageOverview.tsx
- validate_calendar
- create_word_template
- get_update_runtime_status
- cancel_update_import
- mark_runtime_ready

## God Nodes (most connected - your core abstractions)
1. `App()` - 73 edges
2. `import()` - 53 edges
3. `load()` - 38 edges
4. `replace()` - 34 edges
5. `changes()` - 34 edges
6. `full()` - 33 edges
7. `base()` - 30 edges
8. `save_signature()` - 30 edges
9. `data()` - 29 edges
10. `item()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `STT và quyền sở hữu hàng` --references--> `applyTranslationSttReconciliation()`  [INFERRED]
  docs/translation/TRANSLATION_STT_LANGUAGE_AUTOCOMPLETE_REPORT.md → src/ui.tsx
- `STT và quyền sở hữu hàng` --references--> `saveTranslationFile()`  [INFERRED]
  docs/translation/TRANSLATION_STT_LANGUAGE_AUTOCOMPLETE_REPORT.md → src/ui.tsx
- `run_pdf()` --references--> `RunResult`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/pdf.rs
- `runtime_status()` --calls--> `version()`  [INFERRED]
  src-tauri/src/modular_update.rs → src-tauri/src/update.rs
- `benchmark_legacy_and_shards()` --calls--> `query_calendar_at()`  [INFERRED]
  src-tauri/src/storage/calendar_shards.rs → src-tauri/src/storage.rs

## Import Cycles
- 1-file cycle: `src-tauri/src/storage.rs -> src-tauri/src/storage.rs`

## Hyperedges (group relationships)
- **Frog Character Pose and Expression Variations** — public_frog_directions_frog_character, public_frog_directions_pose_variations, public_frog_directions_facial_expressions [EXTRACTED 1.00]
- **Safe PDF Run Pipeline** — readme_preview_before_run, readme_backup_first_rule, readme_original_file_preservation, readme_duplicate_preflight [EXTRACTED 1.00]
- **Windows Portable Release Pipeline** — github_workflows_release_tag_version_check, github_workflows_release_npm_tests, github_workflows_release_portable_build, github_workflows_release_github_release [EXTRACTED 1.00]

## Communities (109 total, 36 thin omitted)

### Community 0 - "workbook.rs"
Cohesion: 0.06
Nodes (123): append_copies(), append_register(), apply_row_locators(), apply_translation_excel_rules(), apply_translation_rules_to_sheets(), auto_fit_uses_full_matrix_when_first_row_is_merged(), C_ALIASES, C_KEYS (+115 more)

### Community 1 - "calendar_shards.rs"
Cohesion: 0.08
Nodes (101): append(), base(), benchmark_index_delta_saves(), benchmark_legacy_and_shards(), board_done_window_is_72_hours_and_history_stays_queryable(), board_includes_active_events_across_years_and_upgrades_old_summaries(), build_shards(), byte_rollover_and_recent_done_keep_cross_year_access() (+93 more)

### Community 2 - "storage.rs"
Cohesion: 0.10
Nodes (26): check_destination(), apply_completion_transition(), BOARD_DONE_MS, board_done_visible(), board_visibility_uses_exact_elapsed_72_hours(), calendar_category_counts(), CALENDAR_FILE, CALENDAR_LOCK (+18 more)

### Community 3 - "modular_update.rs"
Cohesion: 0.08
Nodes (24): atomic_write(), BUNDLED_FRONTEND_VERSION, BUNDLED_WORDCRAFT_VERSION, CANCEL_IMPORT, CatalogSequence, ComponentSequence, core_readiness_requires_the_active_transaction_identity(), CORE_VERSION (+16 more)

### Community 4 - "update_runner.rs"
Cohesion: 0.07
Nodes (39): apply(), clear_install(), clear_readiness_markers(), clear_recovery(), commit_transaction(), copy_tree(), file_version(), finish_commit() (+31 more)

### Community 5 - "HelpChatbot.tsx"
Cohesion: 0.08
Nodes (44): react-markdown@^10.1.0, remark-gfm@^4.0.1, react-markdown, remark-gfm, answerQuestion(), blockedQuestion(), copiesFields, indexedFaqs (+36 more)

### Community 6 - "CalendarWorkspace.tsx"
Cohesion: 0.06
Nodes (55): boardDoneVisible(), classifyDeadline(), countOverdue(), dateNumber(), deadlineClockChanged(), DeadlineWarning, Item, itemDeadline() (+47 more)

### Community 7 - "chat.rs"
Cohesion: 0.07
Nodes (40): accepted_request(), ask(), blocked(), cancel(), cancellation_before_request_registration_is_retained_once(), CancellationRegistry, CANCELLATIONS, CancelRegistration (+32 more)

### Community 8 - "update.rs"
Cohesion: 0.11
Nodes (10): mark_update_started(), API, BUSY, compares_release_versions_and_rejects_invalid_executables(), legacy_updates_enabled(), mark_started(), require_legacy_updates(), target() (+2 more)

### Community 9 - "ui.tsx"
Cohesion: 0.07
Nodes (33): react, ChatKeySettings(), ChatKeyStatus, CopiesSheet, folderPathsFromDrop(), defaultHomeFavorites, sidebarHomeFeatures(), toggleHomeFeatureFavorite() (+25 more)

### Community 10 - "env"
Cohesion: 0.04
Nodes (47): concurrency, cancel-in-progress, group, B6H_BASE_TAG, B6H_CORE_CHANGED, B6H_EXPECTED_COMPONENTS, B6H_FRONTEND_CHANGED, B6H_ONLINE_DISCOVERY_SMOKE (+39 more)

### Community 11 - "word.rs"
Cohesion: 0.11
Nodes (45): open_recent_word_location(), remove_word_draft(), set_word_template_pinned(), update_recent_word_document(), bad_docx_is_rejected(), create_template(), document_path(), documents_use_template_and_day_month_folder() (+37 more)

### Community 12 - "RulerControls.tsx"
Cohesion: 0.27
Nodes (13): @docx-editor.dev/core, Alignment, alignments, Guide, measure(), RulerControls(), moveTabStop(), putTabStop() (+5 more)

### Community 13 - "check_inner"
Cohesion: 0.35
Nodes (10): check_for_updates(), get_language(), language(), check(), check_inner(), confirm(), is_exe(), message() (+2 more)

### Community 14 - "count.rs"
Cohesion: 0.17
Nodes (8): Group, report(), reports_missing_numbers_in_both_languages(), Scan, scan(), count_scan(), scan(), label()

### Community 15 - "ref_node_fs"
Cohesion: 0.08
Nodes (21): args, result, root, target, backup, call(), evaluate(), files (+13 more)

### Community 16 - "pdf.rs"
Cohesion: 0.12
Nodes (25): preview(), absolute_dir(), backup_precedes_output_and_sources_survive(), build(), copy_phase(), copy_verified(), Destinations, FileEntry (+17 more)

### Community 17 - "CopiesPage.tsx"
Cohesion: 0.12
Nodes (29): classifyChatError(), blankCopiesRow(), copiesSuggestions(), decrementCopiesCount(), isCopiesSaveShortcut, isRegisterSaveShortcut(), amount(), blankSheet() (+21 more)

### Community 18 - "build-wordcraft.mjs"
Cohesion: 0.10
Nodes (33): addImportVersions(), addVersion(), built, checkPath, deployed, directoryBytes(), executableHash(), filesUnder() (+25 more)

### Community 19 - "App"
Cohesion: 0.09
Nodes (22): STT và quyền sở hữu hàng, StorageManager(), App(), applyTranslationSttReconciliation(), changeTranslationSttMode(), clearTranslationCache(), confirmTranslationDuplicate(), displayReport() (+14 more)

### Community 20 - "settings"
Cohesion: 0.16
Nodes (21): chatbot_visible(), clear_translations(), destinations(), file(), read(), reset_destination(), save_chatbot_visible(), save_destination() (+13 more)

### Community 21 - "runtime_status"
Cohesion: 0.29
Nodes (8): activate_update(), is_newer_than_active(), next_major(), only_offers_versions_newer_than_the_active_component(), rejects_incompatible_core_and_contract_versions(), runtime_status(), RuntimeStatus, schedule_package()

### Community 22 - "WordWorkspace.tsx"
Cohesion: 0.05
Nodes (70): RecentDocument, SaveWordInput, SaveWordResult, TemplateEntry, wordBridge, WordDraft, WordFont, WordPayload (+62 more)

### Community 23 - "tauri.conf.json"
Cohesion: 0.07
Nodes (28): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+20 more)

### Community 24 - "AppHandle"
Cohesion: 0.22
Nodes (19): clear_copies_cache(), clear_signature_cache(), export_copies_workbook(), get_signature_settings(), import_copies_workbook(), import_signature_workbook(), import_translation_workbook(), new_copies_workbook() (+11 more)

### Community 25 - "verify-online-discovery.mjs"
Cohesion: 0.18
Nodes (9): env, expected, install, invoke(), local, page(), profile, setup (+1 more)

### Community 26 - "package.json"
Cohesion: 0.11
Nodes (23): author, description, devDependencies, fflate@0.8.3, @tauri-apps/cli@^2.12.4, @types/node@latest, @types/react@latest, @types/react-dom@latest (+15 more)

### Community 27 - "scripts"
Cohesion: 0.08
Nodes (25): scripts, build, build:frontend-update, build:installer, build:installer:core-test, build:installer:offline, build:installer:test, build:update-runner (+17 more)

### Community 28 - "update-e2e.mjs"
Cohesion: 0.08
Nodes (18): baseEnv, data, distribution, exe, install, local, profile, root (+10 more)

### Community 29 - "UpdateManager.tsx"
Cohesion: 0.09
Nodes (28): Dirs, Feedback, T, checkMessageKey, DestinationKind, Key, StorageField, StorageSelector (+20 more)

### Community 30 - "exceljs"
Cohesion: 0.23
Nodes (6): exceljs, ExcelJS, translationHeaders, applyRegisterExcelFormatting(), applyTranslationExcelRules(), exportTranslations()

### Community 31 - "State"
Cohesion: 0.25
Nodes (7): open_external_word_document(), open_path(), open_recent_word_document(), read_report(), run_pdf(), save_count_report(), save_word_document()

### Community 32 - "RegisterFolderDropTarget.tsx"
Cohesion: 0.50
Nodes (3): DropEvent, DropPosition, Props

### Community 33 - "updates_dir"
Cohesion: 0.16
Nodes (22): download_online_update(), get_staged_updates(), install_update_from_file(), launch_core_update(), rollback_core_update(), rollback_update(), run(), clear_staging() (+14 more)

### Community 34 - "signed_generation"
Cohesion: 0.27
Nodes (14): activation_readiness_and_interrupted_startup_restore_safe_generations(), ActivationJournal, append_history(), mark_ready_at(), prune_generations(), queue_recovery_notice(), record_activation_history(), recover_activation_at() (+6 more)

### Community 35 - "ref_node_fs"
Cohesion: 0.18
Nodes (12): applyCleanup(), assertIdle(), candidates, categoryFor(), limitGiB, main(), root, scanCache() (+4 more)

### Community 36 - "pageNumbers.ts"
Cohesion: 0.22
Nodes (17): attr(), Attribute, changePageNumbers(), insertPageNumberField(), is(), Node, pageField(), PageNumberChange (+9 more)

### Community 37 - "conciseTranslationLanguagePair"
Cohesion: 0.48
Nodes (5): conciseLanguages, conciseTranslationLanguage(), conciseTranslationLanguagePair(), languageKey(), splitLanguagePair()

### Community 38 - "release-plan.mjs"
Cohesion: 0.26
Nodes (14): classifyChangedPaths(), compareVersions(), currentInputs(), jsonAt(), latestTag(), nextPatch(), option(), plan() (+6 more)

### Community 39 - "performance-benchmark.mjs"
Cohesion: 0.19
Nodes (10): call(), evaluate(), ExcelJS, invoke(), measure(), page, pending, require (+2 more)

### Community 40 - "update-package.mjs"
Cohesion: 0.32
Nodes (14): args, catalog(), compareVersion(), filesUnder(), keygen(), keyId(), option(), pack() (+6 more)

### Community 41 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 42 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @docx-editor.dev/core@^2.33.0, @docx-editor.dev/editor-api@2.33.0, @docx-editor.dev/i18n@^2.33.0, @docx-editor.dev/react@^2.33.0, exceljs@^4.4.0, @floating-ui/react@^0.27.20, page-mascot@^0.1.0 (+10 more)

### Community 43 - "Frog Reaction Sticker Set"
Cohesion: 0.20
Nodes (10): Blushing Happiness, Dizziness, Frog Reaction Sticker Set, Happy Expression, Laughter, Love Expression, Sleepiness, Sparkling Delight (+2 more)

### Community 44 - "discover_online_updates"
Cohesion: 0.23
Nodes (10): discover_online_updates(), approved_url(), Catalog, CatalogPackage, discover_online_updates(), github_release(), Requirements, signed_catalog_rejects_modified_bytes_and_untrusted_signature() (+2 more)

### Community 45 - "user_dir"
Cohesion: 0.36
Nodes (8): calendar_data(), calendar_rebuild_status(), process_lock(), cancel_calendar_rebuild(), query_calendar_data(), save_calendar_changes(), save_calendar_data(), user_dir()

### Community 46 - "Value"
Cohesion: 0.13
Nodes (23): apply_category_changes(), calendar_date(), chat_path(), chat_session(), chat_session_at(), chatbot_session_replaces_and_resets_only_its_unarchived_file(), date_part(), default_destinations() (+15 more)

### Community 47 - "ensure_home_favorites"
Cohesion: 0.20
Nodes (11): empty_pre_version_favorites_migrate_but_saved_empty_favorites_stay_empty(), ensure_home_favorites(), favorite_save_round_trips_without_touching_word_template_settings(), first_read_migrates_legacy_settings_without_dropping_other_values(), home_favorites(), normalize_home_favorites(), remove_saved_destination(), reset_removes_only_the_selected_saved_kind() (+3 more)

### Community 48 - "signed_generation"
Cohesion: 0.17
Nodes (17): active_asset(), active_asset_at(), checked_runtime_file(), compares_component_versions_without_accepting_malformed_values(), core_satisfies(), isolated_test_key_is_not_a_production_trust_root(), key_for(), Manifest (+9 more)

### Community 49 - "build.rs"
Cohesion: 0.40
Nodes (5): GitHub Release Publication, npm Test Suite, Portable App Build, Release Tag Version Check, Windows Portable Release Workflow

### Community 50 - "Application Icon"
Cohesion: 0.83
Nodes (4): Frog Direction Sprite Sheet, Frog Facial Expressions, Green Frog Character, Frog Pose Variations

### Community 51 - "B6H Business Rules Document"
Cohesion: 0.15
Nodes (8): Developer release maintenance, Incremental release flow, Local checks and preserved runtime, Signing identity, B6H installation and updates, Install, Updates and recovery, B6H Business Rules Document

### Community 52 - "main.rs"
Cohesion: 0.50
Nodes (4): Overlapping Circular Motif, Dark Green Square Background, Square 142x142 Logo Icon, Teal and Gold Palette

### Community 53 - "printDocument.ts"
Cohesion: 0.27
Nodes (10): copiedStyles(), PageSize, PageSnapshot, printDocxPages(), PrintPageSource, printPageStyles(), releaseEditorFocus(), snapshotPage() (+2 more)

### Community 54 - "wordcraft-webview2-smoke.mjs"
Cohesion: 0.22
Nodes (9): appData, evaluate(), page, pending, projectRoot, send(), smokeDir, socket (+1 more)

### Community 55 - "B6H HTML Entry Point"
Cohesion: 0.67
Nodes (3): B6H HTML Entry Point, src/main.tsx Module Entry, React Root Element

### Community 57 - "getUint8ArrayMemory0"
Cohesion: 0.67
Nodes (3): Interlocking Circular Motif, Abstract Orbital Logo, Teal and Yellow Palette

### Community 59 - "word-fidelity-smoke.mjs"
Cohesion: 0.27
Nodes (7): evaluate(), invoke(), page, pending, send(), socket, wait()

### Community 61 - "printing.rs"
Cohesion: 0.12
Nodes (20): get_word_refeed_preferences(), open_word_printer_properties(), print_word_manual_pass(), print_word_pdf(), save_word_refeed_preference(), decode_pdf(), duplex_for_mode(), installed_printer_capabilities_have_the_bridge_shape() (+12 more)

### Community 64 - "lib.rs"
Cohesion: 0.07
Nodes (43): calendar_rebuild_status(), cancel_calendar_rebuild(), clear_translation_cache(), default_destinations(), export_translation_workbook(), get_calendar_data(), get_chatbot_visible(), get_destinations() (+35 more)

### Community 65 - "SignaturePage.tsx"
Cohesion: 0.12
Nodes (35): @tanstack/react-virtual, formatRegisterDate(), parseRegisterDate(), canEnterSignatureFee(), emptyRow(), headerKeys, keys, nextAutoNumber() (+27 more)

### Community 68 - "[2.0.22] - 2026-11-17"
Cohesion: 0.33
Nodes (5): [2.0.21] - 2026-11-16, [2.0.22] - 2026-11-17, Changelog, Fixed, Verified

### Community 70 - "Translation STT parity implementation"
Cohesion: 0.33
Nodes (5): Confirmed workbook evidence, Implementation, Remaining blocker, Translation STT parity implementation, Validation results

### Community 71 - "Báo cáo nguyên nhân và sửa lỗi Translation STT, ngôn ngữ, autocomplete"
Cohesion: 0.22
Nodes (8): Autocomplete “Enter information”, Báo cáo nguyên nhân và sửa lỗi Translation STT, ngôn ngữ, autocomplete, Còn vướng, Cặp ngôn ngữ, Kiểm thử và xác minh, Kết luận, Nguyên nhân và thay đổi, Tệp đã sửa/thêm

### Community 83 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 84 - "update_history"
Cohesion: 0.50
Nodes (4): get_update_history(), read_json(), update_history(), UpdateHistoryEntry

### Community 85 - "copiesWords.ts"
Cohesion: 0.28
Nodes (8): amountInWords(), englishOnes, englishTens, englishTriplet(), englishUnits, vietnameseOnes, vietnameseTriplet(), vietnameseUnits

### Community 86 - "ref_node_assert"
Cohesion: 0.16
Nodes (7): saveCalendarBackup(), CopiesRandomData, randomCopiesDetails(), formatFooterDate(), msUntilNextLocalDay(), nextWordZoom(), data

### Community 87 - "query_calendar_at"
Cohesion: 0.28
Nodes (17): calendar_size_limit_checks_the_actual_pretty_bytes_before_replacing_file(), category_rename_and_delete_include_records_outside_the_queried_range(), indexed_changes_keep_order_append_new_items_and_validate_before_writing(), json_incremental_updates_preserve_unknown_fields_and_reject_stale_writes(), json_range_queries_keep_historical_overlap_and_board_hides_expired_done(), legacy_done_observation_is_distinct_from_actual_completion(), legacy_json_is_backed_up_before_first_write(), normalize_legacy_completions() (+9 more)

### Community 104 - "main.tsx"
Cohesion: 0.18
Nodes (7): @tauri-apps/api@^2.12.4, @tauri-apps/plugin-dialog@^2.8.4, @tauri-apps/api, @tauri-apps/plugin-dialog, desktopApi, listenForFolderDrops(), workbookFilter

### Community 105 - "ReadPageOverview.tsx"
Cohesion: 0.47
Nodes (6): readPageColumns(), shouldShowPrintOverview(), clonePreviewPage(), copyCanvases(), Preview(), ReadPageOverview()

### Community 106 - "validate_calendar"
Cohesion: 0.53
Nodes (6): calendar_accepts_optional_category_colors_and_legacy_data(), calendar_accepts_unicode_and_valid_records(), calendar_rejects_duplicate_ids_and_invalid_status(), calendar_rejects_invalid_or_unknown_category_colors(), valid(), validate_calendar()

### Community 107 - "create_word_template"
Cohesion: 0.50
Nodes (3): create_word_template(), import_word_template(), list_word_templates()

## Knowledge Gaps
- **44 isolated node(s):** `b6h`, `BOARD_DONE_MS`, `b6h-update-runner`, `defaultHomeFavorites`, `Blushing Happiness` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 533 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App()` connect `App` to `SignaturePage.tsx`, `HelpChatbot.tsx`, `conciseTranslationLanguagePair`, `main.tsx`, `ui.tsx`, `adjacentTabId`, `CopiesPage.tsx`, `WordWorkspace.tsx`, `UpdateManager.tsx`, `exceljs`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `b6h`, `BOARD_DONE_MS`, `b6h-update-runner` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `workbook.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.056807362741986674 - nodes in this community are weakly interconnected._
- **Why does `react` connect `ui.tsx` to `RegisterFolderDropTarget.tsx`, `SignaturePage.tsx`, `HelpChatbot.tsx`, `CalendarWorkspace.tsx`, `main.tsx`, `ReadPageOverview.tsx`, `dependencies`, `RulerControls.tsx`, `CopiesPage.tsx`, `WordWorkspace.tsx`, `package.json`, `UpdateManager.tsx`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `calendar_shards.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.0805984555984556 - nodes in this community are weakly interconnected._
- **Why does `@docx-editor.dev/core` connect `RulerControls.tsx` to `pageNumbers.ts`, `dependencies`, `wordcraft-webview2-smoke.mjs`, `WordWorkspace.tsx`, `package.json`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `storage.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._