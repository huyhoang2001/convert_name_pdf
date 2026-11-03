type PageSize = { width: number; height: number };
type PageSnapshot = { element: HTMLElement; width: number; height: number };
type PrintPageSource = { pageCount: number; zoom: number; currentPageCount: () => number; revealPage: (pageNumber: number) => boolean };

export function printPageStyles(sizes: PageSize[], zoom = 1): string {
  const pages = new Map<string, { name: string; width: number; height: number }>();
  const uniform = sizes.every(size => size.width === sizes[0].width && size.height === sizes[0].height);
  const scale = 1 / zoom;
  const assignments = sizes.map(({ width, height }, index) => {
    const widthPx = `${width}px`, heightPx = `${height}px`, key = `${widthPx}:${heightPx}`;
    let page = pages.get(key);
    if (!page) { page = { name: `docx-page-${pages.size}`, width, height }; pages.set(key, page); }
    return `.docx-print-page-${index}{${uniform ? '' : `page:${page.name};`}width:${width}px!important;height:${height}px!important}`;
  });
  const first = sizes[0];
  return [`@page{size:${Math.ceil(first.width * scale + 1)}px ${Math.ceil(first.height * scale + 1)}px;margin:0}`, ...[...pages.values()].map(page => `@page ${page.name}{size:${Math.ceil(page.width * scale + 1)}px ${Math.ceil(page.height * scale + 1)}px;margin:0}`),
    'html,body{width:auto!important;height:auto!important;margin:0!important;padding:0!important;overflow:visible!important;background:#fff!important}',
    '.docx-print-root{display:block!important;position:static!important;width:auto!important;margin:0!important;padding:0!important;transform:none!important;zoom:1!important}',
    '.docx-pages{display:block!important;margin:0!important;padding:0!important;gap:0!important}',
    `.docx-page{box-sizing:border-box!important;display:block!important;position:relative!important;inset:auto!important;contain:none!important;overflow:hidden!important;box-shadow:none!important;border:0!important;margin:0!important;zoom:${scale}!important;transform:none!important}`,
    '.docx-page+.docx-page{break-before:page!important}',
    '.docx-print-root,.docx-print-root *{caret-color:transparent!important;outline:none!important}',
    '::selection{background:transparent!important}',
    '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}',
    ...assignments].join('\n');
}

function copiedStyles(): string {
  return [...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node => {
    const copy = node.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
    if (copy instanceof HTMLLinkElement && copy.href) copy.href = copy.href;
    return copy.outerHTML;
  }).join('\n');
}

export function releaseEditorFocus(): void {
  (document.activeElement as HTMLElement | null)?.blur();
  window.getSelection()?.removeAllRanges();
}

async function waitForAssets(doc: Document): Promise<void> {
  const styles = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link =>
    link.sheet ? Promise.resolve() : new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(Error(`Print stylesheet did not load: ${link.href}`));
      }, 10_000);
      const cleanup = () => {
        window.clearTimeout(timer);
        link.removeEventListener('load', onLoad);
        link.removeEventListener('error', onError);
      };
      const onLoad = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(Error(`Print stylesheet failed to load: ${link.href}`)); };
      link.addEventListener('load', onLoad, { once: true });
      link.addEventListener('error', onError, { once: true });
    })
  );
  await Promise.all(styles);
  if (doc.fonts) await doc.fonts.ready;
  await Promise.all([...doc.images].map(image => image.decode()));
}

async function waitForPage(pages: HTMLElement, pageIndex: number): Promise<HTMLElement> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const page = pages.querySelector<HTMLElement>(`.docx-page[data-page-index="${pageIndex}"]`);
    if (page?.querySelector('.docx-page-content')) return page;
    await new Promise(resolve => window.setTimeout(resolve, 25));
  }
  throw Error(`Page ${pageIndex + 1} was not ready to print.`);
}

function snapshotPage(page: HTMLElement, pageNumber: number): PageSnapshot {
  const style = getComputedStyle(page);
  const width = Number.parseFloat(style.width), height = Number.parseFloat(style.height);
  if (!(width > 0 && height > 0)) throw Error(`The size of page ${pageNumber} is not available.`);
  const element = page.cloneNode(true) as HTMLElement;
  page.querySelectorAll('canvas').forEach((original, index) => {
    const canvas = element.querySelectorAll('canvas')[index];
    if (canvas) canvas.getContext('2d')?.drawImage(original, 0, 0);
  });
  return { element, width, height };
}

export async function printDocxPages(pages: HTMLElement, source: PrintPageSource): Promise<void> {
  if (!Number.isInteger(source.pageCount) || source.pageCount < 1) throw Error('The document pages are not ready to print.');
  if (!(source.zoom > 0)) throw Error('The document zoom is not available for printing.');
  releaseEditorFocus();

  const pageSnapshots: PageSnapshot[] = [];
  for (let index = 0; index < source.pageCount; index++) {
    if (!source.revealPage(index + 1)) throw Error(`Page ${index + 1} could not be prepared for printing.`);
    pageSnapshots.push(snapshotPage(await waitForPage(pages, index), index + 1));
  }
  if (pageSnapshots.length !== source.currentPageCount()) throw Error('The document page count changed while preparing the print view.');
  const sizes = pageSnapshots.map(({ width, height }) => ({ width, height }));

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) { iframe.remove(); throw Error('The print view could not be created.'); }

  try {
    const clone = pages.cloneNode(false) as HTMLElement;
    clone.classList.add('docx-print-root');
    pageSnapshots.forEach(({ element }, index) => {
      element.classList.add(`docx-print-page-${index}`);
      clone.append(element);
    });
    clone.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
    clone.querySelectorAll('.no-print,[data-no-print],.page-setup-warning,.navigation-pane').forEach(node => node.remove());

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}">${copiedStyles()}<style>${printPageStyles(sizes, source.zoom)}</style></head><body></body></html>`);
    doc.close();
    doc.body.append(clone);
    await waitForAssets(doc);

    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        iframe.remove();
        window.focus();
        resolve();
      };
      const timer = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        iframe.remove();
        reject(Error('The print dialog did not finish.'));
      }, 600_000);
      win.addEventListener('afterprint', cleanup, { once: true });
      try { win.focus(); win.print(); }
      catch (error) { window.clearTimeout(timer); iframe.remove(); reject(error); }
    });
  } catch (error) {
    iframe.remove();
    throw error;
  }
}
