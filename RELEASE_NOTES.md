# B6H v3.0.1 — Frontend Maintenance

- Added automatic due-today, due-soon, and overdue warnings for unfinished Calendar & To-do items, with localized Board filtering and counts across Board, Calendar, Timeline, and item details.
- Kept overdue items actionable across yearly partitions without changing their status, JSON records, ownership, or the 72-hour Done retention rule.
- Refined the Home Page heading and sidebar mascot presentation.
- Published a production-signed Frontend update package. The v3.0.0 Windows x64 Setup.exe and its SHA-256 sidecar are reused for new users; Rust Core, Wordcraft, and Setup.exe were not rebuilt.
- The Setup is unsigned by Authenticode because B6H is free and open source. Windows may show an unknown-publisher or SmartScreen warning. Verify its published SHA-256 checksum and download only from this official GitHub release.
