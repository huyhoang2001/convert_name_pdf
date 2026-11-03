export function nextWordZoom(current: number, deltaY: number): number {
  return Math.max(0.1, Math.min(2, Math.round(current * 10 + (deltaY < 0 ? 1 : -1)) / 10));
}
