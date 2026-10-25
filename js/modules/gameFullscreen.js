// Game fullscreen — real browser fullscreen for embedded (iframe) game windows.
//
// One entry point: GameFullscreen.attach({ win, button }) wires
//   * the toolbar button,
//   * F11 (the focused game window toggles),
//   * Escape (the browser already leaves Fullscreen API fullscreen; the
//     maximized fallback needs the explicit handler),
//   * the mobile back gesture, via a history entry pushed while fullscreen.
//
// When the Fullscreen API is missing or refuses the request (iOS Safari does
// not fullscreen arbitrary elements), the window is maximized instead, so the
// button still does something useful.
//
// Listeners are bound once per realm and released per window on
// `window-closed` (see js/modules/windowManager.js).
import WindowManager from './windowManager.js';

const controllers = new Map(); // window id -> controller
let historyPushed = false;
let bound = false;

function isFullscreen(c) {
    if (c.pseudo) return WindowManager.isMaximized(c.win.id);
    const el = typeof document !== 'undefined' ? document.fullscreenElement : null;
    if (!el || !c.win.element) return false;
    return el === c.win.element || c.win.element.contains(el);
}

function update(c) {
    if (!c.button) return;
    const active = isFullscreen(c);
    c.button.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    c.button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function pushHistory(c) {
    if (historyPushed) return;
    try {
        history.pushState({ w12GameFullscreen: c.win.id }, '');
        historyPushed = true;
    } catch (e) { /* history unavailable (sandboxed frame) */ }
}

function popHistory() {
    if (!historyPushed) return;
    historyPushed = false;
    try { history.back(); } catch (e) { /* ignore */ }
}

function enterPseudo(c) {
    c.pseudo = true;
    try { WindowManager.setMaximized(c.win.id, true); } catch (e) { /* window gone */ }
}

async function enter(c) {
    if (isFullscreen(c)) return;
    c.pseudo = false;
    const el = c.win.element;
    if (el && typeof el.requestFullscreen === 'function') {
        try {
            await el.requestFullscreen();
            pushHistory(c);
            update(c);
            return;
        } catch (e) { /* refused — fall back to maximizing the window */ }
    }
    enterPseudo(c);
    pushHistory(c);
    update(c);
}

function exit(c, fromPop = false) {
    if (c.pseudo) {
        c.pseudo = false;
        try { WindowManager.setMaximized(c.win.id, false); } catch (e) { /* window gone */ }
    } else if (isFullscreen(c)) {
        try { document.exitFullscreen(); } catch (e) { /* ignore */ }
    }
    if (fromPop) historyPushed = false;
    else popHistory();
    update(c);
}

function toggle(c) {
    if (isFullscreen(c)) exit(c);
    else enter(c);
}

function focusedController() {
    for (const c of controllers.values()) {
        if (WindowManager.isFocused(c.win.id)) return c;
    }
    return null;
}

function onKeyDown(e) {
    const c = focusedController();
    if (!c) return;
    if (e.key === 'F11') {
        e.preventDefault();
        toggle(c);
    } else if (e.key === 'Escape' && isFullscreen(c)) {
        exit(c);
    }
}

function onFullscreenChange() {
    // Escape (or the browser) can leave fullscreen without going through the
    // button — drop the history entry we pushed so Back is not swallowed.
    if (!document.fullscreenElement && historyPushed) popHistory();
    for (const c of controllers.values()) update(c);
}

function onPopState() {
    // The mobile Back gesture popped our entry: leave fullscreen and do not
    // call history.back() again (the browser already did). Every window that
    // is still fullscreen is released — Back always means "not fullscreen".
    if (!historyPushed) return;
    historyPushed = false;
    for (const c of controllers.values()) {
        if (isFullscreen(c)) exit(c, true);
    }
}

function onWindowClosed(e) {
    const id = e && e.detail && e.detail.id;
    const c = controllers.get(id);
    if (!c) return;
    if (isFullscreen(c)) exit(c);
    c.button = null;
    controllers.delete(id);
}

function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('window-closed', onWindowClosed);
}

function attach(options) {
    const { win, button } = options || {};
    if (!win || !win.id || !win.element) return null;
    bind();
    const c = { win, button: button || null, pseudo: false };
    controllers.set(win.id, c);
    if (button) {
        button.title = 'Fullscreen (F11)';
        button.addEventListener('click', () => toggle(c));
    }
    update(c);
    return {
        toggle: () => toggle(c),
        isFullscreen: () => isFullscreen(c),
        exit: () => exit(c),
        destroy: () => {
            if (isFullscreen(c)) exit(c);
            c.button = null;
            controllers.delete(win.id);
        }
    };
}

export default { attach };
