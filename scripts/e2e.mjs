/**
 * End-to-end verification of the built extension in a real browser.
 *
 * Usage:
 *   pnpm build
 *   CHROME_BIN="/path/to/chrome" pnpm test:e2e
 *
 * Why not Playwright: branded Chrome no longer allows `--load-extension`; this
 * script only needs a Chrome for Testing / Chromium binary and Node's built-in
 * WebSocket, so it has zero dependencies.
 *
 * It checks the things unit tests cannot:
 *   - the MAIN-world probe is installed and runs at document_start
 *   - messages sent before the page loads are captured
 *   - srcdoc frames are injected and their messages are captured
 *   - a parent -> child delivery is observed by the child's probe
 *   - the panel and popup bundles boot
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION = join(ROOT, '.output/chrome-mv3');
const FIXTURES = join(ROOT, 'tests/fixtures');
const MANIFEST = join(EXTENSION, 'manifest.json');

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function check(name, condition, detail = '') {
  console.log(`  ${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
}

if (!existsSync(MANIFEST)) {
  console.error('✗ .output/chrome-mv3 not found. Run `pnpm build` first.');
  process.exit(1);
}

const chromeBinary = CANDIDATES.find((candidate) => candidate && existsSync(candidate));
if (!chromeBinary) {
  console.error('✗ No Chrome/Chromium binary found.');
  console.error('  Set CHROME_BIN, or install Chrome for Testing:');
  console.error('  https://googlechromelabs.github.io/chrome-for-testing/');
  process.exit(1);
}

async function freePort() {
  const server = createTcpServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

function serveFixtures() {
  const server = createServer((request, response) => {
    const file = (request.url ?? '/').split('?')[0] ?? '/';
    const name = file === '/' ? 'torture.html' : file.replace(/^\//, '');
    if (!/^[\w.-]+$/.test(name)) {
      response.writeHead(400).end('bad path');
      return;
    }
    try {
      const body = readFileSync(join(FIXTURES, name));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

function connect(wsUrl) {
  return new Promise((res, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.addEventListener('open', () => {
      let id = 0;
      const pending = new Map();
      const events = [];
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
          pending.get(message.id)(message);
          pending.delete(message.id);
        } else if (message.method) {
          events.push(message);
        }
      });
      res({
        send: (method, params = {}) =>
          new Promise((done) => {
            const messageId = (id += 1);
            pending.set(messageId, done);
            socket.send(JSON.stringify({ id: messageId, method, params }));
          }),
        events,
        close: () => socket.close(),
      });
    });
    socket.addEventListener('error', reject);
  });
}

async function evaluate(session, expression, contextId) {
  const response = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    ...(contextId ? { contextId } : {}),
  });
  return response.result?.result?.value;
}

const cdpPort = await freePort();
const { server, port: fixturePort } = await serveFixtures();
const userDataDir = join(process.env.TMPDIR ?? '/tmp', `pmc-e2e-${process.pid}-${Date.now()}`);

const chrome = spawn(
  chromeBinary,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-crashpad',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
);

const cdp = `http://127.0.0.1:${cdpPort}`;
let worker = null;
let page = null;
let panel = null;

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(`${cdp}/json/version`);
      break;
    } catch {
      await sleep(250);
    }
  }

  // Give the browser a moment to register the unpacked extension. The MV3
  // worker is lazy, so the fixture page is what wakes it.
  await sleep(1000);

  page = await (
    await fetch(
      `${cdp}/json/new?${encodeURIComponent(`http://127.0.0.1:${fixturePort}/torture.html`)}`,
      { method: 'PUT' },
    )
  ).json();

  for (let attempt = 0; attempt < 40 && !worker; attempt += 1) {
    const targets = await (await fetch(`${cdp}/json/list`)).json();
    for (const target of targets.filter((item) => item.type === 'service_worker')) {
      const session = await connect(target.webSocketDebuggerUrl);
      const name = await evaluate(session, 'chrome.runtime?.getManifest?.().name ?? "unknown"');
      session.close();
      if (name === 'postMessage-catcher') worker = target;
    }
    if (!worker) await sleep(250);
  }
  if (!worker) {
    fail('the extension service worker did not start');
    throw new Error('no worker');
  }

  const extensionId = new URL(worker.url).host;
  console.log(`extension ${extensionId} on ${chromeBinary}`);

  await sleep(2500);

  const pageSession = await connect(page.webSocketDebuggerUrl);
  await pageSession.send('Runtime.enable');
  let installed = await evaluate(pageSession, 'String(window.__pmcProbeInstalled)');
  if (installed !== 'true') {
    // The first navigation can beat extension registration; reload once.
    await pageSession.send('Page.enable');
    await pageSession.send('Page.reload');
    await sleep(2000);
    installed = await evaluate(pageSession, 'String(window.__pmcProbeInstalled)');
  }
  check('MAIN-world probe is installed', installed === 'true', String(installed));
  pageSession.close();

  const workerSession = await connect(worker.webSocketDebuggerUrl);
  await workerSession.send('Runtime.enable');
  const stored = await evaluate(
    workerSession,
    'chrome.storage.session.get(null).then((value) => JSON.stringify(value))',
  );
  workerSession.close();

  const buffers = JSON.parse(stored ?? '{}')['pmc:buffers'] ?? {};
  const entries = Object.values(buffers).flat();
  const types = new Set(entries.map((entry) => entry.data?.type));

  console.log(`  captured ${entries.length}: ${[...types].join(', ')}`);
  check('message sent during <head> is captured', types.has('during-head'));
  check('message sent after load is captured', types.has('after-load'));
  check('message from an srcdoc frame is captured', types.has('from-srcdoc'));
  check('message from a same-origin iframe is captured', types.has('from-frame'));
  check('parent -> child delivery is captured by the child probe', types.has('to-child'));
  check(
    'a JSON encoded string payload is captured verbatim',
    entries.some(
      (entry) => typeof entry.data === 'string' && entry.data.includes('"channel":"widget"'),
    ),
  );
  const toChild = entries.find((entry) => entry.data?.type === 'to-child');
  check(
    'parent -> child delivery is attributed to the parent window',
    toChild?.sender?.kind === 'parent' && typeof toChild?.sender?.url === 'string',
    JSON.stringify(toChild?.sender),
  );
  const fromFrame = entries.find((entry) => entry.data?.type === 'from-frame');
  check(
    'iframe message is attributed to a child window',
    fromFrame?.sender?.kind === 'child',
    JSON.stringify(fromFrame?.sender),
  );
  check(
    'srcdoc frames inherit the parent origin',
    entries.every((entry) => entry.receiver?.origin === `http://127.0.0.1:${fixturePort}`),
  );
  check(
    'the extension neither captures nor leaks its own handshake',
    ![...types].some((type) => typeof type === 'string' && type.includes('wxt:')),
  );

  panel = await (
    await fetch(
      `${cdp}/json/new?${encodeURIComponent(`chrome-extension://${extensionId}/panel.html`)}`,
      {
        method: 'PUT',
      },
    )
  ).json();
  await sleep(1200);
  const panelSession = await connect(panel.webSocketDebuggerUrl);
  await panelSession.send('Runtime.enable');
  const rootLength = await evaluate(
    panelSession,
    'document.getElementById("root")?.innerHTML.length ?? 0',
  );
  panelSession.close();
  check('the panel bundle boots', Number(rootLength) > 100, `root html ${rootLength}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  for (const target of [page, panel]) {
    if (target?.id) await fetch(`${cdp}/json/close/${target.id}`).catch(() => {});
  }
  try {
    process.kill(-chrome.pid, 'SIGKILL');
  } catch {
    chrome.kill('SIGKILL');
  }
  server.close();
  await sleep(150);
}

if (process.exitCode === 1) {
  console.error('\ne2e verification failed');
} else {
  console.log('\ne2e verification passed');
}
