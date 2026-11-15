# B6H v2.0.16

- Added a versioned English and Vietnamese UI knowledge index. The help chatbot uses the active workspace to locate verified controls and asks for clarification when a command such as Save is ambiguous.
- Limited online help to a small set of relevant UI entries. The native bridge validates those entry IDs and the persisted 20-question session before sending a request.
- Added Calendar Export backup and Import backup controls connected to the existing JSON backup handlers.
- Refreshed the source architecture map and documented the Graphify navigation policy for future B6H changes.
- Included the existing local Storage Manager, Calendar storage, Wordcraft host, and printing changes from the authoritative B6H worktree; the full Node and Rust test suites passed for this combined source.
- Reused the verified Wordcraft runtime assets. No Wordcraft source rebuild was needed.

The portable Windows executable and its SHA-256 checksum are attached to this release.
