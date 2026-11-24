# B6H v3.0.7 - Main Release Candidate

- Improve Settings storage management and validate destination paths through the new Core command.
- Add numeric four-part display versions for future hotfixes; the next hotfix identity after this release is v3.0.7.0001.
- Route the Core update before the Frontend update. The original v3.0.4 updater must receive a signed catalog containing only Core-compatible packages; the upgraded Core can then read the full signed catalog.
- Frontend and Core use version 3.0.7. Wordcraft and Update Runner remain unchanged.
- The lightweight Windows x64 Setup is built but is unsigned by Authenticode. Verify its SHA-256 checksum before installation.
- Signed packages, catalogs, and a real v3.0.4-to-v3.0.7 desktop activation test remain release gates. Do not publish without the owner's separate authorization.
