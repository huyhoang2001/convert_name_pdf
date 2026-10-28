import test from 'node:test';
import assert from 'node:assert/strict';
import { chatSize, clampChat, launcherAt } from '../src/chatDock.ts';

test('chat panel and launcher stay together while the group is moved', () => {
  for (const [width, height] of [[1778, 988], [360, 480]]) {
    const size = chatSize(width, height);
    const panel = clampChat({ x: width / 3, y: height / 4 }, width, height);
    const launcher = launcherAt(panel, width, height);
    assert.equal(launcher.x + 62, panel.x + size.width);
    assert.equal(launcher.y - (panel.y + size.height), 8);
    assert.ok(panel.x >= 12 && launcher.x + 62 <= width - 12);
    assert.ok(panel.y >= 12 && launcher.y + 62 <= height - 12);
  }
});

test('chat group is clamped inside the viewport after extreme dragging', () => {
  const panel = clampChat({ x: 10000, y: -10000 }, 360, 480);
  const launcher = launcherAt(panel, 360, 480);
  assert.equal(panel.y, 12);
  assert.equal(launcher.x + 62, 348);
});
