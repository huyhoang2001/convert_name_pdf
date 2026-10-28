export type Point = { x: number; y: number };

const margin = 12;
const gap = 8;
const launcherSize = 62;

export function chatSize(width: number, height: number) {
  return { width: Math.min(368, width - 2 * margin), height: Math.min(480, height - 100) };
}

export function clampChat(point: Point, width: number, height: number): Point {
  const size = chatSize(width, height);
  return {
    x: Math.max(margin, Math.min(point.x, width - size.width - margin)),
    y: Math.max(margin, Math.min(point.y, height - size.height - gap - launcherSize - margin))
  };
}

export function launcherAt(panel: Point, width: number, height: number): Point {
  const size = chatSize(width, height);
  return { x: panel.x + size.width - launcherSize, y: panel.y + size.height + gap };
}
