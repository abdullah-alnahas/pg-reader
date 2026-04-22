/**
 * PG Reader v2 — Content Script
 *
 * Structure once, style everywhere.
 * Runs at document_start. FOUC prevention via CSS class.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'pg-reader-enabled';
    const THEME_KEY = 'pg-reader-theme';
    const SCROLL_KEY = 'pg-reader-scroll';

    // Fallback nav used only when sidebar detection fails.
    // hrefs sourced from PG's actual sidebar HTML — keep only confirmed ones.
    const DEFAULT_NAV_LINKS = [
        { text: 'Home', href: '/' },
        { text: 'Essays', href: '/articles.html' },
        { text: 'H&P', href: '/hp.html' },
        { text: 'YC', href: 'https://www.ycombinator.com' },
        { text: 'Arc', href: 'http://arclanguage.org' },
        { text: 'Bel', href: '/bel.html' },
        { text: 'RSS', href: '/rss.html' },
        { text: 'Twitter', href: 'https://twitter.com/paulg' },
        { text: 'Email', href: '/info.html' },
        { text: 'Index', href: '/ind.html' },
    ];

    // Maps image-map filenames/hostnames → human-readable nav labels.
    const AREA_LABEL_MAP = {
        'index': 'Home', 'articles': 'Essays', 'hp': 'H&P',
        'books': 'Books', 'ycombinator': 'YC', 'arc': 'Arc',
        'bel': 'Bel', 'lisp': 'Lisp', 'antispam': 'Spam', 'spam': 'Spam',
        'kedrosky': 'Responses', 'faq': 'FAQs', 'raq': 'RAQs',
        'quo': 'Quotes', 'rss': 'RSS', 'bio': 'Bio',
        'twitter': 'Twitter', 'mas': 'Mastodon', 'paulg': 'Mastodon',
    };

    // FOUC prevention — synchronous, runs before any paint
    document.documentElement.classList.add('pg-reader-pending');

    /* ── Bootstrap ─────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', () => {
        chrome.storage.sync.get([STORAGE_KEY, THEME_KEY], (result) => {
            if (result[THEME_KEY]) {
                document.documentElement.setAttribute('data-pg-theme', result[THEME_KEY]);
            }

            if (result[STORAGE_KEY] !== false) {
                const { contentTd, sidebarTd } = detectPageStructure();
                if (contentTd) {
                    loadLocalFont();
                    enhance(contentTd, sidebarTd);
                    document.documentElement.classList.add('pg-reader');
                    document.documentElement.classList.remove('pg-reader-pending');

                    const savedScroll = sessionStorage.getItem(SCROLL_KEY);
                    if (savedScroll) {
                        sessionStorage.removeItem(SCROLL_KEY);
                        requestAnimationFrame(() => window.scrollTo(0, parseInt(savedScroll, 10)));
                    }
                    return;
                }
            }
            document.documentElement.classList.add('pg-reader-skip');
            document.documentElement.classList.remove('pg-reader-pending');
        });
    });

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'toggle') window.location.reload();
    });

    /* ── Font Loading ──────────────────────────────────────── */

    function loadLocalFont() {
        if (document.getElementById('pg-font-style')) return;
        const fontUrl = chrome.runtime.getURL('fonts/montserrat.woff2');
        const style = document.createElement('style');
        style.id = 'pg-font-style';
        style.textContent = [
            '@font-face {',
            "  font-family: 'Montserrat';",
            '  font-style: normal;',
            '  font-weight: 100 900;',
            '  font-display: swap;',
            "  src: url('" + fontUrl + "') format('woff2');",
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    /* ── Page Structure Detection ──────────────────────────── */

    function detectPageStructure() {
        let sidebarTd = null;
        let contentTd = null;
        let maxTextLen = 0;

        const tds = Array.from(document.querySelectorAll('td'));

        // Try to find sidebar by nav images
        sidebarTd = tds.find(td =>
            td.querySelector('img[src*="home.gif"], img[src*="essays.gif"], img[src*="articles.gif"]')
        );

        // Fallback: td with multiple image-based nav links and short text
        if (!sidebarTd) {
            sidebarTd = tds.find(td => {
                const imgLinks = Array.from(td.querySelectorAll('a')).filter(a => a.querySelector('img'));
                return imgLinks.length >= 3 && td.textContent.replace(/\s+/g, '').length < 400;
            });
        }

        // Tier 3: td with many short links (text nav)
        if (!sidebarTd) {
            sidebarTd = tds.find(td => {
                const links = Array.from(td.querySelectorAll('a'));
                const avgLinkLen = links.length > 0
                    ? links.reduce((s, a) => s + a.textContent.trim().length, 0) / links.length
                    : 999;
                return links.length >= 4 && links.length <= 25 &&
                    avgLinkLen < 20 && td.textContent.replace(/\s+/g, '').length < 500;
            });
        }

        // Tier 4: td with image map areas (own.html style — <map><area href>)
        if (!sidebarTd) {
            sidebarTd = tds.find(td => td.querySelectorAll('area[href]').length >= 3);
        }

        // Find the td with most text as content (excluding sidebar and its ancestors/descendants)
        tds.forEach((td) => {
            if (td === sidebarTd) return;
            if (sidebarTd && (sidebarTd.contains(td) || td.contains(sidebarTd))) return;
            const textLen = td.textContent.trim().length;
            if (textLen > maxTextLen && textLen > 200) {
                maxTextLen = textLen;
                contentTd = td;
            }
        });

        // Drill into contentTd: prefer the deepest child td that still carries ≥ 90% of the text
        // (handles pages like own.html where the essay is nested inside an outer wrapper td)
        if (contentTd) {
            let drilled = contentTd;
            let changed = true;
            while (changed) {
                changed = false;
                const threshold = drilled.textContent.trim().length * 0.9;
                const childTds = Array.from(drilled.querySelectorAll(':scope > table td, :scope > * > table td'));
                const deeper = childTds.find(td => td.textContent.trim().length >= threshold);
                if (deeper && deeper !== drilled) { drilled = deeper; changed = true; }
            }
            contentTd = drilled;
        }

        return { contentTd, sidebarTd };
    }

    /* ── Main Enhancement ──────────────────────────────────── */

    function enhance(contentTd, sidebarTd) {
        if (document.getElementById('main-content')) return;

        if (!document.querySelector('meta[name="viewport"]')) {
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1';
            document.head.appendChild(meta);
        }

        const isArticlesPage = /\/articles(\.html?)?$/.test(location.pathname);
        if (isArticlesPage) document.documentElement.classList.add('pg-articles-layout');

        const sidebarLinks = extractNavLinks(sidebarTd);
        const main = createMain(contentTd);

        promoteTitle(main);
        replaceSectionBreaks(main);
        promoteBoldHeadings(main);
        convertCourierFonts(main);
        wrapParagraphs(main);
        stripStrayBrs(main);
        cleanupTitleImages(main);
        styleBlockquotes(main);
        if (!isArticlesPage) handleYcBanner(main);
        resetFontTags(main);

        // Date must be extracted BEFORE drop cap (otherwise first letter span breaks month regex)
        const essayDate = isArticlesPage ? null : extractEssayDate(main);

        if (isArticlesPage) {
            enhanceArticlesLayout(main);
        } else {
            wrapThanksSection(main);
            collectThanksAppendix(main, contentTd);
            wrapNotesSection(main);
            markSectionFirstParagraphs(main);
            markFirstParagraph(main);
            markQuoteParagraphs(main);
            markNoDropCapParas(main);
            collectMoreInfoLinks(main, contentTd);
            linkifyFootnoteRefs(main);
            // Auto-linkify bare URLs in main body + notes (PG writes them as plain text)
            autolinkUrls(main);
            applyDropCap(main);
        }

        const readMins = isArticlesPage ? null : calculateReadingTime(main);
        const metaLine = createMetaLine(readMins, essayDate);

        const titleArea = document.createElement('div');
        titleArea.className = 'pg-title-area';
        const h1 = main.querySelector('h1');
        if (h1) titleArea.appendChild(h1);
        if (!isArticlesPage) titleArea.appendChild(metaLine);
        main.insertBefore(titleArea, main.firstChild);

        if (!isArticlesPage) main.insertBefore(createBackLink(), titleArea);

        mountPageChrome(main, sidebarLinks);
    }

    // Assembles and inserts all persistent page chrome (nav, brand header, progress bar,
    // floating controls) into the document body, then wires up their behaviours.
    function mountPageChrome(main, sidebarLinks) {
        const topNav = createTopNav(sidebarLinks);
        const brandHeader = createBrandHeader(createSkipLink(), createThemeToggle());

        const progressContainer = document.createElement('div');
        progressContainer.className = 'pg-progress-container';
        const progressBar = document.createElement('div');
        progressBar.className = 'pg-progress-bar';
        progressContainer.appendChild(progressBar);

        const wrapper = document.createElement('div');
        wrapper.className = 'pg-page';
        wrapper.appendChild(main);

        const toggleContainer = createToggleSwitch();
        const backToTop = createBackToTopButton();

        document.body.insertBefore(wrapper, document.body.firstChild);
        document.body.insertBefore(topNav, document.body.firstChild);
        document.body.insertBefore(brandHeader, document.body.firstChild);
        document.body.appendChild(progressContainer);
        document.body.appendChild(toggleContainer);
        document.body.appendChild(backToTop);

        // Hide every table not inside our new <main> (original layout junk).
        document.querySelectorAll('table').forEach(table => {
            if (!main.contains(table)) {
                table.style.display = 'none';
                table.setAttribute('aria-hidden', 'true');
            }
        });

        setupNavToggle(topNav);
        setupFootnotes();
        setupProgressBar(progressBar);
        setupBackToTop(backToTop);
        setupExternalLinks(main);
    }

    /* ── Element Factories ─────────────────────────────────── */

    function createBrandHeader(skipLink, themeToggle) {
        const header = document.createElement('header');
        header.className = 'pg-brand-header';

        if (skipLink) header.appendChild(skipLink);

        const a = document.createElement('a');
        a.href = '/';
        a.className = 'pg-brand-link';
        a.textContent = 'Paul Graham';
        header.appendChild(a);

        if (themeToggle) header.appendChild(themeToggle);
        return header;
    }

    const MOON_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';

    const SUN_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="5"/>' +
        '<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42' +
        'M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

    function createThemeToggle() {
        const btn = document.createElement('button');
        btn.className = 'pg-theme-toggle';
        btn.setAttribute('aria-label', 'Toggle dark/light theme');

        const currentTheme = document.documentElement.getAttribute('data-pg-theme') ||
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

        btn.innerHTML = currentTheme === 'dark' ? SUN_SVG : MOON_SVG;
        btn.dataset.theme = currentTheme;

        btn.addEventListener('click', () => {
            const newTheme = btn.dataset.theme === 'dark' ? 'light' : 'dark';
            btn.dataset.theme = newTheme;
            btn.innerHTML = newTheme === 'dark' ? SUN_SVG : MOON_SVG;
            document.documentElement.setAttribute('data-pg-theme', newTheme);
            chrome.storage.sync.set({ [THEME_KEY]: newTheme });
        });

        return btn;
    }

    function createToggleSwitch() {
        const container = document.createElement('div');
        container.className = 'pg-toggle-container';

        const label = document.createElement('span');
        label.className = 'pg-toggle-label';
        label.textContent = 'Reader';

        const switchLabel = document.createElement('label');
        switchLabel.className = 'pg-switch';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = true;

        const slider = document.createElement('span');
        slider.className = 'pg-slider';

        input.addEventListener('change', () => {
            sessionStorage.setItem(SCROLL_KEY, window.scrollY);
            chrome.storage.sync.set({ [STORAGE_KEY]: input.checked }, () => {
                window.location.reload();
            });
        });

        switchLabel.appendChild(input);
        switchLabel.appendChild(slider);
        container.appendChild(label);
        container.appendChild(switchLabel);
        return container;
    }

    function createSkipLink() {
        const a = document.createElement('a');
        a.href = '#main-content';
        a.className = 'pg-skip-link';
        a.textContent = 'Skip to content';
        return a;
    }

    function createBackLink() {
        const a = document.createElement('a');
        a.href = '/articles.html';
        a.className = 'pg-back-link';
        a.textContent = '← Essays';
        return a;
    }

    function createBackToTopButton() {
        const btn = document.createElement('button');
        btn.className = 'pg-back-to-top';
        btn.setAttribute('aria-label', 'Back to top');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M8 12V4M4 7l4-4 4 4');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');

        svg.appendChild(path);
        btn.appendChild(svg);
        return btn;
    }

    function createMain(contentTd) {
        const main = document.createElement('main');
        main.id = 'main-content';
        while (contentTd.firstChild) {
            main.appendChild(contentTd.firstChild);
        }

        // Strip leading BRs and empty text nodes
        while (main.firstChild) {
            const n = main.firstChild;
            if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR') { n.remove(); continue; }
            if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) { n.remove(); continue; }
            break;
        }

        // Strip trailing empty children
        const children = Array.from(main.children);
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            const text = child.textContent.trim();
            if (!text || text === '____' || child.tagName === 'HR') {
                child.remove();
            } else {
                break;
            }
        }

        return main;
    }

    function createMetaLine(readMins, date) {
        const div = document.createElement('div');
        div.className = 'pg-meta';

        if (date) {
            const dateSpan = document.createElement('span');
            dateSpan.className = 'pg-meta-date';
            dateSpan.textContent = date;
            div.appendChild(dateSpan);

            const dot = document.createElement('span');
            dot.className = 'pg-meta-dot';
            dot.textContent = '·';
            div.appendChild(dot);
        }

        const time = document.createElement('span');
        time.className = 'pg-meta-time';
        time.textContent = readMins + ' min read';
        div.appendChild(time);
        return div;
    }

    function createTopNav(links) {
        const nav = document.createElement('nav');
        nav.className = 'pg-topnav';
        nav.id = 'pg-topnav';
        nav.setAttribute('aria-label', 'Site navigation');

        const inner = document.createElement('div');
        inner.className = 'pg-topnav-inner';

        const linksDiv = document.createElement('div');
        linksDiv.className = 'pg-topnav-links';
        linksDiv.id = 'pg-topnav-links';

        links.forEach((link) => {
            const a = document.createElement('a');
            a.href = link.href;
            a.className = 'pg-topnav-link';

            a.textContent = link.text;

            try {
                const url = new URL(link.href, location.href);
                if (url.origin !== location.origin) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.classList.add('pg-ext-link');
                } else if (url.pathname === location.pathname ||
                    (url.pathname === '/' && location.pathname === '/index.html')) {
                    a.classList.add('pg-topnav-current');
                    a.setAttribute('aria-current', 'page');
                }
            } catch (_) { }

            linksDiv.appendChild(a);
        });

        inner.appendChild(linksDiv);

        const hamburger = document.createElement('button');
        hamburger.className = 'pg-topnav-hamburger';
        hamburger.id = 'pg-nav-hamburger';
        hamburger.setAttribute('aria-label', 'Toggle menu');
        [0, 1, 2].forEach(() => hamburger.appendChild(document.createElement('span')));
        inner.appendChild(hamburger);

        nav.appendChild(inner);
        return nav;
    }

    /* ── Nav Link Extraction ───────────────────────────────── */

    // Append Email + Index if not already present in the extracted nav.
    function appendStaticNavLinks(links) {
        const has = (txt) => links.some(l => l.text.toLowerCase() === txt.toLowerCase());
        const out = links.slice();
        if (!has('Email')) out.push({ text: 'Email', href: '/info.html' });
        if (!has('Index')) out.push({ text: 'Index', href: '/ind.html' });
        return out;
    }

    function extractNavLinks(sidebarTd) {
        if (!sidebarTd) return DEFAULT_NAV_LINKS;

        // Image map sidebar (<area href> elements — no text content)
        const areas = Array.from(sidebarTd.querySelectorAll('area[href]'));
        if (areas.length >= 3) {
            const links = [];
            areas.forEach((area) => {
                const href = area.getAttribute('href');
                if (!href) return;
                try {
                    const resolved = new URL(href, window.location.origin + '/').href;
                    const url = new URL(resolved);
                    // Derive label: check hostname then filename
                    const hostname = url.hostname.replace('www.', '');
                    const filename = url.pathname.replace(/\.[^.]+$/, '').split('/').pop();
                    const key = Object.keys(AREA_LABEL_MAP).find(k =>
                        hostname.includes(k) || filename === k
                    );
                    // PG's "Hackers & Painters" Amazon product link (ASIN 0596006624)
                    const isHpBook = /amazon\./.test(hostname) && /0596006624/.test(url.pathname);
                    let text = key ? AREA_LABEL_MAP[key] : (filename ? filename.charAt(0).toUpperCase() + filename.slice(1) : null);
                    if (isHpBook) text = 'H&P';
                    const isCommerce = /amazon\.|ebay\.|shop\.|store\./.test(hostname) && !isHpBook;
                    const isNumericId = /^\d+$/.test(filename) && !isHpBook;
                    if (text && !isCommerce && !isNumericId) {
                        if (!links.find(l => l.text === text)) links.push({ text, href: resolved });
                    }
                } catch (_) { }
            });
            return appendStaticNavLinks(links.length > 0 ? links : DEFAULT_NAV_LINKS);
        }

        const links = [];
        sidebarTd.querySelectorAll('a').forEach((a) => {
            const img = a.querySelector('img');
            let text = img
                ? (img.alt || img.title || '').trim()
                : a.textContent.trim();
            // Derive text from image src filename if alt is missing
            if (!text && img && img.src) {
                const fn = img.src.replace(/\?.*$/, '').split('/').pop().replace(/\.[^.]+$/, '');
                text = fn.charAt(0).toUpperCase() + fn.slice(1);
            }
            const href = a.getAttribute('href');

            if (text && href && text.length > 1) {
                const isApplyLink = href.includes('ycombinator') && text.toLowerCase().includes('apply');
                if (isApplyLink) return;
                try {
                    // Resolve relative to origin (not location.href) so paths like "hp.html" are correct
                    const resolved = new URL(href, window.location.origin + '/').href;
                    links.push({ text, href: resolved });
                } catch (_) {
                    links.push({ text, href });
                }
            }
        });

        return links.length > 0 ? links : DEFAULT_NAV_LINKS;
    }

    /* ── Progress Bar ──────────────────────────────────────── */

    function setupProgressBar(bar) {
        let ticking = false;
        const update = () => {
            const scrollTop = window.scrollY;
            const total = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            bar.style.width = total > 0 ? ((scrollTop / total) * 100) + '%' : '0%';
            ticking = false;
        };
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }, { passive: true });
        update();
    }

    /* ── Back to Top ───────────────────────────────────────── */

    function setupBackToTop(btn) {
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    btn.classList.toggle('pg-back-to-top-visible', window.scrollY > 500);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ── External Links ───────────────────────────────────── */

    function setupExternalLinks(container) {
        container.querySelectorAll('a[href]').forEach(a => {
            try {
                const url = new URL(a.href, location.href);
                if (!isSameSite(url)) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.classList.add('pg-ext-link');
                } else {
                    a.classList.remove('pg-ext-link');
                }
            } catch (_) { }
        });
    }

    /* ── Date Extraction ───────────────────────────────────── */

    function extractEssayDate(container) {
        const all = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
            'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];
        // Matches "January 2008", "29 January 2008", or "January 29, 2008"
        const regex = new RegExp(
            '(?:(\\d{1,2})\\s+)?(' + all.join('|') + ')(?:\\s+(\\d{1,2}),?)?\\s+(\\d{4})',
            'i'
        );

        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
            const match = node.textContent.match(regex);
            if (match) {
                const dayBefore = match[1];
                const month = match[2];
                const dayAfter = match[3];
                const year = match[4];
                node.textContent = node.textContent.replace(match[0], '').trim();
                if (dayBefore) return dayBefore + ' ' + month + ' ' + year;
                if (dayAfter) return month + ' ' + dayAfter + ', ' + year;
                return month + ' ' + year;
            }
        }
        return null;
    }

    /* ── Semantic Restructuring ────────────────────────────── */

    function promoteTitle(main) {
        const titleImg = findTitleImage(main);
        if (titleImg) {
            const h1 = document.createElement('h1');
            h1.textContent = document.title.split(' - ')[0] || titleImg.alt || '';
            titleImg.parentNode.insertBefore(h1, titleImg);
            titleImg.remove();
        } else if (!main.querySelector('h1')) {
            const h1 = document.createElement('h1');
            h1.textContent = document.title.split(' - ')[0] || '';
            main.insertBefore(h1, main.firstChild);
        }
    }

    function findTitleImage(container) {
        const pageName = location.pathname.replace(/\.html?$/, '').replace(/^\//, '');
        if (pageName) {
            const match = container.querySelector('img[src*="' + pageName + '"]');
            if (match) return match;
        }
        for (const img of container.querySelectorAll('img')) {
            if (img.alt && img.alt.length > 2) return img;
        }
        return null;
    }

    function cleanupTitleImages(main) {
        const h1 = main.querySelector('h1');
        if (!h1) return;
        // Only strip images that match the page title — alt matches h1, or filename
        // matches the page slug (e.g. /design.html → design-philosophy-3.gif).
        // Don't touch inline content images (photos, diagrams) even if they're
        // served from the same CDN path containing "paulgraham".
        const pageSlug = location.pathname.replace(/\.html?$/, '').replace(/^\//, '').toLowerCase();
        main.querySelectorAll('img').forEach((img) => {
            const filename = (img.getAttribute('src') || '').split('/').pop().toLowerCase();
            const matchesTitle = img.alt && img.alt.trim() === h1.textContent.trim();
            const matchesSlug = pageSlug && filename.startsWith(pageSlug + '-');
            // PG's site-wide author-name banner (bel-7.gif, bel-8.gif) — duplicates our brand header
            const isSiteHeader = /^bel-\d+\.gif$/.test(filename);
            if (matchesTitle || matchesSlug || isSiteHeader) img.remove();
        });
    }

    function replaceSectionBreaks(container) {
        // Recognise ____, ---, ___, _ _ _, - - -, and ·  · · variants as section dividers.
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        const hits = [];
        while (walker.nextNode()) {
            const t = walker.currentNode.textContent;
            const stripped = t.replace(/\s/g, '');
            if (stripped.length >= 3 && /^[_\-·•—]+$/.test(stripped)) {
                hits.push(walker.currentNode);
            }
        }
        hits.forEach((node) => {
            const parent = node.parentNode;
            const hr = document.createElement('hr');
            hr.className = 'pg-section-break';
            // If the text is the only meaningful child of a decorative wrapper
            // (<center>, <p>, <div>), replace that wrapper entirely.
            const onlyChild = parent && parent.childNodes.length === 1 &&
                ['CENTER', 'P', 'DIV'].includes(parent.tagName);
            if (onlyChild && parent.parentNode) {
                parent.parentNode.insertBefore(hr, parent);
                parent.remove();
            } else {
                parent.insertBefore(hr, node);
                node.remove();
            }
        });
    }

    function wrapParagraphs(container) {
        // Unwrap direct-child FONT/SPAN/DIV wrappers that contain most of the essay.
        // PG's pages often put the entire body in a single <font> — which hides all
        // internal <br><br> paragraph breaks from the splitting logic below.
        unwrapInlineWrappers(container);

        // If content already has <p> tags, don't re-wrap — just mark the first paragraph
        const existingParas = Array.from(container.querySelectorAll('p'))
            .filter(p => p.parentNode === container);
        if (existingParas.length >= 2) {
            const firstP = container.querySelector('p');
            if (firstP && !firstP.classList.contains('pg-first-paragraph')) {
                firstP.classList.add('pg-first-paragraph');
            }
            return;
        }

        const nodes = Array.from(container.childNodes);
        const groups = [[]];
        let i = 0;

        while (i < nodes.length) {
            const node = nodes[i];
            if (isBr(node) && i + 1 < nodes.length && isBr(nodes[i + 1])) {
                groups.push([]);
                i += 2;
                // Consume any extra trailing BRs to prevent blank paragraphs
                while (i < nodes.length && isBr(nodes[i])) i++;
                continue;
            }
            groups[groups.length - 1].push(node);
            i++;
        }

        container.innerHTML = '';

        let firstPara = true;

        function emitPara(nodes) {
            if (!hasContent(nodes)) return;
            const p = document.createElement('p');
            if (firstPara) { p.className = 'pg-first-paragraph'; firstPara = false; }
            nodes.forEach((n) => p.appendChild(n));
            container.appendChild(p);
        }

        for (const group of groups) {
            if (!hasContent(group)) continue;
            if (!groupHasBlock(group)) {
                emitPara(group);
                continue;
            }
            // Mixed group (e.g., H1 followed by text): emit blocks directly,
            // collect surrounding inline content into its own paragraph.
            let inlineBuf = [];
            for (const n of group) {
                const isBlock = n.nodeType === Node.ELEMENT_NODE &&
                    /^(H[1-6]|HR|BLOCKQUOTE|PRE|P|UL|OL|TABLE|DIV|SECTION)$/.test(n.tagName);
                if (isBlock) {
                    emitPara(inlineBuf);
                    inlineBuf = [];
                    container.appendChild(n);
                } else {
                    inlineBuf.push(n);
                }
            }
            emitPara(inlineBuf);
        }
    }

    function unwrapInlineWrappers(container) {
        // Repeatedly unwrap wrappers that hide paragraph structure:
        //   1. FONT / SPAN / DIV that hold most of the text.
        //   2. P elements containing ≥2 BR-pairs — PG's auto-opened <p> that
        //      wraps many paragraphs' worth of text terminated by an implicit close.
        let passes = 0;
        while (passes++ < 8) {
            let unwrapped = false;
            const kids = Array.from(container.childNodes);
            const totalLen = container.textContent.trim().length;

            for (const kid of kids) {
                if (kid.nodeType !== Node.ELEMENT_NODE) continue;
                const tag = kid.tagName;
                if (!/^(FONT|SPAN|DIV|P)$/.test(tag)) continue;

                let shouldUnwrap = false;
                if (/^(FONT|SPAN|DIV)$/.test(tag) &&
                    totalLen > 0 &&
                    kid.textContent.trim().length >= totalLen * 0.7) {
                    shouldUnwrap = true;
                } else if (tag === 'P') {
                    // P that contains many BR-BR pairs anywhere (PG often nests
                    // the entire essay inside <p><font>...<br><br>...</font></p>)
                    const brs = kid.querySelectorAll('br');
                    let pairs = 0;
                    for (let i = 0; i < brs.length - 1; i++) {
                        if (brs[i].nextSibling === brs[i + 1] ||
                            (brs[i].nextSibling && brs[i].nextSibling.nodeType === Node.TEXT_NODE &&
                             !brs[i].nextSibling.textContent.trim() &&
                             brs[i].nextSibling.nextSibling === brs[i + 1])) {
                            pairs++;
                        }
                    }
                    if (pairs >= 2) shouldUnwrap = true;
                }

                if (!shouldUnwrap) continue;
                const parent = kid.parentNode;
                while (kid.firstChild) parent.insertBefore(kid.firstChild, kid);
                kid.remove();
                unwrapped = true;
                break; // restart pass — live DOM shifted
            }

            if (!unwrapped) break;
        }
    }

    function isBr(node) {
        return node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR';
    }

    function hasContent(group) {
        return group.some((n) => {
            if (n.nodeType === Node.TEXT_NODE) return n.textContent.trim() !== '';
            if (isBr(n)) return false;
            return true;
        });
    }

    function groupHasBlock(group) {
        return group.some(
            (n) => n.nodeType === Node.ELEMENT_NODE &&
                /^(H[1-6]|HR|BLOCKQUOTE|PRE|P|UL|OL|TABLE|DIV|SECTION)$/.test(n.tagName)
        );
    }

    function styleBlockquotes(container) {
        container.querySelectorAll('blockquote').forEach((bq) => bq.classList.add('pg-blockquote'));
        container.querySelectorAll('dd').forEach((dd) => dd.classList.add('pg-blockquote'));
    }

    function linkifyFootnoteRefs(main) {
        // Some essays (e.g. spam.html) use plain-text "[N]" markers instead of
        // hyperlinks. Scan the notes section to find numbered note paragraphs,
        // then wrap each matching "[N]" reference in body text with an <a> link.
        const notes = main.querySelector('.pg-notes');
        if (!notes) return;

        const noteMap = new Map();
        notes.querySelectorAll('p').forEach(p => {
            const m = p.textContent.match(/^\s*\[?(\d+)[\]\.]/);
            if (m && !noteMap.has(m[1])) {
                const id = 'pg-fn-' + m[1];
                if (!p.id) p.id = id;
                noteMap.set(m[1], p.id);
            }
        });
        if (noteMap.size === 0) return;

        // Walk text nodes inside main, outside the notes section, outside links/code.
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (notes.contains(node)) return NodeFilter.FILTER_REJECT;
                let p = node.parentElement;
                while (p && p !== main) {
                    if (p.tagName === 'A' || p.tagName === 'PRE' ||
                        p.tagName === 'CODE' || p.tagName === 'H1') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    p = p.parentElement;
                }
                return /\[\d+\]/.test(node.textContent)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });

        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        // Wrap ONLY the digit inside [N]; leave the brackets as plain text so
        // the reference reads naturally in the body text.
        const re = /\[(\d+)\]/g;
        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const parent = textNode.parentNode;
            const frag = document.createDocumentFragment();
            let lastIdx = 0;
            let changed = false;
            let m;
            re.lastIndex = 0;
            while ((m = re.exec(text)) !== null) {
                const num = m[1];
                const targetId = noteMap.get(num);
                if (!targetId) continue;
                changed = true;
                const startBracket = m.index;
                const digitStart = startBracket + 1;
                const digitEnd = digitStart + num.length;
                const endBracket = digitEnd + 1;

                if (startBracket > lastIdx) {
                    frag.appendChild(document.createTextNode(text.slice(lastIdx, startBracket)));
                }
                frag.appendChild(document.createTextNode('['));
                const a = document.createElement('a');
                a.href = '#' + targetId;
                a.className = 'pg-fn-ref';
                a.textContent = num;
                a.setAttribute('role', 'doc-noteref');
                a.setAttribute('data-fn', num);
                frag.appendChild(a);
                frag.appendChild(document.createTextNode(']'));
                lastIdx = endBracket;
            }
            if (!changed) return;
            if (lastIdx < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIdx)));
            }
            parent.replaceChild(frag, textNode);
        });
    }

    function markQuoteParagraphs(main) {
        // Paragraphs whose first visible character is a quote mark should not
        // receive the bold+accent first-letter treatment — the quote itself
        // would otherwise get styled, which looks wrong.
        const quoteChars = /^["'“”‘’«»„‚]/;
        main.querySelectorAll(':scope > p').forEach(p => {
            const text = p.textContent.replace(/^\s+/, '');
            if (quoteChars.test(text)) p.classList.add('pg-quote-para');
        });
    }

    function markNoDropCapParas(main) {
        // Mark paragraphs that should not get first-letter styling:
        //  - starts with list marker (1., 2), -, *, •, —, –)
        //  - starts with punctuation (, . ; : ! ?)
        //  - first word is inside a link
        const paras = Array.from(main.querySelectorAll(':scope > p'));
        paras.forEach(p => {
            const text = p.textContent.replace(/^\s+/, '');
            if (/^(\d+[.)]|[-*•·—–]|[,.;:!?])/.test(text)) {
                p.classList.add('pg-no-dropcap');
                return;
            }
            // First child element that has text — if it's <a>, skip
            const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
            let tn = walker.nextNode();
            while (tn && !tn.textContent.trim()) tn = walker.nextNode();
            if (!tn) return;
            let anc = tn.parentNode;
            while (anc && anc !== p) {
                if (anc.tagName === 'A') { p.classList.add('pg-no-dropcap'); return; }
                anc = anc.parentNode;
            }
        });
    }

    function markFirstParagraph(main) {
        // Clear any pre-existing first-paragraph markers from wrapParagraphs so
        // we can pick the real substantive opening paragraph.
        main.querySelectorAll('p.pg-first-paragraph').forEach(p => p.classList.remove('pg-first-paragraph'));

        const paras = Array.from(main.querySelectorAll(':scope > p'));
        for (const p of paras) {
            const text = p.textContent.trim();
            if (!text) continue;

            // Skip italic-only intros ("(This article describes...)")
            const realChildren = Array.from(p.childNodes).filter(n =>
                !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim())
            );
            const isItalicOnly = realChildren.length === 1 &&
                realChildren[0].nodeType === Node.ELEMENT_NODE &&
                realChildren[0].tagName === 'I';
            if (isItalicOnly) {
                p.classList.add('pg-intro');
                continue;
            }

            // Skip pure parenthetical lead-ins
            if (/^[\(\[\{]/.test(text)) {
                p.classList.add('pg-intro');
                continue;
            }

            // Must start with a letter to be a proper first paragraph
            const firstNonSpace = text.match(/\S/);
            if (firstNonSpace && /[A-Za-zÀ-ɏ]/.test(firstNonSpace[0])) {
                p.classList.add('pg-first-paragraph');
                return;
            }
        }
    }

    // After Thanks is extracted, scan ancestors of the original contentTd for
    // small link-only tables that sit right after the essay body (PG's
    // translation / credit blocks — no heading). Render as a separate
    // .pg-related section placed after Thanks, so they're preserved rather
    // than hidden.
    function collectThanksAppendix(main, originalContentTd) {
        const thanks = main.querySelector('.pg-thanks');
        if (!thanks || !originalContentTd) return;

        const candidates = [];
        const seen = new Set();
        let scope = originalContentTd;
        while (scope && !seen.has(scope) && scope.tagName !== 'BODY') {
            seen.add(scope);
            scope.querySelectorAll('table').forEach(t => {
                if (!main.contains(t) && !t.hasAttribute('data-pg-consumed') &&
                    !candidates.includes(t)) candidates.push(t);
            });
            scope = scope.parentElement;
        }

        const ul = document.createElement('ul');
        ul.className = 'pg-related-list';
        const seenHrefs = new Set();
        let hasTranslations = false;

        for (const t of candidates) {
            const links = Array.from(t.querySelectorAll('a[href]'))
                .filter(a => a.textContent.trim().length > 1);
            if (links.length < 1 || links.length > 6) continue;
            const textLen = t.textContent.trim().length;
            const linkTextLen = links.reduce((s, a) => s + a.textContent.trim().length, 0);
            if (textLen - linkTextLen > 40) continue;
            const avgLinkLen = linkTextLen / links.length;
            if (avgLinkLen > 60) continue;

            links.forEach(a => {
                const href = a.href;
                if (seenHrefs.has(href)) return;
                seenHrefs.add(href);
                const label = a.textContent.trim();
                if (!label) return;
                if (/translation/i.test(label)) hasTranslations = true;
                const li = document.createElement('li');
                const aNew = document.createElement('a');
                aNew.href = href;
                aNew.textContent = label;
                try {
                    if (new URL(href).origin !== location.origin) {
                        aNew.target = '_blank';
                        aNew.rel = 'noopener noreferrer';
                        aNew.classList.add('pg-ext-link');
                    }
                } catch (_) { }
                li.appendChild(aNew);
                ul.appendChild(li);
            });
            t.setAttribute('data-pg-consumed', 'true');
        }

        if (ul.children.length === 0) return;

        const section = document.createElement('section');
        section.className = 'pg-related';
        const heading = document.createElement('h2');
        heading.className = 'pg-related-heading';
        heading.textContent = hasTranslations ? 'Translations' : 'Related';
        section.appendChild(heading);
        section.appendChild(ul);

        // Insert after Thanks, before .pg-notes if present.
        const notes = main.querySelector('.pg-notes');
        if (notes) main.insertBefore(section, notes);
        else main.appendChild(section);
    }

    function collectMoreInfoLinks(main, originalContentTd) {
        // Match any trailing link-grid heading: More Info, Related, See Also,
        // Further Reading, Translations, etc.
        const trailingHeadingRe = /^(more info|related|see also|further reading|translations?)$/i;
        const heading = Array.from(main.querySelectorAll('h2.pg-body-heading'))
            .find(h => trailingHeadingRe.test(h.textContent.trim()));
        if (!heading) return;

        // Search for a sibling/descendant table (outside main) that looks like a link grid.
        // Start from the original contentTd's ancestors and walk outward.
        const candidates = [];
        const seen = new Set();
        let scope = originalContentTd;
        while (scope && !seen.has(scope) && scope.tagName !== 'BODY') {
            seen.add(scope);
            scope.querySelectorAll('table').forEach(t => {
                if (!main.contains(t) && !candidates.includes(t)) candidates.push(t);
            });
            scope = scope.parentElement;
        }

        for (const t of candidates) {
            const links = Array.from(t.querySelectorAll('a[href]'))
                .filter(a => a.textContent.trim().length > 1);
            if (links.length < 3) continue;
            const textLen = t.textContent.trim().length;
            const avgLinkLen = links.reduce((s, a) => s + a.textContent.trim().length, 0) / links.length;
            if (avgLinkLen > 60) continue;
            // Link-density check: the table is mostly links (not paragraphs)
            if (textLen > links.length * 90) continue;

            const ul = document.createElement('ul');
            ul.className = 'pg-more-info-list';
            const seenHrefs = new Set();
            links.forEach(a => {
                const href = a.href;
                const label = a.textContent.trim();
                if (!label || seenHrefs.has(href)) return;
                seenHrefs.add(href);
                const li = document.createElement('li');
                const aNew = document.createElement('a');
                aNew.href = href;
                aNew.textContent = label;
                // External links get the ext-link treatment
                try {
                    if (new URL(href).origin !== location.origin) {
                        aNew.target = '_blank';
                        aNew.rel = 'noopener noreferrer';
                        aNew.classList.add('pg-ext-link');
                    }
                } catch (_) { }
                li.appendChild(aNew);
                ul.appendChild(li);
            });
            heading.parentNode.insertBefore(ul, heading.nextSibling);
            t.setAttribute('data-pg-consumed', 'true');
            break;
        }
    }

    function promoteBoldHeadings(container) {
        // A standalone <b> on its own line (BR before, BR after) is a section heading.
        // Labels like "Notes:" / "Thanks" are stripped so wrapNotes/wrapThanks can add clean ones.
        const bs = Array.from(container.querySelectorAll('b'));
        bs.forEach(b => {
            const next = b.nextSibling;
            if (!next || next.nodeName !== 'BR') return;
            // Walk back until a BR — all intervening nodes must be whitespace-only
            let prev = b.previousSibling;
            let sawBr = false;
            while (prev) {
                if (prev.nodeName === 'BR') { sawBr = true; break; }
                if (prev.nodeType === Node.TEXT_NODE) {
                    if (prev.textContent.trim() !== '') return;
                } else return;
                prev = prev.previousSibling;
            }
            // Also valid if <b> is the first child of its parent (no prev)
            if (!sawBr && b.previousSibling) return;

            const rawText = b.textContent.trim();
            const stripped = rawText.replace(/:+$/, '').trim();

            // Strip duplicate "Notes" / "Thanks" labels — our section wrappers add clean headings
            if (/^(notes?|thanks)$/i.test(stripped)) {
                b.remove();
                if (next.parentNode) next.remove();
                return;
            }

            const h = document.createElement('h2');
            h.className = 'pg-body-heading';
            h.textContent = stripped;
            b.parentNode.insertBefore(h, b);
            b.remove();
            if (next.parentNode) next.remove();
        });
    }

    function convertCourierFonts(container) {
        const courierFonts = Array.from(container.querySelectorAll('font'))
            .filter(f => /courier/i.test(f.getAttribute('face') || ''));
        courierFonts.forEach(f => {
            const xmp = f.querySelector('xmp');
            const brCount = f.querySelectorAll('br').length;
            const text = f.textContent;
            const hasNewlines = /\n/.test(text);
            const isBlock = xmp || brCount >= 1 || (hasNewlines && text.length > 40);

            if (isBlock) {
                const pre = document.createElement('pre');
                pre.className = 'pg-code-block';
                let code;
                if (xmp) {
                    // <xmp> preserves raw text verbatim
                    code = xmp.textContent;
                } else {
                    const clone = f.cloneNode(true);
                    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
                    code = clone.textContent;
                }
                pre.textContent = code.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
                f.replaceWith(pre);
            } else {
                const code = document.createElement('code');
                code.className = 'pg-code-inline';
                while (f.firstChild) code.appendChild(f.firstChild);
                f.replaceWith(code);
            }
        });
    }

    // Splits a plain-text string around a known link-text substring, appending
    // the three parts (before, anchor element, after) to a container element.
    function appendSplitLink(div, text, linkText, anchorEl) {
        const idx = text.indexOf(linkText);
        const before = idx >= 0 ? text.slice(0, idx).trim() : text;
        const after  = idx >= 0 ? text.slice(idx + linkText.length).trim() : '';
        if (before) div.appendChild(document.createTextNode(before + ' '));
        div.appendChild(anchorEl);
        if (after) div.appendChild(document.createTextNode(' ' + after));
    }

    // Returns true if an element looks like a PG YC/Hacker-News promotional banner.
    function isYcElement(el) {
        const t = el.textContent || '';
        const linkHrefs = Array.from(el.querySelectorAll('a[href]'))
            .map(a => a.getAttribute('href') || '');
        const hasYcMark =
            t.includes('Y Combinator') || t.includes('ycombinator') ||
            t.includes('Hacker News') || t.includes('hacker news') ||
            linkHrefs.some(h => /ycombinator\.com|news\.ycombinator/i.test(h));
        const hasYcContext =
            t.includes('funded') || t.includes('startup') ||
            t.includes('apply') || t.includes('build things') ||
            t.includes('Hacker News') || t.includes('hacker news');
        return hasYcMark && hasYcContext;
    }

    // Replaces a raw YC banner element with a clean themed <div>.
    // Strips inner tables, spacer images, and bgcolor attributes.
    function rebuildYcBanner(el, isBottom) {
        const div = document.createElement('div');
        div.className = isBottom ? 'pg-yc-banner pg-yc-banner-bottom' : 'pg-yc-banner';

        const links = Array.from(el.querySelectorAll('a[href]')).filter(a => {
            const href = a.getAttribute('href') || '';
            return a.textContent.trim().length > 0 && !/\.(gif|png|jpe?g)$/i.test(href);
        });

        const text = el.textContent.replace(/\s+/g, ' ').trim();
        const primary = links.find(a =>
            /ycombinator|hacker\s*news/i.test(a.href + ' ' + a.textContent)
        ) || links[0];

        if (primary) {
            const linkText = primary.textContent.trim();
            const a = document.createElement('a');
            a.href = primary.href;
            a.textContent = linkText;
            try {
                if (new URL(primary.href).origin !== location.origin) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.classList.add('pg-ext-link');
                }
            } catch (_) { }
            appendSplitLink(div, text, linkText, a);
        } else {
            div.textContent = text;
        }

        el.replaceWith(div);
        return div;
    }

    // Replaces a raw Amazon book-promo element with a clean themed <div>.
    function rebuildBookPromo(el) {
        const div = document.createElement('div');
        div.className = 'pg-book-promo';
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        const amazonLink = Array.from(el.querySelectorAll('a[href]'))
            .find(a => /amazon\./i.test(a.getAttribute('href') || ''));
        if (amazonLink) {
            const linkText = amazonLink.textContent.trim();
            const a = document.createElement('a');
            a.href = amazonLink.href;
            a.textContent = linkText;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.classList.add('pg-ext-link');
            appendSplitLink(div, text, linkText, a);
            // Strip leading sentence punctuation from the trailing fragment.
            const idx = text.indexOf(linkText);
            const after = idx >= 0 ? text.slice(idx + linkText.length).trim() : '';
            const afterClean = after.replace(/^[.,]\s*/, '');
            if (after !== afterClean && div.lastChild && div.lastChild.nodeType === Node.TEXT_NODE) {
                div.lastChild.textContent = afterClean ? ' ' + afterClean : '';
            }
        } else {
            div.textContent = text;
        }
        el.replaceWith(div);
    }

    function handleYcBanner(container) {
        const children = Array.from(container.children);
        // Top banner — search first 5 children.
        for (let i = 0; i < Math.min(5, children.length); i++) {
            if (isYcElement(children[i])) { rebuildYcBanner(children[i], false); break; }
        }
        // Bottom banner — rescan after potential rebuild shifted indexes.
        const fresh = Array.from(container.children);
        for (let i = fresh.length - 1; i >= Math.max(0, fresh.length - 5); i--) {
            const el = fresh[i];
            if (el.classList && el.classList.contains('pg-yc-banner')) continue;
            if (isYcElement(el)) { rebuildYcBanner(el, true); break; }
        }

        // Book promo — PG's "You'll find this essay in <book>" table links to Amazon.
        const fresh2 = Array.from(container.children);
        for (let i = fresh2.length - 1; i >= Math.max(0, fresh2.length - 10); i--) {
            const el = fresh2[i];
            const links = Array.from(el.querySelectorAll('a[href]'));
            const hasAmazon = links.some(
                a => /amazon\.com\/gp\/product|amazon\.com\/dp/i.test(a.getAttribute('href') || '')
            );
            const elText = (el.textContent || '').trim();
            const isBookPromo = hasAmazon && elText.length > 10 && elText.length < 240 &&
                !el.classList.contains('pg-yc-banner');
            if (isBookPromo) { rebuildBookPromo(el); break; }
        }
    }

    function resetFontTags(container) {
        container.querySelectorAll('font').forEach((f) => f.classList.add('pg-font-reset'));
    }

    /* ── Notes Section ─────────────────────────────────────── */

    function wrapNotesSection(main) {
        const NOTE_START_RE = /^\s*\[?(\d+)[\]\.]\s/;
        const directParagraphs = Array.from(main.querySelectorAll(':scope > p'));
        const noteStartIndex = directParagraphs.findIndex(p =>
            NOTE_START_RE.test(p.textContent.trim()) || p.querySelector('a[name]')
        );

        if (noteStartIndex < 2) return;

        const candidateNotes = directParagraphs.slice(noteStartIndex).filter(p =>
            NOTE_START_RE.test(p.textContent.trim()) || p.querySelector('a[name]')
        );
        if (candidateNotes.length < 2) return;

        const section = document.createElement('section');
        section.className = 'pg-notes';

        const heading = document.createElement('h2');
        heading.className = 'pg-notes-heading';
        heading.textContent = 'Notes';
        section.appendChild(heading);

        // Walk from first note paragraph forward, but skip any .pg-thanks
        // section (extracted by wrapThanksSection) so it stays separate.
        let node = directParagraphs[noteStartIndex];
        while (node) {
            const next = node.nextSibling;
            if (node.nodeType === Node.ELEMENT_NODE &&
                node.classList?.contains('pg-thanks')) {
                node = next;
                continue;
            }
            section.appendChild(node);
            node = next;
        }

        // Tag each block child (p/blockquote/pre/ul/ol) with its note number.
        // A note starts at a "[N]" paragraph and continues until the next
        // "[N+1]" / "Thanks to" / end-of-section. Non-paragraph blocks
        // (e.g. <blockquote>) inherit the current note's number.
        let currentNum = null;
        Array.from(section.children).forEach(el => {
            if (el.tagName === 'H2') return;
            if (el.tagName === 'P') {
                const text = el.textContent.trim();
                const startMatch = text.match(NOTE_START_RE);
                if (startMatch) {
                    currentNum = startMatch[1];
                    el.dataset.noteStart = '1';
                } else if (/^\s*Thanks to\b/i.test(text)) {
                    currentNum = null;
                }
            }
            if (currentNum) el.dataset.noteNum = currentNum;
        });

        main.appendChild(section);
    }

    function wrapThanksSection(main) {
        // PG writes the acknowledgement paragraph as "<b>Thanks</b> to <names>
        // for reading drafts of this." — sometimes followed by links. Detect it
        // by the bold "Thanks" prefix (strong signal) or plain "Thanks to" start,
        // located in the last half of the essay.
        const paragraphs = Array.from(main.querySelectorAll(':scope > p'));
        const isThanksPara = (p) => {
            const text = p.textContent.trim();
            if (!/^Thanks\b/i.test(text)) return false;
            // Require "Thanks to" within the first ~30 chars (allows bold tag + space)
            return /^Thanks\s+to\b/i.test(text.slice(0, 30));
        };
        const thanksIdx = paragraphs.findIndex(isThanksPara);
        if (thanksIdx === -1) return;
        if (thanksIdx < Math.floor(paragraphs.length * 0.5)) return;

        const thanksP = paragraphs[thanksIdx];

        // Strip the leading "Thanks" word (CSS ::before adds its own label).
        stripLeadingThanks(thanksP);

        const section = document.createElement('section');
        section.className = 'pg-thanks';
        section.appendChild(thanksP);

        // Insert before .pg-notes if present, else append at end.
        const notes = main.querySelector('.pg-notes');
        if (notes) main.insertBefore(section, notes);
        else main.appendChild(section);
    }

    // Remove leading "Thanks" word (and any bold wrapper containing only it)
    // from a paragraph, leaving "to <names> for ..." plus any trailing links.
    function stripLeadingThanks(p) {
        let n = p.firstChild;
        while (n) {
            if (n.nodeType === Node.TEXT_NODE) {
                if (!n.textContent.trim()) { const next = n.nextSibling; n.remove(); n = next; continue; }
                n.textContent = n.textContent.replace(/^\s*Thanks\s*/i, '');
                if (!n.textContent) { const next = n.nextSibling; n.remove(); n = next; continue; }
                break;
            }
            if (n.nodeType === Node.ELEMENT_NODE) {
                const tag = n.tagName;
                if ((tag === 'B' || tag === 'STRONG' || tag === 'FONT' || tag === 'SPAN') &&
                    /^\s*Thanks\s*$/i.test(n.textContent)) {
                    const next = n.nextSibling;
                    n.remove();
                    n = next;
                    continue;
                }
                // Element contains "Thanks " inline — descend one level and strip there.
                if ((tag === 'B' || tag === 'STRONG' || tag === 'FONT' || tag === 'SPAN') &&
                    /^\s*Thanks\b/i.test(n.textContent)) {
                    stripLeadingThanks(n);
                    break;
                }
                break;
            }
            n = n.nextSibling;
        }
    }

    /* ── Articles Page Layout ─────────────────────────────── */

    function enhanceArticlesLayout(main) {
        // Pull out intro paragraphs (prose with multiple links, not essay rows).
        const introParas = [];
        const collectIntroProse = (el) => {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (!text) return;
            const links = Array.from(el.querySelectorAll('a[href]'));
            const avgLinkLen = links.length > 0
                ? links.reduce((s, a) => s + a.textContent.trim().length, 0) / links.length
                : 0;
            const isIntroProse = text.length > 40 &&
                (links.length >= 2 || text.length > avgLinkLen * 2.5);
            if (!isIntroProse) return;
            const p = document.createElement('p');
            // Clone link nodes + text so anchors stay clickable
            Array.from(el.childNodes).forEach(n => p.appendChild(n.cloneNode(true)));
            introParas.push(p);
        };

        Array.from(main.querySelectorAll(':scope > p')).forEach(p => {
            collectIntroProse(p);
            p.remove();
        });

        // Classify tables: essay list (many link rows) vs intro prose.
        const essays = [];
        Array.from(main.querySelectorAll('table')).forEach(table => {
            const trs = Array.from(table.querySelectorAll('tr'));
            const linkRows = trs.filter(tr => tr.querySelector('a[href]')).length;
            if (linkRows >= 10) {
                // Essay list table
                trs.forEach(tr => {
                    const link = tr.querySelector('a[href]');
                    if (!link) return;
                    const linkText = link.textContent.replace(/\s+/g, ' ').trim();
                    if (!linkText || linkText.length < 2) return;
                    const trText = tr.textContent;
                    const dateMatch = trText.match(/\(([^)]+)\)/);
                    essays.push({
                        href: link.href,
                        title: linkText,
                        date: dateMatch ? dateMatch[1] : null
                    });
                });
            } else {
                // Intro prose table — preserve content as intro paragraph
                collectIntroProse(table);
            }
            table.remove();
        });

        // Clear everything except the h1/title area.
        Array.from(main.childNodes).forEach(n => {
            if (n.nodeType === Node.ELEMENT_NODE &&
                (n.tagName === 'H1' || n.classList?.contains('pg-title-area'))) return;
            n.remove();
        });

        // Render intro prose above the list.
        if (introParas.length > 0) {
            const introWrap = document.createElement('div');
            introWrap.className = 'pg-articles-intro';
            introParas.forEach(p => introWrap.appendChild(p));
            main.appendChild(introWrap);
        }

        if (essays.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'pg-essay-list';
            const seen = new Set();
            essays.forEach(e => {
                if (seen.has(e.href)) return;
                seen.add(e.href);
                const li = document.createElement('li');
                li.className = 'pg-essay-item';
                const a = document.createElement('a');
                a.href = e.href;
                a.className = 'pg-essay-link';
                a.textContent = e.title;
                li.appendChild(a);
                if (e.date) {
                    const d = document.createElement('span');
                    d.className = 'pg-essay-date';
                    d.textContent = e.date;
                    li.appendChild(d);
                }
                ul.appendChild(li);
            });
            main.appendChild(ul);
        }
    }

    /* ── Drop Cap ──────────────────────────────────────────── */

    function applyDropCap(main) {
        const firstP = main.querySelector('p.pg-first-paragraph');
        if (!firstP) return;

        // Skip if paragraph opens with list marker (1., 2), -, *, •, —) or other punctuation
        const paraText = firstP.textContent.replace(/^\s+/, '');
        if (/^(\d+[.)]|[-*•·—–]|[,.;:!?])/.test(paraText)) return;

        // Walk to first non-empty text node
        const walker = document.createTreeWalker(firstP, NodeFilter.SHOW_TEXT, null);
        let textNode = walker.nextNode();
        while (textNode && !textNode.textContent.trim()) textNode = walker.nextNode();
        if (!textNode) return;

        // Skip drop cap if first word is inside a link
        let anc = textNode.parentNode;
        while (anc && anc !== firstP) {
            if (anc.tagName === 'A') return;
            anc = anc.parentNode;
        }

        const raw = textNode.textContent;
        // Find first alphanumeric character, skipping leading punctuation/quotes/spaces
        const match = raw.match(/^(\s*[\u201C\u2018"'\u00AB\xAB\s]*)(\S)/);
        if (!match) return;

        const leadingPunct = match[1];
        const firstLetter = match[2];
        const rest = raw.slice(leadingPunct.length + 1);

        // Only apply drop cap when first actual character is a letter
        if (!/[A-Za-z\u00C0-\u024F]/.test(firstLetter)) return;

        // Replace text node with: leading punct + <span.pg-drop-cap>letter</span> + rest
        const span = document.createElement('span');
        span.className = 'pg-drop-cap';
        span.textContent = firstLetter;

        const beforeNode = document.createTextNode(leadingPunct);
        const afterNode = document.createTextNode(rest);
        textNode.replaceWith(beforeNode, span, afterNode);

        // Remove the CSS ::first-letter approach for this paragraph since we're using a span
        firstP.classList.add('pg-drop-cap-active');
    }

    /* ── Strip Stray BRs ──────────────────────────────────── */

    function stripStrayBrs(container) {
        // Remove <br> elements that appear directly between block-level siblings
        const brs = Array.from(container.querySelectorAll('br'));
        brs.forEach(br => {
            if (br.parentNode === container) br.remove();
        });
    }

    /* ── Section First Paragraph ───────────────────────────── */

    function markSectionFirstParagraphs(main) {
        main.querySelectorAll('hr.pg-section-break').forEach(hr => {
            let next = hr.nextElementSibling;
            while (next && next.tagName !== 'P') next = next.nextElementSibling;
            if (next) next.classList.add('pg-section-first');
        });
    }

    /* ── Reading Time ──────────────────────────────────────── */

    function calculateReadingTime(container) {
        const words = (container.textContent || '').trim().split(/\s+/).length;
        return Math.max(1, Math.ceil(words / 238));
    }

    /* ── Nav Toggle ────────────────────────────────────────── */

    function setupNavToggle(topNav) {
        const hamburger = topNav.querySelector('#pg-nav-hamburger');
        const linksDiv = topNav.querySelector('#pg-topnav-links');
        if (hamburger && linksDiv) {
            hamburger.addEventListener('click', () => {
                linksDiv.classList.toggle('pg-topnav-links-open');
            });
        }
    }

    /* ── Footnote Popup System ─────────────────────────────── */

    let popoverEl = null;

    // Builds and mounts the footnote popover DOM; returns its named sub-elements.
    function createFootnotePopoverEl() {
        const el = document.createElement('div');
        el.id = 'fn-popover';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Footnote');
        el.hidden = true;

        const arrow = document.createElement('div');
        arrow.className = 'fn-arrow';

        const header = document.createElement('div');
        header.className = 'fn-header';

        const label = document.createElement('span');
        label.className = 'fn-label';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fn-close';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close footnote');

        header.appendChild(label);
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        content.className = 'fn-content';

        el.appendChild(arrow);
        el.appendChild(header);
        el.appendChild(content);
        document.body.appendChild(el);

        return { el, arrow, label, closeBtn, content };
    }

    function setupFootnotes() {
        const { el, arrow, label, closeBtn, content } = createFootnotePopoverEl();
        popoverEl = el;

        let currentTrigger = null;

        const hidePopover = () => {
            popoverEl.classList.remove('fn-visible');
            setTimeout(() => {
                if (!popoverEl.classList.contains('fn-visible')) {
                    popoverEl.hidden = true;
                }
            }, 180);
            currentTrigger = null;
        };

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hidePopover();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !popoverEl.hidden) {
                e.preventDefault();
                const t = currentTrigger;
                hidePopover();
                if (t) try { t.focus(); } catch (_) { }
            }
        });

        // Dismiss on click-outside
        document.addEventListener('click', (e) => {
            if (popoverEl.hidden) return;
            if (popoverEl.contains(e.target)) return;
            const maybeTrigger = e.target.closest('a.pg-fn-ref, a[href*="#f"]');
            if (!maybeTrigger) hidePopover();
        });

        // Dismiss if the user scrolls far enough that the trigger leaves the viewport.
        // Scroll is passive — popup stays with the text because it is position:absolute.
        window.addEventListener('scroll', () => {
            if (popoverEl.hidden || !currentTrigger) return;
            const r = currentTrigger.getBoundingClientRect();
            const vh = window.innerHeight;
            if (r.bottom < -80 || r.top > vh + 80) hidePopover();
        }, { passive: true });

        // Opens the popover anchored to a footnote reference link.
        const showPopover = (link, href, noteLabel) => {
            const targetId = href.split('#')[1];
            if (!targetId) return;
            const target = document.getElementById(targetId) ||
                document.querySelector('a[name="' + targetId + '"]');
            if (!target) return;

            while (content.firstChild) content.removeChild(content.firstChild);
            content.appendChild(extractFootnoteContent(target));
            label.textContent = 'Note ' + noteLabel;

            currentTrigger = link;
            popoverEl.hidden = false;
            // Reset any prior positioning so dimensions can be measured clean.
            popoverEl.style.left = '0px';
            popoverEl.style.top = '0px';

            requestAnimationFrame(() => {
                positionPopover(popoverEl, arrow, link);
                popoverEl.classList.add('fn-visible');
                setTimeout(() => { try { closeBtn.focus({ preventScroll: true }); } catch (_) { } }, 50);
            });
        };

        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const text = link.textContent.trim();
            const href = link.getAttribute('href') || '';
            const isFootnoteLink =
                link.classList.contains('pg-fn-ref') ||
                /^\[\d+\]$/.test(text) ||
                (href.includes('#f') && /^\[?(\d+)\]?$/.test(text));

            if (!isFootnoteLink) return;

            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            showPopover(link, href, text.replace(/[\[\]]/g, ''));
        }, true);
    }

    function positionPopover(popover, arrow, trigger) {
        const GAP = 10;
        const MARGIN = 16;

        const trigRect = trigger.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        // Reset max-height to allow natural measurement, then clamp.
        popover.style.maxHeight = '';
        const popRect = popover.getBoundingClientRect();
        const popWidth = popRect.width;
        const popHeight = popRect.height;

        const viewportW = document.documentElement.clientWidth;
        const viewportH = window.innerHeight;

        // Prefer below trigger; flip to above if not enough room.
        const spaceBelow = viewportH - trigRect.bottom - GAP;
        const spaceAbove = trigRect.top - GAP;
        const placeBelow = spaceBelow >= Math.min(popHeight, 280) || spaceBelow >= spaceAbove;
        const maxAllowed = Math.max(120, (placeBelow ? spaceBelow : spaceAbove) - MARGIN);
        popover.style.maxHeight = Math.min(420, maxAllowed) + 'px';

        // Re-measure after max-height clamp
        const finalHeight = popover.getBoundingClientRect().height;

        // Horizontal: center on trigger, constrained to viewport with MARGIN.
        let left = trigRect.left + scrollX + trigRect.width / 2 - popWidth / 2;
        const minLeft = scrollX + MARGIN;
        const maxLeft = scrollX + viewportW - popWidth - MARGIN;
        if (left < minLeft) left = minLeft;
        if (left > maxLeft) left = maxLeft;

        let top;
        if (placeBelow) {
            top = trigRect.bottom + scrollY + GAP;
            popover.dataset.arrow = 'top';
        } else {
            top = trigRect.top + scrollY - finalHeight - GAP;
            popover.dataset.arrow = 'bottom';
        }

        popover.style.left = left + 'px';
        popover.style.top = top + 'px';

        // Arrow horizontal alignment — center on the trigger, clamped within popup width.
        const triggerCenterX = trigRect.left + scrollX + trigRect.width / 2;
        let arrowX = triggerCenterX - left;
        const arrowPad = 14;
        if (arrowX < arrowPad) arrowX = arrowPad;
        if (arrowX > popWidth - arrowPad) arrowX = popWidth - arrowPad;
        arrow.style.left = arrowX + 'px';
    }

    function isSameSite(url) {
        // Treat paulgraham.com and www.paulgraham.com as the same site.
        const strip = (h) => h.replace(/^www\./, '');
        return strip(url.hostname) === strip(location.hostname);
    }

    function decorateFootnoteLinks(root) {
        // Auto-linkify bare URLs in text nodes (PG's footnotes often cite
        // "http://..." as plain text with no <a> wrapper).
        autolinkUrls(root);

        // External links open in new tab + get the ↗ indicator.
        // Internal (same-site) links — strip any inherited ext-link class from
        // the cloned source to avoid stray arrow indicators.
        root.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href') || '';
            if (href.startsWith('#')) {
                a.classList.remove('pg-ext-link');
                a.removeAttribute('target');
                return;
            }
            try {
                const url = new URL(href, location.href);
                if (!isSameSite(url)) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.classList.add('pg-ext-link');
                } else {
                    a.classList.remove('pg-ext-link');
                    a.removeAttribute('target');
                }
            } catch (_) { }
        });
    }

    function autolinkUrls(root) {
        // Match bare http/https URLs. Stop at whitespace or common trailing punctuation.
        const urlRe = /\bhttps?:\/\/[^\s<>()'"]+/;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (node.parentElement && node.parentElement.closest('a,code,pre')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return urlRe.test(node.textContent)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });

        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const frag = document.createDocumentFragment();
            let lastIdx = 0;
            const re = /\bhttps?:\/\/[^\s<>()'"]+/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                let url = m[0];
                // Strip trailing punctuation that's likely sentence terminators.
                const trimmed = url.replace(/[.,;:!?]+$/, '');
                const trailing = url.slice(trimmed.length);
                url = trimmed;

                if (m.index > lastIdx) {
                    frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
                }
                const a = document.createElement('a');
                a.href = url;
                a.textContent = url;
                frag.appendChild(a);
                if (trailing) frag.appendChild(document.createTextNode(trailing));
                lastIdx = m.index + m[0].length;
            }
            if (lastIdx < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIdx)));
            }
            textNode.parentNode.replaceChild(frag, textNode);
        });
    }

    // Strip a leading "[N]" note marker from the start of a cloned paragraph.
    // PG writes these as one of:
    //   text "[N]..."           — plain text
    //   text "[" + <a>N</a> + "]..."    — anchored digit inside brackets
    //   <a name="fN"></a>text "[N]..."  — named anchor then brackets
    // Walk forward removing nodes/text until the first "]" is consumed.
    function stripLeadingNoteMarker(clone) {
        let done = false;
        while (!done && clone.firstChild) {
            const n = clone.firstChild;
            if (n.nodeType === Node.TEXT_NODE) {
                const idx = n.textContent.indexOf(']');
                if (idx >= 0) {
                    n.textContent = n.textContent.slice(idx + 1).replace(/^\s+/, '');
                    if (!n.textContent) n.remove();
                    done = true;
                } else {
                    n.remove();
                }
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                const t = n.textContent.trim();
                // Anchor-only or digit-only elements belong to the marker — drop them.
                if (!t || /^\[?\d+[\]\.]?$/.test(t) || (n.tagName === 'A' && !n.hasAttribute('href'))) {
                    n.remove();
                } else {
                    done = true;
                }
            } else {
                n.remove();
            }
        }
    }

    function extractFootnoteContent(anchor) {
        const fragment = document.createDocumentFragment();

        // Resolve to the paragraph that contains or is the footnote target.
        const notePara = anchor.tagName === 'P'
            ? anchor
            : (anchor.classList?.contains('pg-notes')
                ? anchor.querySelector('p')
                : anchor.closest && anchor.closest('p'));

        // Case A (preferred): paragraph is tagged by wrapNotesSection — gather
        // all paragraphs sharing data-note-num (a note can span multiple paras).
        if (notePara && notePara.dataset.noteNum) {
            const noteNum = notePara.dataset.noteNum;
            const parts = [notePara];
            let sib = notePara.nextElementSibling;
            // Include any subsequent block (P, BLOCKQUOTE, PRE, UL, OL) that
            // carries the same data-note-num and isn't a new note-start.
            while (sib &&
                   sib.dataset.noteNum === noteNum &&
                   !sib.dataset.noteStart) {
                parts.push(sib);
                sib = sib.nextElementSibling;
            }
            parts.forEach((el, idx) => {
                const clone = el.cloneNode(true);
                if (idx === 0) stripLeadingNoteMarker(clone);
                decorateFootnoteLinks(clone);
                fragment.appendChild(clone);
            });
            return fragment;
        }

        // Case B: target is an <a name="fN"> inline anchor — walk forward until
        // we hit the next note or a double BR.
        let node = anchor.nextSibling;
        let brCount = 0;
        let isFirstText = true;

        while (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.textContent;
                if (isFirstText) {
                    text = text.replace(/^\s*[\]\)\.\d\s]+/, '');
                    isFirstText = false;
                }
                if (text.trim()) {
                    fragment.appendChild(document.createTextNode(text));
                    brCount = 0;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'BR') {
                    brCount++;
                    if (brCount >= 2) break;
                    fragment.appendChild(document.createElement('br'));
                } else if (node.tagName === 'A' && (node.id || node.name) && node !== anchor) {
                    break;
                } else {
                    fragment.appendChild(node.cloneNode(true));
                    brCount = 0;
                    isFirstText = false;
                }
            }
            node = node.nextSibling;
        }

        if (!fragment.textContent.trim()) {
            const parent = anchor.parentElement;
            if (parent && parent.tagName === 'P') fragment.appendChild(parent.cloneNode(true));
        }

        // Decorate external links in the captured fragment (case B).
        const wrapper = document.createElement('div');
        wrapper.appendChild(fragment);
        decorateFootnoteLinks(wrapper);
        const out = document.createDocumentFragment();
        while (wrapper.firstChild) out.appendChild(wrapper.firstChild);
        return out;
    }

})();
