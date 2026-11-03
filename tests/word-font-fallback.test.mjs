import test from 'node:test';
import assert from 'node:assert/strict';
import { substituteMissingFonts } from '../src/word/docx.ts';

const font = (family, weight, style = 'normal') => ({ request: { family, weight, style } });
const configuration = { sources: [
  font('Arial', 400), font('Arial', 700), font('Arial', 400, 'italic'), font('Arial', 700, 'italic'),
  font('Times New Roman', 400), font('Times New Roman', 700), font('Times New Roman', 700, 'italic'),
] };

test('known missing DOCX fonts map to installed local faces', () => {
  const result = substituteMissingFonts(configuration, ['Open Sans', 'Times New Roman Bold']);
  assert.ok(result);
  assert.equal(result.substitutions.length, 6);
  assert.deepEqual(result.substitutions.find(row => row.from.family === 'Open Sans' && row.from.weight === 700)?.to, { family: 'Arial', weight: 700, style: 'normal' });
  assert.deepEqual(result.substitutions.find(row => row.from.family === 'Times New Roman Bold' && row.from.style === 'italic')?.to, { family: 'Times New Roman', weight: 700, style: 'italic' });
});

test('unknown or unavailable missing fonts do not offer a fallback', () => {
  assert.equal(substituteMissingFonts(configuration, ['A font the app does not map']), null);
  assert.equal(substituteMissingFonts({ sources: [font('Arial', 400)] }, ['Times New Roman Bold']), null);
});
