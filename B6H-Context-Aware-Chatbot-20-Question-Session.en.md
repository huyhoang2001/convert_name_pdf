# B6H Context-Aware Intelligent FAQ & Q&A — 20-Question Session Update

**Authoritative implementation specification (English) · 2026-11-07**  
**Repository:** https://github.com/huyhoang2001/convert_name_pdf  
**Audience:** AI coding agent implementing against the **checked-out local repository**  
**Execution boundary:** inspect, modify, test, and benchmark **locally only**. No installer/portable package, Git commit, push, tag, version bump, or GitHub release.

> **DOCUMENT AUTHORITY:** This English file is the *only* implementation source given to the AI coding agent. The corresponding Vietnamese `.vi.md` is a translation for the project owner, not a dependency. Never block because `.vi.md` is missing. This spec supersedes earlier contradictory suggestions to (a) retain unlimited chatbot history forever, or (b) reset the chatbot whenever the entire app reloads/restarts.

## 1. Product decision: scope and hard invariants

Improve B6H's existing offline FAQ and optional OpenRouter chatbot so a user can ask in natural Vietnamese/English, including follow-ups such as “I'm in Copies, why is this input invalid?”, “I clicked Save and got an unexpected error”, or “What should I enter here?”. Provide actionable, factual help grounded in **actual app state, actual validation rules, relevant errors, and verified FAQ content**. Do not invent field formats or instructions.

**Nonnegotiable constraints:**

- Preserve existing PDF/Excel/Word/Translation/Signature/Copies behaviors, validation, backups, output, file operations, settings, persisted business data formats, existing API/IPC contracts, routes, tabs, keyboard shortcuts, credentials, and UI/UX. Minimal chatbot-only elements for remaining count/reset/consent are permitted if unavoidable; match existing styling and localization.
- Do not reload/restart/navigate the host application to reset chat. **Reset Chatbot is an isolated chatbot operation.** Never reset other selectors, edits, documents, or unsaved changes.
- Keep the existing default offline path and existing opt-in OpenRouter online path. No surprise network calls, no new API key mechanism, no automatic document indexing, no autonomous editing/saving of user files.
- Preserve pre-existing untracked/dirty files. Make targeted, reversible code changes. Do not install an expensive local LLM, continuously capture the screen, or introduce unbounded in-memory queues.
- The owner has **not** requested a knowledge assistant that reads document contents. Only use structured help/validation/error context unless a later specification explicitly authorizes additional document access.

## 2. First: verify code; do not trust proposed module names

Before changing code, find the existing chatbot UI/state/hooks, offline FAQ resources, backend OpenRouter calls, messages/history handling, Tauri app-data utilities, online key storage, error handling, selectors, field validation, and relevant tests. Previously inspected paths include `src/HelpChatbot.tsx` and Tauri/Rust code, but names/behavior may have changed. Report the actual current paths and data flow. Inspect HEAD, Git status and all untracked files; **do not overwrite, delete, reset or clean existing user files**. Run local baseline tests/build using repo scripts; measure chatbot p50/p95 response times, memory and bundle impact before modifying it. Treat older reports (78 tests, 5.17 MB main JS, 940 KB ExcelJS) as historical leads, not current facts.

If the implementation already supports any requirement, keep it and add regression coverage instead of rebuilding it. No full framework rewrite.

## 3. Exact 20-question policy (applies to ONLINE and OFFLINE)

**One active chatbot session at a time. Cap = 20 accepted USER submissions per session.** Assistant replies, tool/diagnostic updates, suggestions displayed but not sent, UI focus events, and internal retries do **not** increase the counter. Switching Online ↔ Offline is *not* a new session and does *not* reset the count. The 20th accepted question must receive its full answer (or a clearly reported error); after that submission no 21st question may be accepted until the user invokes **Reset Chatbot**.

- Display an unobtrusive localized indicator such as `18/20 questions` consistent with current chat UI. If the user clicks Send at 20/20, do not send, charge tokens or silently start over; explain that Reset Chatbot is required.
- When the 20th request is in flight, disable new sends but retain reply rendering, cancellation, diagnostics and error display. Do not reset just because a reply fails or times out. A failed accepted request is counted once and remains visible with its error; a validation rejection before a question is accepted is not counted.
- Double-clicks, Enter/Send races, network retries, streaming chunks and React rerenders must not double-count. Use a synchronous admission guard / single-flight or equivalent serialized state transition; request IDs must distinguish stale responses. A retry of the SAME accepted question, when explicitly supported, must not consume an extra slot; sending a new submitted question does.
- Manual reset is available before the cap too, with confirmation if chat history would be lost. At the cap, explain deletion irreversibility; the action should be obvious and accessible, not require app restart.
- **Only an explicit chatbot Reset** clears session history/counter and starts a fresh 0/20 session. Merely closing/minimizing the chatbot drawer, switching B6H selectors, reloading the webview, closing/reopening B6H, or restarting Windows **must not reset** a session. No implicit reset on errors or on memory pressure.

### Required state machine

```text
Active(0..19) --accept user question--> Active(1..20)
Active(20, pending) --reply/error settles--> LimitReached(20)
Active(any) / LimitReached(20) --explicit Reset Chatbot--> Resetting --> Active(0)
App/WebView close/reload --restore same session + count--> Active or LimitReached
```

Count once **upon durable acceptance** of a submission; handle interrupted/pending requests after restart with a safe `interrupted` status (do not resend to OpenRouter automatically or decrement count). Persist status atomically with the message. If storage fails, do not claim persistence or silently consume/send a request; show a recoverable chatbot-local error.

## 4. Preserve ONE active session across app reload/restart without retaining old sessions forever

**Clarification of apparent conflict:** The owner requires both (a) old history permanently removed on Reset and (b) current session surviving app reload. This means **bounded local persistence of only the single current session**, *not* memory-only state and *not* a permanent archive of every previous session.

- Store exactly one active-session record in a small local app-data store through an existing Tauri storage path when possible; use a compact, atomic JSON file or existing suitable database. Do not introduce SQLite solely for 20 questions unless it is already in the app and clearly beneficial. Avoid making all chat messages a global settings blob.
- Suggested internal fields (adapt to existing code; not a new public contract): `schemaVersion`, `sessionId`, `userQuestionCount`, `createdAt`, `updatedAt`, `messages[]` with stable message IDs, role, mode, status, timestamps and text, and a minimal topic reference. Limit to 20 user questions plus the assistant messages that belong to them. Bound per-message input and reply length according to existing backend limits; handle malformed/corrupt data without crashing. No API keys, full screenshots, raw personal documents, or stack traces in persistent history.
- Persist user-question acceptance before dispatching the request; persist settled assistant replies/error statuses after completion; use bounded writes and safe atomic replace where available. On crash/reopen, show previous messages and same count; pending items should be marked interrupted, never silently replayed.
- On explicit Reset: cancel pending requests, invalidate request IDs, remove the persisted current-session data, remove temporary image files/caches, clear in-memory message arrays, context and input attachments, then create a new empty session and persist it. A new empty record replacing the old one is acceptable, provided the old session is **not recoverable via the app**. Do not promise forensic secure erase or instant OS-level memory reclamation. Consider journal/backup/temp copies and ensure old sessions are not retained by an app-owned backup mechanism. Explain to user that disk recovery cannot be guaranteed without secure-erasure facilities.
- Preserve session on normal app closure and reload. Do not clear chat storage on unmount. Rehydrate once; ensure asynchronous late responses from old sessions cannot populate a new session after Reset.
- Provide a narrowly scoped migration for existing chat state (if any), avoiding any modification to unrelated settings. If legacy history is unlimited, require deterministic truncation to the latest valid current-session subset and explain the decision in report; never delete existing business files.

## 5. Context-aware Q&A without continuous screenshot capture

Default answer path MUST be **structured context first**, without screenshot capture or image models.

Context adapter should retrieve, when available and user-authorized:

| Field | Example *only* | Rules |
|---|---|---|
| `selector` | `copies` | Actual active module, not guessed |
| `tabId` / `panel` | current Copies form | Minimal stable identifier |
| `fieldId`, `fieldLabel` | focused input and its visible label | May be absent; don't infer “this field” if focus lost |
| `validationCode`, `validationRuleId` | `INVALID_FORMAT` | Derived from *existing* validation code, not invented |
| `lastAction` | `save`, `import` | Only recent relevant action; stale entries expire |
| `errorCode`, `safeErrorMessage` | current error | Redacted; no raw stack trace or personal values |
| `locale`, `helpTopic` | `vi`, `copies-import` | Existing locale and verified knowledge |

**Do not collect full form contents by default.** Do not persist raw field values or transmit sensitive identifiers, record contents, names, personal data, credentials, or document content to OpenRouter. Avoid DOM scraping and background keylogging. Resolve ambiguous “here/this input” against the focus snapshot and most recent validation event; if unavailable/stale, ask the user which field or exact error they see. Context changes while a request is pending must not retroactively change the answer context; capture a minimal immutable snapshot when the question is accepted.

Prefer existing React state/selector metadata, validation and error handlers over parallel recreated validators. Any `ChatbotContextProvider`, `ValidationRegistry`, `ErrorRegistry` or `DiagnosticEngine` names in earlier discussion are **architecture suggestions only**; integrate with actual repo organization. Observers/subscriptions must mount/unmount cleanly, avoid expensive polling, and never trigger unrelated component rerenders at high frequency.

### Diagnostics

- Classify: field validation, parse/import, filesystem, access/permission, Tauri IPC, OpenRouter/network/timeouts, unexpected frontend errors. Distinguish **observed facts** from potential causes; do not assert a cause without evidence.
- Troubleshooting flow: state the selector/field/error if known; explain verified validation rule; give safe user-performed steps; ask one targeted clarification if uncertain; offer a redacted diagnostic report for user-controlled copying when unresolved.
- Collect bounded metadata and safe error codes only. Never intercept or ship global logs, secrets, document contents or crash dumps without separate explicit consent. Do not auto-correct fields, click Save, bypass validation, alter records, or erase files.
- For legal/office record inputs, provide software usage help only; do not invent legal requirements or certify legal correctness.

## 6. Screenshot only on explicit request/consent; memory-safe cleanup

Default **OFF**; no interval capture, recording, auto-screenshot on every question, screenshot-based continuous “vision”, or silent upload. If context is insufficient and visual evidence genuinely helps, offer a **single optional capture of a limited region** with clear permission and preview/redaction before external transmission. If no current image-analysis backend is supported, do not pretend screenshots can be analyzed: keep text-only diagnostics and state this limitation.

- At most **one** capture/analysis request in flight, no queue; crop/scale preferably to long edge ≤1280 px, and a provisional ~32 MiB transient image-buffer budget (adjust after testing). Fail safely when limits cannot be met.
- Never embed screenshots/base64 in message history, persisted session JSON, diagnostic telemetry, or long-lived React state. Do not automatically send screenshots to OpenRouter; separately inform/ask before any external upload, and verify provider/model supports images. Screenshots may contain personal/regulated office data; default to not sharing them.
- Always clean up on success, failure, timeout, cancel, Reset, panel unmount or replacement: release `ImageBitmap.close()`, revoke owned `URL.createObjectURL()` URLs, dispose canvas/offscreen resources, release Blob/ArrayBuffer references, remove app-created temporary files, and drop Rust buffers. Use `try/finally` + cancellation tokens; guard against stale async callbacks.
- Garbage collection/allocator may retain reserved memory; verify **no unbounded growth**, not necessarily immediate Task Manager decrease. Never force app reload to free memory.

## 7. Smart offline FAQ + grounded online Q&A

Maintain and extend the previous English intelligent-FAQ scope, but keep this file standalone:

1. Verify existing knowledge sources and UI labels. Build a source-backed, versioned help knowledge set for Copies, Translation, Signature, PDF rename/backup/output, Excel import/save, Word/Templates, Settings and chat/errors. Every instructional step must be checked against the current app; no invented buttons, field rules or file formats.
2. Normalize Vietnamese Unicode, case/whitespace and optional diacritic-insensitive matching; support no-accent phrasing, colloquial wording, typos, English/Vietnamese code switching, and aliases conservatively. Preserve raw question for display.
3. Retrieve using lightweight keyword/intent aliases and scored lexical matching, plus optional semantic similarity **only if** the memory/performance budget permits. Prefer compact offline indexes; do not package a large local LLM or use a paid service in offline mode.
4. Rerank with verified active selector + field/error context and short dialogue context. Prefer exact validated help instructions over generic paragraphs. With low confidence or conflicting FAQ entries, ask one precise question; **never fabricate** a field format, root cause or solution.
5. Maintain bounded multi-turn context within **the same** 20-question session, including sensible subject change handling. Reset removes all dialogue context. Closing/reopening app restores only that one current session.
6. Online OpenRouter mode may receive a **minimal redacted** relevant-FAQ excerpt, current user question and a small number of relevant prior chat turns, subject to **existing backend message-count/byte limits**. Saved local history does not mean “send all 20 turns”. Preserve API key handling, provider selection and offline/online user choice. Never automatically upload all FAQ data, screenshots or private forms.
7. Include answer validation: explicitly separate observed error and potential causes; cite/link to existing help entry when the UI permits. Provide a usable offline answer when online service fails, without erasing the session or restarting B6H.

## 8. Low-memory behavior, concurrency and resource bounds

Target usable behavior on **Windows machines with 4 GB physical RAM**, subject to actual system load. Do not claim universal guarantee without hardware validation.

- No continuous screen capture, no embedded large LLM, no repeated full FAQ rebuilds on each question, no unbounded chat arrays, and no unbounded logs. Persist **one ≤20-question session** on disk and only retain the current rendered window and bounded retrieval candidates in RAM.
- Single-flight online AI request by default, with request ID, cancel/abort and timeout. Streaming (if existing) must have bounded buffered text and throttled render updates. Reset cancels/invalidates everything tied to the old session; no late insertion.
- Keep high-frequency React context out of global rerender paths; use memoized selectors only if profiling confirms benefit. Lazy-load optional diagnosis/image functionality and build indexes once per knowledge version. Profile startup overhead.
- Handle out-of-memory/resource errors, failed storage writes, invalid persisted data and unavailable WebView/IPC gracefully when possible; show small text-only fallback instead of crashing chat or other modules. No automatic reset or lost session on memory pressure.
- Provisional acceptance goals (not guaranteed outcomes): common offline FAQ p95 ≤500 ms on defined small KB, no meaningful app-startup regression, no sustained RAM growth after repeated chat open/close and optional capture. Report real p50/p95, peak RSS/private bytes and heap, with environment details.

## 9. Privacy, security and destructive action policy

- Current conversation persistence must be explained to the user: survives close/reload/restart and is deleted **on explicit chatbot reset**; content is held locally, not synced by this feature.
- Reset is destructive for **chat history only** and should require a clear user action and confirmation. It must not clear unrelated app cache, PDF backups, workbook data, Word tabs or shared settings.
- Never store or log OpenRouter keys. Use existing Windows Credential Manager/settings mechanism. Sanitize error/context strings; avoid prompt injection from untrusted documents or external model output. Never execute model-provided commands.
- If current storage automatically backs up the active chat, prevent archival retention of past sessions or document limitation and choose a safer storage route. Do not promise secure erasure of SSD sectors or OS paging.

## 10. Required tests (automated + Windows manual)

### A. Session boundary / persistence matrix (must all pass)

| Scenario | Expected |
|---|---|
| Questions #1 through #19 | Accepted; count increments once per accepted question |
| Question #20 | Accepted; answer/error shown; count 20/20 |
| Attempt #21 | Rejected before provider call; reset instruction shown |
| Manual Reset at 5/20 or 20/20 | Only chatbot cleared; next question is #1 |
| Switch Online ↔ Offline | Same count and messages |
| Hide/reopen chatbot panel | Same session |
| Switch Copies ↔ Word/PDF | Same session; business state retained |
| Reload webview / reload app shell | Same session and count, no automatic reset |
| Close/reopen app, reboot Windows | Same session and count |
| Crash during a pending reply | Restores accepted question marked interrupted; no automatic resend |
| Double Send / Enter race | Exactly one accepted message, one counter increment |
| Retry same accepted request | Does not double-count; no duplicate persisted message |
| Reset while OpenRouter response is pending | Response discarded; new session stays empty |
| Reset deletes persisted old session | Old chat does not reappear after app reopen |
| Simulated failed persistence | No silent send/count drift; recoverable error |

### B. Q&A and diagnostics

- Build a **labeled evaluation set of at least 120 verified questions**: VI with accents, VI no accents, English, typos, paraphrases, module ambiguity, multi-turn follow-ups, field reference (“this input”), validation and unexpected errors, out-of-knowledge questions, offline/online fallback.
- Test Copies invalid input where rule exists: answer must cite actual rule; if no field focus/error, ask rather than inventing requirements.
- Test stale selector/focus, rapid module switches, error code changing mid-request; snapshot must not drift.
- Test online unavailable/API errors without resetting history or altering other app features; test redaction of sensitive fields and no automatic screenshot upload.
- Record exact top-1/Recall@5 / intent precision / grounded-answer assessments; targets should be established using baseline data rather than claiming predetermined pass rates.

### C. Memory / cleanup / regression

- On a Windows 4 GB RAM test system if available, repeatedly ask/reset over ≥30 sessions, open/close the chat panel ≥100 times, optionally capture/cancel ≥100 times where capture exists; observe memory trend after settling, CPU use and UI responsiveness. If 4 GB hardware is unavailable, use constrained-memory tests as supplemental evidence and report the hardware gap explicitly.
- Verify all temporary captures are disposed and no capture data remains in chat storage. Stress cancellation and late responses, malformed storage, IO failures, large/Unicode inputs.
- Run the full existing tests and production web build; add unit/integration tests for session reducer, persistence recovery, race/cancel, FAQ scoring and privacy boundaries. Check PDF/Excel/Word/Copies workflows and unsaved state unchanged.

## 11. Implementation phases (local only)

1. **Discovery + baseline**: actual files, data flow, tests, baseline FAQ quality, memory and response time; protect dirty/untracked work.
2. **Chat session model**: strict atomic 20-question admission, mode-independent counter, error/retry semantics, accessible chatbot-only Reset and count UI.
3. **Bounded persistence**: store only current session; restore through close/reload/restart; interruption handling; permanent app-level removal of prior session on Reset.
4. **Structured context + diagnostics**: hook into actual selector/focus/validation/error data; redaction, TTL and immutable request snapshots; safe help workflow.
5. **Smarter FAQ + OpenRouter grounding**: lightweight multilingual retrieval, short follow-up context and online minimal prompts.
6. **Optional one-shot screenshot**: implement *only if* useful and supported; permission, bounded image memory and guaranteed cleanup; otherwise document as deferred while preserving the text-only flow.
7. **Full regression/performance tests and report**: ensure the app is still responsive on low-resource systems.

Do not ship an untested rewrite. Use small changes and test after each phase. Do not silently change persisted business schemas or public IPC contracts. If a strict invariant is impossible due to existing architecture, stop that subtask, explain the blocker, and continue independent safe improvements.

## 12. Required completion report and definition of done

Provide: exact HEAD and dirty/untracked preservation notes; files modified; observed legacy chatbot behavior; new session storage location/format; explicit count/reset rules; privacy/redaction and cleanup choices; knowledge sources used; before/after chatbot QA, p50/p95, RAM/CPU figures; test commands/results; Windows 4 GB test status (measured or not); limitations and remaining risks; manual verification checklist.

**Completion requires**: the 20th question is fully handled; the 21st cannot send; **only Reset Chatbot** creates a new session; closing/reloading the app retains the current session; explicit reset deletes its history; chat/diagnostic features do not alter business workflows; offline remains functional; no screenshot leak; regression tests pass. If some requirements are blocked, mark them incomplete rather than claiming full completion.

**Strictly forbidden for this phase:** application reload/restart as a reset mechanism; packaging `.exe` or installer; Git commit/push/tag; changing project version; GitHub release; deleting pre-existing untracked files; modifying unrelated business logic/UI; uploading private data without authorization.
