// Shell-wide hyperlink routing.
//
// A hyperlink inside the OS belongs to the OS. Clicking one is a request to
// open that address in the built-in Browser app — without this, a plain
// <a href="…"> (and every `target="_blank"` anchor a markdown preview or an
// inserted link emits) was followed by the browser tab that hosts the OS, so
// the user landed outside the desktop in a host tab.
//
// The listener runs on the BUBBLE phase: an app that handles the click itself
// and calls preventDefault() keeps full control, and anchors inside an
// embedded iframe never reach this document at all. Only http/https addresses
// are routed; other schemes (mailto:, tel:, blob:, data:, javascript:) keep
// their native meaning, as does anything marked `download`.

import AppLoader from './appLoader.js';

const ROUTABLE = new Set(['http:', 'https:']);

// A double click fires two clicks; the second must not open the same address
// twice. Small window, same URL only.
const REPEAT_MS = 400;

let started = false;
let lastUrl = '';
let lastAt = 0;

function routableHref(anchor) {
    if (anchor.hasAttribute('download')) return null;
    // Inside an editor a click is a caret placement, not navigation —
    // browsers do not follow links in editable content either.
    if (anchor.isContentEditable) return null;

    const href = (anchor.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#')) return null;

    let url;
    try {
        url = new URL(href, document.baseURI);
    } catch (e) {
        return null;
    }
    if (!ROUTABLE.has(url.protocol)) return null;
    return url.href;
}

function handle(event) {
    if (event.defaultPrevented) return;

    const target = event.target;
    const anchor = target && typeof target.closest === 'function'
        ? target.closest('a[href]')
        : null;
    if (!anchor) return;

    const url = routableHref(anchor);
    if (!url) return;

    // The host tab must never follow the link — `target="_blank"` included.
    event.preventDefault();
    open(url);
}

async function open(url) {
    if (typeof url !== 'string' || !url.trim()) return;

    const now = Date.now();
    if (url === lastUrl && now - lastAt < REPEAT_MS) return;
    lastUrl = url;
    lastAt = now;

    const folder = AppLoader.folderFor('browser');
    if (!folder) return;
    try {
        const browser = await AppLoader.ensureLoaded(folder);
        if (!browser) return;
        if (typeof browser.openUrl === 'function') browser.openUrl(url);
        else if (typeof browser.launch === 'function') browser.launch(url);
    } catch (e) { /* the crash monitor reports load failures */ }
}

function init() {
    if (started) return;
    started = true;
    document.addEventListener('click', handle);
    // Middle click normally opens a host tab as well.
    document.addEventListener('auxclick', (event) => {
        if (event.button === 1) handle(event);
    });
}

export default { init, open };
