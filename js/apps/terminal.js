import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';
import SystemConfig from '../modules/systemConfig.js';
import BatchEngine from '../modules/batchEngine.js';
import VBEngine from '../modules/vbsEngine.js';

const Terminal = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="2" fill="#0C0C0C"/><polyline points="6 9 10 12 6 15" stroke="#CCCCCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="18" y2="15" stroke="#CCCCCC" stroke-width="2" stroke-linecap="round"/></svg>`;

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

        function print(text) {
            output.textContent += text + '\n';
            output.scrollTop = output.scrollHeight;
        }

        function resolvePath(input) {
            if (!input) return [...cwd];
            let parts;
            if (input.startsWith('/')) {
                parts = input.split('/').filter(Boolean);
            } else if (input.startsWith('~/')) {
                parts = [...HOME.slice(1), ...input.slice(2).split('/').filter(Boolean)];
            } else {
                parts = [...cwd.slice(1), ...input.split('/').filter(Boolean)];
            }

            const resolved = [];
            for (const part of parts) {
                if (part === '.') continue;
                if (part === '..') { resolved.pop(); continue; }
                resolved.push(part);
            }
            return ['/', ...resolved];
        }

        function formatEntry(entry) {
            const isDir = entry.type === 'folder';
            const name = isDir ? entry.name + '/' : entry.name;
            const color = isDir ? '#569CD6' : '#CCCCCC';
            return `<span style="color:${color}">${name}</span>`;
        }

        const commands = {
            help() {
                print('Available commands:');
                print('  help              Show this help message');
                print('  ls / dir          List directory contents');
                print('  cd <path>         Change directory');
                print('  pwd               Print working directory');
                print('  cat <file>        Display file contents');
                print('  echo <text>       Print text');
                print('  mkdir <name>      Create a directory');
                print('  touch <name>      Create an empty file');
                print('  write <file> <text>  Write text to a file');
                print('  rm <path>         Delete file or folder');
                print('  rename <old> <new>   Rename a file or folder');
                print('  run <file.bat>    Run a batch script');
                print('  clear             Clear the terminal');
                print('  history           Show command history');
                print('  whoami            Show current user');
                print('  date              Show current date/time');
                print('  neofetch          Show system info');
            },

            ls() {
                const children = FileSystem.getChildren(cwd);
                if (children.length === 0) {
                    print('(empty directory)');
                    return;
                }
                const lines = children.map(e => {
                    const isDir = e.type === 'folder';
                    const name = isDir ? e.name + '/' : e.name;
                    const color = isDir ? '#569CD6' : '#D4D4D4';
                    return `<span style="color:${color}">${name}</span>`;
                });
                print(lines.join('  '));
            },

            dir() { commands.ls(); },

            cd(args) {
                if (!args || args === '~') {
                    cwd = [...HOME];
                    updatePrompt();
                    return;
                }
                if (args === '-') {
                    print('cd: OLDPWD not set');
                    return;
                }
                const target = resolvePath(args);
                if (!FileSystem.isFolder(target)) {
                    print(`cd: no such file or directory: ${args}`);
                    return;
                }
                cwd = target;
                updatePrompt();
            },

            pwd() {
                print(cwd.join('/'));
            },

            cat(args) {
                if (!args) { print('cat: missing file operand'); return; }
                const target = resolvePath(args);
                const node = FileSystem.getNode(target);
                if (!node) { print(`cat: ${args}: No such file or directory`); return; }
                if (node.type === 'folder') { print(`cat: ${args}: Is a directory`); return; }
                const content = FileSystem.readFile(target);
                print(content !== null ? content : '(empty file)');
            },

            echo(args) {
                if (args === undefined) { print(''); return; }
                let text = args;
                if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
                    text = text.slice(1, -1);
                }
                print(text);
            },

            mkdir(args) {
                if (!args) { print('mkdir: missing operand'); return; }
                const name = args.trim().split('/').filter(Boolean).pop();
                const parentPath = resolvePath(args.includes('/') ? args.substring(0, args.lastIndexOf('/')) : '.');
                const ok = FileSystem.createFolder(parentPath, name);
                if (!ok) print(`mkdir: cannot create directory '${args}': File exists or invalid path`);
            },

            touch(args) {
                if (!args) { print('touch: missing file operand'); return; }
                const name = args.trim().split('/').filter(Boolean).pop();
                const parentPath = resolvePath(args.includes('/') ? args.substring(0, args.lastIndexOf('/')) : '.');
                if (FileSystem.itemExists(resolvePath(args))) return;
                const ext = name.includes('.') ? name.split('.').pop() : '';
                const ok = FileSystem.createFile(parentPath, name, '', ext);
                if (!ok) print(`touch: cannot create file '${args}': File exists or invalid path`);
            },

            write(args) {
                if (!args) { print('write: usage: write <file> <text>'); return; }
                const spaceIdx = args.indexOf(' ');
                if (spaceIdx === -1) { print('write: usage: write <file> <text>'); return; }
                const filePath = args.substring(0, spaceIdx);
                const content = args.substring(spaceIdx + 1);
                const target = resolvePath(filePath);
                if (!FileSystem.itemExists(target)) {
                    const name = filePath.split('/').filter(Boolean).pop();
                    const parentPath = resolvePath(filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.');
                    const ext = name.includes('.') ? name.split('.').pop() : '';
                    FileSystem.createFile(parentPath, name, content, ext);
                } else {
                    FileSystem.writeFile(target, content);
                }
            },

            rm(args) {
                if (!args) { print('rm: missing operand'); return; }
                const target = resolvePath(args);
                if (!FileSystem.itemExists(target)) { print(`rm: ${args}: No such file or directory`); return; }
                FileSystem.deleteItem(target);
            },

            rename(args) {
                if (!args) { print('rename: usage: rename <old> <new>'); return; }
                const parts = args.split(/\s+/);
                if (parts.length < 2) { print('rename: usage: rename <old> <new>'); return; }
                const oldPath = resolvePath(parts[0]);
                const ok = FileSystem.renameItem(oldPath, parts[1]);
                if (!ok) print(`rename: cannot rename '${parts[0]}' to '${parts[1]}'`);
            },

            clear() {
                output.textContent = '';
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
                print(`<span style="color:#569CD6">        _____</span>         <span style="color:#569CD6">${user}</span>@<span style="color:#569CD6">PC</span>`);
                print(`<span style="color:#569CD6">       /     \\</span>        ----------------`);
                print(`<span style="color:#569CD6">      | () () |</span>       <span style="color:#569CD6">OS:</span> Windows 12`);
                print(`<span style="color:#569CD6">      |  ___  |</span>       <span style="color:#569CD6">Resolution:</span> ${w}x${h}`);
                print(`<span style="color:#569CD6">      |       |</span>       <span style="color:#569CD6">Shell:</span> Terminal`);
                print(`<span style="color:#569CD6">       \\_____/</span>        <span style="color:#569CD6">Theme:</span> ${SystemConfig.get('darkMode') ? 'Dark' : 'Light'}`);
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
            const batchPrint = (text) => {
                if (text === '\x1BCLS') {
                    output.textContent = '';
                    return;
                }
                if (text && text.startsWith('\x1BTITLE:')) {
                    lastTitle = text.substring(7);
                    const titleEl = el.querySelector('.window-title');
                    if (titleEl) titleEl.textContent = lastTitle;
                    return;
                }
                if (text && text.startsWith('\x1BCOLOR:')) {
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
                if (text === '\x1BCLS') {
                    output.textContent = '';
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

        function execute(raw) {
            const trimmed = raw.trim();
            if (!trimmed) return;

            history.push(trimmed);
            historyIdx = history.length;

            const spaceIdx = trimmed.indexOf(' ');
            let cmd, args;
            if (spaceIdx === -1) {
                cmd = trimmed.toLowerCase();
                args = undefined;
            } else {
                cmd = trimmed.substring(0, spaceIdx).toLowerCase();
                args = trimmed.substring(spaceIdx + 1);
            }

            if (cmd.endsWith('.bat') || cmd.endsWith('.cmd')) {
                const argParts = args ? args.split(/\s+/) : [];
                runBatch(cmd, argParts);
                return;
            }

            if (cmd.endsWith('.vbs') || cmd.endsWith('.vbe')) {
                const argParts = args ? args.split(/\s+/) : [];
                runVBS(cmd, argParts);
                return;
            }

            if (cmd === 'run' && args) {
                const parts = args.split(/\s+/);
                const scriptFile = parts[0];
                const scriptArgs = parts.slice(1);
                if (scriptFile.endsWith('.bat') || scriptFile.endsWith('.cmd')) {
                    runBatch(scriptFile, scriptArgs);
                } else if (scriptFile.endsWith('.vbs') || scriptFile.endsWith('.vbe')) {
                    runVBS(scriptFile, scriptArgs);
                } else {
                    runBatch(scriptFile, scriptArgs);
                }
                return;
            }

            const fn = commands[cmd];
            if (fn) {
                fn(args);
            } else {
                print(`${cmd}: command not found. Type 'help' for available commands.`);
            }
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
                input.value = '';
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
