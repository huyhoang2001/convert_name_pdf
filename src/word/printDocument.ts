type PageSize = { width: number; height: number };

const pxToMm = (pixels: number) => `${(pixels * 25.4 / 96).toFixed(2)}mm`;

export function printPageStyles(sizes: PageSize[]): string {
  const pages = new Map<string, { name: string; width: string; height: string }>();
  const assignments = sizes.map(({ width, height }, index) => {
    const widthMm = pxToMm(width), heightMm = pxToMm(height), key = `${widthMm}:${heightMm}`;
    let page = pages.get(key);
    if (!page) { page = { name: `docx-page-${pages.size}`, width: widthMm, height: heightMm }; pages.set(key, page); }
    return `.docx-print-page-${index}{page:${page.name};width:${page.width}!important;height:${page.height}!important}`;
  });
  return [...[...pages.values()].map(page => `@page ${page.name}{size:${page.width} ${page.height};margin:0}`),
    'html,body{width:auto!important;height:auto!important;margin:0!important;padding:0!important;overflow:visible!important;background:#fff!important}',
    '.docx-print-root{display:block!important;transform:none!important;zoom:1!important}',
    '.docx-pages{display:block!important;margin:0!important;padding:0!important;gap:0!important}',
    '.docx-page{box-sizing:border-box!important;margin:0!important;break-after:page!important;page-break-after:always!important;break-inside:avoid}',
    '.docx-page:last-child{break-after:auto!important;page-break-after:auto!important}',
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

async function waitForAssets(doc: Document): Promise<void> {
  const styles = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link =>
    link.sheet ? Promise.resolve() : new Promise<void>(resolve => {
      const timer = window.setTimeout(resolve, 10_000);
      const done = () => { window.clearTimeout(timer); resolve(); };
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
    })
  );
  await Promise.all(styles);
  await doc.fonts?.ready.catch(() => {});
  await Promise.all([...doc.images].map(image => image.decode().catch(() => {})));
}

export async function printDocxPages(pages: HTMLElement): Promise<void> {
  const sourcePages = [...pages.querySelectorAll<HTMLElement>('.docx-page')];
  if (!sourcePages.length) throw Error('The document pages are not ready to print.');
  const sizes = sourcePages.map(page => {
    const style = getComputedStyle(page);
    const width = Number.parseFloat(style.width), height = Number.parseFloat(style.height);
    if (!(width > 0 && height > 0)) throw Error('The document page size is not available.');
    return { width, height };
  });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) { iframe.remove(); throw Error('The print view could not be created.'); }

  const clone = pages.cloneNode(true) as HTMLElement;
  clone.classList.add('docx-print-root');
  clone.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
  clone.querySelectorAll<HTMLElement>('.docx-page').forEach((page, index) => page.classList.add(`docx-print-page-${index}`));

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}">${copiedStyles()}<style>${printPageStyles(sizes)}</style></head><body></body></html>`);
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
      resolve();
    };
    const timer = window.setTimeout(cleanup, 60_000);
    win.addEventListener('afterprint', cleanup, { once: true });
    try { win.focus(); win.print(); }
    catch (error) { window.clearTimeout(timer); iframe.remove(); reject(error); }
  });
}
