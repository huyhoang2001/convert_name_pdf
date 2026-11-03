import { rulerTabPosition, snapTwips } from '@docx-editor.dev/core/editor';
import type { ParagraphTabStop } from '@docx-editor.dev/core/editor';

export type RulerPageSetup = { pageWidthTwips: number; marginsTwips: { left: number; right: number } };

export function tabPositionFromClientX(
  clientX: number,
  rect: Pick<DOMRect, 'left' | 'width'>,
  page: RulerPageSetup,
  rtl: boolean,
  unit: 'inch' | 'cm',
) {
  if (!rect.width) return 0;
  const pageX = Math.round(((clientX - rect.left) / rect.width) * page.pageWidthTwips);
  const { left, right } = page.marginsTwips;
  const max = page.pageWidthTwips - left - right;
  const fromLeadingMargin = rtl ? page.pageWidthTwips - right - pageX : pageX - left;
  return snapTwips(Math.max(0, Math.min(max, fromLeadingMargin)), unit, false);
}

export function tabPositionPx(stop: ParagraphTabStop, page: RulerPageSetup, rtl: boolean, width: number) {
  return rulerTabPosition(stop.positionTwips, {
    pageWidth: page.pageWidthTwips,
    leftMargin: page.marginsTwips.left,
    rightMargin: page.marginsTwips.right,
  }, { rtl }) / page.pageWidthTwips * width;
}

export function putTabStop(stops: readonly ParagraphTabStop[], stop: ParagraphTabStop) {
  return [...stops.filter(item => item.positionTwips !== stop.positionTwips), stop]
    .sort((a, b) => a.positionTwips - b.positionTwips);
}

export function moveTabStop(stops: readonly ParagraphTabStop[], from: number, to: number) {
  const stop = stops.find(item => item.positionTwips === from);
  return stop ? putTabStop(stops.filter(item => item !== stop), { ...stop, positionTwips: to }) : [...stops];
}

export function removeTabStop(stops: readonly ParagraphTabStop[], position: number) {
  return stops.filter(item => item.positionTwips !== position);
}
