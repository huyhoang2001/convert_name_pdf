# Translation STT parity implementation

## Confirmed workbook evidence

The supplied `BẢN DỊCH 2026.xlsx.xlsx` was inspected read-only. Its only worksheet is `2026`; physical row 478 has no value in column A (STT), while columns B:H contain a date, person, document, language pair, certifier, quantity, and fee. The row is not hidden or merged. Row 477 has STT 476, row 479 has STT 477, and row 480 has STT 478. These neighboring numbers do not establish who owns the business data at row 478, so no STT can safely be inferred. The underlying cause of the reported error is therefore confirmed as a populated business row with a blank STT; the workbook provides no evidence explaining how that STT was lost.

The verified baseline workbook SHA-256 is `9a20485cc58086957657df30fea65bb4aa0763ec9c302291038087709e84bf4b`. During final verification a different version was observed at the download path; it was preserved separately and the download was restored from a byte-identical copy of this baseline. The current download matches this hash. The source of the intervening version is unknown; see `TRANSLATION_STT_LANGUAGE_AUTOCOMPLETE_REPORT.md` for the recovery details and remaining ownership blocker.

## Implementation

- `src-tauri/src/workbook.rs`: Translation no longer derives a missing STT from display order when creating a workbook. Save detects any populated row without STT and reports its sheet and physical Excel row, including rows omitted from the submitted UI model. Reconciliation requires an explicit user-supplied positive STT and revalidates the workbook revision, source row ownership fields, and blank-STT state before moving the business data. Existing duplicate confirmation and ordered insertion are used. Business cells at the ambiguous source are cleared only after the destination write succeeds.
- `src/ui.tsx`: surfaces the exact missing-STT location, blocks deletion of an ambiguous row, and provides an explicit STT reconciliation flow. Reconciliation remains a draft until normal workbook save succeeds. Import/refresh warns before replacing dirty work and detects unresolved rows.
- `src/locales/en.json`, `src/locales/vi.json`: added localized missing-STT and reconciliation messages.

The rest of Translation’s existing data model, custom columns, language defaults, quantity, fees, autocomplete, JSON cache, and workbook-backed save path were retained. Signature-specific behavior remains in the existing Signature implementation.

## Validation results

- `npx.cmd tsc -b --pretty false`: passed.
- `node --test tests/signatureText.test.mjs tests/register-excel-format.test.mjs`: 16 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib workbook::tests`: 43 passed, 1 ignored (existing manual Signature workbook audit).
- New Rust coverage simulates the missing-STT row at physical row 478, verifies the exact diagnostic, verifies no workbook write on unresolved/invalid ownership, and verifies explicitly assigned STT reconciliation with confirmed duplicate handling.
- The actual B6H Tauri application displayed the row 478 diagnostic. On a disposable copy, an explicit test STT was entered and saved. Excel opened, closed, and reopened that copy and showed the new record. **However, the reopened copy also contained unexpected business data at formerly empty row 547 (STT 545), and the resulting workbook had one more business row than the source besides the explicit test reconciliation.** This is a failed save-integrity check; the run cannot be considered a clean end-to-end pass. The anomaly was not present in the untouched source copy and is not explained by the passing backend tests. No production workbook was used for this save.
- The supplied workbook retains its original SHA-256. No release, package, commit, push, tag, or cargo clean command was run.

## Remaining blocker

Determine why the actual-application save test populated row 547 with an unrelated record, reproduce it with a captured UI save payload, and correct the mapping or test interaction as evidence shows. Until the extra-row anomaly is explained and a fresh disposable copy passes Save → Close → Reopen without unrelated row changes, end-to-end save integrity is **not verified**. Also, Excel COM verified the saved test copy, but a manual visual inspection in the Excel UI was not completed.
