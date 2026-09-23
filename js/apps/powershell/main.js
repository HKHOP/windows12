import WindowManager from '../../modules/windowManager.js';
import FileSystem from '../../modules/fileSystem.js';
import PowershellEngine from '../../modules/powershellEngine.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';
import Notifications from '../../modules/notifications.js';
import Popup from '../../modules/popup.js';
import { Taskbar } from '../../modules/taskbar.js';

const PowerShell = (() => {
    const icon = AppIcons.get('powershell');

    // Lazy on purpose: the current user isn't resolved at module-eval time.
    const DATA_PATH = () => Users.appData('powershell');
    const HISTORY_FILE = 'console_history.json';

    function ensureDataDir() {
        try {
            if (!FileSystem.itemExists(DATA_PATH())) {
                FileSystem.createFolder(Users.home(['AppData']), 'powershell');
            }
        } catch { /* best effort */ }
    }

    function loadConsoleHistory() {
        try {
            ensureDataDir();
            const raw = FileSystem.readFile([...DATA_PATH(), HISTORY_FILE]);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) return arr.filter(x => typeof x === 'string').slice(-500);
            }
        } catch { /* corrupt -> fresh */ }
        return [];
    }

    let historySaveTimer = null;
    function saveConsoleHistory(list) {
        if (historySaveTimer) clearTimeout(historySaveTimer);
        historySaveTimer = setTimeout(() => {
            try {
                ensureDataDir();
                const json = JSON.stringify(list.slice(-500));
                const full = [...DATA_PATH(), HISTORY_FILE];
                if (FileSystem.itemExists(full)) FileSystem.writeFile(full, json);
                else FileSystem.createFile(DATA_PATH(), HISTORY_FILE, json, 'json');
            } catch { /* best effort */ }
            historySaveTimer = null;
        }, 500);
    }

    function launch(initialScript) {
        let cwd = [...Users.home()];
        const seededHistory = loadConsoleHistory();

        const win = WindowManager.createWindow('powershell', 'Windows PowerShell', icon, '', {
            width: 760, height: 480, minWidth: 420, minHeight: 260
        });

        const el = win.element;
        const body = el.querySelector('.window-body');
        body.style.cssText = 'margin:0;padding:0;background:#012456;font-family:"Cascadia Mono","Consolas","Courier New",monospace;font-size:13px;overflow:hidden;display:flex;flex-direction:column;height:100%;user-select:text;-webkit-user-select:text;';

        body.innerHTML = `
            <div class="ps-output" style="flex:1;overflow-y:auto;padding:12px 14px;color:#F2F2F2;white-space:pre-wrap;word-break:break-all;line-height:1.4;user-select:text;-webkit-user-select:text;"></div>
            <div class="ps-input-row" style="display:flex;padding:0 14px 10px;align-items:center;user-select:none;-webkit-user-select:none;">
                <span class="ps-prompt" style="color:#F2F2F2;white-space:pre;user-select:none;-webkit-user-select:none;"></span>
                <input class="ps-input" type="text" style="flex:1;background:transparent;border:none;outline:none;color:#F2F2F2;font-family:inherit;font-size:inherit;caret-color:#F2F2F2;margin-left:4px;" spellcheck="false" autocomplete="off" autofocus>
            </div>
        `;

        const output = body.querySelector('.ps-output');
        const input = body.querySelector('.ps-input');
        const promptEl = body.querySelector('.ps-prompt');

        output.addEventListener('selectstart', (e) => e.stopPropagation());
        output.addEventListener('mousedown', (e) => e.stopPropagation());

        let history = [...seededHistory];
        let historyIdx = history.length;

        const engine = PowershellEngine.create(
            (text) => print(text),
            () => [...cwd],
            (nc) => { cwd = nc; updatePrompt(); },
            {
                shell: 'powershell',
                allowNet: true,
                launchApp: (appId) => {
                    try { Taskbar.openApp(String(appId)); return true; }
                    catch { return false; }
                },
                getProcesses: () => {
                    try {
                        return WindowManager.getAllWindows().map(w => ({ name: w.appId || w.title, id: w.id }));
                    } catch { return []; }
                },
                killProcess: (pid) => {
                    try {
                        if (typeof pid === 'string' && pid.startsWith('window-')) {
                            WindowManager.closeWindow(pid);
                            return true;
                        }
                        const wins = WindowManager.getAllWindows().filter(w => w.appId === pid || w.id === pid);
                        wins.forEach(w => WindowManager.closeWindow(w.id));
                        return wins.length > 0;
                    } catch { return false; }
                },
                onNotify: (title, msg) => {
                    try { Notifications.info(title, msg, { appId: 'powershell' }); }
                    catch { /* toasts unavailable */ }
                },
                readHost: (prompt) => Popup.textbox('Windows PowerShell', prompt),
                onHistory: (line) => {
                    history.push(line);
                    history = history.slice(-500);
                    historyIdx = history.length;
                    saveConsoleHistory(history);
                }
            }
        );
        try { engine.setVar('HISTORY', [...seededHistory]); } catch { /* noop */ }

        function getPrompt() {
            let display = 'C:\\';
            try { display = engine.getCwdDisplay(); } catch { /* fallback */ }
            return `PS ${display}> `;
        }

        function updatePrompt() {
            promptEl.textContent = getPrompt();
        }

        function escHtml(s) {
            return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function print(text) {
            const ESC = String.fromCharCode(27);
            if (text === ESC + 'CLS' || text === 'CLS') {
                output.innerHTML = '';
                return;
            }
            const isErr = String(text ?? '').startsWith('PS-ERROR: ');
            const clean = isErr ? String(text).slice('PS-ERROR: '.length) : String(text ?? '');
            for (const ln of clean.split('\n')) {
                const div = document.createElement('div');
                div.textContent = ln;
                if (isErr) div.style.color = '#FF7B72';
                output.appendChild(div);
            }
            output.scrollTop = output.scrollHeight;
        }

        function printHTML(html) {
            const div = document.createElement('div');
            div.innerHTML = html;
            output.appendChild(div);
            output.scrollTop = output.scrollHeight;
        }

        function stripQuotes(s) {
            const t = String(s ?? '').trim();
            if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
                return t.slice(1, -1);
            }
            return t;
        }

        function execute(raw) {
            const trimmed = raw.trim();
            if (!trimmed) return;
            print(getPrompt() + raw);
            try {
                engine.run(trimmed);
            } catch (e) {
                print('PS-ERROR: ' + (e && e.message ? e.message : String(e)));
            }
            updatePrompt();
        }

        function resolvePath(input) {
            let s = stripQuotes(input);
            const HOME = Users.home();
            if (!s || s === '~') return [...HOME];
            s = s.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
            let parts;
            if (s.startsWith('/')) {
                parts = s.split('/').filter(Boolean);
            } else if (s === '~' || s.startsWith('~/')) {
                parts = [...HOME.slice(1), ...s.slice(2).split('/').filter(Boolean)];
            } else {
                parts = [...cwd.slice(1), ...s.split('/').filter(Boolean)];
            }
            const resolved = [];
            for (const part of parts) {
                if (part === '.' || part === '') continue;
                if (part === '..') { resolved.pop(); continue; }
                resolved.push(part);
            }
            return ['/', ...resolved];
        }

        function longestCommonPrefix(words) {
            if (!words.length) return '';
            let pre = words[0];
            for (let i = 1; i < words.length; i++) {
                let j = 0;
                const a = pre.toLowerCase(), b = words[i].toLowerCase();
                while (j < a.length && j < b.length && a[j] === b[j]) j++;
                pre = pre.slice(0, j);
                if (!pre) break;
            }
            return pre;
        }

        function tabComplete() {
            const val = input.value;
            const endsWithSpace = /\s$/.test(val);
            const trimmed = val.replace(/^\s+/, '');
            const pieces = trimmed === '' ? [] : trimmed.split(/\s+/);
            const completingCommand = pieces.length === 0 || (pieces.length === 1 && !endsWithSpace);

            if (completingCommand) {
                const frag = (pieces[0] || '').replace(/^-/, '');
                let hits = [];
                try { hits = engine.completeCommand(frag); } catch { hits = []; }
                if (hits.length === 1) {
                    input.value = (val.match(/^\s*/) || [''])[0] + hits[0] + ' ';
                } else if (hits.length > 1) {
                    const common = longestCommonPrefix(hits);
                    if (common.length > frag.length) {
                        input.value = (val.match(/^\s*/) || [''])[0] + common;
                    } else {
                        printHTML(`<span style="color:#9CDCFE">${hits.map(escHtml).join('  ')}</span>`);
                    }
                }
                return;
            }

            const rawFrag = endsWithSpace ? '' : pieces[pieces.length - 1];
            const head = endsWithSpace ? val : val.slice(0, val.length - rawFrag.length);
            const frag = stripQuotes(rawFrag).replace(/\\/g, '/');
            const slash = frag.lastIndexOf('/');
            let dir = [...cwd];
            let base = frag;
            let prefix = '';
            if (slash >= 0) {
                prefix = frag.slice(0, slash + 1);
                base = frag.slice(slash + 1);
                dir = resolvePath(frag.slice(0, slash) || '/');
            }
            if (!FileSystem.isFolder(dir)) return;
            const kids = FileSystem.getChildren(dir) || [];
            const hits = kids.filter(k => k.name.toLowerCase().startsWith(base.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
            if (hits.length === 1) {
                const done = prefix + hits[0].name + (hits[0].type === 'folder' ? '/' : (/\s/.test(hits[0].name) ? '' : ' '));
                input.value = head + (/\s/.test(done) && !/^"/.test(rawFrag) ? `"${done.trimEnd()}"` + (done.endsWith(' ') ? ' ' : '') : done);
            } else if (hits.length > 1) {
                const names = hits.map(k => k.name);
                const common = longestCommonPrefix(names);
                if (common.length > base.length) {
                    input.value = head + prefix + common;
                } else {
                    printHTML(hits.map(k => `<span style="color:${k.type === 'folder' ? '#9CDCFE' : '#F2F2F2'}">${escHtml(k.name + (k.type === 'folder' ? '/' : ''))}</span>`).join('  '));
                }
            }
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = input.value;
                input.value = '';
                execute(val);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (history.length > 0 && historyIdx > 0) {
                    historyIdx--;
                    input.value = history[historyIdx];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIdx < history.length - 1) {
                    historyIdx++;
                    input.value = history[historyIdx];
                } else {
                    historyIdx = history.length;
                    input.value = '';
                }
            } else if (e.key === 'l' && e.ctrlKey) {
                e.preventDefault();
                output.innerHTML = '';
            } else if (e.key === 'c' && e.ctrlKey) {
                e.preventDefault();
                print(getPrompt() + input.value + '^C');
                input.value = '';
            } else if (e.key === 'Tab') {
                e.preventDefault();
                tabComplete();
            }
        });

        el.addEventListener('click', (e) => {
            if (e.target.closest('.window-header') || e.target.closest('.window-controls')) return;
            const sel = window.getSelection().toString();
            if (!sel) input.focus();
        });

        updatePrompt();
        print('Windows PowerShell');
        print('Copyright (C) Microsoft Corporation. All rights reserved. (Simulator replica)');
        print('');
        print("Type 'Get-Help' for help, 'Get-Command' to list cmdlets.\n");

        if (initialScript) {
            print(getPrompt() + initialScript.split('\n')[0] + (initialScript.includes('\n') ? ' ...' : ''));
            try {
                const vals = engine.runScriptContent(initialScript, null, []) || [];
                engine.formatValues(vals).forEach((ln) => print(ln));
            } catch (e) {
                print('PS-ERROR: ' + (e && e.message ? e.message : String(e)));
            }
            updatePrompt();
        }
        input.focus();
    }

    // File association: double-clicking a .ps1/.psm1 runs it in a new window.
    function open(path, content) {
        launch(content ?? '');
    }

    return { launch, open };
})();

export default PowerShell;
