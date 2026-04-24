# PG Reader — Privacy Policy

_Last updated: 2026-04-24_

PG Reader is a Chrome extension that restyles essays on paulgraham.com into a readable reader-mode layout.

## Data collection

**PG Reader does not collect, store, transmit, sell, or share any personal or user data.**

- No analytics.
- No telemetry.
- No tracking pixels, cookies, fingerprints, or identifiers.
- No network requests are made to any server — not to the author, not to any third party.

## Local storage

The extension saves two small values inside your browser using the standard `chrome.storage.sync` API so your preferences survive between page loads and sync across your own Chrome profile:

| Key | Value | Purpose |
|-----|-------|---------|
| `pg-reader-enabled` | `true` / `false` | Whether reader mode is on or off |
| `pg-reader-theme` | `"light"` / `"dark"` | Your theme choice |

These values never leave your Google account's synced storage. They are not transmitted to the extension author or any third party.

## Permissions

- **`storage`** — to persist the two preferences above.
- **`activeTab`** — to inject the reader stylesheet into the current paulgraham.com tab.
- **Host permissions** for `paulgraham.com` / `www.paulgraham.com` — the content script only runs on these two hosts.

## Third parties

None. The extension does not integrate with any third-party service.

## Contact

Questions: abdullah.nahass@gmail.com

Source code: https://github.com/abdullah-alnahas/pg-reader
