# Dev Guide

## Load the extension

1. Chrome → `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → pick this repo directory
4. Pin the extension (puzzle icon → pin)

## See errors

**Console errors** (runtime issues in `content.js`):
- Open any PG page (e.g. `https://www.paulgraham.com/greatwork.html`)
- DevTools (F12) → **Console** tab
- Errors from the extension show with the extension's source file

**Uncaught throws** (silent failures):
- `chrome://extensions` → the extension's **Errors** button
- Shows stack trace per uncaught exception since last reload

**Break on code**:
- DevTools → **Sources** → `content-scripts` node → `content.js`
- Click gutter to set breakpoint, reload page to hit

**CSS inspection**:
- Right-click an element → Inspect → **Styles** pane shows cascade
- Toggle class via `.cls` button to preview changes

## Reload after edits

Edit `content.js` / `content.css` → `chrome://extensions` → click the circular reload arrow on the extension card → refresh the target PG page.

Hard reload (if state seems stuck): disable/enable toggle on the card.

## Headless verification

Diag scripts in `/tmp/diag-*.js` inject `content.js`+`content.css` into a puppeteer-core Chrome and assert page state. Pattern:

```js
const puppeteer = require('/tmp/node_modules/puppeteer-core');
// read content.js + content.css from repo, inline font,
// inject after page load, wait, evaluate assertions.
```

See existing `/tmp/diag-indpager.js`, `/tmp/diag-12aug.js`, `/tmp/diag-name.js`, `/tmp/diag-sweep.js` for working templates.

## Site-wide sweep

`/tmp/diag-sweep.js` walks every essay linked from `articles.html` and reports any page where `#main-content` is missing or under 100 chars. Use after layout-detection changes.
