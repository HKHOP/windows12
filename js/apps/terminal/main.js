import WindowManager from '../../modules/windowManager.js';
import FileSystem from '../../modules/fileSystem.js';
import SystemConfig from '../../modules/systemConfig.js';
import BatchEngine from '../../modules/batchEngine.js';
import VBEngine from '../../modules/vbsEngine.js';
import AppIcons from '../../modules/appIcons.js';

const Terminal = (() => {
    const icon = AppIcons.get('terminal');

    const HOME = ['/', 'users', 'default'];

    function launch() {
        let cwd = [...HOME];
        let history = [];
        let historyIdx = -1;

        const win = WindowManager.createWindow('terminal', 'Terminal', icon, '', {
            width: 700, height: 450, minWidth: 400, minHeight: 250
        });

        const el = win.element;
        const body = el.querySelector('.window-body');
        body.style.cssText = 'margin:0;padding:0;background:#0C0C0C;font-family:"Cascadia Mono","Consolas","Courier New",monospace;font-size:13px;overflow:hidden;display:flex;flex-direction:column;height:100%;user-select:text;-webkit-user-select:text;';

        body.innerHTML = `
            <div class="term-output" style="flex:1;overflow-y:auto;padding:12px 14px;color:#CCCCCC;white-space:pre-wrap;word-break:break-all;line-height:1.4;user-select:text;-webkit-user-select:text;"></div>
            <div class="term-input-row" style="display:flex;padding:0 14px 10px;align-items:center;user-select:none;-webkit-user-select:none;">
                <span class="term-prompt" style="color:#569CD6;white-space:pre;user-select:none;-webkit-user-select:none;"></span>
                <input class="term-input" type="text" style="flex:1;background:transparent;border:none;outline:none;color:#CCCCCC;font-family:inherit;font-size:inherit;caret-color:#CCCCCC;margin-left:4px;" spellcheck="false" autocomplete="off" autofocus>
            </div>
        `;

        const output = body.querySelector('.term-output');
        const input = body.querySelector('.term-input');
        const promptEl = body.querySelector('.term-prompt');

        output.addEventListener('selectstart', (e) => e.stopPropagation());
        output.addEventListener('mousedown', (e) => e.stopPropagation());

        function getPrompt() {
            const p = cwd.join('/').replace('//', '/');
            const short = p === '/' + HOME.slice(1).join('/') ? '~' : '~' + p.replace('/' + HOME.slice(1).join('/'), '');
            return `${SystemConfig.get('userName')}@PC ${short}> `;
        }

        function updatePrompt() {
            promptEl.textContent = getPrompt();
        }

        function escHtml(s) {
            return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function stripQuotes(s) {
            const t = String(s ?? '').trim();
            if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
                return t.slice(1, -1);
            }
            return t;
        }

        // Split on whitespace, respecting single/double quotes.
        function splitTokens(text) {
            const out = [];
            let cur = '';
            let q = null;
            for (const ch of String(text ?? '')) {
                if (q) {
                    if (ch === q) q = null;
                    else cur += ch;
                } else if (ch === '"' || ch === "'") {
                    q = ch;
                } else if (/\s/.test(ch)) {
                    if (cur) { out.push(cur); cur = ''; }
                } else {
                    cur += ch;
                }
            }
            if (cur) out.push(cur);
            return out;
        }

        // First whitespace-separated token + the verbatim remainder.
        function splitFirst(text) {
            const s = String(text ?? '');
            let i = 0;
            while (i < s.length && /\s/.test(s[i])) i++;
            let first = '';
            if (s[i] === '"' || s[i] === "'") {
                const q = s[i++];
                const start = i;
                while (i < s.length && s[i] !== q) i++;
                first = s.slice(start, i);
                if (s[i] === q) i++;
            } else {
                const start = i;
                while (i < s.length && !/\s/.test(s[i])) i++;
                first = s.slice(start, i);
            }
            return { first, rest: s.slice(i).replace(/^\s+/, '') };
        }

        function print(text) {
            for (const ln of String(text ?? '').split('\n')) {
                const div = document.createElement('div');
                div.textContent = ln;
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

        function resolvePath(input) {
            let s = stripQuotes(input);
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

        // Create every missing folder along targetDir (array path). Returns bool.
        function ensureParents(targetDir) {
            let cur = ['/'];
            for (const seg of targetDir.slice(1)) {
                const next = [...cur, seg];
                if (!FileSystem.itemExists(next)) {
                    if (!FileSystem.createFolder(cur, seg)) return false;
                } else if (!FileSystem.isFolder(next)) {
                    return false;
                }
                cur = next;
            }
            return true;
        }

        function clearOutput() {
            output.innerHTML = '';
        }

        const BATCH_COMMANDS = ['type', 'copy', 'xcopy', 'move', 'del', 'erase', 'ren', 'rename', 'md', 'mkdir', 'rd', 'rmdir', 'dir', 'set', 'if', 'for', 'call', 'goto', 'exit', 'shift', 'pause', 'title', 'color', 'timeout', 'choice', 'pushd', 'popd', 'path', 'prompt', 'vol', 'date', 'time', 'tree', 'find', 'sort', 'more', 'fc', 'where', 'chcp', 'ver', 'systeminfo', 'ping', 'ipconfig', 'help', 'cls', 'echo'];

        const commands = {
            help() {
                print('Terminal commands:');
                print('  help              Show this help message');
                print('  ls [path]         List directory contents');
                print('  dir               Same as ls (supports DIR switches via CMD fallback)');
                print('  cd <path>         Change directory (cd.., cd\\ and quotes supported)');
                print('  pwd               Print working directory');
                print('  cat <file>        Display file contents');
                print('  echo <text>       Print text (echo hi > file works too)');
                print('  mkdir <dir...>    Create directories (nested paths ok)');
                print('  touch <file>      Create an empty file');
                print('  write <file> <text>  Write text to a file');
                print('  rm [-r] <path>    Delete file or folder (-r for folders)');
                print('  rename <old> <new>   Rename a file or folder');
                print('  run <file>        Run a .bat/.cmd/.vbs script');
                print('  script.bat args   Run a batch script directly');
                print('  clear | cls       Clear the terminal');
                print('  history           Show command history');
                print('  whoami            Show current user');
                print('  date              Show current date/time');
                print('  neofetch          Show system info');
                print('  exit              Close the terminal');
                print('');
                print('Anything else (copy, move, del, type, find, sort, set, ... and');
                print('batch operators & && || | > >> <) runs through the CMD engine.');
                print('Tip: Tab completes names, Up/Down browses history.');
            },

            ls(args) {
                const toks = splitTokens(args || '').filter(t => !t.startsWith('-'));
                const target = toks.length ? resolvePath(toks[0]) : [...cwd];
                if (!FileSystem.isFolder(target)) {
                    print(`ls: cannot access '${toks[0]}': No such directory`);
                    return;
                }
                const children = FileSystem.getChildren(target);
                if (children.length === 0) {
                    print('(empty directory)');
                    return;
                }
                const lines = children.map(e => {
                    const isDir = e.type === 'folder';
                    const name = isDir ? e.name + '/' : e.name;
                    const color = isDir ? '#569CD6' : '#D4D4D4';
                    return `<span style="color:${color}">${escHtml(name)}</span>`;
                });
                printHTML(lines.join('  '));
            },

            dir(args) {
                if (args && /[/-]/.test(args[0])) runFallback('dir ' + args);
                else commands.ls(args);
            },

            cd(args) {
                const raw = stripQuotes(args || '');
                if (!raw || raw === '~') {
                    cwd = [...HOME];
                    updatePrompt();
                    return;
                }
                if (raw === '-') {
                    print('cd: OLDPWD not set');
                    return;
                }
                const low = raw.toLowerCase();
                if (low === '/d') return;
                if (low.startsWith('/d ')) {
                    commands.cd(raw.slice(3));
                    return;
                }
                const target = resolvePath(raw);
                if (!FileSystem.isFolder(target)) {
                    print(`cd: no such file or directory: ${args}`);
                    return;
                }
                cwd = target;
                updatePrompt();
            },

            pwd() {
                print('/' + cwd.slice(1).join('/'));
            },

            cat(args) {
                const toks = splitTokens(args || '');
                if (!toks.length) { print('cat: missing file operand'); return; }
                for (const name of toks) {
                    const target = resolvePath(name);
                    const node = FileSystem.getNode(target);
                    if (!node) { print(`cat: ${name}: No such file or directory`); continue; }
                    if (node.type === 'folder') { print(`cat: ${name}: Is a directory`); continue; }
                    if (FileSystem.isBlobFile(target)) { print(`cat: ${name}: binary file, cannot display as text`); continue; }
                    const content = FileSystem.readFile(target);
                    print(content !== null && content !== undefined ? content : '(empty file)');
                }
            },

            echo(args) {
                if (args === undefined || args === '') { print(''); return; }
                print(stripQuotes(args));
            },

            mkdir(args) {
                const toks = splitTokens(args || '');
                if (!toks.length) { print('mkdir: missing operand'); return; }
                for (const name of toks) {
                    const target = resolvePath(name);
                    if (FileSystem.itemExists(target)) {
                        print(`mkdir: cannot create directory '${name}': File exists`);
                        continue;
                    }
                    if (!ensureParents(target)) print(`mkdir: cannot create directory '${name}': Invalid path`);
                }
            },

            touch(args) {
                const toks = splitTokens(args || '');
                if (!toks.length) { print('touch: missing file operand'); return; }
                for (const name of toks) {
                    const target = resolvePath(name);
                    if (FileSystem.itemExists(target)) continue;
                    if (!ensureParents(target.slice(0, -1))) {
                        print(`touch: cannot create file '${name}': Invalid path`);
                        continue;
                    }
                    const leaf = target[target.length - 1];
                    const ext = leaf.includes('.') ? leaf.split('.').pop() : '';
                    if (!FileSystem.createFile(target.slice(0, -1), leaf, '', ext)) {
                        print(`touch: cannot create file '${name}': File exists or invalid path`);
                    }
                }
            },

            write(args) {
                if (!args) { print('write: usage: write <file> <text>'); return; }
                const { first, rest } = splitFirst(args);
                if (!first || !rest) { print('write: usage: write <file> <text>'); return; }
                const target = resolvePath(first);
                if (!ensureParents(target.slice(0, -1))) {
                    print(`write: cannot write '${first}': Invalid path`);
                    return;
                }
                if (!FileSystem.itemExists(target)) {
                    const leaf = target[target.length - 1];
                    const ext = leaf.includes('.') ? leaf.split('.').pop() : '';
                    FileSystem.createFile(target.slice(0, -1), leaf, rest, ext);
                } else {
                    FileSystem.writeFile(target, rest);
                }
            },

            rm(args) {
                const toks = splitTokens(args || '');
                if (!toks.length) { print('rm: missing operand'); return; }
                let recursive = false;
                const paths = [];
                for (const t of toks) {
                    if (/^(-r(f)?|--recursive|\/s)$/i.test(t)) recursive = true;
                    else paths.push(t);
                }
                if (!paths.length) { print('rm: missing operand'); return; }
                for (const p of paths) {
                    const target = resolvePath(p);
                    if (!FileSystem.itemExists(target)) { print(`rm: ${p}: No such file or directory`); continue; }
                    const node = FileSystem.getNode(target);
                    if (node && node.type === 'folder') {
                        const kids = FileSystem.getChildren(target);
                        if (kids.length && !recursive) { print(`rm: ${p}: is a directory (use rm -r)`); continue; }
                    }
                    FileSystem.deleteItem(target);
                }
            },

            rename(args) {
                const toks = splitTokens(args || '');
                if (toks.length < 2) { print('rename: usage: rename <old> <new>'); return; }
                const oldPath = resolvePath(toks[0]);
                const ok = FileSystem.renameItem(oldPath, toks[1].split('/').pop().split('\\').pop());
                if (!ok) print(`rename: cannot rename '${toks[0]}' to '${toks[1]}'`);
            },

            clear() {
                output.innerHTML = '';
            },

            cls() { commands.clear(); },

            exit() {
                WindowManager.closeWindow(win.id);
            },

            history() {
                history.forEach((cmd, i) => print(`  ${i + 1}  ${cmd}`));
            },

            whoami() {
                print(SystemConfig.get('userName'));
            },

            date() {
                print(new Date().toString());
            },

            neofetch() {
                const user = SystemConfig.get('userName');
                const w = window.innerWidth;
                const h = window.innerHeight;
                const theme = SystemConfig.get('darkMode') ? 'Dark' : 'Light';
                const art = ['        _____', '       /     \\', '      | () () |', '      |  ___  |', '      |       |', '       \\_____/'];
                const info = [`${user}@PC`, '----------------', 'OS: Windows 12', `Resolution: ${w}x${h}`, 'Shell: Terminal', `Theme: ${theme}`];
                printHTML(art.map((a, i) => {
                    const label = escHtml(info[i]);
                    return `<span style="color:#569CD6">${a}</span>         ${label}`;
                }).join('<br>'));
            }
        };

        function runBatch(filePath, args) {
            const target = resolvePath(filePath);
            const node = FileSystem.getNode(target);
            if (!node) {
                print(`'${filePath}' is not recognized as an internal or external command.`);
                return;
            }
            if (node.type === 'folder') {
                print(`'${filePath}' is a directory.`);
                return;
            }
            const content = FileSystem.readFile(target);
            if (content === null || content === undefined) {
                print(`Error reading '${filePath}'.`);
                return;
            }

            let lastTitle = null;
            const ESC = String.fromCharCode(27);
            const batchPrint = (text) => {
                if (text === ESC + 'CLS') {
                    clearOutput();
                    return;
                }
                if (text && text.startsWith(ESC + 'TITLE:')) {
                    lastTitle = text.substring((ESC + 'TITLE:').length);
                    const titleEl = el.querySelector('.window-title');
                    if (titleEl) titleEl.textContent = lastTitle;
                    return;
                }
                if (text && text.startsWith(ESC + 'COLOR:')) {
                    return;
                }
                print(text);
            };

            const batchGetCwd = () => [...cwd];
            const batchSetCwd = (newCwd) => { cwd = newCwd; };

            const engine = BatchEngine.create(batchPrint, batchGetCwd, batchSetCwd);
            engine.run(content, args);
            updatePrompt();
        }

        function runVBS(filePath, args) {
            const target = resolvePath(filePath);
            const node = FileSystem.getNode(target);
            if (!node) {
                print(`'${filePath}' is not recognized as an internal or external command.`);
                return;
            }
            if (node.type === 'folder') {
                print(`'${filePath}' is a directory.`);
                return;
            }
            const content = FileSystem.readFile(target);
            if (content === null || content === undefined) {
                print(`Error reading '${filePath}'.`);
                return;
            }

            const vbsPrint = (text) => {
                if (text === String.fromCharCode(27) + 'CLS') {
                    clearOutput();
                    return;
                }
                print(text);
            };

            const vbsGetCwd = () => [...cwd];
            const vbsSetCwd = (newCwd) => { cwd = newCwd; };

            const engine = VBEngine.create(vbsPrint, vbsGetCwd, vbsSetCwd);
            engine.run(content, args);
            updatePrompt();
        }

        // Anything the Terminal doesn't implement itself runs through the
        // real CMD engine, so copy/move/del/type/set/operators work here too.
        function runFallback(line) {
            const ESC = String.fromCharCode(27);
            const fallbackPrint = (text) => {
                if (text === ESC + 'CLS') { clearOutput(); return; }
                if (text && text.startsWith(ESC + 'TITLE:')) {
                    const titleEl = el.querySelector('.window-title');
                    if (titleEl) titleEl.textContent = text.substring((ESC + 'TITLE:').length);
                    return;
                }
                if (text && text.startsWith(ESC + 'COLOR:')) return;
                print(text);
            };
            const engine = BatchEngine.create(fallbackPrint, () => [...cwd], (nc) => { cwd = nc; });
            // "@" suppresses the engine's own echo — the Terminal already
            // echoed the typed line above.
            engine.run(line.startsWith('@') ? line : '@' + line);
            updatePrompt();
        }

        function execute(raw) {
            const trimmed = raw.trim();
            if (!trimmed) return;

            history.push(trimmed);
            historyIdx = history.length;

            // Keep the original case for paths; only the command word itself
            // is matched case-insensitively.
            const { first: rawCmd, rest } = splitFirst(trimmed);
            const cmd = rawCmd.toLowerCase();
            const args = rest || undefined;

            // cd.. / cd\ without a space, like real CMD.
            if (cmd === 'cd..') { commands.cd('..'); return; }
            if (cmd === 'cd\\') { cwd = ['/']; updatePrompt(); return; }

            if (cmd.endsWith('.bat') || cmd.endsWith('.cmd')) {
                runBatch(rawCmd, args ? splitTokens(args) : []);
                return;
            }

            if (cmd.endsWith('.vbs') || cmd.endsWith('.vbe')) {
                runVBS(rawCmd, args ? splitTokens(args) : []);
                return;
            }

            if (cmd === 'run') {
                if (!args) { print('run: usage: run <script.bat|script.vbs> [args]'); return; }
                const { first: scriptFile, rest: scriptRest } = splitFirst(args);
                const scriptArgs = scriptRest ? splitTokens(scriptRest) : [];
                const low = scriptFile.toLowerCase();
                if (low.endsWith('.vbs') || low.endsWith('.vbe')) {
                    runVBS(scriptFile, scriptArgs);
                } else {
                    runBatch(scriptFile, scriptArgs);
                }
                return;
            }

            // "help <topic>" shows the CMD help for batch commands.
            if (cmd === 'help' && args) { runFallback(trimmed); return; }

            const fn = commands[cmd];
            // Batch-native commands containing operators (& && || | > >> <)
            // run through the real engine so chaining/redirection work.
            if (fn && !(BATCH_COMMANDS.includes(cmd) && /[&|<>]/.test(trimmed))) {
                fn(args);
            } else {
                runFallback(trimmed);
            }
        }

        function tabComplete() {
            const val = input.value;
            const endsWithSpace = /\s$/.test(val);
            const trimmed = val.replace(/^\s+/, '');
            const pieces = trimmed === '' ? [] : trimmed.split(/\s+/);
            const completingCommand = pieces.length === 0 || (pieces.length === 1 && !endsWithSpace);

            if (completingCommand) {
                const frag = (pieces[0] || '').toLowerCase();
                const names = [...new Set([...Object.keys(commands), ...BATCH_COMMANDS, 'run'])];
                const hits = names.filter(n => n.startsWith(frag)).sort();
                if (hits.length === 1) {
                    input.value = (val.match(/^\s*/) || [''])[0] + hits[0] + ' ';
                } else if (hits.length > 1) {
                    const common = longestCommonPrefix(hits);
                    if (common.length > frag.length) {
                        input.value = (val.match(/^\s*/) || [''])[0] + common;
                    } else {
                        printHTML(`<span style="color:#8e8e8e">${hits.map(escHtml).join('  ')}</span>`);
                    }
                }
                return;
            }

            // Path completion for the last fragment.
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
                    printHTML(hits.map(k => `<span style="color:${k.type === 'folder' ? '#569CD6' : '#D4D4D4'}">${escHtml(k.name + (k.type === 'folder' ? '/' : ''))}</span>`).join('  '));
                }
            }
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

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = input.value;
                print(getPrompt() + val);
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
                commands.clear();
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
        print('Windows 12 Terminal');
        print("Type 'help' for available commands.\n");
        input.focus();
    }

    return { launch };
})();

export default Terminal;
