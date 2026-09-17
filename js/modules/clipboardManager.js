// ClipboardManager — Win+V-style clipboard history flyout (system module).
// Owns no window: a small floating panel above the taskbar with history,
// pin/unpin, per-item delete, clear-unpinned, search, and click-to-paste.
//
// Browser limits (honest): pages cannot silently read the OS clipboard —
// reads need focus + the clipboard-read permission and may prompt. So:
//  - copy/cut events INSIDE the OS are captured automatically (free),
//  - the system clipboard is imported on explicit user gesture (opening the
//    flyout / "Sync" button), and polled only while permission is 'granted'.
import FileSystem from './fileSystem.js';
import UIIcons from './uiIcons.js';
import Flyout from './flyout.js';
import Popup from './popup.js';

const ClipboardManager = (() => {
    const DATA_DIR = ['/', 'system', 'programs data', 'clipboard'];
    const HISTORY_PATH = [...DATA_DIR, 'history.json'];
    const MAX_ITEMS = 50;
    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    const MAX_STORE_CHARS = 3.5 * 1024 * 1024;
    const POLL_MS = 3000;

    let history = [];
    let panel = null;
    let listEl = null;
    let searchInput = null;
    let emptyEl = null;
    let countEl = null;
    let pollTimer = null;
    let canPoll = false;
    let lastSeenText = null;

    function ensureDir() {
        for (let i = 1; i <= DATA_DIR.length; i++) {
            const partial = DATA_DIR.slice(0, i);
            if (!FileSystem.itemExists(partial)) {
                FileSystem.createFolder(DATA_DIR.slice(0, i - 1), DATA_DIR[i - 1]);
            }
        }
    }

    function load() {
        try {
            const raw = FileSystem.readFile(HISTORY_PATH);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) history = parsed.filter(isValidItem);
            }
        } catch { history = []; }
    }

    function isValidItem(it) {
        return it && typeof it.id === 'string'
            && (it.type === 'text' || it.type === 'image')
            && typeof it.time === 'number';
    }

    function save() {
        try {
            ensureDir();
            let json = JSON.stringify(history);
            // Storage guard: localStorage-backed FS (~5MB). Evict oldest
            // unpinned images first, then oldest unpinned text, until small.
            while (json.length > MAX_STORE_CHARS) {
                const idx = history.findIndex(h => !h.pinned && h.type === 'image')
                    ?? -1;
                const fallback = history.findIndex(h => !h.pinned);
                const victim = idx !== -1 ? idx : fallback;
                if (victim === -1 || victim === undefined) break;
                history.splice(victim, 1);
                json = JSON.stringify(history);
            }
            if (FileSystem.itemExists(HISTORY_PATH)) FileSystem.writeFile(HISTORY_PATH, json);
            else FileSystem.createFile(DATA_DIR, 'history.json', json, 'json');
        } catch { /* disk full — keep in-memory only */ }
    }

    function makeId() {
        return `clip-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function addItem(item) {
        if (item.type === 'text') {
            const text = (item.text || '').trim();
            if (!text) return false;
            // No duplicate of the newest entry.
            const newest = history[0];
            if (newest && newest.type === 'text' && newest.text === text) return false;
            history.unshift({ id: makeId(), type: 'text', text, pinned: false, time: Date.now() });
        } else if (item.type === 'image') {
            if (!item.dataUrl) return false;
            const newest = history[0];
            if (newest && newest.type === 'image' && newest.dataUrl === item.dataUrl) return false;
            history.unshift({ id: makeId(), type: 'image', dataUrl: item.dataUrl, mime: item.mime || 'image/png', pinned: false, time: Date.now() });
        } else {
            return false;
        }
        // Enforce cap: evict oldest unpinned first, pinned always survive.
        const unpinned = history.filter(h => !h.pinned);
        if (unpinned.length + history.filter(h => h.pinned).length > MAX_ITEMS) {
            for (let i = history.length - 1; i >= 0 && history.length > MAX_ITEMS; i--) {
                if (!history[i].pinned) history.splice(i, 1);
            }
        }
        // Pinned items are exempt from the cap (user choice), unpinned trimmed.
        save();
        render();
        return true;
    }

    function timeAgo(t) {
        const s = Math.floor((Date.now() - t) / 1000);
        if (s < 10) return 'Just now';
        if (s < 60) return `${s}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return new Date(t).toLocaleDateString();
    }

    // ---------- image helpers ----------

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(new Error('read-failed'));
            fr.readAsDataURL(blob);
        });
    }

    function approxBytes(dataUrl) {
        return Math.floor((dataUrl.length * 3) / 4);
    }

    async function downscaleImage(dataUrl, mime) {
        if (approxBytes(dataUrl) <= MAX_IMAGE_BYTES) return { dataUrl, mime };
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('decode-failed'));
            im.src = dataUrl;
        });
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        // Try PNG first (keeps transparency), then JPEG, shrinking each round.
        for (let round = 0; round < 4; round++) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w));
            canvas.height = Math.max(1, Math.round(h));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const useJpeg = round >= 1;
            const out = canvas.toDataURL(useJpeg ? 'image/jpeg' : 'image/png', 0.85);
            if (approxBytes(out) <= MAX_IMAGE_BYTES) {
                return { dataUrl: out, mime: useJpeg ? 'image/jpeg' : 'image/png' };
            }
            w *= 0.7;
            h *= 0.7;
        }
        // Last resort: smallest JPEG.
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL('image/jpeg', 0.7);
        return { dataUrl: out, mime: 'image/jpeg' };
    }

    // ---------- system clipboard IO (user-gesture only) ----------

    async function readSystemText() {
        try {
            if (!navigator.clipboard?.readText) return null;
            if (!document.hasFocus()) return null;
            return await navigator.clipboard.readText();
        } catch { return null; }
    }

    async function readSystemImages() {
        const out = [];
        try {
            if (!navigator.clipboard?.read) return out;
            if (!document.hasFocus()) return out;
            const items = await navigator.clipboard.read();
            for (const item of items || []) {
                for (const type of item.types || []) {
                    if (!type.startsWith('image/')) continue;
                    try {
                        const blob = await item.getType(type);
                        const raw = await blobToDataUrl(blob);
                        const fit = await downscaleImage(raw, type).catch(() => null);
                        if (fit) out.push(fit);
                    } catch { /* skip unreadable type */ }
                }
            }
        } catch { /* permission denied — caller handles */ }
        return out;
    }

    async function refreshPermission() {
        try {
            if (!navigator.permissions?.query) return;
            const st = await navigator.permissions.query({ name: 'clipboard-read' });
            canPoll = st.state === 'granted';
            if (st.onchange !== undefined) {
                st.onchange = () => { canPoll = st.state === 'granted'; };
            }
        } catch { /* unsupported browser — polling stays off */ }
    }

    async function syncFromSystemClipboard() {
        await refreshPermission();
        const text = await readSystemText();
        if (text && text.trim() && text !== lastSeenText) {
            lastSeenText = text;
            addItem({ type: 'text', text });
        } else if (text) {
            lastSeenText = text;
        }
        const images = await readSystemImages();
        for (const img of images) addItem({ type: 'image', ...img });
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(async () => {
            if (!canPoll || !document.hasFocus()) return;
            if (!panel || panel.classList.contains('hidden')) return;
            try {
                const text = await navigator.clipboard.readText();
                if (text && text.trim() && text !== lastSeenText) {
                    lastSeenText = text;
                    addItem({ type: 'text', text });
                } else if (text) {
                    lastSeenText = text;
                }
            } catch { /* lost permission mid-session */ }
        }, POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    async function writeToSystemClipboard(item) {
        if (item.type === 'text') {
            try {
                await navigator.clipboard.writeText(item.text);
                return true;
            } catch { /* fall through to legacy path */ }
            try {
                const ta = document.createElement('textarea');
                ta.value = item.text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                return true;
            } catch { return false; }
        }
        try {
            const blob = await (await fetch(item.dataUrl)).blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
            return true;
        } catch { return false; }
    }

    function pasteIntoFocused(item) {
        if (item.type !== 'text') return false;
        const ae = document.activeElement;
        if (!ae) return false;
        try {
            if (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /^(text|search|password|email|url|number)$/i.test(ae.type || 'text'))) {
                const start = ae.selectionStart ?? ae.value.length;
                const end = ae.selectionEnd ?? ae.value.length;
                ae.value = ae.value.slice(0, start) + item.text + ae.value.slice(end);
                ae.selectionStart = ae.selectionEnd = start + item.text.length;
                ae.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
            if (ae.isContentEditable) {
                document.execCommand('insertText', false, item.text);
                return true;
            }
        } catch { /* read-only field */ }
        return false;
    }

    // ---------- flyout UI ----------

    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'clipboard-flyout';
        panel.classList.add('hidden');
        panel.innerHTML = `
            <div class="clip-header">
                <span class="clip-title">Clipboard</span>
                <span class="clip-count"></span>
                <div class="clip-header-actions">
                    <button class="clip-sync" title="Import the current system clipboard">Sync</button>
                    <button class="clip-clear" title="Clear unpinned history">Clear</button>
                </div>
            </div>
            <div class="clip-search">
                <input type="text" class="clip-search-input" placeholder="Search clipboard" spellcheck="false">
            </div>
            <div class="clip-list"></div>
            <div class="clip-empty hidden">Nothing here yet.<br>Copy text or images inside the OS, or press Sync.</div>
            <div class="clip-footer"><span>Win+V to open &middot; click an item to paste</span></div>
        `;
        document.body.appendChild(panel);
        listEl = panel.querySelector('.clip-list');
        searchInput = panel.querySelector('.clip-search-input');
        emptyEl = panel.querySelector('.clip-empty');
        countEl = panel.querySelector('.clip-count');

        searchInput.addEventListener('input', render);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); hide(); }
        });
        panel.querySelector('.clip-sync').addEventListener('click', () => syncFromSystemClipboard());
        panel.querySelector('.clip-clear').addEventListener('click', clearUnpinned);

        panel.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    function render() {
        if (!panel) return;
        const q = (searchInput?.value || '').toLowerCase();
        const pinned = history.filter(h => h.pinned);
        const rest = history.filter(h => !h.pinned);
        const ordered = [...pinned, ...rest].filter(h =>
            !q || (h.type === 'text' && h.text.toLowerCase().includes(q)));
        listEl.innerHTML = '';
        emptyEl.classList.toggle('hidden', ordered.length > 0);
        countEl.textContent = history.length ? `${history.length}/${MAX_ITEMS}` : '';

        for (const item of ordered) {
            const row = document.createElement('div');
            row.className = 'clip-item' + (item.pinned ? ' pinned' : '');
            row.dataset.id = item.id;

            const preview = item.type === 'text'
                ? `<div class="clip-text">${esc(item.text.slice(0, 160))}${item.text.length > 160 ? '&hellip;' : ''}</div>`
                : `<div class="clip-img"><img alt="clipboard image"></div>`;
            row.innerHTML = `
                ${preview}
                <div class="clip-meta"><span>${item.type === 'text' ? `${item.text.length} chars` : 'Image'} &middot; ${timeAgo(item.time)}</span></div>
                <div class="clip-row-actions">
                    <button class="clip-pin" title="${item.pinned ? 'Unpin' : 'Pin'}">${item.pinned ? 'Unpin' : 'Pin'}</button>
                    <button class="clip-del" title="Delete">&times;</button>
                </div>
            `;
            if (item.type === 'image') {
                row.querySelector('img').src = item.dataUrl;
            }
            row.addEventListener('click', (e) => {
                if (e.target.closest('.clip-row-actions')) return;
                pasteItem(item.id);
            });
            row.querySelector('.clip-pin').addEventListener('click', () => togglePin(item.id));
            row.querySelector('.clip-del').addEventListener('click', () => deleteItem(item.id));
            listEl.appendChild(row);
        }
    }

    async function pasteItem(id) {
        const item = history.find(h => h.id === id);
        if (!item) return;
        const ok = await writeToSystemClipboard(item);
        if (!ok) {
            Popup.error('Paste failed', 'The browser blocked clipboard access. Click inside a text field and press Ctrl+V instead.');
            return;
        }
        // Move pasted entry to the top (most-recent) like Windows does.
        history = [item, ...history.filter(h => h.id !== id)];
        save();
        render();
        pasteIntoFocused(item);
        hide();
    }

    function togglePin(id) {
        const item = history.find(h => h.id === id);
        if (!item) return;
        item.pinned = !item.pinned;
        save();
        render();
    }

    function deleteItem(id) {
        history = history.filter(h => h.id !== id);
        save();
        render();
    }

    function clearUnpinned() {
        if (!history.some(h => !h.pinned)) return;
        Popup.confirm('Clear clipboard', 'Delete all unpinned history? Pinned items are kept.').then(ok => {
            if (!ok) return;
            history = history.filter(h => h.pinned);
            save();
            render();
        });
    }

    function clearHistory() {
        history = [];
        try {
            if (FileSystem.itemExists(HISTORY_PATH)) FileSystem.deleteItem(HISTORY_PATH);
        } catch { /* noop */ }
        render();
    }

    function show() {
        if (!panel) return;
        Flyout.show(panel);
        render();
        syncFromSystemClipboard();
        setTimeout(() => searchInput?.focus(), 60);
    }

    function hide() {
        if (!panel) return;
        Flyout.hide(panel);
        if (searchInput) searchInput.value = '';
    }

    function toggle() {
        if (!panel) return;
        if (Flyout.isOpen(panel)) hide();
        else show();
    }

    function isOpen() {
        return !!panel && Flyout.isOpen(panel);
    }

    // ---------- capture wiring ----------

    function onCopyEvent(e) {
        try {
            const cd = e.clipboardData;
            if (!cd) return;
            // Images first (richer payload).
            if (cd.items) {
                for (const it of cd.items) {
                    if (it.type && it.type.startsWith('image/')) {
                        const file = it.getAsFile();
                        if (!file) continue;
                        blobToDataUrl(file)
                            .then(raw => downscaleImage(raw, it.type))
                            .then(fit => { if (fit) addItem({ type: 'image', ...fit }); })
                            .catch(() => {});
                        return;
                    }
                }
            }
            const text = cd.getData('text/plain');
            if (text && text.trim()) {
                lastSeenText = text;
                addItem({ type: 'text', text });
            }
        } catch { /* clipboard unreadable */ }
    }

    function onKeydown(e) {
        const v = e.key === 'v' || e.key === 'V';
        if (!v) return;
        // Win+V (Meta) with Ctrl+Shift+V fallback.
        if (e.metaKey || (e.ctrlKey && e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            toggle();
        }
    }

    function onPointerDown(e) {
        if (isOpen() && panel && !panel.contains(e.target)) hide();
    }

    function onEscape(e) {
        if (e.key === 'Escape' && isOpen()) hide();
    }

    function addTrayButton() {
        const tray = document.getElementById('tray-icons');
        if (!tray || tray.querySelector('.clipboard-tray-btn')) return;
        const btn = document.createElement('span');
        btn.className = 'clipboard-tray-btn';
        btn.title = 'Clipboard (Win+V)';
        btn.innerHTML = UIIcons.action('paste', 16);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });
        tray.appendChild(btn);
    }

    function init() {
        load();
        buildPanel();
        render();
        addTrayButton();
        document.addEventListener('copy', onCopyEvent);
        document.addEventListener('cut', onCopyEvent);
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onEscape);
        refreshPermission().then(() => { if (canPoll) startPolling(); });
        // Re-check permission grants periodically; polling only runs granted.
        setInterval(() => {
            refreshPermission().then(() => { if (canPoll && !pollTimer) startPolling(); });
        }, 15000);
    }

    return { init, show, hide, toggle, isOpen, syncFromSystemClipboard, clearHistory, getHistory: () => [...history] };
})();

export default ClipboardManager;
