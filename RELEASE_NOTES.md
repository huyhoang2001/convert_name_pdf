# B6H v3.0.2 — Maintenance Release

- Enforced locale-independent `dd/mm/yyyy` display for native Excel date cells saved by Signature Authentication and Translation while preserving native Excel date values and existing text-date fields.
- Improved update lifecycle feedback, active-version filtering, history display, and localized status messages. Manual rollback controls are removed from Settings while automatic recovery and backend rollback remain available.
- Kept the existing Home page menu removal and Calendar & To-do overdue visibility behavior.
- Published a production-signed Frontend and Core update package. The Windows x64 Setup.exe and its SHA-256 sidecar are included for new users; the validated Wordcraft runtime was reused.
- The Setup is unsigned by Authenticode because B6H is free and open source. Windows may show an unknown-publisher or SmartScreen warning. Verify its published SHA-256 checksum and download only from this official GitHub release.
