import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DocxEditorRef } from '@docx-editor.dev/react';
import { readPageColumns } from './readOverviewLayout';

function copyCanvases(source: HTMLElement, target: HTMLElement) {
  const canvases = target.querySelectorAll('canvas');
  source.querySelectorAll('canvas').forEach((original, index) => {
    const canvas = canvases[index];
    if (!canvas) return;
    canvas.width = original.width;
    canvas.height = original.height;
    canvas.getContext('2d')?.drawImage(original, 0, 0);
  });
}

function clonePreviewPage(page: HTMLElement): HTMLElement {
  const clone = page.cloneNode(true) as HTMLElement;
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('[contenteditable], [tabindex]').forEach(node => {
    node.removeAttribute('contenteditable');
    node.removeAttribute('tabindex');
  });
  copyCanvases(page, clone);
  return clone;
}

function Preview({ page }: { page?: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.replaceChildren(page?.cloneNode(true) ?? document.createElement('span'));
    if (!page) return;
    copyCanvases(page, ref.current);
  }, [page]);
  return <div className="word-read-page docx-pages" ref={ref} aria-hidden="true"/>;
}

export function ReadPageOverview({ editorRef, hostRef, savedPosition, language, activePage = null, revision, onSelectPage, onActivePageGone }: { editorRef: React.RefObject<DocxEditorRef | null>; hostRef: React.RefObject<HTMLDivElement | null>; savedPosition: { top: number; left: number }; language: 'EN' | 'VI'; activePage?: number | null; revision: number; onSelectPage?: (index: number) => void; onActivePageGone?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedPage = useRef(false);
  const capturedZoom = useRef(1);
  const previousActivePage = useRef<number | null>(null);
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [previews, setPreviews] = useState<Map<number, HTMLElement>>(new Map());
  const [retry, setRetry] = useState(0);
  const columns = readPageColumns(width, pageWidth);
  const rows = Math.ceil(total / columns);
  const virtualizer = useVirtualizer({ count: rows, getScrollElement: () => scrollRef.current, estimateSize: () => pageHeight + 16 || 180, overscan: 2 });
  const visible = virtualizer.getVirtualItems();
  const needed = visible.flatMap(row => Array.from({ length: Math.min(columns, total - row.index * columns) }, (_, column) => row.index * columns + column));
  const neededKey = needed.join(',');

  const refreshPage = (index: number) => {
    const page = hostRef.current?.querySelector<HTMLElement>(`:scope > .docx-editor:not(.word-read-overview) .docx-pages .docx-page[data-page-index="${index}"]`);
    if (!page?.querySelector('.docx-page-content')) return;
    setPreviews(current => new Map(current).set(index, clonePreviewPage(page)));
  };

  useLayoutEffect(() => {
    if (activePage === null) return;
    const host = hostRef.current;
    const surface = scrollRef.current;
    if (!host || !surface) return;
    const update = () => {
      const tile = surface.querySelector<HTMLElement>(`[data-overview-page-index="${activePage}"]`);
      if (!tile) { onActivePageGone?.(); return; }
      const rect = tile.getBoundingClientRect();
      const viewport = surface.getBoundingClientRect();
      if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) { onActivePageGone?.(); return; }
      const source = host.querySelector<HTMLElement>(':scope > .docx-editor:not(.word-read-overview) .docx-editor__scroll-container');
      const page = source?.querySelector<HTMLElement>(`.docx-page[data-page-index="${activePage}"]`);
      if (!source || !page) return;
      const sourceRect = source.getBoundingClientRect();
      const sourceContent = page.querySelector<HTMLElement>('.docx-page-content')?.getBoundingClientRect() ?? page.getBoundingClientRect();
      const previewContent = tile.querySelector<HTMLElement>('.docx-page-content')?.getBoundingClientRect() ?? rect;
      const left = previewContent.left - (sourceContent.left - sourceRect.left);
      const top = previewContent.top - (sourceContent.top - sourceRect.top);
      host.style.setProperty('--word-live-left', `${left}px`);
      host.style.setProperty('--word-live-top', `${top}px`);
      host.style.setProperty('--word-live-width', `${source.offsetWidth}px`);
      host.style.setProperty('--word-live-height', `${source.offsetHeight}px`);
      host.style.setProperty('--word-live-clip', `inset(${Math.max(0, Math.max(rect.top, viewport.top) - top)}px ${Math.max(0, source.offsetWidth - (Math.min(rect.right, viewport.right) - left))}px ${Math.max(0, source.offsetHeight - (Math.min(rect.bottom, viewport.bottom) - top))}px ${Math.max(0, Math.max(rect.left, viewport.left) - left)}px)`);
    };
    let frame = 0;
    const scheduleUpdate = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(update); };
    scheduleUpdate();
    surface.addEventListener('scroll', scheduleUpdate);
    const source = host.querySelector<HTMLElement>(':scope > .docx-editor:not(.word-read-overview) .docx-editor__scroll-container');
    source?.addEventListener('scroll', scheduleUpdate);
    const resize = new ResizeObserver(scheduleUpdate);
    resize.observe(surface);
    if (source) resize.observe(source);
    const tile = surface.querySelector<HTMLElement>(`[data-overview-page-index="${activePage}"]`);
    if (tile) resize.observe(tile);
    const page = source?.querySelector<HTMLElement>(`.docx-page[data-page-index="${activePage}"]`);
    if (page) resize.observe(page);
    const content = page?.querySelector<HTMLElement>('.docx-page-content');
    if (content) resize.observe(content);
    const changes = source && new MutationObserver(scheduleUpdate);
    if (source && changes) changes.observe(source, { childList: true, subtree: true });
    if (page && changes) changes.observe(page, { attributes: true, attributeFilter: ['style', 'class'] });
    if (content && changes) changes.observe(content, { attributes: true, attributeFilter: ['style', 'class'] });
    const tileChanges = tile && new MutationObserver(scheduleUpdate);
    if (tile && tileChanges) tileChanges.observe(tile, { childList: true, subtree: true });
    return () => {
      surface.removeEventListener('scroll', scheduleUpdate);
      source?.removeEventListener('scroll', scheduleUpdate);
      resize.disconnect();
      changes?.disconnect();
      tileChanges?.disconnect();
      window.cancelAnimationFrame(frame);
      for (const name of ['--word-live-top', '--word-live-left', '--word-live-width', '--word-live-height', '--word-live-clip']) host.style.removeProperty(name);
    };
  }, [activePage, hostRef, onActivePageGone, zoom]);

  useEffect(() => {
    if (previousActivePage.current !== null && activePage === null) {
      capturedZoom.current = NaN;
      setPreviews(new Map());
      setRetry(value => value + 1);
    }
    previousActivePage.current = activePage;
  }, [activePage]);

  useEffect(() => {
    if (activePage === null) return;
    const timer = window.setTimeout(() => refreshPage(activePage), 400);
    return () => window.clearTimeout(timer);
  }, [activePage, revision]);

  useEffect(() => {
    const source = hostRef.current?.querySelector<HTMLElement>(':scope > .docx-editor:not(.word-read-overview) .docx-editor__scroll-container');
    const update = () => {
      const editor = editorRef.current?.getEditor();
      const snapshot = editorRef.current?.snapshot();
      if (!editor || !snapshot) return;
      setTotal(snapshot.page.total);
      setZoom(editor.getZoom());
      const page = hostRef.current?.querySelector<HTMLElement>(':scope > .docx-editor:not(.word-read-overview) .docx-pages .docx-page');
      if (page) {
        const bounds = page.getBoundingClientRect();
        if (bounds.width > 0) setPageWidth(previous => Math.max(previous, bounds.width));
        if (bounds.height > 0) setPageHeight(previous => Math.max(previous, bounds.height));
      }
    };
    const resize = new ResizeObserver(() => setWidth(scrollRef.current?.clientWidth ?? 0));
    if (scrollRef.current) resize.observe(scrollRef.current);
    update();
    const timer = window.setInterval(update, 250);
    return () => {
      window.clearInterval(timer);
      resize.disconnect();
      if (source && !selectedPage.current) { source.scrollTop = savedPosition.top; source.scrollLeft = savedPosition.left; }
    };
  }, [editorRef, hostRef, savedPosition]);

  useEffect(() => { setPreviews(new Map()); setPageWidth(0); setPageHeight(0); }, [zoom]);
  useEffect(() => {
    if (!needed.length) return;
    let cancelled = false;
    let retryTimer = 0;
    const capture = async () => {
      const next = new Map<number, HTMLElement>(capturedZoom.current === zoom ? [...previews].filter(([index]) => needed.includes(index)) : []);
      capturedZoom.current = zoom;
      setPreviews(new Map(next));
      let moved = false;
      try {
        for (const index of needed) {
          if (cancelled) return;
          if (next.has(index)) continue;
          const editor = editorRef.current?.getEditor();
          if (!editor?.scrollToPage(index + 1)) continue;
          moved = true;
          for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
            const page = hostRef.current?.querySelector<HTMLElement>(`:scope > .docx-editor:not(.word-read-overview) .docx-pages .docx-page[data-page-index="${index}"]`);
            if (page?.querySelector('.docx-page-content')) {
              const bounds = page.getBoundingClientRect();
              setPageWidth(previous => Math.max(previous, bounds.width));
              setPageHeight(previous => Math.max(previous, bounds.height));
              const clone = clonePreviewPage(page);
              next.set(index, clone);
              setPreviews(new Map(next));
              break;
            }
            await new Promise(resolve => window.setTimeout(resolve, 50));
          }
        }
      } finally {
        if (moved && activePage !== null) editorRef.current?.getEditor()?.scrollToPage(activePage + 1);
      }
      if (!cancelled && next.size < needed.length) retryTimer = window.setTimeout(() => setRetry(value => value + 1), 1000);
    };
    void capture();
    return () => { cancelled = true; window.clearTimeout(retryTimer); };
  }, [neededKey, zoom, retry, activePage, editorRef, hostRef]);

  return <div className="word-read-overview docx-editor docx-preview-surface" ref={scrollRef} role="region" aria-label={language === 'VI' ? 'Tổng quan trang' : 'Page overview'}>
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {visible.map(row => <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} className="word-read-row" style={{ position: 'absolute', top: row.start, width: '100%', gridTemplateColumns: `repeat(${columns}, ${pageWidth || 1}px)` }}>
        {Array.from({ length: Math.min(columns, total - row.index * columns) }, (_, column) => {
          const index = row.index * columns + column;
          const content = <><Preview page={previews.get(index)}/>{!previews.has(index) && <span className="word-read-loading">{language === 'VI' ? 'Đang tải trang…' : 'Loading page…'}</span>}</>;
          return onSelectPage
            ? <button key={index} type="button" className="word-read-tile" data-overview-page-index={index} data-active={activePage === index || undefined} style={{ minHeight: pageHeight || 160 }} aria-label={language === 'VI' ? `Mở trang ${index + 1} để chỉnh sửa` : `Open page ${index + 1} for editing`} onClick={() => { if (activePage !== null && activePage !== index) refreshPage(activePage); selectedPage.current = true; onSelectPage(index); }}>{content}</button>
            : <div key={index} className="word-read-tile" style={{ minHeight: pageHeight || 160 }} aria-label={`${language === 'VI' ? 'Trang' : 'Page'} ${index + 1}`}>{content}</div>;
        })}
      </div>)}
    </div>
  </div>;
}
