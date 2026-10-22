const fs = require('node:fs');
const path = require('node:path');

function scan(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw Error('Choose a valid folder.');
  const root = fs.realpathSync(folder);
  if (!fs.statSync(root).isDirectory()) throw Error('The selected path is not a folder.');
  const groups = new Map();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.toLowerCase() === 'thong_ke.txt') continue;
    const stem = path.parse(entry.name).name;
    let label, raw;
    if (/^\d+$/.test(stem)) { label = 'Number only'; raw = stem; }
    else if (/^(.*)_(\d+)$/.test(stem)) { const m = stem.match(/^(.*)_(\d+)$/); label = `${m[1]}_`; raw = m[2]; }
    else if (/^(\d+)[-_](.*)$/.test(stem)) { const m = stem.match(/^(\d+)[-_](.*)$/); label = `Starts with number · ${m[2]}`; raw = m[1]; }
    else if (/^(.*?)(\d+)$/.test(stem)) { const m = stem.match(/^(.*?)(\d+)$/); label = m[1] || 'Other numbered files'; raw = m[2]; }
    else continue;
    const number = BigInt(raw), files = groups.get(label) || [];
    files.push({ name: entry.name, number, width: raw.length }); groups.set(label, files);
  }
  return { root, groups: [...groups].map(([label, files]) => {
    files.sort((a, b) => a.number < b.number ? -1 : a.number > b.number ? 1 : a.name.localeCompare(b.name));
    const min = files[0].number, max = files.at(-1).number, present = new Set(files.map(f => f.number.toString())), missing = [], expected = max - min + 1n, width = Math.max(...files.map(f => f.width));
    for (let n = min; n <= max && missing.length < 10000; n++) if (!present.has(n.toString())) missing.push(n.toString().padStart(width, '0'));
    return { label, count: files.length, min: min.toString(), max: max.toString(), expected: expected.toString(), missingCount: (expected - BigInt(present.size)).toString(), missing, truncated: BigInt(missing.length) < expected - BigInt(present.size) };
  }).sort((a, b) => a.label.localeCompare(b.label)) };
}

function saveReport(folder, language = 'EN') {
  const vi = language === 'VI', text = (en, vn) => vi ? vn : en;
  const data = scan(folder), lines = [text('FILE NUMBER CHECK', 'BÁO CÁO KIỂM TRA SỐ'), `${text('Folder', 'Thư mục')}: ${data.root}`, ''];
  let total = 0, missingTotal = 0n;
  for (const g of data.groups) {
    total += g.count; missingTotal += BigInt(g.missingCount);
    lines.push('='.repeat(60), `${text('Group', 'Nhóm')}: ${g.label}`, `${text('Files', 'Số tệp')}: ${g.count}`, `${text('Minimum', 'Số nhỏ nhất')}: ${g.min}`, `${text('Maximum', 'Số lớn nhất')}: ${g.max}`, `${text('Expected', 'Số lượng dự kiến')}: ${g.expected}`, `${text('Missing', 'Số còn thiếu')}: ${g.missingCount}`, '', text('Missing numbers:', 'Các số còn thiếu:'), ...(g.missing.length ? g.missing : [text('None', 'Không có')]), ...(g.truncated ? [text('(List truncated after 10000 values.)', '(Danh sách đã giới hạn ở 10.000 số đầu tiên.)')] : []), '');
  }
  lines.push('='.repeat(60), `${text('Groups', 'Số nhóm')}: ${data.groups.length}`, `${text('Files', 'Tổng số tệp')}: ${total}`, `${text('Missing numbers', 'Tổng số còn thiếu')}: ${missingTotal}`);
  const reportPath = path.join(data.root, 'thong_ke.txt');
  fs.writeFileSync(reportPath, lines.join('\r\n'), 'utf8');
  return reportPath;
}

module.exports = { scan, saveReport };
