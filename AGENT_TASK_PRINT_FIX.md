# AGENT TASK: Fix DOCX printing in React + Tauri app

## Role
You are a coding agent working in a React + Tauri (v2) app that renders and edits Word (.docx) documents. Implement the changes below exactly. Do not refactor unrelated code.

## Problem
Pressing Print (Microsoft Print to PDF) prints the whole WebView. The printout contains:
1. The Navigation pane (Headings / Find / Bookmarks, "Search document") overlapping the page text.
2. The warning "The saved DOCX changed page setup or section layout."
3. A visible text caret; the editor keeps focus while the Print dialog is open.

## Required outcome
Only document pages are printed. No navigation pane, toolbar, search box, warning banner, caret, or selection highlight. Printed page size and margins match the DOCX section settings.

## Constraints
- Do not use `window.print()` on the main window for document printing. Print from an isolated iframe.
- Do not compare `w:sectPr` as XML strings.
- Keep all existing features working on screen. Print-only rules go in `@media print` or the iframe.
- TypeScript strict. No new dependencies.

---

## Step 0. Discover (do first, report findings in your summary)
- Find the component that renders document pages, the Navigation pane, the toolbar, the search box, and the "page setup" warning.
- Find every call to `window.print()` and every Ctrl/Cmd+P handler.
- Find where the DOCX is saved and where `w:sectPr` is built or read.

## Step 1. Add class markers
| Element | Add |
|---|---|
| Wrapper containing all rendered pages | `className="docx-print-root"` and a ref |
| Each rendered page | `className="docx-page"` |
| Navigation pane, toolbar, search, status bar, warning banner | `className="no-print"` |
| Warning banner | also `page-setup-warning` |

The warning banner and Navigation pane must NOT be descendants of `.docx-print-root`.

## Step 2. Create `src/styles/print.css` and import it in `main.tsx`

```css
@page { size: A4; margin: 0; }

@media print {
  html, body, #root {
    width: auto !important; height: auto !important;
    margin: 0 !important; padding: 0 !important;
    background: #fff !important; overflow: visible !important;
  }
  .no-print, .navigation-pane, .toolbar, .statusbar, .search-box,
  .page-setup-warning, [role="dialog"], [role="toolbar"], [data-no-print] {
    display: none !important;
  }
  body * { visibility: hidden !important; }
  .docx-print-root, .docx-print-root * { visibility: visible !important; }
  .docx-print-root {
    position: absolute !important; left: 0; top: 0; width: 100% !important;
    margin: 0 !important; padding: 0 !important;
    transform: none !important; zoom: 1 !important;
  }
  .docx-page {
    box-shadow: none !important; border: 0 !important; margin: 0 !important;
    break-after: page; page-break-after: always; break-inside: avoid;
  }
  .docx-page:last-child { break-after: auto; page-break-after: auto; }
  .docx-print-root, .docx-print-root * {
    caret-color: transparent !important; user-select: none !important; outline: none !important;
  }
  ::selection { background: transparent !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
```

## Step 3. Create `src/lib/printDocument.ts`

```ts
function collectStyles(): string {
  const parts: string[] = [];
  document.querySelectorAll("style, link[rel='stylesheet']").forEach((n) =>
    parts.push((n as HTMLElement).outerHTML)
  );
  return parts.join("\n");
}

async function waitForAssets(doc: Document): Promise<void> {
  try { await (doc as any).fonts?.ready; } catch {}
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve()
        : new Promise<void>((r) => { img.onload = img.onerror = () => r(); })
    )
  );
}

export function releaseEditorFocus() {
  (document.activeElement as HTMLElement | null)?.blur();
  window.getSelection()?.removeAllRanges();
}

export async function printDocxPages(
  pages: HTMLElement,
  pageCss = "@page { size: A4; margin: 0 }"
): Promise<void> {
  releaseEditorFocus();

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", visibility: "hidden",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  const clone = pages.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));
  clone.querySelectorAll(".no-print,[data-no-print],.page-setup-warning,.navigation-pane")
       .forEach((e) => e.remove());

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8">
${collectStyles()}
<style>
${pageCss}
html,body{margin:0;padding:0;background:#fff}
.docx-page{box-shadow:none!important;margin:0!important;break-after:page;page-break-after:always}
.docx-page:last-child{break-after:auto;page-break-after:auto}
*{caret-color:transparent;-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body></body></html>`);
  doc.close();
  doc.body.appendChild(clone);

  await waitForAssets(doc);

  const cleanup = () => { iframe.remove(); window.focus(); };
  iframe.contentWindow!.addEventListener("afterprint", cleanup, { once: true });
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => { if (document.body.contains(iframe)) cleanup(); }, 60_000);
}
```

## Step 4. Wire every print entry point
- Replace each `window.print()` with:

```ts
async function handlePrint() {
  if (!pagesRef.current) return;
  await printDocxPages(pagesRef.current, buildPageCss(currentSection));
  editorRef.current?.focus({ preventScroll: true }); // restore caret after dialog
}
```

- Replace the Ctrl/Cmd+P handler:

```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      handlePrint();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

## Step 5. Create `src/lib/pageSetup.ts` (page size from DOCX, units in twips)

```ts
export interface SectionProps {
  pageW: number; pageH: number;           // w:pgSz w/h (twips)
  orient?: "portrait" | "landscape";
  top: number; right: number; bottom: number; left: number; // w:pgMar
  header?: number; footer?: number; gutter?: number;
}

const twipToMm = (t: number) => (t / 1440) * 25.4;

export function buildPageCss(s: SectionProps): string {
  const w = twipToMm(s.pageW).toFixed(2);
  const h = twipToMm(s.pageH).toFixed(2);
  const m = (v: number) => twipToMm(v).toFixed(2) + "mm";
  return `@page{size:${w}mm ${h}mm;margin:0}
.docx-page{width:${w}mm;height:${h}mm;box-sizing:border-box;overflow:hidden;
padding:${m(s.top)} ${m(s.right)} ${m(s.bottom)} ${m(s.left)}}`;
}

const EPS = 1; // twips
export function sameSection(a: SectionProps, b: SectionProps): boolean {
  const keys: (keyof SectionProps)[] =
    ["pageW","pageH","top","right","bottom","left","header","footer","gutter"];
  return keys.every((k) => Math.abs(((a[k] as number) ?? 0) - ((b[k] as number) ?? 0)) <= EPS)
    && (a.orient ?? "portrait") === (b.orient ?? "portrait");
}
```

For documents with mixed portrait and landscape sections, use CSS named pages (`page: portrait-a4` / `page: landscape-a4` with matching `@page` rules) instead of one global `@page`.

## Step 6. Stop the false "page setup changed" warning
In the DOCX save path:
1. Keep the original `w:sectPr` nodes. Copy them into the saved body. Never rebuild them from defaults.
2. Preserve paragraph-level `w:sectPr` (inside `w:pPr`) for multi-section documents, plus the final body-level one.
3. Show the warning only when `!sections.every((s, i) => sameSection(s, originalSections[i]))`.

## Step 7. Tauri notes
- Call print only from a frontend user action, never from a Tauri command thread.
- Windows (WebView2): iframe printing works and prints only the iframe document.
- macOS/Linux: if `print()` does nothing, fall back to PDF: convert DOCX to PDF (sidecar or Rust), then open it with the OS default viewer (`tauri-plugin-opener`).
- Plain `window.print()` or `iframe.contentWindow.print()` needs no capability entry.

---

## Acceptance criteria (all must pass)
- [ ] Print preview of a 1-page DOCX shows only the page. No nav pane, search box, banner, or caret.
- [ ] Multi-page DOCX: one DOCX page per sheet, no blank trailing page.
- [ ] Landscape section prints landscape.
- [ ] Ctrl/Cmd+P goes through `printDocxPages`.
- [ ] After closing the Print dialog, the caret blinks in the editor again.
- [ ] Saving without layout edits, then reopening, shows no "page setup changed" warning.
- [ ] Works in `tauri build` output, not only `tauri dev`.
- [ ] `tsc --noEmit` and the existing test suite pass.

## Deliverable
Summarize in your final message: files created, files changed, the selectors or components you mapped the markers to (Step 0), and anything you could not verify.
