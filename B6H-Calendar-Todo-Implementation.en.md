# B6H — Calendar & To-do Selector: Full Local Implementation Specification

**Status:** Implementation specification, not implemented code  
**Authoritative file for coding agent:** This English document only  
**Target:** Existing B6H Windows desktop application (React + TypeScript + Tauri 2 + Rust)  
**Reference materials:** User-provided Board screenshot, Stitch preview `https://stitch.google.com/preview/1349618765706719718?node-id=b87f1931993d47ce9c26dc`, and the supplied HTML prototype `Văn bản đã dán (1)(1).txt`  
**Execution scope:** Modify and test locally only. **No packaging, commit, push, version change, tag, or GitHub release.**

## 0. Authority, interpretation, and constraints

1. Add a **Calendar / To-do** selector to B6H's existing **application-level sidebar**. This is distinct from the Calendar module's own internal navigation sidebar seen in the reference image.
2. Use the screenshot and provided HTML as **visual and interaction references**, not as production architecture or authoritative data. Match their visual hierarchy: top header; Board / Calendar / Timeline switches; Today and period navigation; left mini calendar + filters; main board/grid/timeline; optional right Event/Task detail panel. Integrate with the existing B6H design system, themes and EN/VI labels instead of replacing the app shell.
3. The HTML is a **static prototype** with hard-coded May 2026 dates and mock handlers. Examples: `saveSideForm()` only shows a success toast; `handleTodayClick()` resets to May 2026; `handleAISubmit()` shows a fake completion; some filters and sharing/export buttons are placeholders. Replace visible placebo actions with real behavior or disable/hide them with clear explanations. Do not ship false success messages.
4. Preserve all B6H PDF, Translation, Signature, Copies, Word, Settings, Chatbot functionality, Tauri command compatibility, data schemas and user files. Calendar data must be isolated in its own namespace/storage. No unrelated refactoring.
5. Read and inspect the **actual checkout** first. Do not assume code filenames, route names, store patterns, Rust modules, theme or storage libraries. Follow established project conventions; suggested module names below are examples only.
6. The **English `.en.md` is the only agent implementation specification**. The Vietnamese `.vi.md` is a translation for the owner; do not request it or block work if absent.
7. Do not assume the live Stitch preview can be fetched without authentication; the supplied screenshot and HTML are sufficient to establish the visual reference. Never copy Tailwind CDN, Google-hosted assets or inline `onclick` handlers into the production desktop implementation. Bundle approved local dependencies/assets.

## 1. Product intent and scope

Deliver a **fully functional, offline-first personal task and calendar workspace** within B6H, with three synchronized views: **Board (Kanban), Calendar, Timeline (Gantt-like)**. Focus on personal productivity and local persistence. Additional features include task checklists, progress, recurrence, reminders, search/filter/sort, quick add, keyboard usability, backup/export and crash-safe storage.

### P0 (must ship locally)

- App sidebar entry, route/selector, EN/VI localization, integration with existing theme/window behavior.
- Board, Calendar, Timeline based on one underlying store.
- Real create/read/update/delete of tasks and events, task status/priority/category, due dates, start/end, all-day, notes, checklist, completion and progress.
- Persistent local storage: close/reopen/reload **without data loss**.
- Mini calendar, date controls, Today, day/week/month navigation; genuine filters and search.
- Right detail panel: inspect/edit/save/cancel with validation and unsaved-change safeguards.
- Real drag and drop for Board status changes, plus non-drag keyboard/dropdown alternatives.
- Offline in-app reminders, overdue/upcoming indicators, and safe, bounded resource use.
- Automated tests, local manual testing, rollback/migration safety and measured performance.

### P1 (implement after P0 when safe)

- Repeating tasks/events, recurrence edit scope and exceptions.
- Task subtasks/checklists, quick duplication, bulk selection and bulk status changes.
- Import/export as CSV/JSON; iCalendar `.ics` import/export for standard compatible events if feasible, with explicit supported-feature notes.
- Optional Windows notification integration where permissions/runtime support it; local-only by default.
- Undo for destructive user operations, archive completed items, keyboard shortcuts.

### P2 (optional; NOT silently promised)

- Cloud sync, multi-user sharing, invitations, bi-directional Google/Outlook sync, accounts and team permissions, collaborative real-time editing. These require explicit product/backend decisions and credentials; **do not invent such infrastructure**.
- Natural-language task creation via online AI is optional and **must not** be represented by a fake toast or automatically contact OpenRouter. If integrated later, require user opt-in, preview of parsed data and manual confirmation before save. Do not consume or modify B6H chatbot's 20-question-session policy.

## 2. UX structure and interaction requirements

### 2.1 B6H integration

- Add `Calendar / Lịch & Công việc` selector at the appropriate position in existing app sidebar, with a calendar icon consistent with existing icon conventions.
- New Calendar module uses the current shell, theme, fonts, title-bar behavior, navigation, language selector, accessibility settings and responsive conventions.
- Switching to other selectors must not inadvertently reset unsaved Calendar edits or modify another module. Handle dirty form state explicitly; restore last chosen subview and visible date when re-entering if safe.
- Avoid introducing another global sidebar that conflicts with B6H's main sidebar. The reference's mini-calendar sidebar belongs **inside** the Calendar workspace and may collapse at narrow widths.

### 2.2 Top toolbar

- Three real view modes: **Board**, **Calendar**, **Timeline**; selected view visibly indicated.
- Today resolves the system's current local date, not hard-coded May 2026; previous/next navigation honors current mode and calendar year boundaries.
- Day/Week/Month mode control changes the displayed time span, not only the label. For Board, date span restricts items only when user explicitly activates a time filter; do not invisibly hide undated tasks.
- Filters: category, task status, priority, due date, overdue, calendar and completion; meaningful **All / Mine / High Priority** with accurate semantics. In single-user mode, Mine = local owner items; if no assignees exist, show an understandable label or suppress meaningless multi-user filtering.
- Search across title, description, tags and local calendar metadata, debounced; clear-filters state and visible active-filter chips.
- New Task and New Event actions; useful keyboard shortcuts with no conflict with existing B6H shortcuts.
- Export button opens real export options. Share button must **not claim online sharing**; show local export/copy summary as a clearly labeled alternative or disable Share until a sharing backend exists. No fabricated share link.

### 2.3 Left internal panel

- Mini calendar: actual month lengths, leap years, first-day-of-week setting (default Monday), selected date, current-day indication, accurate week row, previous/next navigation.
- Clicking a day selects/navigates to that day and updates the other views and detail selection coherently.
- "My Schedule" is a real set of user-defined event/task category filters, not hard-coded example checkboxes. Allow category creation/rename/delete with safe handling of existing items.
- Category counts are computed from stored records and applied filters, not approximations such as `checkedBoxes.length * 3`.
- Provide clear empty/error/loading states and collapsible sections.

### 2.4 Board (Kanban)

- Default lanes: **To Do / In Progress / In Review / Done**, preserving their screenshot styling and state colors. Status is a stable internal enum, translated labels are display only.
- Cards show title, short notes, category tag, priority (Normal/Medium/High/Urgent; exact defaults chosen consistently), due date, optional progress and ownership where meaningful.
- Quick Task and lane-level Add Task create a **real persisted task** using safe defaults, with keyboard submit and validation.
- Drag cards between lanes using accessible drag/drop; persist status transactionally; rollback UI on failure. Provide Edit Status in task details and keyboard controls.
- Marking Done stamps `completedAt`; moving back restores open status without deleting checklist progress.
- Filters and sorting apply consistently. Count badges derive from real records. Avoid rendering thousands of cards at once; use pagination/virtualization if benchmarking warrants it.

### 2.5 Calendar view

- Real **day, week and month** calendar, not a screenshot of a single hardcoded week; correct weekday alignment and timezone labels.
- Timed events, all-day events, tasks with due dates, overlapping events, multi-day spans and events crossing midnight must render intelligibly. No silent loss or clipping of data.
- Click an empty slot to prefill an event draft, click an item to open its details. Moving/resizing via drag (if offered) must confirm valid times; keyboard form alternative required.
- 12h/24h preference, local timezone handling, daylight saving transitions where relevant, 00:00 and overnight events, leap years and date-range boundaries.
- Current-time marker uses the clock and refreshes at a bounded interval only while view is active; pause on unmount/hidden window.
- Work hours, weekends and optional category colors; never mark unavailable time based on static sample hatching without real data.

### 2.6 Timeline view

- Gantt-like date-axis with rows for tasks/workstreams, start/end dates, progress bars, milestone representation and optional dependency indication where implemented.
- Day/Week/Month zoom updates scale and data positions. Scroll/selection retains identity across view changes.
- Moving a task date range or editing progress updates Board, Calendar and details from the same persisted record. Do not treat static sample geometry or names as data.
- Dependencies are optional P1 and must not be presented as functioning when not stored/validated.

### 2.7 Right Event/Task detail panel

- Show when selecting a task/event or invoking Add; panel may collapse, with keyboard focus management. Switching between Event and Task must not overwrite or cross-populate unrelated records.
- Event: title, description, date, start/end, all-day, location (plain text), category/calendar, reminders, recurrence, optional participants as **local labels only** (no invitations without backend).
- Task: title, description, status, priority, category, start/due dates, checklist, progress, tags, reminder, recurrence and optional local owner label.
- Save performs schema+domain validation and actual disk persistence before success toast; error states preserve draft. Cancel reverts unsaved changes; confirm before discarding dirty edits.
- Delete includes confirmation/undo where feasible. Validation: required title, valid date range, max field lengths, sensible timezone/recurrence options.

## 3. Unified data model (illustrative; adapt to existing repository)

Use separate Calendar namespace and stable IDs. Example TypeScript interface, **not a mandate to modify existing B6H schemas**:

```ts
type WorkStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
type Priority = 'normal' | 'medium' | 'high' | 'urgent';
type CalendarItem = {
  id: string;
  kind: 'task' | 'event';
  title: string;
  description?: string;
  categoryId?: string;
  status?: WorkStatus;            // tasks only
  priority?: Priority;            // tasks only
  startAt?: string;               // ISO date/time with timezone convention
  endAt?: string;                 // events or bounded task range
  dueAt?: string;                 // tasks only
  allDay?: boolean;
  timezone?: string;
  completedAt?: string;
  checklist?: { id: string; title: string; done: boolean }[];
  progress?: number;             // 0-100, with documented derivation/override
  reminder?: { offsetMinutes: number; enabled: boolean };
  recurrenceRule?: string;       // validated supported subset, never free-form eval
  recurrenceExceptions?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};
```

- Keep status, priority and type semantically distinct (e.g. "event" cannot have a Kanban status unless explicitly modeled as task).
- Define whether a task with a due date appears as a marker or block in Calendar and ensure no duplicate entity is created by cross-view edits.
- Store ID references instead of copying task details between Board, Calendar and Timeline.
- Differentiate date-only items from instants; store timezone explicitly/consistently, not locale-formatted strings like `May 22`.
- Define recurrence occurrence IDs, edit-this vs edit-series behavior, and checklist/progress semantics.
- Stable migrations and schema versioning within the **new Calendar storage only**.

## 4. Storage, privacy and durability

- **Local-first, offline** functionality must work without OpenRouter, user accounts or an internet connection.
- Prefer the application's established Rust/Tauri storage abstraction. If absent or unsuitable, use **SQLite via Rust** (or equally robust local database already installed), stored under B6H's existing app-data root in a Calendar-specific location; don't introduce storage in PDF/Excel/Word folders.
- Safe parameterized queries, transactions, indexes for date/status/category, deterministic ordering; clear repository/services boundary and serializable schema validation.
- Never place the primary database solely in React state/localStorage; load a bounded visible date range, keep small caches and paginate search/history.
- Autosave only when explicit design permits, otherwise Save button transaction; on crash, committed changes survive. Use WAL or equivalent supported durability, checkpoint/backup consistently.
- Support documented **export** and **import backup** flow with preview and validation, separate from cloud sharing. Default no telemetry or external upload. Avoid storing API keys or confidential file content in task metadata unless voluntarily entered.
- Do not create dummy users, real email invitations or public URLs. If the reference avatar/share control is retained, implement a local profile representation or leave clearly disabled.

## 5. Notifications and recurrence

- Reminder rules: at time, 5/15/30/60 minutes before, and customizable safe intervals if feasible. Support dismissal and snooze, including restart behavior.
- Implement one bounded scheduler/timer, not one live timer per item; only scan a bounded upcoming window. Deduplicate notifications across reopens and system clock changes. Do not claim alerts will fire when app is fully closed unless OS-level scheduling is actually integrated and tested.
- In-app overdue and due-soon indicators work offline. OS desktop notifications require feature/permission detection and graceful fallback.
- Recurrence: daily/weekly/monthly/yearly and interval; optional by-weekday, end-count/date; validate invalid dates (e.g. Feb 30) and DST, cap expansion per visible window; never materialize infinite rows.
- Editing one occurrence, this and future, or entire series must be clearly scoped and tested before claiming support.

## 6. Accessibility, localization, usability

- Both Vietnamese and English; labels, tooltips, validation, dates, priority/status badges, prompts and empty states are localized using B6H's existing localization system.
- Honor B6H light/dark theme; screenshot color palette is a reference for light mode, not permission to hardcode light-only styling.
- Screen reader labels, tab order, keyboard selection, Esc to close, focus return, visible focus indicator; drag/drop alternatives; color not sole status cue.
- Adaptive layouts for ~1280 px down to ~1024 px and smaller windows: collapsible internal left panel/right inspector and horizontal scroll for Kanban/Timeline, no essential controls permanently clipped.
- Loading placeholders and honest persistence/error feedback. Autosave/save state must be visible.

## 7. Performance and low-memory design

- Keep Calendar lazy-loaded so it does not increase B6H startup substantially when the user never visits the selector.
- Only load visible date ranges and needed entity fields; avoid rendering off-screen weeks or huge timeline ranges.
- Memoized derived selectors keyed by record ID and visible window; do not repeatedly parse every date on each keystroke.
- Bounded recurrence generation, small context caches, debounce search; unregister listeners/timers on unmount.
- Avoid CDN assets, full calendar library stacks if a lightweight component already fits; profile trade-offs before adding dependencies.
- Target Windows PCs with **4 GB RAM**, without promising absolute compatibility absent measurement. Test 1,000 and 10,000 tasks, 1,000 calendar events, large recurrence sets, repeated view switching and restart.
- Performance acceptance targets (initial goals, not guarantees): 95th-percentile view switch under 300 ms on baseline device, input response under 100 ms for ordinary workloads, bounded memory after 100 view switches; benchmark actual build/dev hardware and report deviations.

## 8. Implementation strategy and gates

### Phase A — Inspect and baseline

- Inspect current sidebar selectors/routes, translation files, theme, Tauri commands, local storage conventions, tests and unsaved-state patterns. Record current Git HEAD and preserve tracked/untracked existing changes.
- Run baseline unit tests, TypeScript checks and frontend build; collect current app startup/memory baseline where possible. Record failures before editing.
- Analyze supplied screenshot+HTML, list all fake/placebo handlers, map each to a real feature or explicit non-feature.

### Phase B — Core persistence + model

- Implement type-safe model, schema validation, repository/storage layer, migrations, atomic CRUD and recovery tests.
- Write integration tests for create/edit/delete/restart, Unicode titles, timezone and concurrent edit attempts.

### Phase C — UI and synchronized views

- Add B6H selector, localization and lazy route. Build top navigation, internal sidebar, Board, Calendar, Timeline and right inspector using one store.
- Ensure CRUD from any view updates all views and persists after restart. Add filters/search and keyboard usability.

### Phase D — Productivity features

- Add checklists, recurring tasks/events, reminders, import/export, backup, sorting/archiving and optional drag-drop/rescheduling only with adequate tests.
- Hide/disable cloud Share and AI task assistant placeholders until genuinely implemented.

### Phase E — Regression and local acceptance

- Run `npm.cmd test`, `npm.cmd run web:build`, TypeScript checks and relevant Rust checks/tests according to actual repo scripts/toolchain.
- **Launch B6H locally** (development mode); verify the new selector and other selectors remain functional. Compare existing screenshot and actual Calendar view at reference desktop width.
- Manually test on Windows: switching selectors; task/event CRUD; status drag/drop; filters; actual current date; calendar boundary; Timeline; recurrence; reminders; reopen/reload persistence; import/export; offline; 4 GB RAM target where a device/VM is available.
- Do not claim a 4 GB result if only higher-RAM hardware was tested.

## 9. Required acceptance test matrix

| ID | Scenario | Pass condition |
|---|---|---|
| CAL-01 | Open Calendar selector | Module appears, other selectors unchanged |
| CAL-02 | Date today | Uses real system date; leap/year boundaries work |
| CAL-03 | Add task on Board | Persisted in proper lane and details |
| CAL-04 | Move task To Do → Done | Same record updates across views, survives restart |
| CAL-05 | Add all-day/timed event | Correct day/week/month display |
| CAL-06 | Event overlap/cross midnight | Correct layout and time interval |
| CAL-07 | Edit in Timeline | Board/Calendar/detail reflect same changes |
| CAL-08 | Search and filters | Correct result/count; clear restores data |
| CAL-09 | Cancel dirty form | No unintended save; user warned appropriately |
| CAL-10 | Crash/reload/reopen | Committed edits restored; no false saved toast |
| CAL-11 | Invalid input/duplicate IDs | Safe error, no corruption |
| CAL-12 | Recurrence + DST + leap | Accurate bounded instances/exception editing |
| CAL-13 | Reminders | Deduplicated, respects permissions and restarts |
| CAL-14 | Import/export | Round-trip integrity, invalid files rejected |
| CAL-15 | Offline | CRUD/view/reminders work without internet |
| CAL-16 | English/Vietnamese + theme | No missing labels or unreadable theme |
| CAL-17 | Existing PDF/Excel/Word/chat | All existing tests and smoke flows unaffected |
| CAL-18 | 1k/10k stress | No unbounded RAM growth; documented timings |
| CAL-19 | Share/AI placeholder | No misleading success or imaginary cloud sync |
| CAL-20 | Narrow window/keyboard | Core actions usable without mouse and no clipping |

## 10. Prohibited changes and release restrictions

- Do **not** rewrite unrelated B6H modules, alter existing user files/settings schemas, break native commands, or replace the overall shell.
- Do **not** embed reference demo dates/tasks in production; demo fixtures may live only in tests or opt-in sample data.
- Do **not** expose private data through internet/CDNs; do **not** claim teams/cloud features exist without a backend.
- Do **not** package `.exe`, run release workflows, create installers, tag, bump version, commit or push to GitHub.
- Preserve existing working-tree changes and untracked files; never delete or overwrite them without explicit user instruction.
- When blocked, deliver completed local improvements and an explicit blocked/untested list. Do not substitute a plan-only result when implementation is possible.

## 11. Final agent report template

1. Git HEAD, initial working-tree status, source/design references inspected.
2. Existing app patterns discovered and architectural decisions, dependencies added and why.
3. Files added/changed and behavior implemented per P0/P1/P2.
4. Tests/checks executed with pass/fail totals; manual Windows smoke tests.
5. Startup, memory, 1k/10k workload metrics before/after (actual measurements only).
6. Known limitations, unsupported features, migration/backup notes and risks.
7. Confirmation: **local only; no commit, package, push, version bump, tag, or release**.

**Completion rule:** A Calendar selector with functioning CRUD and synchronized views, offline persistence and validated tests is the deliverable. A static imitation of the screenshot with toast-only buttons is **not** complete.
