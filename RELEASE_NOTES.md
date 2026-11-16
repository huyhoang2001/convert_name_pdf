# B6H v2.0.21

- Signature Authentication preserves workbook STT values and missing positions. Auto mode continues above the established high-water number; manual mode can fill a gap. Duplicate numbers prompt for confirmation, keep the entered data when validation is canceled, and group matching rows together with the same highlight. Duplicate detection on save still locates the existing row.
- Signature Authentication now keeps entered multiline text, uppercases authenticated-document and signer text in the table and Excel files, suggests previously used documents, highlights every search match, and exports register cells at 14-point type.
- Workbook imports and saves retain existing rows and formulas while writing updates to their source locations. Date entry and export use day-first `dd/mm/yyyy` formatting.
- Added saved Auto/Manual STT mode and a Settings toggle for chatbot visibility.
- Hardened Wordcraft asset reuse and publishing checks, including runtime inventory validation, source-build fingerprinting, safe staged publication, and Cargo cache size reporting. The previously validated Wordcraft WASM/JavaScript runtime is reused; no upstream source rebuild is required for this release.
- Updated the English and Vietnamese UI knowledge version and release documentation.

The Windows x64 portable executable and its SHA-256 checksum are attached to this release.
