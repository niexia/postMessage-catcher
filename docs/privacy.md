# Privacy

postMessage-catcher is a local debugging tool. It has no servers, no accounts,
no analytics and no network access of any kind.

## What it handles

While recording is on, the extension observes `message` events delivered to the
frames of the pages you open. For each message it stores:

- the message payload, converted to a JSON-safe snapshot (large or unbounded
  payloads are truncated and marked);
- the sender and receiver origins, and the sender/receiver URLs when the browser
  allows reading them;
- a timestamp, a tab id, a frame id and the document id.

It does not read form values, cookies, local storage, network requests, page
text, keystrokes or clipboard contents. It does not modify the page.

## Where it goes

Everything stays on your device:

| Data                    | Location                                         | Lifetime                                                    |
| ----------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Settings                | `chrome.storage.local`                           | Until uninstalled                                           |
| Per-tab recording flags | `chrome.storage.session`                         | Until the browser exits                                     |
| Captured messages       | service-worker memory + `chrome.storage.session` | Capped per tab; cleared by **Clear** or when the tab closes |

Nothing is transmitted. There is no remote code, no remote fonts, no CDN, no
`fetch` to a third party.

## Permission

The only requested permission is `storage`, which is used for the settings and
the per-tab history above. Content scripts are declared in the manifest; that
does **not** grant access to page URLs or browsing history.

The extension does not use `tabs`, `webRequest`, `debugger` or `scripting`.

## Your control

- **Record this tab** in the popup stops capture for the current tab.
- **Capture on all sites** is the master switch; when off, the probe captures
  nothing.
- **Clear** in the panel deletes the buffered history for the inspected tab.
- Uninstalling the extension removes all of its storage.

## Contact

Open an issue at
<https://github.com/niexia/postMessage-catcher/issues>.
