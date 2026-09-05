import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';
import Popup from '../modules/popup.js';
import FileSystem from '../modules/fileSystem.js';
import ContextMenu from '../modules/contextMenu.js';
import SystemConfig from '../modules/systemConfig.js';
import UserActivity from '../modules/userActivity.js';
import Sounds from '../modules/sounds.js';
import SavePrompt from '../modules/saveprompt.js';

const Words = (() => {
    const APP_ID = 'words';
    const DEFAULT_PATH = ['/', 'users', 'default', 'Documents'];
    const DATA_PATH = ['/', 'system', 'programs data', APP_ID];

    let docCounter = 0;

    const state = {
        title: 'Untitled document',
        path: null,
        dirty: false,
        zoom: 100,
        lastSavedHtml: '',
    };

    const icon = AppIcons.get(APP_ID) || `
        <svg viewBox="0 0 24 24" fill="none">
            <rect x="3" y="2" width="18" height="20" rx="2" fill="#3b82f6"/>
            <path d="M7 7h10M7 11h10M7 15h7" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
    `;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_PATH)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], APP_ID);
        }
    }

    function normalizePath(path) {
        return Array.isArray(path) ? path : DEFAULT_PATH;
    }

    function getFileDisplayName(path) {
        return path?.[path.length - 1] || 'Untitled document.html';
    }

    function isTextLike(path) {
        const name = getFileDisplayName(path).toLowerCase();
        return ['.html', '.htm', '.txt', '.md', '.markdown'].some(ext => name.endsWith(ext));
    }

    function stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    function htmlDocument(content, title) {
        return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5}
.page{max-width:820px;margin:0 auto;padding:76px 78px;box-sizing:border-box;min-height:1050px}
img{max-width:100%}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #999;padding:6px}
blockquote{border-left:4px solid #aaa;padding-left:14px;color:#555}
</style>
</head>
<body><div class="page">${content}</div></body>
</html>`;
    }

    function extractBody(raw) {
        if (!raw) return '';
        const trimmed = raw.trim();

        if (/^<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
            const parser = new DOMParser();
            const parsed = parser.parseFromString(trimmed, 'text/html');
            const page = parsed.querySelector('.page');
            return page ? page.innerHTML : parsed.body?.innerHTML || '';
        }

        return `<p>${escapeHtml(trimmed).replace(/\r?\n/g, '</p><p>')}</p>`;
    }

    function defaultContent() {
        return `
            <h1>Untitled document</h1>
            <p>Start writing here...</p>
        `;
    }

    function setDirty(win, dirty = true) {
        state.dirty = dirty;
        const title = win.element.querySelector('.words-window-title');
        if (title) title.textContent = `${state.title}${dirty ? ' *' : ''}`;
        const saveBtn = win.element.querySelector('[data-action="save"]');
        if (saveBtn) saveBtn.classList.toggle('is-dirty', dirty);
    }

    function updateStats(win) {
        const editor = win.element.querySelector('.words-editor');
        const status = win.element.querySelector('.words-status');
        if (!editor || !status) return;

        const text = editor.innerText.replace(/\u00a0/g, ' ').trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;
        status.textContent = `${words.toLocaleString()} words  •  ${chars.toLocaleString()} characters`;
    }

    function exec(editor, command, value = null) {
        editor.focus();
        try {
            document.execCommand(command, false, value);
        } catch (_) {
            // Some browsers expose commands inconsistently.
        }
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }

    function formatBlock(editor, tag) {
        editor.focus();
        try {
            document.execCommand('formatBlock', false, tag);
        } catch (_) {}
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }

    function setFontName(editor, font) {
        if (!font) return;
        exec(editor, 'fontName', font);
    }

    function setFontSize(editor, size) {
        // execCommand fontSize uses 1-7 rather than px.
        const map = { 11: '2', 12: '3', 14: '3', 16: '4', 18: '4', 20: '5', 24: '5', 28: '6', 32: '6', 36: '7' };
        exec(editor, 'fontSize', map[size] || '4');
    }

    function applyColor(editor, color) {
        exec(editor, 'foreColor', color);
    }

    function applyHighlight(editor, color) {
        // HiliteColor is Chromium-supported; backColor is a fallback.
        editor.focus();
        try {
            document.execCommand('hiliteColor', false, color);
        } catch (_) {
            try {
                document.execCommand('backColor', false, color);
            } catch (_) {}
        }
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }

    function insertLink(editor) {
        const selection = window.getSelection();
        const selected = selection ? selection.toString().trim() : '';

        Popup.forum('Insert Link', [
            { key: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com' },
            { key: 'text', label: 'Text', value: selected }
        ]).then(data => {
            if (!data || !data.url) return;
            editor.focus();
            if (selected) {
                try {
                    document.execCommand('createLink', false, data.url);
                } catch (_) {}
            } else {
                const label = data.text || data.url;
                try {
                    document.execCommand('insertHTML', false, `<a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`);
                } catch (_) {}
            }
            editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
        });
    }

    function insertTable(editor) {
        Popup.forum('Insert Table', [
            { key: 'rows', label: 'Rows', type: 'number', value: '3' },
            { key: 'cols', label: 'Columns', type: 'number', value: '3' }
        ]).then(data => {
            if (!data) return;

            const rows = Math.min(10, Math.max(1, Number(data.rows) || 3));
            const cols = Math.min(10, Math.max(1, Number(data.cols) || 3));
            const cells = Array.from({ length: rows }, (_, r) =>
                `<tr>${Array.from({ length: cols }, (_, c) =>
                    r === 0 ? `<th>Header ${c + 1}</th>` : `<td>&nbsp;</td>`
                ).join('')}</tr>`
            ).join('');

            editor.focus();
            try {
                document.execCommand('insertHTML', false,
                    `<table style="border-collapse:collapse;width:100%;margin:12px 0;"><tbody>${cells}</tbody></table><p><br></p>`
                );
            } catch (_) {}
            editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
        });
    }

    async function saveDocument(win, saveAs = false) {
        const editor = win.element.querySelector('.words-editor');
        if (!editor) return false;

        const html = editor.innerHTML;
        const payload = htmlDocument(html, state.title);

        if (!saveAs && state.path && FileSystem.itemExists(state.path)) {
            const ok = FileSystem.writeFile(state.path, payload);
            if (!ok) {
                await Popup.error('Save failed', 'Words could not save the document.');
                Sounds.error();
                return false;
            }

            state.lastSavedHtml = html;
            setDirty(win, false);
            Sounds.confirm();
            updateStats(win);
            if (state.path) UserActivity.trackFileOpen(state.path, getFileDisplayName(state.path));
            return true;
        }

        const result = await SavePrompt.show({
            defaultName: `${state.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled document'}.html`,
            defaultPath: state.path ? state.path.slice(0, -1) : DEFAULT_PATH,
            extensions: [
                { value: 'html', label: 'HTML Document' },
                { value: 'txt', label: 'Text Document' },
                { value: 'md', label: 'Markdown Document' }
            ],
            parentApp: APP_ID
        });

        if (!result) return false;

        let output = payload;
        if (result.ext === 'txt') {
            output = stripHtml(html);
        } else if (result.ext === 'md') {
            output = stripHtml(html);
        }

        const fullPath = [...normalizePath(result.path), result.fullName];
        let ok;

        if (FileSystem.itemExists(fullPath)) {
            ok = FileSystem.writeFile(fullPath, output);
        } else {
            ok = FileSystem.createFile(result.path, result.fullName, output, result.ext);
        }

        if (!ok) {
            await Popup.error('Save failed', 'Words could not create the document.');
            Sounds.error();
            return false;
        }

        state.path = fullPath;
        state.title = result.fullName.replace(/\.[^.]+$/, '') || 'Untitled document';
        state.lastSavedHtml = html;
        setDirty(win, false);
        updateTitleInputs(win);
        UserActivity.trackFileOpen(fullPath, result.fullName);
        Sounds.confirm();
        return true;
    }

    function updateTitleInputs(win) {
        const titleInput = win.element.querySelector('.words-title-input');
        const titleLabel = win.element.querySelector('.words-window-title');

        if (titleInput) titleInput.value = state.title;
        if (titleLabel) titleLabel.textContent = `${state.title}${state.dirty ? ' *' : ''}`;
    }

    async function maybeSave(win) {
        if (!state.dirty) return true;

        const result = await Popup.pick('Unsaved Changes', 'Save changes before continuing?', [
            { label: 'Save' },
            { label: 'Discard' }
        ]);

        if (!result) return false;
        const label = typeof result === 'string' ? result : result.label;

        if (label === 'Save') return await saveDocument(win, false);
        return true;
    }

    async function newDocument(win) {
        if (!(await maybeSave(win))) return;

        state.title = 'Untitled document';
        state.path = null;
        state.dirty = false;
        state.lastSavedHtml = '';

        const editor = win.element.querySelector('.words-editor');
        editor.innerHTML = defaultContent();
        updateTitleInputs(win);
        updateStats(win);
        editor.focus();
        Sounds.click();
    }

    async function openDocument(win) {
        if (!(await maybeSave(win))) return;

        const children = FileSystem.getChildren(DEFAULT_PATH) || [];
        const files = children
            .filter(item => item.type !== 'folder')
            .filter(item => isTextLike([DEFAULT_PATH.join('/'), item.name]))
            .sort((a, b) => String(b.modified || '').localeCompare(String(a.modified || '')));

        if (!files.length) {
            await Popup.info('Open Document', 'No HTML, Markdown, or text documents were found in Documents.');
            return;
        }

        const selected = await Popup.pick('Open Document', 'Choose a document from Documents:', files.map(f => f.name));
        if (!selected) return;

        const path = [...DEFAULT_PATH, selected];
        const raw = FileSystem.readFile(path);

        if (raw == null) {
            await Popup.error('Open failed', 'Words could not read that document.');
            Sounds.error();
            return;
        }

        const editor = win.element.querySelector('.words-editor');
        editor.innerHTML = extractBody(raw);
        state.path = path;
        state.title = selected.replace(/\.[^.]+$/, '') || 'Untitled document';
        state.lastSavedHtml = editor.innerHTML;
        setDirty(win, false);
        updateTitleInputs(win);
        updateStats(win);
        UserActivity.trackFileOpen(path, selected);
        Sounds.info();
    }

    function printDocument(win) {
        const editor = win.element.querySelector('.words-editor');
        if (!editor) return;

        const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=900');
        if (!printWindow) {
            Popup.error('Print', 'The browser blocked the print window. Allow popups for the Windows 12 web OS.')
                .then(() => {});
            return;
        }

        printWindow.document.write(htmlDocument(editor.innerHTML, state.title));
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 150);
    }

    function setZoom(win, nextZoom) {
        state.zoom = Math.min(200, Math.max(50, nextZoom));
        const editor = win.element.querySelector('.words-editor');
        const zoomLabel = win.element.querySelector('.words-zoom-label');

        if (editor) {
            editor.style.setProperty('--words-zoom', `${state.zoom}%`);
            editor.style.zoom = `${state.zoom / 100}`;
        }

        if (zoomLabel) zoomLabel.textContent = `${state.zoom}%`;
    }

    function createToolbar() {
        const button = (action, label, iconText, shortcut = '') =>
            `<button class="words-tool" type="button" data-action="${action}" title="${escapeHtml(label)}${shortcut ? ` (${shortcut})` : ''}">${iconText}</button>`;

        return `
            <div class="words-ribbon">
                <div class="words-menu-row">
                    <div class="words-brand">
                        <div class="words-brand-icon">${icon}</div>
                        <span>Words</span>
                    </div>

                    <div class="words-title-wrap">
                        <input class="words-title-input" value="${escapeHtml(state.title)}" aria-label="Document title">
                    </div>

                    <div class="words-menu-actions">
                        ${button('new', 'New document', '＋')}
                        ${button('open', 'Open document', '📂')}
                        ${button('save', 'Save', '💾', 'Ctrl+S')}
                        ${button('save-as', 'Save as', '↥')}
                        ${button('print', 'Print', '🖨')}
                    </div>
                </div>

                <div class="words-toolbar">
                    <div class="words-tool-group">
                        ${button('undo', 'Undo', '↶', 'Ctrl+Z')}
                        ${button('redo', 'Redo', '↷', 'Ctrl+Y')}
                    </div>

                    <div class="words-divider"></div>

                    <div class="words-tool-group select-group">
                        <select data-format="fontName" class="words-select font-select" title="Font">
                            <option value="Arial">Arial</option>
                            <option value="Georgia">Georgia</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Verdana">Verdana</option>
                            <option value="Trebuchet MS">Trebuchet MS</option>
                            <option value="Courier New">Courier New</option>
                        </select>

                        <select data-format="fontSize" class="words-select size-select" title="Font size">
                            <option value="11">11</option>
                            <option value="12">12</option>
                            <option value="14">14</option>
                            <option value="16" selected>16</option>
                            <option value="18">18</option>
                            <option value="20">20</option>
                            <option value="24">24</option>
                            <option value="28">28</option>
                            <option value="32">32</option>
                            <option value="36">36</option>
                        </select>
                    </div>

                    <div class="words-divider"></div>

                    <div class="words-tool-group">
                        ${button('bold', 'Bold', '<b>B</b>', 'Ctrl+B')}
                        ${button('italic', 'Italic', '<i>I</i>', 'Ctrl+I')}
                        ${button('underline', 'Underline', '<u>U</u>', 'Ctrl+U')}
                        ${button('strikeThrough', 'Strikethrough', '<s>S</s>')}
                    </div>

                    <div class="words-tool-group">
                        <label class="words-color-picker" title="Text color">
                            <span class="color-letter">A</span>
                            <input type="color" data-color="text" value="#111111">
                        </label>
                        <label class="words-color-picker" title="Highlight">
                            <span class="highlight-letter">H</span>
                            <input type="color" data-color="highlight" value="#fff59d">
                        </label>
                    </div>

                    <div class="words-divider"></div>

                    <div class="words-tool-group">
                        ${button('justifyLeft', 'Align left', '≡')}
                        ${button('justifyCenter', 'Center', '≣')}
                        ${button('justifyRight', 'Align right', '≡')}
                        ${button('justifyFull', 'Justify', '☰')}
                    </div>

                    <div class="words-tool-group">
                        ${button('insertUnorderedList', 'Bulleted list', '•')}
                        ${button('insertOrderedList', 'Numbered list', '1.')}
                        ${button('outdent', 'Decrease indent', '⇤')}
                        ${button('indent', 'Increase indent', '⇥')}
                    </div>

                    <div class="words-divider"></div>

                    <div class="words-tool-group">
                        <select data-format="block" class="words-select block-select" title="Styles">
                            <option value="P" selected>Normal</option>
                            <option value="H1">Heading 1</option>
                            <option value="H2">Heading 2</option>
                            <option value="H3">Heading 3</option>
                            <option value="BLOCKQUOTE">Quote</option>
                        </select>
                        ${button('createLink', 'Insert link', '🔗')}
                        ${button('insertTable', 'Insert table', '▦')}
                        ${button('removeFormat', 'Clear formatting', 'Tx')}
                    </div>
                </div>
            </div>
        `;
    }

    function getContent() {
        return `
            <style>
                .words-root{
                    --words-ui:#f4f6f8;
                    --words-border:#d7dbe0;
                    --words-text:#202124;
                    --words-muted:#66707a;
                    --words-accent:#3b82f6;
                    height:100%;
                    display:flex;
                    flex-direction:column;
                    overflow:hidden;
                    background:#e9edf1;
                    color:var(--words-text);
                    font-family:Segoe UI,Arial,sans-serif;
                }
                .words-ribbon{
                    flex:none;
                    background:#ffffff;
                    border-bottom:1px solid var(--words-border);
                    box-shadow:0 1px 4px rgba(0,0,0,.08);
                    z-index:3;
                }
                .words-menu-row{
                    height:48px;
                    display:flex;
                    align-items:center;
                    gap:12px;
                    padding:0 12px;
                    border-bottom:1px solid #eceff2;
                    box-sizing:border-box;
                }
                .words-brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;min-width:96px}
                .words-brand-icon{width:22px;height:22px;display:grid;place-items:center}
                .words-brand-icon svg{width:22px;height:22px}
                .words-title-wrap{flex:1;max-width:520px}
                .words-title-input{
                    width:100%;
                    border:1px solid transparent;
                    border-radius:5px;
                    padding:6px 8px;
                    background:transparent;
                    color:#27313a;
                    font-size:14px;
                    outline:none;
                    box-sizing:border-box;
                }
                .words-title-input:hover,.words-title-input:focus{border-color:#cfd5dc;background:#f8fafc}
                .words-menu-actions{display:flex;gap:4px;margin-left:auto}
                .words-toolbar{
                    min-height:48px;
                    display:flex;
                    align-items:center;
                    gap:6px;
                    padding:6px 10px;
                    overflow-x:auto;
                    box-sizing:border-box;
                }
                .words-tool-group{display:flex;align-items:center;gap:3px}
                .words-tool{
                    min-width:30px;height:30px;border:1px solid transparent;border-radius:5px;
                    background:transparent;color:#29323a;cursor:pointer;font-size:14px;
                    display:grid;place-items:center;padding:0 7px;
                }
                .words-tool:hover{background:#eef3f8;border-color:#d9e0e7}
                .words-tool:active{background:#e2e8ef}
                .words-tool.is-dirty{color:#2563eb}
                .words-divider{height:26px;width:1px;background:#e0e4e8;margin:0 3px;flex:none}
                .words-select{
                    height:30px;border:1px solid #d7dce2;border-radius:5px;background:white;
                    color:#27313a;padding:0 7px;outline:none;
                }
                .font-select{width:150px}
                .size-select{width:68px}
                .block-select{width:125px}
                .words-color-picker{
                    width:31px;height:30px;border:1px solid transparent;border-radius:5px;
                    display:grid;grid-template-rows:15px 8px;place-items:center;cursor:pointer;
                    position:relative;
                }
                .words-color-picker:hover{background:#eef3f8;border-color:#d9e0e7}
                .words-color-picker input{position:absolute;opacity:0;width:1px;height:1px}
                .color-letter{font-weight:700;border-bottom:3px solid #111;line-height:12px}
                .highlight-letter{font-weight:700;background:#fff59d;line-height:16px;padding:0 3px}
                .words-workspace{
                    flex:1;min-height:0;overflow:auto;padding:30px 28px 18px;
                    box-sizing:border-box;display:flex;justify-content:center;
                }
                .words-paper{
                    flex:none;width:min(820px,calc(100vw - 100px));min-height:1050px;
                    background:#fff;box-shadow:0 6px 30px rgba(20,30,40,.16);
                    border:1px solid #dce1e6;box-sizing:border-box;
                }
                .words-editor{
                    min-height:1050px;
                    outline:none;
                    padding:82px 82px 100px;
                    box-sizing:border-box;
                    color:#12161a;
                    background:#fff;
                    font-family:Arial,sans-serif;
                    font-size:16px;
                    line-height:1.55;
                }
                .words-editor:focus{box-shadow:inset 0 0 0 1px rgba(59,130,246,.08)}
                .words-editor h1{font-size:32px;line-height:1.2;margin:0 0 22px}
                .words-editor h2{font-size:25px;line-height:1.25;margin:28px 0 14px}
                .words-editor h3{font-size:20px;line-height:1.3;margin:22px 0 10px}
                .words-editor p{margin:0 0 12px}
                .words-editor ul,.words-editor ol{padding-left:28px}
                .words-editor blockquote{border-left:4px solid #b9c5d1;margin:18px 0;padding:8px 16px;color:#5a6570;background:#f6f8fa}
                .words-editor a{color:#2563eb}
                .words-editor table{border-collapse:collapse;width:100%;margin:14px 0}
                .words-editor th,.words-editor td{border:1px solid #adb6bf;padding:7px;min-width:50px}
                .words-editor th{background:#edf1f5}
                .words-statusbar{
                    height:28px;flex:none;background:#f7f8f9;border-top:1px solid var(--words-border);
                    display:flex;align-items:center;padding:0 12px;font-size:12px;color:#606972;
                }
                .words-status-left{flex:1;display:flex;gap:16px}
                .words-zoom-controls{display:flex;align-items:center;gap:5px}
                .words-zoom-controls button{border:0;background:transparent;cursor:pointer;color:#4c5660;width:22px;height:22px;border-radius:4px}
                .words-zoom-controls button:hover{background:#e8edf2}
                .words-zoom-label{width:42px;text-align:center}
                .words-context-target{outline:2px solid rgba(59,130,246,.3)}
                @media (max-width:800px){
                    .words-brand{min-width:auto}
                    .words-brand span{display:none}
                    .words-title-wrap{max-width:none}
                    .words-workspace{padding:14px 8px}
                    .words-paper{width:calc(100vw - 32px)}
                    .words-editor{padding:50px 35px 70px}
                }
            </style>

            <div class="words-root">
                ${createToolbar()}

                <div class="words-workspace">
                    <div class="words-paper">
                        <div class="words-editor" contenteditable="true" spellcheck="true">${defaultContent()}</div>
                    </div>
                </div>

                <div class="words-statusbar">
                    <div class="words-status-left">
                        <span class="words-status">0 words  •  0 characters</span>
                        <span>English</span>
                    </div>
                    <div class="words-zoom-controls">
                        <button type="button" data-zoom="down" title="Zoom out">−</button>
                        <span class="words-zoom-label">100%</span>
                        <button type="button" data-zoom="up" title="Zoom in">+</button>
                    </div>
                </div>
            </div>
        `;
    }

    function wireToolbar(win) {
        const root = win.element.querySelector('.words-root');
        const editor = win.element.querySelector('.words-editor');
        if (!root || !editor) return [];

        const listeners = [];
        const on = (target, event, handler) => {
            target.addEventListener(event, handler);
            listeners.push(() => target.removeEventListener(event, handler));
        };

        root.querySelectorAll('.words-tool').forEach(tool => {
            on(tool, 'click', () => {
                const action = tool.dataset.action;

                if (action === 'new') return void newDocument(win);
                if (action === 'open') return void openDocument(win);
                if (action === 'save') return void saveDocument(win, false);
                if (action === 'save-as') return void saveDocument(win, true);
                if (action === 'print') return void printDocument(win);
                if (action === 'undo') return exec(editor, 'undo');
                if (action === 'redo') return exec(editor, 'redo');
                if (action === 'createLink') return insertLink(editor);
                if (action === 'insertTable') return insertTable(editor);

                exec(editor, action);
            });
        });

        const fontSelect = root.querySelector('[data-format="fontName"]');
        const sizeSelect = root.querySelector('[data-format="fontSize"]');
        const blockSelect = root.querySelector('[data-format="block"]');

        on(fontSelect, 'change', e => setFontName(editor, e.target.value));
        on(sizeSelect, 'change', e => setFontSize(editor, Number(e.target.value)));
        on(blockSelect, 'change', e => formatBlock(editor, e.target.value));

        root.querySelector('[data-color="text"]')?.addEventListener('input', e => applyColor(editor, e.target.value));
        root.querySelector('[data-color="highlight"]')?.addEventListener('input', e => applyHighlight(editor, e.target.value));

        const textColor = root.querySelector('[data-color="text"]');
        const highlightColor = root.querySelector('[data-color="highlight"]');
        if (textColor) listeners.push(() => textColor.removeEventListener('input', e => applyColor(editor, e.target.value)));
        if (highlightColor) listeners.push(() => highlightColor.removeEventListener('input', e => applyHighlight(editor, e.target.value)));

        on(editor, 'input', () => {
            setDirty(win, true);
            updateStats(win);
        });

        on(editor, 'keyup', () => updateStats(win));
        on(editor, 'mouseup', () => updateSelectionState(win));
        on(editor, 'keyup', () => updateSelectionState(win));

        on(editor, 'keydown', e => {
            const mod = e.ctrlKey || e.metaKey;

            if (mod && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveDocument(win, false);
                return;
            }

            if (mod && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                newDocument(win);
                return;
            }

            if (mod && e.key.toLowerCase() === 'o') {
                e.preventDefault();
                openDocument(win);
                return;
            }

            if (mod && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                printDocument(win);
                return;
            }

            if (mod && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                insertLink(editor);
                return;
            }

            if (e.key === 'Tab') {
                const active = document.activeElement;
                if (active === editor) {
                    e.preventDefault();
                    exec(editor, e.shiftKey ? 'outdent' : 'indent');
                }
            }
        });

        const zoomDown = root.querySelector('[data-zoom="down"]');
        const zoomUp = root.querySelector('[data-zoom="up"]');
        on(zoomDown, 'click', () => setZoom(win, state.zoom - 10));
        on(zoomUp, 'click', () => setZoom(win, state.zoom + 10));

        on(root.querySelector('.words-title-input'), 'change', e => {
            const next = e.target.value.trim() || 'Untitled document';
            if (next !== state.title) {
                state.title = next;
                setDirty(win, true);
                updateTitleInputs(win);
            }
        });

        on(editor, 'contextmenu', e => {
            e.preventDefault();
            ContextMenu.show(e.clientX, e.clientY, [
                { label: 'Undo', icon: '↶', shortcut: 'Ctrl+Z', action: () => exec(editor, 'undo') },
                { label: 'Redo', icon: '↷', shortcut: 'Ctrl+Y', action: () => exec(editor, 'redo') },
                'separator',
                { label: 'Cut', icon: '✂', shortcut: 'Ctrl+X', action: () => exec(editor, 'cut') },
                { label: 'Copy', icon: '⧉', shortcut: 'Ctrl+C', action: () => exec(editor, 'copy') },
                { label: 'Paste', icon: '📋', shortcut: 'Ctrl+V', action: () => exec(editor, 'paste') },
                'separator',
                { label: 'Clear formatting', icon: 'Tx', action: () => exec(editor, 'removeFormat') }
            ]);
        });

        setZoom(win, state.zoom);
        updateStats(win);
        updateSelectionState(win);

        return listeners;
    }

    function updateSelectionState(win) {
        const editor = win.element.querySelector('.words-editor');
        if (!editor) return;

        const boldBtn = win.element.querySelector('[data-action="bold"]');
        const italicBtn = win.element.querySelector('[data-action="italic"]');
        const underlineBtn = win.element.querySelector('[data-action="underline"]');

        try {
            boldBtn?.classList.toggle('active', document.queryCommandState('bold'));
            italicBtn?.classList.toggle('active', document.queryCommandState('italic'));
            underlineBtn?.classList.toggle('active', document.queryCommandState('underline'));
        } catch (_) {}
    }

    function launch() {
        const win = WindowManager.createWindow(
            APP_ID,
            'Words',
            icon,
            getContent(),
            {
                width: 1120,
                height: 780,
                minWidth: 700,
                minHeight: 520,
                saveState: true
            }
        );

        docCounter += 1;
        UserActivity.trackAppOpen(APP_ID);

        const editor = win.element.querySelector('.words-editor');
        state.title = 'Untitled document';
        state.path = null;
        state.dirty = false;
        state.lastSavedHtml = editor?.innerHTML || '';

        const listeners = wireToolbar(win);

        // The window manager owns the actual close button. Hooking the DOM button
        // lets us clean our listeners and ask about unsaved changes before close.
        const closeBtn = win.element.querySelector('.close-btn');
        if (closeBtn) {
            const guardedClose = async (e) => {
                if (!state.dirty) return;

                e.preventDefault();
                const shouldSave = await maybeSave(win);
                if (!shouldSave) return;

                listeners.forEach(cleanup => cleanup());
                WindowManager.closeWindow(win.id);
            };

            closeBtn.addEventListener('click', guardedClose);
            listeners.push(() => closeBtn.removeEventListener('click', guardedClose));
        }

        return win;
    }

    return { launch };
})();

export default Words;
