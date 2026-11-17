# B6H v2.0.22

- Fixed Signature Authentication record ordering: a new manual STT is placed before the next higher group, an empty canonical Excel slot is reused, and confirmed duplicates are inserted beside their group. The table scrolls to and highlights the saved record.
- Preserved canonical STT slots, missing-number gaps, formulas, and unrelated worksheet data during save and deletion. Excel persistence refreshes physical row mappings and validates the saved workbook after reopening it.
- Kept STTs such as `01` visible with leading zeros in Excel and the application, including confirmed duplicate rows.
- Disabled browser autofill on the STT field and corrected light/dark hover text contrast in document suggestions.
- Reused and validated the existing Wordcraft JavaScript/WASM runtime; no Wordcraft source rebuild was needed.

The Windows x64 portable executable and its SHA-256 checksum are attached to this release.
