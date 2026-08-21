import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const port = 8123;
const debugPort = 9222;

function findChrome() {
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('No Chrome/Chromium binary available');
}

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', `http://127.0.0.1:${port}`).pathname;
    const safePath = pathname.replace(/^\/+/, '');
    if (safePath.includes('..')) throw new Error('bad path');
    const filePath = resolve(root, safePath);
    if (!filePath.startsWith(root)) throw new Error('bad path');
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

await new Promise((resolveReady) => server.listen(port, '127.0.0.1', resolveReady));
const profile = await mkdtemp(join(tmpdir(), 'nubo-sense-chrome-'));
const chrome = spawn(findChrome(), [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let chromeErr = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeErr += chunk; });

async function waitForJson(url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

let socket;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const targetUrl = `http://127.0.0.1:${port}/scripts/web-sense-smoke.html`;
  const targetResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(targetUrl)}`,
    { method: 'PUT' },
  );
  if (!targetResponse.ok) throw new Error(`Could not create Chrome target: ${targetResponse.status}`);
  const target = await targetResponse.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => rejectOpen(new Error('CDP websocket timeout')), 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); rejectOpen(new Error('CDP websocket error')); }, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(message.error.message));
    else resolver.resolve(message.result);
  });

  const call = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const requestId = ++id;
    pending.set(requestId, { resolve: resolveCall, reject: rejectCall });
    socket.send(JSON.stringify({ id: requestId, method, params }));
    setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      rejectCall(new Error(`CDP call timeout: ${method}`));
    }, 5000);
  });

  await call('Runtime.enable');
  const deadline = Date.now() + 35000;
  let lastText = '';
  while (Date.now() < deadline) {
    const result = await call('Runtime.evaluate', {
      expression: 'JSON.stringify({status:document.body?.dataset?.senseStatus||"",text:document.body?.textContent||""})',
      returnByValue: true,
    });
    const raw = result?.result?.value;
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      lastText = parsed.text;
      if (parsed.status === 'ready') {
        console.log('Web Sense worker runtime smoke: READY');
        process.exitCode = 0;
        break;
      }
      if (parsed.status === 'error') {
        throw new Error(`Web Sense worker browser error: ${parsed.text}`);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (process.exitCode !== 0) {
    throw new Error(`Web Sense worker did not reach READY in 35s. Last page text: ${lastText}`);
  }
} catch (error) {
  console.error(String(error));
  if (chromeErr) console.error(chromeErr.slice(-5000));
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  chrome.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
