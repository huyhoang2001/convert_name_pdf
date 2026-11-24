# Graph Report - B6H_ew  (2026-11-24)

## Corpus Check
- 164 files · ~138,084 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: .ico 12, (none) 5, .css 3)

## Summary
- 1872 nodes · 4657 edges · 115 communities (82 shown, 33 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bf7351f4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- workbook.rs
- calendar_shards.rs
- settings
- modular_update.rs
- update_runner.rs
- HelpChatbot.tsx
- CalendarWorkspace.tsx
- chat.rs
- WordWorkspace.tsx
- ui.tsx
- env
- word.rs
- RulerControls.tsx
- storage.rs
- WordcraftEditor.tsx
- ref_node_fs
- pdf.rs
- CopiesPage.tsx
- build-wordcraft.mjs
- App
- StorageManager.tsx
- discover_online_updates
- docx.ts
- tauri.conf.json
- AppHandle
- verify-online-discovery.mjs
- package.json
- scripts
- update-e2e.mjs
- UpdateManager.tsx
- exceljs
- wordcraft-cache.mjs
- active_asset_at
- stage_package_in
- signed_generation
- bridge.ts
- pageNumbers.ts
- Báo cáo nguyên nhân gốc: ký phát hành B6H v3.0.3 và v3.0.4
- release-plan.mjs
- performance-benchmark.mjs
- update-package.mjs
- compilerOptions
- dependencies
- Frog Reaction Sticker Set
- approved_url
- release
- release.yml
- authorize_production_signing
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
- with
- Value
- [2.0.22] - 2026-11-17
- Abstract Interlocking Loop Mark
- Translation STT parity implementation
- Báo cáo nguyên nhân và sửa lỗi Translation STT, ngôn ngữ, autocomplete
- steps
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
- chat_session
- get_update_runtime_status
- ensure_home_favorites
- TranslationPersonInput.tsx
- check_directory
- RegisterFolderDropTarget.tsx
- word-font-fallback.test.mjs

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
- `install_update_from_file()` --references--> `PackageInfo`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs
- `download_online_update()` --references--> `PackageInfo`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/modular_update.rs

## Import Cycles
- 1-file cycle: `src-tauri/src/storage.rs -> src-tauri/src/storage.rs`

## Hyperedges (group relationships)
- **Frog Character Pose and Expression Variations** — public_frog_directions_frog_character, public_frog_directions_pose_variations, public_frog_directions_facial_expressions [EXTRACTED 1.00]
- **Safe PDF Run Pipeline** — readme_preview_before_run, readme_backup_first_rule, readme_original_file_preservation, readme_duplicate_preflight [EXTRACTED 1.00]
- **Windows Portable Release Pipeline** — github_workflows_release_tag_version_check, github_workflows_release_npm_tests, github_workflows_release_portable_build, github_workflows_release_github_release [EXTRACTED 1.00]

## Communities (115 total, 33 thin omitted)

### Community 0 - "workbook.rs"
Cohesion: 0.06
Nodes (123): append_copies(), append_register(), apply_row_locators(), apply_translation_excel_rules(), apply_translation_rules_to_sheets(), auto_fit_uses_full_matrix_when_first_row_is_merged(), C_ALIASES, C_KEYS (+115 more)

### Community 1 - "calendar_shards.rs"
Cohesion: 0.07
Nodes (109): calendar_data(), append(), base(), benchmark_index_delta_saves(), benchmark_legacy_and_shards(), board_done_window_is_72_hours_and_history_stays_queryable(), board_includes_active_events_across_years_and_upgrades_old_summaries(), build_shards() (+101 more)

### Community 2 - "settings"
Cohesion: 0.09
Nodes (32): clear_translation_cache(), get_chatbot_visible(), get_signature_stt_mode(), get_theme(), get_translation_stt_mode(), save_chatbot_visible(), save_language(), save_signature_stt_mode() (+24 more)

### Community 3 - "modular_update.rs"
Cohesion: 0.08
Nodes (25): atomic_write(), BUNDLED_FRONTEND_VERSION, BUNDLED_WORDCRAFT_VERSION, CANCEL_IMPORT, CatalogSequence, ComponentSequence, core_readiness_requires_the_active_transaction_identity(), CORE_VERSION (+17 more)

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

### Community 8 - "WordWorkspace.tsx"
Cohesion: 0.12
Nodes (21): markWorkspaceUnsaved(), workspaces, TemplateEntry, WordPayload, EditorAccess, Tab, displayWordPath(), filterTemplates() (+13 more)

### Community 9 - "ui.tsx"
Cohesion: 0.07
Nodes (31): react, ChatKeySettings(), ChatKeyStatus, CopiesSheet, folderPathsFromDrop(), defaultHomeFavorites, sidebarHomeFeatures(), toggleHomeFeatureFavorite() (+23 more)

### Community 10 - "env"
Cohesion: 0.14
Nodes (14): B6H_BASE_TAG, B6H_CORE_CHANGED, B6H_EXPECTED_COMPONENTS, B6H_FRONTEND_CHANGED, B6H_ONLINE_DISCOVERY_SMOKE, B6H_PREVIOUS_SETUP, B6H_PUBLIC_KEY, B6H_RELEASE_DIR (+6 more)

### Community 11 - "word.rs"
Cohesion: 0.05
Nodes (68): cancel_calendar_rebuild(), get_language(), mark_update_started(), open_recent_word_location(), remove_word_draft(), set_word_template_pinned(), update_recent_word_document(), calendar_rebuild_status() (+60 more)

### Community 12 - "RulerControls.tsx"
Cohesion: 0.24
Nodes (14): @docx-editor.dev/core@^2.33.0, @docx-editor.dev/core, Alignment, alignments, Guide, measure(), RulerControls(), moveTabStop() (+6 more)

### Community 13 - "storage.rs"
Cohesion: 0.12
Nodes (20): BOARD_DONE_MS, board_done_visible(), board_visibility_uses_exact_elapsed_72_hours(), calendar_category_counts(), CALENDAR_FILE, CALENDAR_LOCK, category_counts_include_zeroes_and_count_items_in_one_result(), COPIES_ADDRESS (+12 more)

### Community 14 - "WordcraftEditor.tsx"
Cohesion: 0.28
Nodes (11): decodeDocx(), encodeDocx(), FailureKind, Pending, WordcraftEditor, advanceWordcraftStage(), MAX_WORDCRAFT_DOCX_BYTES, wordcraftBytes() (+3 more)

### Community 15 - "ref_node_fs"
Cohesion: 0.08
Nodes (21): args, result, root, target, backup, call(), evaluate(), files (+13 more)

### Community 16 - "pdf.rs"
Cohesion: 0.07
Nodes (33): Group, report(), reports_missing_numbers_in_both_languages(), Scan, scan(), count_scan(), preview(), scan() (+25 more)

### Community 17 - "CopiesPage.tsx"
Cohesion: 0.13
Nodes (27): @tanstack/react-virtual, blankCopiesRow(), copiesSuggestions(), decrementCopiesCount(), isCopiesSaveShortcut, isRegisterSaveShortcut(), amount(), blankSheet() (+19 more)

### Community 18 - "build-wordcraft.mjs"
Cohesion: 0.10
Nodes (33): addImportVersions(), addVersion(), built, checkPath, deployed, directoryBytes(), executableHash(), filesUnder() (+25 more)

### Community 19 - "App"
Cohesion: 0.10
Nodes (20): STT và quyền sở hữu hàng, App(), applyTranslationSttReconciliation(), changeTranslationSttMode(), clearTranslationCache(), confirmTranslationDuplicate(), displayReport(), doPreview() (+12 more)

### Community 20 - "StorageManager.tsx"
Cohesion: 0.21
Nodes (11): Dirs, Feedback, StorageManager(), T, checkMessageKey, DestinationKind, Key, StorageField (+3 more)

### Community 21 - "discover_online_updates"
Cohesion: 0.27
Nodes (10): discover_online_updates(), get_staged_updates(), Catalog, CatalogPackage, discover_online_updates(), is_newer_than_active(), Requirements, runtime_status() (+2 more)

### Community 22 - "docx.ts"
Cohesion: 0.17
Nodes (26): attr(), blankWordDocument(), canonical(), checkDocxOpen(), checkDocxOutput(), checkDocxRoundTrip(), checkDocxSave(), descendants() (+18 more)

### Community 23 - "tauri.conf.json"
Cohesion: 0.07
Nodes (28): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+20 more)

### Community 24 - "AppHandle"
Cohesion: 0.22
Nodes (19): clear_copies_cache(), clear_signature_cache(), export_copies_workbook(), import_copies_workbook(), import_signature_workbook(), import_translation_workbook(), new_copies_workbook(), new_signature_workbook() (+11 more)

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
Cohesion: 0.14
Nodes (19): unsavedWorkspaces(), actionKeys, activeVersion(), AvailableUpdate, componentKeys, formatBytes(), HistoryEntry, OnlineUpdate (+11 more)

### Community 30 - "exceljs"
Cohesion: 0.15
Nodes (11): exceljs, ExcelJS, translationHeaders, applyRegisterExcelFormatting(), applyTranslationExcelRules(), conciseLanguages, conciseTranslationLanguage(), conciseTranslationLanguagePair() (+3 more)

### Community 31 - "wordcraft-cache.mjs"
Cohesion: 0.18
Nodes (12): applyCleanup(), assertIdle(), candidates, categoryFor(), limitGiB, main(), root, scanCache() (+4 more)

### Community 32 - "active_asset_at"
Cohesion: 0.33
Nodes (7): active_asset(), active_asset_at(), checked_runtime_file(), ManifestFile, rejects_windows_unsafe_paths(), RuntimeAsset, safe_path()

### Community 33 - "stage_package_in"
Cohesion: 0.25
Nodes (15): run(), clear_staging(), download_online_update(), import_package(), imports_existing_signed_packages_into_isolated_staging(), PackageInfo, process_lock(), recover_activation() (+7 more)

### Community 34 - "signed_generation"
Cohesion: 0.24
Nodes (18): activation_readiness_and_interrupted_startup_restore_safe_generations(), ActivationJournal, append_history(), Manifest, mark_ready_at(), prune_generations(), queue_recovery_notice(), record_activation_history() (+10 more)

### Community 35 - "bridge.ts"
Cohesion: 0.16
Nodes (11): RecentDocument, SaveWordInput, SaveWordResult, wordBridge, WordDraft, WordFont, WordPrinter, WordRefeedPreference (+3 more)

### Community 36 - "pageNumbers.ts"
Cohesion: 0.22
Nodes (17): attr(), Attribute, changePageNumbers(), insertPageNumberField(), is(), Node, pageField(), PageNumberChange (+9 more)

### Community 37 - "Báo cáo nguyên nhân gốc: ký phát hành B6H v3.0.3 và v3.0.4"
Cohesion: 0.20
Nodes (9): Báo cáo nguyên nhân gốc: ký phát hành B6H v3.0.3 và v3.0.4, Bằng chứng và dòng thời gian, Các bước chính xác để tiếp tục v3.0.4, Có thể dùng lại khóa và cách phát hành cũ không?, Kết luận, Nguồn tài liệu GitHub, Phạm vi và giới hạn xác minh, Tệp thay đổi (+1 more)

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
Nodes (18): dependencies, @docx-editor.dev/editor-api@2.33.0, @docx-editor.dev/i18n@^2.33.0, @docx-editor.dev/react@^2.33.0, exceljs@^4.4.0, @floating-ui/react@^0.27.20, page-mascot@^0.1.0, react@latest (+10 more)

### Community 43 - "Frog Reaction Sticker Set"
Cohesion: 0.20
Nodes (10): Blushing Happiness, Dizziness, Frog Reaction Sticker Set, Happy Expression, Laughter, Love Expression, Sleepiness, Sparkling Delight (+2 more)

### Community 44 - "approved_url"
Cohesion: 0.33
Nodes (5): approved_url(), github_release(), GitHubAsset, GitHubRelease, update_client()

### Community 45 - "release"
Cohesion: 0.22
Nodes (9): B6H_UPDATE_TRUST_ROOTS, CARGO_TARGET_DIR, GH_TOKEN, release, env, environment, if, runs-on (+1 more)

### Community 46 - "release.yml"
Cohesion: 0.25
Nodes (7): concurrency, cancel-in-progress, group, jobs, name, permissions, contents

### Community 47 - "authorize_production_signing"
Cohesion: 0.25
Nodes (8): default, description, required, type, authorize_production_signing, on, workflow_dispatch, inputs

### Community 48 - "signed_generation"
Cohesion: 0.25
Nodes (9): compares_component_versions_without_accepting_malformed_values(), core_satisfies(), isolated_test_key_is_not_a_production_trust_root(), key_for(), read_manifest(), signed_catalog_rejects_modified_bytes_and_untrusted_signature(), validate_catalog(), validate_manifest() (+1 more)

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
Nodes (45): activate_update(), calendar_rebuild_status(), check_for_updates(), default_destinations(), download_online_update(), export_translation_workbook(), get_calendar_data(), get_destinations() (+37 more)

### Community 65 - "SignaturePage.tsx"
Cohesion: 0.13
Nodes (32): formatRegisterDate(), parseRegisterDate(), canEnterSignatureFee(), emptyRow(), headerKeys, keys, nextAutoNumber(), SearchText() (+24 more)

### Community 66 - "with"
Cohesion: 0.25
Nodes (8): with, cache, fetch-depth, key, node-version, path, restore-keys, targets

### Community 67 - "Value"
Cohesion: 0.26
Nodes (12): apply_category_changes(), apply_completion_transition(), completion_locks_exact_start_and_keeps_end_editable(), default_destinations(), default_destinations_value(), merge_item(), reopening_and_recompletion_keep_one_record_and_only_record_real_transitions(), save_calendar_changes_at() (+4 more)

### Community 68 - "[2.0.22] - 2026-11-17"
Cohesion: 0.33
Nodes (5): [2.0.21] - 2026-11-16, [2.0.22] - 2026-11-17, Changelog, Fixed, Verified

### Community 70 - "Translation STT parity implementation"
Cohesion: 0.33
Nodes (5): Confirmed workbook evidence, Implementation, Remaining blocker, Translation STT parity implementation, Validation results

### Community 71 - "Báo cáo nguyên nhân và sửa lỗi Translation STT, ngôn ngữ, autocomplete"
Cohesion: 0.22
Nodes (8): Autocomplete “Enter information”, Báo cáo nguyên nhân và sửa lỗi Translation STT, ngôn ngữ, autocomplete, Còn vướng, Cặp ngôn ngữ, Kiểm thử và xác minh, Kết luận, Nguyên nhân và thay đổi, Tệp đã sửa/thêm

### Community 72 - "steps"
Cohesion: 0.29
Nodes (7): steps, id, if, name, run, shell, uses

### Community 83 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 84 - "update_history"
Cohesion: 0.50
Nodes (4): get_update_history(), read_json(), update_history(), UpdateHistoryEntry

### Community 85 - "copiesWords.ts"
Cohesion: 0.27
Nodes (8): amountInWords(), englishOnes, englishTens, englishTriplet(), englishUnits, vietnameseOnes, vietnameseTriplet(), vietnameseUnits

### Community 86 - "ref_node_assert"
Cohesion: 0.17
Nodes (7): saveCalendarBackup(), CopiesRandomData, randomCopiesDetails(), formatFooterDate(), msUntilNextLocalDay(), nextWordZoom(), data

### Community 87 - "query_calendar_at"
Cohesion: 0.21
Nodes (17): calendar_date(), calendar_size_limit_checks_the_actual_pretty_bytes_before_replacing_file(), category_rename_and_delete_include_records_outside_the_queried_range(), date_part(), history_range_query_keeps_items_that_overlap_window(), indexed_changes_keep_order_append_new_items_and_validate_before_writing(), json_incremental_updates_preserve_unknown_fields_and_reject_stale_writes(), json_range_queries_keep_historical_overlap_and_board_hides_expired_done() (+9 more)

### Community 104 - "main.tsx"
Cohesion: 0.19
Nodes (6): @tauri-apps/plugin-dialog@^2.8.4, @tauri-apps/api, @tauri-apps/plugin-dialog, desktopApi, listenForFolderDrops(), workbookFilter

### Community 105 - "ReadPageOverview.tsx"
Cohesion: 0.47
Nodes (6): readPageColumns(), shouldShowPrintOverview(), clonePreviewPage(), copyCanvases(), Preview(), ReadPageOverview()

### Community 106 - "validate_calendar"
Cohesion: 0.53
Nodes (6): calendar_accepts_optional_category_colors_and_legacy_data(), calendar_accepts_unicode_and_valid_records(), calendar_rejects_duplicate_ids_and_invalid_status(), calendar_rejects_invalid_or_unknown_category_colors(), valid(), validate_calendar()

### Community 107 - "create_word_template"
Cohesion: 0.50
Nodes (3): create_word_template(), import_word_template(), list_word_templates()

### Community 108 - "chat_session"
Cohesion: 0.24
Nodes (11): reset_chat_session(), chat_path(), chat_session(), chat_session_at(), chatbot_session_replaces_and_resets_only_its_unarchived_file(), malformed_chat_session_is_reported_without_deleting_it(), reset_chat_session(), reset_chat_session_at() (+3 more)

### Community 109 - "get_update_runtime_status"
Cohesion: 0.20
Nodes (4): cancel_update_import(), get_update_runtime_status(), mark_runtime_ready(), cancel_import()

### Community 110 - "ensure_home_favorites"
Cohesion: 0.25
Nodes (9): empty_pre_version_favorites_migrate_but_saved_empty_favorites_stay_empty(), ensure_home_favorites(), favorite_save_round_trips_without_touching_word_template_settings(), first_read_migrates_legacy_settings_without_dropping_other_values(), home_favorites(), normalize_home_favorites(), save_home_favorites(), saved_favorites_deduplicate_ids_and_reject_invalid_values() (+1 more)

### Community 111 - "TranslationPersonInput.tsx"
Cohesion: 0.60
Nodes (5): filterRegisterSuggestions(), foldSuggestion(), translationPersonSuggestions(), Row, TranslationPersonInput()

### Community 112 - "check_directory"
Cohesion: 0.33
Nodes (6): check_destination(), check_destination_path(), open_destination(), check_directory(), check_directory_reports_states_and_leaves_no_residue(), destination_path()

### Community 113 - "RegisterFolderDropTarget.tsx"
Cohesion: 0.40
Nodes (4): DropEvent, DropPosition, Props, RegisterFolderDropTarget()

## Knowledge Gaps
- **44 isolated node(s):** `b6h`, `BOARD_DONE_MS`, `b6h-update-runner`, `defaultHomeFavorites`, `Blushing Happiness` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 546 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App()` connect `App` to `SignaturePage.tsx`, `HelpChatbot.tsx`, `CalendarWorkspace.tsx`, `main.tsx`, `ui.tsx`, `WordWorkspace.tsx`, `TranslationPersonInput.tsx`, `CopiesPage.tsx`, `RegisterFolderDropTarget.tsx`, `StorageManager.tsx`, `UpdateManager.tsx`, `exceljs`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `b6h`, `BOARD_DONE_MS`, `b6h-update-runner` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `workbook.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.056807362741986674 - nodes in this community are weakly interconnected._
- **Why does `react` connect `ui.tsx` to `SignaturePage.tsx`, `HelpChatbot.tsx`, `CalendarWorkspace.tsx`, `main.tsx`, `ReadPageOverview.tsx`, `dependencies`, `WordWorkspace.tsx`, `RulerControls.tsx`, `WordcraftEditor.tsx`, `TranslationPersonInput.tsx`, `CopiesPage.tsx`, `RegisterFolderDropTarget.tsx`, `StorageManager.tsx`, `package.json`, `UpdateManager.tsx`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `calendar_shards.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.07380952380952381 - nodes in this community are weakly interconnected._
- **Why does `@docx-editor.dev/core` connect `RulerControls.tsx` to `pageNumbers.ts`, `WordWorkspace.tsx`, `wordcraft-webview2-smoke.mjs`, `docx.ts`, `package.json`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Should `settings` be split into smaller, more focused modules?**
  _Cohesion score 0.08522727272727272 - nodes in this community are weakly interconnected._