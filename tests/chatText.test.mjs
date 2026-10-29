import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { formatChatText } from '../src/chatText.ts';

test('escaped Vietnamese Markdown renders without raw markers', () => {
  const answer = String.raw`\**Dịch thuật\**
\### Thêm bản dịch
1\. Mở màn hình \**Dịch thuật\**.
&#x20;  \- Chọn bản ghi`;
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { skipHtml: true }, formatChatText(answer)));
  assert.match(html, /<strong>Dịch thuật<\/strong>/);
  assert.match(html, /<h3>Thêm bản dịch<\/h3>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<ul>\s*<li>Chọn bản ghi<\/li>/);
  assert.doesNotMatch(html, /&#x20;|\\\*|\\###/);
});

test('isolated plus artifacts are removed while real plus signs remain', () => {
  assert.equal(formatChatText('++ Click “+” or use C++.'), ' Click “+” or use C++.');
});
