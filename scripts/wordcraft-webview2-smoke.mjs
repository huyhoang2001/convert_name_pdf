import { readZip } from '@docx-editor.dev/core/store';

const endpoint = process.env.WORDCRAFT_CDP_URL ?? 'http://127.0.0.1:9223';
const pages = await fetch(`${endpoint}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && /(?:localhost:5175|tauri\.localhost)\//.test(item.url));
if (!page) throw Error('Isolated Tauri WebView2 page is unavailable; launch with remote debugging on port 9223.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const [resolve, reject, label] = pending.get(message.id);
  pending.delete(message.id);
  if (message.error || message.result?.exceptionDetails) reject(Error(`${label}: ${JSON.stringify(message.error || message.result.exceptionDetails)}`));
  else resolve(message.result.result?.value ?? message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, [resolve, reject, method === 'Runtime.evaluate' ? `${method} ${params.expression.slice(0, 100)}` : method]);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = expression => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
const waitFor = async (expression, message, timeout = 90000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await evaluate(expression);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error(message);
};
const assert = (condition, message) => { if (!condition) throw Error(message); };

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (window === window.top) {
      window.__wordcraftSmoke = { ready: 0, wasm: [], snapshots: [] };
      window.addEventListener('message', async event => {
        const data = event.data;
        if (data?.type === 'wordcraft:ready') window.__wordcraftSmoke.ready++;
        if (data?.type === '__wordcraftWasmSmoke') window.__wordcraftSmoke.wasm.push(data.result);
        if (data?.type === 'wordcraft:snapshot-result' && data.id?.startsWith('smoke-')) {
          const bytes = data.bytes instanceof ArrayBuffer ? new Uint8Array(data.bytes) : new Uint8Array(data.bytes.buffer, data.bytes.byteOffset, data.bytes.byteLength);
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const snapshot = { id: data.id, hash: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join(''), size: bytes.byteLength };
          if (data.id === 'smoke-edited') snapshot.docx = btoa(Array.from({ length: Math.ceil(bytes.length / 0x8000) }, (_, i) => String.fromCharCode(...bytes.subarray(i * 0x8000, (i + 1) * 0x8000))).join(''));
          window.__wordcraftSmoke.snapshots.push(snapshot);
        }
      });
    } else if (location.pathname.endsWith('/wordcraft/index.html')) {
      const inspect = async (source, imports) => {
        let module;
        if (source instanceof Response) module = await WebAssembly.compile(await source.clone().arrayBuffer());
        else if (source instanceof WebAssembly.Module) module = source;
        else module = await WebAssembly.compile(source);
        const descriptors = WebAssembly.Module.imports(module);
        const errors = descriptors.flatMap(item => {
          const namespace = imports?.[item.module];
          if (!Object.hasOwn(imports ?? {}, item.module) || (typeof namespace !== 'object' && typeof namespace !== 'function')) return [item.module + ' is absent or not an object'];
          const member = namespace[item.name];
          if (member === undefined) return [item.module + '.' + item.name + ' is absent'];
          if (item.kind === 'function' && typeof member !== 'function') return [item.module + '.' + item.name + ' is not a function'];
          if (item.kind === 'memory' && !(member instanceof WebAssembly.Memory)) return [item.module + '.' + item.name + ' is not memory'];
          if (item.kind === 'table' && !(member instanceof WebAssembly.Table)) return [item.module + '.' + item.name + ' is not a table'];
          if (item.kind === 'global' && !(member instanceof WebAssembly.Global)) return [item.module + '.' + item.name + ' is not a global'];
          return [];
        });
        return { count: descriptors.length, imports: [...new Set(descriptors.map(item => item.module))], errors };
      };
      const report = result => window.top.postMessage({ type: '__wordcraftWasmSmoke', result }, '*');
      for (const name of ['instantiateStreaming', 'instantiate']) {
        const original = WebAssembly[name];
        WebAssembly[name] = async function(source, imports, ...rest) {
          let result;
          try {
            const audit = await inspect(source, imports);
            result = { method: name, ...audit };
            if (audit.errors.length) throw Error(audit.errors.join('; '));
            const instance = await original.call(this, source, imports, ...rest);
            result.success = true;
            report(result);
            return instance;
          } catch (error) {
            report({ ...(result ?? { method: name }), error: String(error) });
            throw error;
          }
        };
      }
    }
  ` });
  await send('Page.reload');
  await waitFor('!!window.__wordcraftSmoke', 'Smoke instrumentation did not initialize');
  const sriCount = await evaluate(`(async () => {
    const response = await fetch(new URL('wordcraft/index.html', location.href));
    if (!response.ok) throw Error('Wordcraft HTML request failed: ' + response.status);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const checked = await Promise.all([...doc.querySelectorAll('[integrity][href]')].map(async asset => {
      const url = new URL(asset.getAttribute('href'), response.url);
      const bytes = await fetch(url).then(result => { if (!result.ok) throw Error('Wordcraft asset request failed: ' + result.status + ' ' + url); return result.arrayBuffer(); });
      const digest = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-384', bytes))));
      const actual = 'sha384-' + digest;
      if (actual !== asset.integrity) throw Error('Served SRI mismatch for ' + url.pathname);
      return { asset: url.pathname, integrity: actual };
    }));
    if (!checked.some(asset => asset.asset.endsWith('.wasm')) || !checked.some(asset => /wordcraft-web-.*\\.js$/.test(asset.asset))) throw Error('Wordcraft HTML did not expose WASM and glue SRI resources');
    window.__wordcraftSmoke.sri = checked;
    return checked.length;
  })()`);
  await evaluate(`document.querySelector('button.nav-item[aria-label^="Word"]')?.click()`);
  await waitFor(`!!document.querySelector('button.nav-item.active[aria-label^="Word"]')`, 'Word navigation did not activate');
  await waitFor(`!!(document.querySelector('.word-home')?.getClientRects().length || document.querySelector('.wordcraft-editor')?.getClientRects().length)`, 'Word workspace did not open');
  await evaluate(`(() => { const home = document.querySelector('.word-home'); if (home?.getClientRects().length) home.querySelector('.word-home-head button.primary-button')?.click(); })()`);
  const report = JSON.parse(await waitFor(`(() => { const editor = document.querySelector('.wordcraft-editor.is-ready'); return editor?.getClientRects().length && editor.querySelector('iframe')?.getBoundingClientRect().width > 0 && window.__wordcraftSmoke.ready === 1 && window.__wordcraftSmoke.wasm.some(result => result.success) ? JSON.stringify(window.__wordcraftSmoke) : ''; })()`, 'Wordcraft WASM or renderer did not become ready'));
  assert(report.wasm.filter(item => item.success).length === 1, `Wordcraft did not initialize exactly once: ${JSON.stringify(report)}`);
  assert(report.wasm.find(item => item.success).errors.length === 0, 'WASM imports object did not satisfy Module.imports()');
  assert(report.ready === 1, 'wordcraft:ready was not received exactly once');
  const baselineId = 'smoke-baseline';
  await evaluate(`document.querySelector('.wordcraft-editor iframe').contentWindow.postMessage({type:'wordcraft:snapshot',id:${JSON.stringify(baselineId)}},location.origin)`);
  await waitFor(`window.__wordcraftSmoke.snapshots.some(snapshot => snapshot.id === ${JSON.stringify(baselineId)})`, 'Initial DOCX snapshot failed');
  const point = await evaluate(`(() => { const frame = document.querySelector('.wordcraft-editor iframe'); const frameRect = frame.getBoundingClientRect(); const canvas = frame.contentDocument.querySelector('canvas'); const rect = canvas.getBoundingClientRect(); canvas.focus(); return {x:frameRect.x+rect.x+rect.width/2,y:frameRect.y+rect.y+rect.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await send('Input.insertText', { text: 'WORDCRAFT_SMOKE' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await evaluate(`document.querySelector('.wordcraft-editor iframe').contentWindow.postMessage({type:'wordcraft:snapshot',id:'smoke-edited'},location.origin)`);
  await waitFor(`window.__wordcraftSmoke.snapshots.some(snapshot => snapshot.id === 'smoke-edited')`, 'Edited DOCX snapshot failed');
  const snapshots = JSON.parse(await evaluate(`JSON.stringify(window.__wordcraftSmoke.snapshots)`));
  const before = snapshots.find(item => item.id === baselineId);
  const after = snapshots.find(item => item.id === 'smoke-edited');
  assert(after.hash !== before.hash, 'Typing did not change the DOCX snapshot');
  const documentXml = readZip(Uint8Array.from(Buffer.from(after.docx, 'base64'))).entries.get('/word/document.xml');
  assert(new TextDecoder().decode(documentXml).includes('WORDCRAFT_SMOKE'), 'Typed marker is missing from the DOCX snapshot');
  assert(report.wasm.find(item => item.success).imports.some(name => name.includes('/snippets/eframe-')), 'Captured WASM imports omit the eframe snippet namespace');
  console.log(JSON.stringify({ result: 'passed', servedSriResources: sriCount, imports: report.wasm.find(item => item.success).count, namespaces: report.wasm.find(item => item.success).imports.length, successfulInitializations: 1, readyMessages: report.ready, editedSnapshotChanged: true, backend: await evaluate(`document.querySelector('.wordcraft-editor iframe').dataset.backend`) }));
} finally {
  socket.close();
}
