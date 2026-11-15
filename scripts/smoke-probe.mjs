/**
 * Smoke-test the *built* MAIN-world probe without a browser.
 *
 * The probe runs in the page's world, so it must never touch `chrome.*`. This
 * script loads the bundle from `.output/chrome-mv3`, executes it against a fake
 * window/document, and checks the capture pipeline end to end:
 *
 *   1. nothing is emitted before the bridge sends its configuration
 *   2. early messages are buffered and flushed once configuration arrives
 *   3. live messages are captured
 *   4. disabling configuration stops capture
 *
 * It is deliberately dependency-free: `node scripts/smoke-probe.mjs`.
 */
import { readFile } from 'node:fs/promises';

const PROBE_PATH = '.output/chrome-mv3/content-scripts/probe.js';

const code = await readFile(PROBE_PATH, 'utf8');
if (/\bchrome\s*\./.test(code)) {
  throw new Error('probe.js references chrome.* — it runs in the MAIN world and cannot use it');
}

const fakeWindow = new EventTarget();
const fakeDocument = new EventTarget();
const fakeLocation = { href: 'https://shop.test/checkout', origin: 'https://shop.test' };

const captured = [];
let ready = false;
fakeDocument.addEventListener('pmc:ready', () => {
  ready = true;
});
fakeDocument.addEventListener('pmc:capture', (event) => {
  captured.push(JSON.parse(event.detail));
});

const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function dispatchMessage(data, origin = 'https://pay.test') {
  const event = new Event('message');
  Object.defineProperty(event, 'data', { value: data });
  Object.defineProperty(event, 'origin', { value: origin });
  Object.defineProperty(event, 'source', { value: null });
  fakeWindow.dispatchEvent(event);
}

function configure(enabled) {
  fakeDocument.dispatchEvent(
    new CustomEvent('pmc:config', {
      detail: JSON.stringify({ enabled, mirrorToConsole: false }),
    }),
  );
}

console.log(`smoke: ${PROBE_PATH} (${code.length} bytes)`);

new Function('window', 'document', 'location', code)(fakeWindow, fakeDocument, fakeLocation);

check('probe announces itself to the bridge', ready);
check('probe emits nothing before configuration', captured.length === 0);

// A message that arrives before the bridge has read storage must be buffered.
dispatchMessage({ type: 'early', n: 1 });
check('early message is withheld while unconfigured', captured.length === 0);

configure(true);
check('early message is flushed on configuration', captured.length === 1);
check('early payload survives the flush', captured[0]?.data?.type === 'early');

dispatchMessage({ type: 'ready', user: { id: 7 } });
const live = captured.at(-1);
check('live message is captured', captured.length === 2);
check('receiver origin is recorded', live?.receiver?.origin === 'https://shop.test');
check('sender origin comes from the event', live?.sender?.origin === 'https://pay.test');
check('payload is JSON-safe', JSON.stringify(live?.data) === '{"type":"ready","user":{"id":7}}');
check('size is measured in bytes', typeof live?.size === 'number' && live.size > 0);
check('sequence increases monotonically', captured[1].seq > captured[0].seq);

// Values JSON cannot represent must not throw.
dispatchMessage({ fn: () => 1, big: 10n, list: [1, 2] });
check(
  'non-JSON values are marked instead of throwing',
  captured.at(-1)?.data?.big?.$pmc === 'BigInt',
);

// Cyclic data must not throw either.
const cyclic = { name: 'loop' };
cyclic.self = cyclic;
dispatchMessage(cyclic);
check('cycles are broken', captured.at(-1)?.data?.self?.$pmc === 'Circular');

// Hostile payloads must not disable the probe.
const hostile = {};
Object.defineProperty(hostile, 'boom', {
  enumerable: true,
  get() {
    throw new Error('nope');
  },
});
dispatchMessage(hostile);
check('throwing getters are contained', captured.at(-1)?.data?.boom?.$pmc === 'Unreadable');

configure(false);
const before = captured.length;
dispatchMessage({ type: 'after-disable' });
check('disabling stops capture', captured.length === before);

configure(true);
dispatchMessage({ type: 'after-enable' });
check('re-enabling resumes capture', captured.at(-1)?.data?.type === 'after-enable');

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`\nall checks passed (${captured.length} messages captured)`);
