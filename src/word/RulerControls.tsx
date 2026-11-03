import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { DocxEditor, usePageSetup, useParagraphFormat, useZoom } from '@docx-editor.dev/react';
import type { ParagraphTabStop } from '@docx-editor.dev/core/editor';
import { moveTabStop, putTabStop, removeTabStop, tabPositionFromClientX, tabPositionPx } from './rulerTabs';

const alignments = ['left', 'center', 'right', 'decimal'] as const;
type Alignment = typeof alignments[number];
type Guide = { axis: 'x' | 'y'; position: number };

export function RulerControls({ host, active, language }: { host: RefObject<HTMLDivElement | null>; active: boolean; language: 'EN' | 'VI' }) {
  const { pageSetup } = usePageSetup();
  const { zoom } = useZoom();
  const { format, isEnabled, apply } = useParagraphFormat();
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [verticalHost, setVerticalHost] = useState<HTMLElement | null>(null);
  const [horizontalRuler, setHorizontalRuler] = useState<HTMLElement | null>(null);
  const [alignmentIndex, setAlignmentIndex] = useState(0);
  const [preview, setPreview] = useState<ParagraphTabStop | null>(null);
  const [dragging, setDragging] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const drag = useRef<{ pointerId: number; origin: number; stop: ParagraphTabStop; position: number; remove: boolean } | null>(null);
  const latest = useRef({ format, apply, pageSetup, isEnabled, language, zoom });
  latest.current = { format, apply, pageSetup, isEnabled, language, zoom };
  const frame = useRef(0);
  const unit = language === 'VI' ? 'cm' : 'inch';

  useEffect(() => {
    const root = host.current;
    if (!root || !active) {
      setRow(null); setVerticalHost(null); setHorizontalRuler(null);
      return;
    }
    const sync = () => {
      const rulerRow = root.querySelector<HTMLElement>('[data-testid="docx-editor-ruler-row"]');
      const ruler = rulerRow?.querySelector<HTMLElement>('.docx-horizontal-ruler.word-ruler-custom') ?? null;
      const defaultVertical = root.querySelector<HTMLElement>('.docx-vertical-ruler:not(.word-ruler-custom)');
      setRow(current => current === rulerRow ? current : rulerRow);
      setVerticalHost(current => current === defaultVertical?.parentElement ? current : defaultVertical?.parentElement ?? null);
      setHorizontalRuler(current => current === ruler ? current : ruler);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [host, active]);

  const updateDrag = useCallback((event: PointerEvent) => {
    const current = drag.current;
    const ruler = horizontalRuler;
    const page = latest.current.pageSetup;
    if (!current || event.pointerId !== current.pointerId || !ruler || !page) return;
    const rect = ruler.getBoundingClientRect();
    const isRtl = latest.current.format?.direction === 'rtl';
    const position = tabPositionFromClientX(event.clientX, rect, page, isRtl, latest.current.language === 'VI' ? 'cm' : 'inch');
    current.position = position;
    current.remove = event.clientY > rect.bottom + 6;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setPreview(current.remove ? null : { ...current.stop, positionTwips: position });
      const hostRect = host.current?.getBoundingClientRect();
      if (hostRect) setGuide({ axis: 'x', position: event.clientX - hostRect.left });
    });
  }, [host, horizontalRuler]);

  useEffect(() => {
    if (!dragging) return;
    const finish = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const { format: currentFormat, apply: applyFormat } = latest.current;
      if (currentFormat && !currentFormat.disagrees.tabStops) {
        const stops = currentFormat.tabStops ?? [];
        const next = current.remove ? removeTabStop(stops, current.origin) : moveTabStop(stops, current.origin, current.position);
        if (JSON.stringify(next) !== JSON.stringify(stops)) applyFormat({ tabStops: next });
      }
      drag.current = null;
      setDragging(false); setPreview(null); setGuide(null);
    };
    window.addEventListener('pointermove', updateDrag);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', updateDrag);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [dragging, updateDrag]);

  useEffect(() => {
    const root = host.current;
    if (!root || !active) return;
    let pending: { axis: 'x' | 'y'; start: number } | null = null;
    const start = (event: PointerEvent | MouseEvent) => {
      if (pending || !latest.current.isEnabled) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const ruler = target.closest('.docx-horizontal-ruler, .docx-vertical-ruler');
      if (!ruler || target.closest('.word-ruler-tab-marker, .word-ruler-tab-selector')) return;
      const axis = ruler.classList.contains('docx-vertical-ruler') ? 'y' : 'x';
      pending = { axis, start: axis === 'y' ? event.clientY : event.clientX };
      const move = (moveEvent: PointerEvent | MouseEvent) => {
        if (!pending) return;
        const coordinate = pending.axis === 'y' ? moveEvent.clientY : moveEvent.clientX;
        if (Math.abs(coordinate - pending.start) < 2) return;
        const hostRect = root.getBoundingClientRect();
        setGuide({ axis: pending.axis, position: coordinate - (pending.axis === 'y' ? hostRect.top : hostRect.left) });
      };
      const end = () => {
        pending = null; setGuide(null);
        window.removeEventListener('pointermove', move); window.removeEventListener('mousemove', move);
        window.removeEventListener('pointerup', end); window.removeEventListener('mouseup', end); window.removeEventListener('pointercancel', end);
      };
      window.addEventListener('pointermove', move); window.addEventListener('mousemove', move);
      window.addEventListener('pointerup', end); window.addEventListener('mouseup', end); window.addEventListener('pointercancel', end);
    };
    root.addEventListener('pointerdown', start, true); root.addEventListener('mousedown', start, true);
    return () => { root.removeEventListener('pointerdown', start, true); root.removeEventListener('mousedown', start, true); };
  }, [host, active]);

  useEffect(() => {
    if (!horizontalRuler) return;
    const addStop = (event: MouseEvent) => {
      const { format: currentFormat, pageSetup: page, apply: applyFormat, isEnabled: enabled, language: currentLanguage } = latest.current;
      if (!enabled || !currentFormat || !page || currentFormat.disagrees.tabStops) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('.word-ruler-tab-marker, .docx-ruler-indent')) return;
      const rect = horizontalRuler.getBoundingClientRect();
      const marginScale = rect.width / page.pageWidthTwips;
      if (event.clientX < rect.left + page.marginsTwips.left * marginScale || event.clientX > rect.right - page.marginsTwips.right * marginScale) return;
      const positionTwips = tabPositionFromClientX(event.clientX, rect, page, currentFormat.direction === 'rtl', currentLanguage === 'VI' ? 'cm' : 'inch');
      applyFormat({ tabStops: putTabStop(currentFormat.tabStops ?? [], { positionTwips, alignment: alignments[alignmentIndex] }) });
    };
    horizontalRuler.addEventListener('click', addStop);
    return () => horizontalRuler.removeEventListener('click', addStop);
  }, [horizontalRuler, alignmentIndex]);

  const stops = format?.tabStops ?? [];
  const editableTabs = !!isEnabled && !!format && !format.disagrees.tabStops && !!pageSetup;
  const selectorLabel = language === 'VI' ? 'Kiểu điểm dừng tab' : 'Tab stop alignment';
  const alignmentLabel = (value: Alignment) => language === 'VI'
    ? ({ left: 'Trái', center: 'Giữa', right: 'Phải', decimal: 'Thập phân' } as const)[value]
    : ({ left: 'Left', center: 'Center', right: 'Right', decimal: 'Decimal' } as const)[value];
  const markerText = (value: Alignment) => ({ left: 'L', center: 'C', right: 'R', decimal: 'D' } as const)[value];
  const visibleStops = drag.current?.remove
    ? removeTabStop(stops, drag.current.origin)
    : preview ? putTabStop(removeTabStop(stops, drag.current?.origin ?? preview.positionTwips), preview) : stops;

  return <>
    {row && createPortal(<DocxEditor.HorizontalRuler unit={unit} className="word-ruler-custom"/>, row)}
    {verticalHost && createPortal(<DocxEditor.VerticalRuler unit={unit} className="word-ruler-custom"/>, verticalHost)}
    {row && createPortal(<button type="button" className="word-ruler-tab-selector" disabled={!editableTabs} aria-label={selectorLabel} title={`${selectorLabel}: ${alignmentLabel(alignments[alignmentIndex])}`} onClick={() => setAlignmentIndex(index => (index + 1) % alignments.length)}>{markerText(alignments[alignmentIndex])}</button>, row)}
    {horizontalRuler && pageSetup && createPortal(<div className="word-ruler-tab-layer">
      {visibleStops.map(stop => {
        const position = tabPositionPx(stop, pageSetup, format?.direction === 'rtl', horizontalRuler.clientWidth);
        const label = `${alignmentLabel(stop.alignment as Alignment)}: ${measure(stop.positionTwips, unit, language)}`;
        const keyPosition = drag.current && stop === preview ? drag.current.origin : stop.positionTwips;
        return <button key={`${stop.alignment}-${keyPosition}`} type="button" className="word-ruler-tab-marker" style={{ left: `${position}px` }} aria-label={`${language === 'VI' ? 'Điểm dừng tab' : 'Tab stop'} ${label}`} title={label} disabled={!editableTabs} onPointerDown={event => {
          if (!editableTabs) return;
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, origin: stop.positionTwips, stop, position: stop.positionTwips, remove: false };
          setPreview(stop); setDragging(true);
        }}><span aria-hidden="true">{markerText(stop.alignment as Alignment)}</span></button>;
      })}
      {preview && <span className="word-ruler-tab-value">{measure(preview.positionTwips, unit, language)}</span>}
    </div>, horizontalRuler)}
    {guide && host.current && createPortal(<div aria-hidden="true" className={`word-ruler-guide is-${guide.axis}`} style={guide.axis === 'x' ? { left: guide.position } : { top: guide.position }}/>, host.current)}
  </>;
}

function measure(twips: number, unit: 'inch' | 'cm', language: 'EN' | 'VI') {
  const value = twips / (unit === 'cm' ? 567 : 1440);
  return `${new Intl.NumberFormat(language === 'VI' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 }).format(value)} ${unit === 'cm' ? 'cm' : 'in'}`;
}
