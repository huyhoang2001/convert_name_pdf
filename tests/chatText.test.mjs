import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

test('collapsed escaped table renders as rows and cells', () => {
  const answer = String.raw`**Các chức năng chính của B6H**
\| Chức năng | Tác dụng | Cách sử dụng nhanh | |----------|--------------|---------------| | **Đổi tên PDF** | Quét tệp PDF. | Chọn “Đổi tên”. | | **Đếm số** | Báo cáo số bị thiếu. | Mở “Đếm số”. |`;
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { skipHtml: true, remarkPlugins: [remarkGfm] }, formatChatText(answer)));
  assert.match(html, /<table>/);
  assert.match(html, /<th>Chức năng<\/th>/);
  assert.match(html, /<td><strong>Đổi tên PDF<\/strong><\/td>/);
  assert.match(html, /<td>Báo cáo số bị thiếu\.<\/td>/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 3);
  assert.doesNotMatch(html, /\\\| Chức năng|\|----------/);
});

test('valid Markdown table renders and ordinary pipes stay unchanged', () => {
  const table = '| Name | Use |\n| --- | --- |\n| PDF | Rename |';
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { skipHtml: true, remarkPlugins: [remarkGfm] }, formatChatText(table)));
  assert.match(html, /<table>/);
  assert.match(html, /<td>Rename<\/td>/);
  assert.equal(formatChatText('Choose Backup | Output for your copy.'), 'Choose Backup | Output for your copy.');
  const code = '```text\n| A | B | |---|---| | C | D |\n```';
  assert.equal(formatChatText(code), code);
});
