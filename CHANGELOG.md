# Changelog

## [2.0.22] - 2026-11-17

### Fixed

- Manual Signature Authentication STTs now enter the correct logical position in the record list instead of appearing after the highest visible row.
- Confirmed duplicate records stay adjacent to their STT group, while empty canonical slots and Gap/Missing positions are preserved in the Excel worksheet.
- Newly inserted rows refresh their physical worksheet mappings; the application scrolls to, focuses, and highlights the correct record.
- STT display keeps leading zeros after saving and reopening Excel workbooks.
- Signature workbook saves validate the temporary workbook before replacing the source, and deletion removes only verified extra rows while retaining the canonical STT slot.
- The STT field no longer shows the browser's saved-info autofill popup, and document-suggestion hover colors remain readable in both themes.

### Verified

- Added workbook regression coverage for additions at the 890 boundary, canonical slots 01/750/789, confirmed duplicates, Auto 891, Manual 900, physical Excel rows, and mapping refresh after reopen.
- Reused the validated Wordcraft runtime without rebuilding its source.

## [2.0.21] - 2026-11-16

- See the [v2.0.21 release notes](https://github.com/huyhoang2001/convert_name_pdf/releases/tag/v2.0.21) for the previous release summary.
