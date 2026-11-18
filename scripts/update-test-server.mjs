import https from 'node:https';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';

if (process.env.B6H_UPDATE_TEST_SERVER !== '1') throw Error('Set B6H_UPDATE_TEST_SERVER=1 to start the isolated test server.');
const root = resolve(process.env.B6H_UPDATE_TEST_DISTRIBUTION ?? '.b6h-state/distribution');
const pfx = await readFile('.b6h-state/update-test-keys/local-test-server.pfx');
const server = https.createServer({ pfx, passphrase: 'B6H-local-test-only' }, async (request, response) => {
  try {
    const url = new URL(request.url, 'https://localhost');
    if (url.pathname === '/releases/latest') {
      const assets = (await readdir(root)).filter(name => name === 'catalog.json' || name === 'catalog.sig' || name.endsWith('.b6hupdate'));
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ tag_name: 'v3.0.0', assets: assets.map(name => ({ name, browser_download_url: `https://localhost:8443/assets/${encodeURIComponent(basename(name))}` })) }));
      return;
    }
    if (url.pathname.startsWith('/assets/')) {
      const name = decodeURIComponent(url.pathname.slice('/assets/'.length));
      if (!name || basename(name) !== name || name.includes(sep)) throw Error('Invalid asset path.');
      const bytes = await readFile(resolve(root, name));
      response.writeHead(200, { 'content-length': bytes.length, 'cache-control': 'no-store' });
      response.end(bytes);
      return;
    }
    response.writeHead(404); response.end();
  } catch (error) { response.writeHead(404); response.end(error.message); }
});
server.listen(8443, '127.0.0.1', () => console.log('Isolated update test server: https://localhost:8443/releases/latest'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
