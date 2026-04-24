# Chrome Web Store Listing — PG Reader

## Name
PG Reader

## Summary (≤132 chars)
Reader mode for paulgraham.com essays. Readable typography, footnote popovers, light/dark themes, reading progress.

## Category
Productivity

## Language
English

## Description
Reader mode for Paul Graham's essays at paulgraham.com.

The original site is unstyled HTML from the 90s. Readable, but not comfortable on a modern screen. PG Reader restyles every essay page into a focused, distraction-free layout without changing a word of the content.

Features:
• Typography tuned for long reads — generous line height, measured column width, Montserrat sans-serif.
• Light and dark themes. Remembers your choice.
• Click any footnote marker to open the note inline in a popover — no scrolling to the bottom and back.
• Reading progress bar + estimated time remaining on long essays.
• Drop cap on the first paragraph.
• Back-to-top button on scroll.
• Clean nav bar with links to Essays, H&P, Index, Bio, RSS, etc.
• One-click toggle to disable reader mode and see the original page.
• Works on every essay, the essay index, the articles list, and PG's other pages (bio, info, quotes, RAQs, Kedrosky responses).

Permissions:
• storage — remembers your theme (light/dark) and on/off toggle.
• activeTab — used only to inject the reader stylesheet on paulgraham.com.

No tracking. No analytics. No data leaves your browser. The extension only runs on paulgraham.com.

Source code: https://github.com/abdullah-alnahas/pg-reader

## Single Purpose (for store review)
Improve the readability of Paul Graham's essays at paulgraham.com.

## Permission justifications
• storage: persist the user's theme preference and reader-mode on/off toggle between page loads.
• activeTab: inject the reader stylesheet and script into the active paulgraham.com tab. No cross-site access.
• Host permissions (paulgraham.com / www.paulgraham.com): the extension's content script runs only on these two hosts to restyle essay pages.

## Data handling
• Does not collect user data.
• Does not transmit any data off-device.
• Only stored values: theme preference ("light"/"dark") and on/off flag, via chrome.storage.sync.
