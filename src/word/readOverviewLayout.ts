export function readPageColumns(width: number, pageWidth: number) {
  return pageWidth > 0 ? Math.max(1, Math.min(3, Math.floor((width - 16) / (pageWidth + 16)))) : 1;
}

export function shouldShowPrintOverview(zoom: number, width: number, pageWidth: number) {
  return zoom < 1 && readPageColumns(width, pageWidth) > 1;
}
