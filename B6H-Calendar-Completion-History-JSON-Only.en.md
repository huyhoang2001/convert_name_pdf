# B6H Calendar & To-do — JSON-Only Completion History, 72-Hour Board Visibility and Dark-Mode Fix

**Status:** Implementation specification for AI coding agent  
**Authority:** This English document is the sole implementation specification. The Vietnamese translation is for the project owner only and is not a prerequisite.  
**Scope:** Existing React + TypeScript + Tauri/Rust B6H repository, Calendar & To-do selector only (except shared styling/utility changes strictly required for compatibility).  
**Execution:** Implement and test **locally only**. **DO NOT** package, commit, push, tag, increment version, or create a release.

## 1. Objective and non-negotiable constraints

Complete the Calendar & To-do behavior so that a Task/Event which has ever reached **Done** retains its original start date/time, can later be reopened, and remains available in historical Calendar/Timeline views. Completed board items appear in **Done for at most 72 hours** after their most recent completion and then disappear from **Board only**, without data deletion. Fix dark-theme mini-calendar date readability.

**B6H USES JSON-ONLY PERSISTENT STORAGE.** The existing Calendar JSON store (identify its real path/name and format from the working tree; `calendar.json` if that is what the application uses) remains authoritative.

**Strict prohibitions:**
- Do not add SQLite, `rusqlite`, `sqlx`, SQL, another DB engine, a second authoritative store, or any database migration.
- Do not replace current JSON data with a new schema. Preserve every existing key, valid record, ID, enum, backup/import/export format, and other modules' persistence.
- Do not silently delete, rewrite, reorder or normalize unrelated stored user data. Do not convert existing timestamps or time zones as a side effect.
- Do not change unrelated B6H behavior or UI/UX; no app reload/restart is needed for completion/archive updates.
- Do not overwrite pre-existing modified or untracked files. No destructive Git commands.
- Do not assume the user's prior SQLite plan was approved. If uncommitted SQLite changes already exist, inspect and report ownership/impact; request approval before undoing somebody else's changes. Do not build new functionality on SQLite.

## 2. Inspect actual implementation before editing

1. Inspect current `git status`, Calendar components, Board/Calendar/Timeline mapping, Task/Event types, existing JSON read/write commands, settings and backup routines, current tests and dark-theme CSS.
2. Find the actual JSON storage file location and how updates are persisted; do not guess filenames or API names.
3. Identify whether Events genuinely have a workflow status today. If not, add the minimal compatible status behavior required by this document without silently treating scheduled events as Done.
4. Map existing fields to: stable `id`, `status`, original start datetime, editable end datetime, completion datetime(s), category, and any recurrence series/occurrence IDs. Reuse existing fields where equivalent.
5. Capture baseline test results and representative UI/storage timing before changes. State any current working-tree problems in the final report.
6. If any schema or UI behavior is ambiguous, choose the **least invasive backward-compatible** change, document the assumption, and avoid changing unrelated modules.

## 3. Domain semantics and exact 72-hour rule

### 3.1 Task states

Use existing canonical names/values; visually display the existing labels **To Do**, **In Progress** (or current existing label **Progress**), **In Review**, **Done**. Do not rename persisted enum values or break existing filters. A Task is Done only after an explicit valid transition to that state.

### 3.2 Events

An Event is a scheduled occurrence, not automatically a completed Task. Where status controls for Events are required, support the same available four workflow states in the existing Event detail form and persistence, using a backward-compatible default for old Events. **An event ending in clock time does not automatically change to Done** unless the app already explicitly implements that behavior. Ordinary Events do not suddenly appear in Board unless Board already supports them or the product's established behavior requires it; if Board includes Events, apply the same 72-hour visibility rule to them. Calendar and Timeline continue showing both types as applicable.

### 3.3 First completion and immutable start

On the **first actual transition** from a non-Done state to Done:
- Preserve the **exact original stored start value**, including its time/offset/precision and original meaning; never replace it with `completedAt` or today's date.
- Mark that this record has ever been completed using a minimal additive compatible metadata field if not already derivable safely (e.g. `firstCompletedAt` and/or `startLocked`).
- Record `completedAt` as the actual completion instant; keep it distinct from the editable `endAt` / `endDate` field.
- Lock start-date **and start-time editing in both UI and backend** from this point onward. Disable/hide start-edit controls with a clear localized explanation. Backend must reject or ignore unauthorized attempts to alter the immutable start, even from stale UI payloads or imports as appropriate to their existing contract.
- Preserve pre-existing Task/Event properties and prevent new items from being created accidentally during state transitions.

Never infer a “first completion” merely from a past `endAt`. For legacy records already in Done, preserve their original start, lock it on the first load/update, and use a reliable existing completion timestamp if available. If it does not exist, **do not invent an exact historic completion time**; apply a documented conservative compatibility policy (e.g. a one-time observed-at timestamp for future visibility calculations, with a clear distinction from genuine completion time) and test it. Do not silently make historical Done items stay on Board forever.

### 3.4 Reopening and re-completion

For a record that **has ever been Done**, allow user-driven status changes to To Do, In Progress/Progress, In Review and Done:
- **Start remains immutable forever**, regardless of the new status.
- The **end date/time stays editable**, subject to existing validation and end >= start (unless a current product rule explicitly differs).
- On reopening from Done to non-Done, restore normal Board eligibility for Tasks in their chosen column; do not duplicate or delete the history record.
- On transitioning back to Done, update the **latest actual `completedAt`**, restart the 72-hour window, retain `firstCompletedAt` and immutable start; record a status history entry.
- Append status history **only on an actual status change**, never on a simple title edit, save, load, filter, or app restart. Store timestamps in a stable, documented format compatible with current code.
- Editing the end date does **not** reset the archive timer. The clock is determined exclusively by most recent transition to Done.
- If the user merely edits an item while it is already Done, do not renew the 72-hour window.

### 3.5 Precisely when to hide from Board

An item remains in Board's Done column only while `now < completedAt + 72 hours`; at or after that instant it is **excluded from Board**. This is elapsed real time, **not** three midnight boundaries and not based on due/end/start date. Compare instants safely across time zones and daylight-saving transitions. A different visible calendar day does not affect eligibility.

Do not delete a record when the 72 hours expire. The Board query/filter should derive visibility from status and completion time; preferably **no background timer and no mutation of JSON merely to “archive”**. Refresh eligibility when Board opens, when status changes, when the app resumes/returns to Board, and at a lightweight scheduled boundary check while Board is visible if needed. Existing Board filters/counts must exclude expired Done records consistently. No duplicated authoritative archive copy.

## 4. JSON-only persistence and backward compatibility

- Keep the **existing storage engine and JSON layout**. Add the smallest optional, namespaced/compatible fields required for completion metadata/history; do not rename existing fields or require wholesale conversion.
- Keep the current full-data JSON backup import/export structure. If new optional fields are serialized, old backups must still import and new backups must round-trip faithfully. Never drop unknown fields that current app already preserves.
- Persist saves reliably with the project's current write conventions. If not already implemented, consider atomic temp-file + flush + rename where supported; preserve error handling, backups, Windows file-lock behavior, and do not risk losing a valid prior file.
- Use a single canonical file/store: no separate SQLite history, no extra mandatory history database. Any derived cache must be disposable and rebuildable from JSON.
- Validate stable IDs and prevent duplicate records; a Done/reopen cycle must update the same item.
- Keep the original date/time string or exact semantic value once locked. Handle absent optional legacy metadata without data loss.
- Respect simultaneous/rapid changes: avoid lost updates, partial JSON, and stale writes; reuse the repository's existing serialization/locking mechanism or enhance it minimally.
- For recurring Events/Tasks, store status and completion against the correct occurrence according to current recurrence design; completing one occurrence must not automatically mark future occurrences Done. Do not rewrite the recurrence engine unless tests demonstrate a real bug.

### Performance with JSON (do not claim it is a database)

JSON permits limited frontend data transfer, but a backend may still need to **read and parse the full JSON file** to answer a date-range request. Do not promise constant-memory or indexed disk queries from a single JSON file.

Within the existing architecture:
1. Prefer returning **only matching date-range records** to React for Calendar/Timeline; include records whose **interval overlaps** the displayed range, even if they started earlier.
2. Board returns active Tasks plus Done Tasks still within 72 hours (and Events only if already supported), not entire history.
3. Use bounded in-memory memoization/caching only if measured helpful, with explicit invalidation on edits, imports and backup restore.
4. Paginate/virtualize UI rendering where needed, avoid processing a giant history repeatedly on every React render, and keep the UI responsive during JSON I/O.
5. Preserve existing Tauri commands and payloads; if introducing optional date-range commands, they must be additive and compatible. Do not remove full-data backup APIs.
6. Measure file parse time, RAM peak, save time and UI latency at realistic sample volumes; if JSON becomes a proven bottleneck, **report evidence and alternatives** rather than changing storage engine without approval.

## 5. Calendar and Timeline history behavior

- Calendar: preserve a completed item at its originally scheduled period, regardless of Board hiding. Users can navigate back by day/week/month/year and open the original Task/Event record.
- Timeline: retain the original start and the current editable end; preserve historical status/completion metadata for the details panel. Time-range filtering must show intervals overlapping the requested visible window.
- Selecting a historical completed item opens a detail/edit view; its original start is visibly locked, its end is editable, and status may be changed. No implicit status changes merely by opening a detail view.
- Reopened Tasks appear in the appropriate active Board column, with the original start unchanged. Re-completed Tasks return to Done for a fresh 72-hour window.
- History remains stored **indefinitely until a deliberate user delete operation**; automatic Board hiding is never a deletion. Existing delete confirmation/backup behavior continues to apply.
- Status history is per item, not a duplicate array of Task/Event records. Distinguish start, end, latest completion and first completion timestamps.

## 6. Dark theme mini-calendar correction

Fix date-number contrast in the Calendar selector's left mini-calendar. Avoid pale-on-pale or dark-on-dark text. Preserve:
- the existing **blue Today circle**,
- selected-date styling and selected-range background,
- disabled/adjacent-month differentiation,
- hover/focus semantics,
- light-mode appearance and design language.

Use current B6H theme tokens/classes, not ad hoc global overrides. Validate normal, today, selected, today+selected, outside-month, hover/focus and disabled dates in both light and dark theme. Do not modify unrelated selector themes.

## 7. UI/UX and safety compatibility

- Keep the existing Board/Calendar/Timeline layout, sidebar selector, labels, shortcuts, interaction flow, responsive behavior, categories and colors unless a necessary minimal addition is specified.
- Where lock state is shown, use an unobtrusive lock indicator + explanatory tooltip or helper text in the app's existing VI/EN localization approach.
- Do not silently change an Event's category, time or recurrence when editing its status.
- Maintain undo/confirmation behavior and data integrity for user deletion and import.
- No automatic reset of B6H app state; the Calendar module updates without application reload.
- Protect personal data. No network upload or telemetry is required for this feature.

## 8. Implementation phases

**Phase A — Baseline and mapping.** Inspect types/store, tests, on-disk JSON samples; record `git status`, baseline tests and performance. Explicitly report any existing SQLite attempts.

**Phase B — Completion domain logic.** Implement minimal metadata, original-start locking, first/latest completion and history transitions, idempotent status changes, backend validation, legacy behavior.

**Phase C — JSON storage/read filters.** Keep one JSON store; implement safe incremental logical updates via existing JSON save mechanism (not SQL incremental rows). Add compatible date-range retrieval/filtering without breaking full backup methods. Measure impact.

**Phase D — UI integration.** Enforce locked start in detail forms for Task/Event, editable end, reopened workflow, 72-hour Done Board filtering, historical Calendar/Timeline viewing and correct counts.

**Phase E — Dark mode.** Correct mini-calendar date colors and states.

**Phase F — Regression/acceptance.** Run available Rust tests, frontend tests and web build; run the desktop app locally and test real workflows. Stop for user acceptance; do not release.

## 9. Required automated and manual tests

1. Existing `calendar.json` loads unchanged; round-trip saves preserve all legacy/unknown permitted fields.
2. Existing JSON backup export/import shape and both old/new backups round-trip.
3. No SQLite package, SQL file or SQL-based migration introduced by this update.
4. First Done transition captures genuine completion instant, locks exact original start (date, time, offset/precision).
5. Start cannot be changed after first Done from frontend **or** backend (including stale request); end can be edited and validates correctly.
6. Same-status save (Done→Done), ordinary metadata edit, app restart and reopening details do not append history or restart timer.
7. Done→In Progress/To Do/In Review→Done appends only actual transitions; original start unchanged, latest completion refreshed, first completion preserved, stable ID maintained.
8. At 71:59:59 elapsed Done is visible on Board; at 72:00:00 it is excluded. Test time-zone/DST-related boundary cases using deterministic clock injection where feasible.
9. After 72 hours, source JSON still contains item; Calendar and Timeline can query past dates and open it.
10. Board active columns re-show reopened Task; Done count excludes expired items. No stale Board cache after returning to selector.
11. Event status controls and persistence work without treating all elapsed events as Done; recurrence occurrences remain independent.
12. Date-range filtering includes items spanning the range boundary and all-day/multi-day items; historical navigation doesn't require all data in React.
13. JSON write interrupted/failed does not silently corrupt or wipe valid existing user data.
14. Rapid edits/import-restore do not drop concurrent changes; derived caches invalidate correctly.
15. Dark-mode mini-calendar date text is readable across normal, selected, Today, outside-month and hover states; light mode visually unchanged.
16. Test representative 100, 1,000 and 10,000 item JSON datasets if realistic/available; report read/parse/save time, max RAM, UI navigation latency and environment. Do not fabricate outcomes.
17. Other B6H selectors, data, Tauri commands and existing tests remain unaffected.

## 10. Commands and deliverables

Run the repository's actual available test commands (expected examples; confirm scripts first):

```powershell
npm.cmd test
npm.cmd run web:build
# run the existing Rust Calendar tests with cargo test according to the repository's workspace layout
# launch B6H locally via its established dev command and manually verify UI
```

Deliver a final report containing:
- Starting Git HEAD and `git status` (preserve existing user work).
- Exactly which JSON schema additions were necessary and compatibility treatment for older data.
- Changed files and purpose; confirmation **no SQLite** was added.
- Test commands/results, failures/skips and local UI checks.
- Measured baseline vs after for representative workloads (or explicitly say not measured).
- Evidence for 72-hour boundary, start lock, reopen/recompletion, history retention, Events and dark-theme correction.
- Remaining limitations (especially large JSON performance), risks and user acceptance checklist.

**Stop after local implementation and verification. No app packaging, no `.exe` generation, no git commit, no GitHub push, no version bump, no tag, no release.**
