# B6H v3.0.0 — Installer & Modular Update

- Added a lightweight current-user Windows x64 Setup.exe branded with the official B6H logo. The installer is under 50 MB and does not require administrator access.
- Added signed, independently updateable Frontend, Wordcraft, and Core components. Production update catalogs and packages use Ed25519 signatures, SHA-256 integrity checks, compatibility validation, and rollback/recovery support.
- The signed initial stable catalog is empty because v3.0.0 already includes all three components; modular packages are published when a component changes.
- Preserved application settings, JSON storage, workbook behavior, and existing workflows. The validated Wordcraft JavaScript/WASM runtime was reused; the large offline installer was not rebuilt.
- The Setup is unsigned by Authenticode because B6H is free and open source. Windows may show an unknown-publisher or SmartScreen warning. Verify the published SHA-256 checksum and download only from this official GitHub release.
