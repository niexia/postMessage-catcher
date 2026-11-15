/**
 * Compose the Chrome Web Store assets from the screenshots in docs/screenshots.
 *
 * Usage:
 *   pnpm build
 *   CHROME_BIN="/path/to/chrome" pnpm store:assets
 *
 * The frames in `scripts/store/frames/` are rendered in Chrome for Testing at
 * exact sizes, screenshots are captured over CDP, alpha is stripped, and the
 * results land in `store/assets/`. No image libraries are involved.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngInfo, toOpaquePng } from './opaque-png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = join(ROOT, 'store/assets');
const FRAMES = join(ROOT, 'scripts/store/frames');

const TARGETS = [
  {
    frame: 'screenshot-1-messages.html',
    file: 'screenshot-1-messages.png',
    width: 1280,
    height: 800,
  },
  {
    frame: 'screenshot-2-payload.html',
    file: 'screenshot-2-payload.png',
    width: 1280,
    height: 800,
  },
  {
    frame: 'screenshot-3-popup.html',
    file: 'screenshot-3-popup.png',
    width: 1280,
    height: 800,
  },
  { frame: 'small-promo-440x280.html', file: 'small-promo-440x280.png', width: 440, height: 280 },
  { frame: 'marquee-1400x560.html', file: 'marquee-1400x560.png', width: 1400, height: 560 },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8',
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const chromeBinary = CHROME_CANDIDATES.find((candidate) => candidate && existsSync(candidate));
if (!chromeBinary) {
  console.error('No Chrome/Chromium binary found. Set CHROME_BIN to Chrome for Testing.');
  process.exit(1);
}

for (const target of TARGETS) {
  if (!existsSync(join(FRAMES, target.frame))) {
    console.error(`Missing frame: scripts/store/frames/${target.frame}`);
    process.exit(1);
  }
}
for (const shot of [
  'panel-dark.png',
  'panel-json-string.png',
  'popup-dark.png',
  'popup-light.png',
]) {
  if (!existsSync(join(ROOT, 'docs/screenshots', shot))) {
    console.error(`Missing screenshot docs/screenshots/${shot}`);
    process.exit(1);
  }
}

mkdirSync(ASSETS, { recursive: true });

async function freePort() {
  const server = createTcpServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

function serveRepo() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    try {
      const body = readFileSync(file);
      response
        .writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        .end(body);
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
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
          pending.get(message.id)(message);
          pending.delete(message.id);
        }
      });
      res({
        send: (method, params = {}) =>
          new Promise((done) => {
            const messageId = (id += 1);
            pending.set(messageId, done);
            socket.send(JSON.stringify({ id: messageId, method, params }));
          }),
        close: () => socket.close(),
      });
    });
    socket.addEventListener('error', reject);
  });
}

async function evaluate(session, expression) {
  const response = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return response.result?.result?.value;
}

const cdpPort = await freePort();
const { server, port: httpPort } = await serveRepo();
const userDataDir = join(process.env.TMPDIR ?? '/tmp', `pmc-store-${process.pid}-${Date.now()}`);

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
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
);

const cdp = `http://127.0.0.1:${cdpPort}`;

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await fetch(`${cdp}/json/version`);
      break;
    } catch {
      await sleep(250);
    }
  }

  for (const target of TARGETS) {
    const created = await (await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' })).json();
    const session = await connect(created.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: target.width,
      height: target.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await session.send('Page.navigate', {
      url: `http://127.0.0.1:${httpPort}/scripts/store/frames/${target.frame}`,
    });
    await evaluate(
      session,
      `(async () => {
        await document.fonts.ready;
        await new Promise((done) => {
          const check = () => {
            const images = [...document.images];
            if (document.readyState === 'complete' && images.every((img) => img.complete && img.naturalWidth > 0)) done();
            else setTimeout(check, 50);
          };
          check();
        });
        return 'ok';
      })()`,
    );
    await sleep(150);
    const shot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    session.close();
    await fetch(`${cdp}/json/close/${created.id}`).catch(() => {});

    const png = toOpaquePng(Buffer.from(shot.result.data, 'base64'));
    const info = pngInfo(png);
    if (!info || info.width !== target.width || info.height !== target.height) {
      throw new Error(
        `${target.file}: got ${info?.width}x${info?.height}, expected ${target.width}x${target.height}`,
      );
    }
    if (info.colorType !== 2)
      throw new Error(`${target.file}: expected RGB, got color type ${info.colorType}`);
    writeFileSync(join(ASSETS, target.file), png);
    console.log(`wrote store/assets/${target.file} (${target.width}x${target.height})`);
  }

  copyFileSync(join(ROOT, 'public/icon/128.png'), join(ASSETS, 'store-icon-128.png'));
  console.log('wrote store/assets/store-icon-128.png (128x128)');
} catch (error) {
  console.error(`store assets failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  try {
    process.kill(-chrome.pid, 'SIGKILL');
  } catch {
    chrome.kill('SIGKILL');
  }
  server.close();
  await sleep(150);
}

if (!process.exitCode) {
  console.log('\nstore assets are ready in store/assets/');
}
