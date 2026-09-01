import FileSystem from './fileSystem.js';
import Popup from './popup.js';

const BatchEngine = (() => {
    function create(printFn, getCwd, setCwd) {
        let vars = {};
        let labels = {};
        let lines = [];
        let pc = 0;
        let running = false;
        let echoOn = true;
        let errorLevel = 0;
        let callStack = [];
        let breakCalled = false;
        let forStack = [];
        let currentForCtx = null;
        let waitingForAsync = false;

        const builtins = {
            '%DATE%': () => new Date().toLocaleDateString(),
            '%TIME%': () => new Date().toLocaleTimeString(),
            '%RANDOM%': () => Math.floor(Math.random() * 32768).toString(),
            '%CD%': () => getCwd().join('/'),
            '%ERRORLEVEL%': () => errorLevel.toString(),
            '%USERNAME%': () => { try { return window.SystemConfig.get('userName'); } catch(e) { return 'User'; } },
            '%OS%': () => 'Windows_NT',
            '%WINDIR%': () => '/system',
            '%COMPUTERNAME%': () => 'PC',
            '%HOMEPATH%': () => '/users/default',
            '%TEMP%': () => '/users/default/AppData/Local/Temp'
        };

        function expandVars(str) {
            if (!str) return '';
            str = str.replace(/%%/g, '\x00');

            str = str.replace(/%~([0-9])([~fadnpsexz]*)/gi, (match, num, mods) => {
                const val = vars['%' + num + '%'] || '';
                let result = val;
                if (mods) {
                    for (const m of mods.toLowerCase()) {
                        if (m === 'f') result = result.replace(/^.*[\\\/]/, '');
                        else if (m === 'd') result = result.replace(/[\\\/][^\\\/]*$/, '');
                        else if (m === 'n') result = result.replace(/^.*[\\\/]/, '').replace(/\.[^.]*$/, '');
                        else if (m === 'x') { const dot = result.lastIndexOf('.'); result = dot >= 0 ? result.substring(dot) : ''; }
                        else if (m === 'p') result = result.replace(/[\\\/][^\\\/]*$/, '') + '\\';
                        else if (m === 's') result = result.replace(/\s+$/, '');
                    }
                }
                return result;
            });

            for (const [key, fn] of Object.entries(builtins)) {
                str = str.split(key).join(fn());
            }

            str = str.replace(/%~?([a-zA-Z_][a-zA-Z0-9_]*)%/gi, (match, name) => {
                const key = '%' + name + '%';
                return vars[key] !== undefined ? vars[key] : '';
            });

            str = str.replace(/\x00/g, '%');
            return str;
        }

        function parseArgs(line) {
            const args = [];
            let current = '';
            let inQuote = false;
            let i = 0;
            while (i < line.length) {
                const ch = line[i];
                if (ch === '"') {
                    inQuote = !inQuote;
                } else if (ch === ' ' && !inQuote) {
                    if (current) { args.push(current); current = ''; }
                } else {
                    current += ch;
                }
                i++;
            }
            if (current) args.push(current);
            return args;
        }

        function tokenizeRedirect(line) {
            let redirect = null;
            let cleanLine = line;

            const appendMatch = line.match(/^(.*?)\s*>>\s*(.+)$/);
            if (appendMatch) {
                redirect = { type: 'append', file: appendMatch[2].trim() };
                cleanLine = appendMatch[1];
            } else {
                const redirMatch = line.match(/^(.*?)\s*>\s*(.+)$/);
                if (redirMatch) {
                    redirect = { type: 'overwrite', file: redirMatch[2].trim() };
                    cleanLine = redirMatch[1];
                }
            }

            return { line: cleanLine.trim(), redirect };
        }

        function doPrint(text, redirect) {
            if (!redirect) {
                printFn(text);
                return;
            }
            const filePath = expandVars(redirect.file);
            const path = resolvePathArray(filePath);
            const content = FileSystem.readFile(path);
            const existing = content || '';
            const newContent = redirect.type === 'append'
                ? existing + text + '\n'
                : text + '\n';
            if (FileSystem.itemExists(path)) {
                FileSystem.writeFile(path, newContent);
            } else {
                const name = filePath.split('/').filter(Boolean).pop();
                const parentPath = path.slice(0, -1);
                const ext = name.includes('.') ? name.split('.').pop() : '';
                FileSystem.createFile(parentPath, name, newContent, ext);
            }
        }

        function resolvePathArray(input) {
            const cwd = getCwd();
            if (!input) return [...cwd];
            let parts;
            if (input.startsWith('/')) {
                parts = input.split('/').filter(Boolean);
            } else if (input.startsWith('~/')) {
                parts = ['users', 'default', ...input.slice(2).split('/').filter(Boolean)];
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

        function dirListing(path) {
            const children = FileSystem.getChildren(path);
            if (children.length === 0) return '(empty directory)';
            return children.map(e => {
                const isDir = e.type === 'folder';
                const name = isDir ? e.name + '/' : e.name;
                const size = isDir ? '<DIR>' : String(e.size).padStart(10);
                const date = e.modified ? new Date(e.modified).toLocaleDateString() : '';
                return `${date}  ${size}  ${name}`;
            }).join('\n');
        }

        function evalCondition(expr) {
            expr = expandVars(expr).trim();

            const notMatch = expr.match(/^not\s+(.+)$/i);
            if (notMatch) {
                return !evalCondition(notMatch[1]);
            }

            const existMatch = expr.match(/^exist\s+"?(.+?)"?\s*$/i);
            if (existMatch) {
                const p = resolvePathArray(existMatch[1]);
                return FileSystem.itemExists(p);
            }

            const existDirMatch = expr.match(/^exist\s+"?(.+?)"?\s*$/i);
            if (existDirMatch) {
                const p = resolvePathArray(existDirMatch[1]);
                return FileSystem.isFolder(p);
            }

            const eqMatch = expr.match(/^(.+?)\s*==\s*(.+)$/);
            if (eqMatch) {
                return expandVars(eqMatch[1]).trim() === expandVars(eqMatch[2]).trim();
            }

            const neqMatch = expr.match(/^(.+?)\s*!=\s*(.+)$/);
            if (neqMatch) {
                return expandVars(neqMatch[1]).trim() !== expandVars(neqMatch[2]).trim();
            }

            const gtrMatch = expr.match(/^(.+?)\s*GTR\s*(.+)$/i);
            if (gtrMatch) {
                return parseInt(expandVars(gtrMatch[1])) > parseInt(expandVars(gtrMatch[2]));
            }

            const lssMatch = expr.match(/^(.+?)\s*LSS\s*(.+)$/i);
            if (lssMatch) {
                return parseInt(expandVars(lssMatch[1])) < parseInt(expandVars(lssMatch[2]));
            }

            const geqMatch = expr.match(/^(.+?)\s*GEQ\s*(.+)$/i);
            if (geqMatch) {
                return parseInt(expandVars(geqMatch[1])) >= parseInt(expandVars(geqMatch[2]));
            }

            const leqMatch = expr.match(/^(.+?)\s*LEQ\s*(.+)$/i);
            if (leqMatch) {
                return parseInt(expandVars(leqMatch[1])) <= parseInt(expandVars(leqMatch[2]));
            }

            const str = expandVars(expr).trim().toLowerCase();
            return str !== '' && str !== '0' && str !== 'false';
        }

        function findLabel(name) {
            const key = name.toLowerCase();
            if (labels[key] !== undefined) return labels[key];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.toLowerCase() === ':' + key || line.toLowerCase().startsWith(':' + key + ' ')) {
                    labels[key] = i;
                    return i;
                }
            }
            return -1;
        }

        function executeLine(rawLine) {
            let line = rawLine;
            let leadingAt = false;

            if (line.startsWith('@')) {
                leadingAt = true;
                line = line.substring(1).trim();
            }

            if (!echoOn && !leadingAt && line && !line.startsWith('rem') && !line.startsWith('::')) {
                // don't echo
            } else if (echoOn && !leadingAt && line && !line.startsWith('rem') && !line.startsWith('::')) {
                const prompt = getCwd().join('/').replace('//', '/') + '>';
                // Only echo if echo is on and not suppressed by @
            }

            if (!line || line.startsWith('rem') || line.startsWith('::')) return;

            if (line.toLowerCase() === 'echo.') {
                doPrint('');
                return;
            }

            const { line: cleanLine, redirect } = tokenizeRedirect(line);
            line = expandVars(cleanLine);

            const lower = line.toLowerCase();

            if (lower === 'pause') {
                doPrint('Press any key to continue . . .', redirect);
                return;
            }

            if (lower === 'cls') {
                printFn('\x1BCLS');
                return;
            }

            if (lower.startsWith('title ')) {
                const title = line.substring(6).trim().replace(/^"|"$/g, '');
                printFn('\x1BTITLE:' + title);
                return;
            }

            if (lower === 'exit') {
                running = false;
                return;
            }

            if (lower === 'echo off') { echoOn = false; return; }
            if (lower === 'echo on') { echoOn = true; return; }

            if (lower.startsWith('echo ')) {
                let text = line.substring(5);
                if (text === '' || text === '.') {
                    doPrint('', redirect);
                } else {
                    doPrint(text, redirect);
                }
                return;
            }

            if (lower === 'echo') {
                doPrint(echoOn ? 'ECHO is on.' : 'ECHO is off.', redirect);
                return;
            }

            if (lower.startsWith('set ')) {
                const rest = line.substring(4).trim();
                const eqIdx = rest.indexOf('=');
                if (eqIdx >= 0) {
                    const name = rest.substring(0, eqIdx).trim();
                    const val = rest.substring(eqIdx + 1).trim();
                    vars['%' + name + '%'] = val;
                } else {
                    const name = rest.trim();
                    vars['%' + name + '%'] = '';
                }
                return;
            }

            if (lower === 'set') {
                for (const [k, v] of Object.entries(vars).sort()) {
                    doPrint(`${k}=${v}`, redirect);
                }
                return;
            }

            if (lower.startsWith('setlocal')) return;
            if (lower === 'endlocal') return;

            if (lower.startsWith('cd ') || lower.startsWith('chdir ')) {
                const arg = line.replace(/^c[dh]+\s+/i, '').trim().replace(/^"|"$/g, '');
                if (arg === '\\' || arg === '/') {
                    setCwd(['/']);
                } else if (arg === '..') {
                    const cwd = getCwd();
                    if (cwd.length > 1) setCwd(cwd.slice(0, -1));
                } else {
                    const target = resolvePathArray(arg);
                    if (FileSystem.isFolder(target)) {
                        setCwd(target);
                    } else {
                        doPrint('The system cannot find the path specified.', redirect);
                        errorLevel = 1;
                    }
                }
                return;
            }

            if (lower === 'cd' || lower === 'chdir') {
                doPrint(getCwd().join('/'), redirect);
                return;
            }

            if (lower.startsWith('dir')) {
                const arg = line.substring(3).trim();
                const target = arg ? resolvePathArray(arg) : getCwd();
                if (!FileSystem.isFolder(target)) {
                    doPrint('File Not Found', redirect);
                    errorLevel = 1;
                    return;
                }
                const header = ` Volume in drive has no label.\n Volume Serial Number is 0000-0000\n\n Directory of ${target.join('/')}\n`;
                doPrint(header + dirListing(target), redirect);
                return;
            }

            if (lower.startsWith('type ')) {
                const filePath = line.substring(5).trim().replace(/^"|"$/g, '');
                const target = resolvePathArray(filePath);
                if (!FileSystem.itemExists(target)) {
                    doPrint('The system cannot find the file specified.', redirect);
                    errorLevel = 1;
                    return;
                }
                if (FileSystem.isFolder(target)) {
                    doPrint('Access is denied.', redirect);
                    errorLevel = 1;
                    return;
                }
                const content = FileSystem.readFile(target);
                doPrint(content || '', redirect);
                return;
            }

            if (lower.startsWith('mkdir ') || lower.startsWith('md ')) {
                const dirName = (lower.startsWith('mkdir') ? line.substring(6) : line.substring(3)).trim().replace(/^"|"$/g, '');
                const parts = dirName.split(/[\\\/]/).filter(Boolean);
                let current = getCwd();
                for (const part of parts) {
                    const child = [...current, part];
                    if (!FileSystem.itemExists(child)) {
                        FileSystem.createFolder(current, part);
                    }
                    current = child;
                }
                return;
            }

            if (lower.startsWith('rmdir ') || lower.startsWith('rd ')) {
                const dirName = (lower.startsWith('rmdir') ? line.substring(6) : line.substring(3)).trim().replace(/^"|"$/g, '');
                const target = resolvePathArray(dirName);
                if (!FileSystem.itemExists(target)) {
                    doPrint('The system cannot find the path specified.', redirect);
                    errorLevel = 1;
                    return;
                }
                if (!FileSystem.isFolder(target)) {
                    doPrint('The directory name is invalid.', redirect);
                    errorLevel = 1;
                    return;
                }
                const children = FileSystem.getChildren(target);
                if (children.length > 0 && !lower.includes('/s') && !lower.includes('/q')) {
                    doPrint('The directory is not empty.', redirect);
                    errorLevel = 1;
                    return;
                }
                FileSystem.deleteItem(target);
                return;
            }

            if (lower.startsWith('del ') || lower.startsWith('erase ')) {
                const fileArg = lower.startsWith('del') ? line.substring(4) : line.substring(6);
                const parts = parseArgs(expandVars(fileArg.trim()));
                for (const part of parts) {
                    if (part.startsWith('/')) continue;
                    const target = resolvePathArray(part.replace(/^"|"$/g, ''));
                    if (FileSystem.itemExists(target) && !FileSystem.isFolder(target)) {
                        FileSystem.deleteItem(target);
                    }
                }
                return;
            }

            if (lower.startsWith('copy ') || lower.startsWith('xcopy ')) {
                const args = parseArgs(line.substring(line.indexOf(' ') + 1).trim());
                if (args.length < 2) {
                    doPrint('The syntax of the command is incorrect.', redirect);
                    errorLevel = 1;
                    return;
                }
                const src = resolvePathArray(args[0].replace(/^"|"$/g, ''));
                const content = FileSystem.readFile(src);
                if (content === null) {
                    doPrint('The system cannot find the file specified.', redirect);
                    errorLevel = 1;
                    return;
                }
                const dstPath = resolvePathArray(args[1].replace(/^"|"$/g, ''));
                if (FileSystem.isFolder(dstPath)) {
                    const srcName = args[0].split(/[\\\/]/).pop();
                    const finalDst = [...dstPath, srcName];
                    if (FileSystem.itemExists(finalDst)) {
                        FileSystem.writeFile(finalDst, content);
                    } else {
                        const ext = srcName.includes('.') ? srcName.split('.').pop() : '';
                        FileSystem.createFile(dstPath, srcName, content, ext);
                    }
                } else {
                    if (FileSystem.itemExists(dstPath)) {
                        FileSystem.writeFile(dstPath, content);
                    } else {
                        const name = args[1].split(/[\\\/]/).pop();
                        const parentPath = dstPath.slice(0, -1);
                        const ext = name.includes('.') ? name.split('.').pop() : '';
                        FileSystem.createFile(parentPath, name, content, ext);
                    }
                }
                doPrint('        1 file(s) copied.', redirect);
                return;
            }

            if (lower.startsWith('move ')) {
                const args = parseArgs(line.substring(5).trim());
                if (args.length < 2) {
                    doPrint('The syntax of the command is incorrect.', redirect);
                    errorLevel = 1;
                    return;
                }
                const src = resolvePathArray(args[0].replace(/^"|"$/g, ''));
                const content = FileSystem.readFile(src);
                if (content === null) {
                    doPrint('The system cannot find the file specified.', redirect);
                    errorLevel = 1;
                    return;
                }
                const dstPath = resolvePathArray(args[1].replace(/^"|"$/g, ''));
                if (FileSystem.isFolder(dstPath)) {
                    const srcName = args[0].split(/[\\\/]/).pop();
                    const ext = srcName.includes('.') ? srcName.split('.').pop() : '';
                    FileSystem.createFile(dstPath, srcName, content, ext);
                } else {
                    const parentPath = dstPath.slice(0, -1);
                    const name = args[1].split(/[\\\/]/).pop();
                    const ext = name.includes('.') ? name.split('.').pop() : '';
                    if (FileSystem.itemExists(dstPath)) {
                        FileSystem.writeFile(dstPath, content);
                    } else {
                        FileSystem.createFile(parentPath, name, content, ext);
                    }
                }
                FileSystem.deleteItem(src);
                doPrint('        1 file(s) moved.', redirect);
                return;
            }

            if (lower.startsWith('ren ') || lower.startsWith('rename ')) {
                const args = parseArgs(line.replace(/^re[name]+\s+/i, '').trim());
                if (args.length < 2) {
                    doPrint('The syntax of the command is incorrect.', redirect);
                    errorLevel = 1;
                    return;
                }
                const target = resolvePathArray(args[0].replace(/^"|"$/g, ''));
                const ok = FileSystem.renameItem(target, args[1].replace(/^"|"$/g, ''));
                if (!ok) {
                    doPrint('The system cannot find the file specified.', redirect);
                    errorLevel = 1;
                }
                return;
            }

            if (lower.startsWith('color ')) {
                printFn('\x1BCOLOR:' + line.substring(6).trim());
                return;
            }

            if (lower.startsWith('timeout ')) {
                return;
            }

            if (lower.startsWith('choice ')) {
                const choiceArgs = line.substring(7).trim();
                let choices = [];
                let message = '';
                let timeout = null;
                let defaultChoice = null;
                const parts = choiceArgs.split(/\s+/);
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    if (part.toUpperCase() === '/C' && parts[i + 1]) {
                        choices = parts[++i].split('');
                    } else if (part.toUpperCase() === '/M' && parts[i + 1]) {
                        message = parts[++i].replace(/^"|"$/g, '');
                    } else if (part.toUpperCase() === '/T' && parts[i + 1]) {
                        timeout = parseInt(parts[++i]);
                    } else if (part.toUpperCase() === '/D' && parts[i + 1]) {
                        defaultChoice = parts[++i];
                    }
                }
                if (choices.length === 0) choices = ['Y', 'N'];
                if (!message) message = choices.join(',') + '?';

                doPrint(message, redirect);

                const choiceChars = choices.map(c => c.toUpperCase());
                const choiceButtons = choices.map((c, idx) => ({ label: `[${c.toUpperCase()}] ${c}`, value: idx + 1 }));

                running = false;
                waitingForAsync = true;

                Popup.pick(message, choiceButtons).then(result => {
                    if (result !== null && result !== undefined) {
                        errorLevel = result;
                    } else if (defaultChoice) {
                        const idx = choiceChars.indexOf(defaultChoice.toUpperCase());
                        errorLevel = idx >= 0 ? idx + 1 : 1;
                    } else {
                        errorLevel = 1;
                    }
                    resumeAfterAsync();
                }).catch(() => {
                    errorLevel = 1;
                    resumeAfterAsync();
                });
                return;
            }

            if (lower.startsWith('findstr ') || lower.startsWith('find ')) {
                const args = parseArgs(line.replace(/^find(str)?\s+/i, '').trim());
                if (args.length < 2) {
                    doPrint('FIND: Parameter format not correct', redirect);
                    errorLevel = 1;
                    return;
                }
                const searchStr = args[0].replace(/^"|"$/g, '');
                const filePath = args[1].replace(/^"|"$/g, '');
                const target = resolvePathArray(filePath);
                const content = FileSystem.readFile(target);
                if (content === null) {
                    doPrint('File not found - ' + filePath, redirect);
                    errorLevel = 1;
                    return;
                }
                const matches = content.split('\n').filter(l => l.includes(searchStr));
                doPrint(matches.join('\n'), redirect);
                errorLevel = matches.length > 0 ? 0 : 1;
                return;
            }

            if (lower.startsWith('rem ')) return;
            if (lower === 'rem') return;

            if (lower.startsWith('call ')) {
                const target = line.substring(5).trim();
                if (target.startsWith(':')) {
                    const labelName = target.substring(1);
                    const labelLine = findLabel(labelName);
                    if (labelLine >= 0) {
                        callStack.push(pc);
                        pc = labelLine;
                    } else {
                        doPrint(`Label '${labelName}' not found.`);
                        errorLevel = 1;
                    }
                    return;
                }
                const parts = parseArgs(target);
                const scriptPath = resolvePathArray(parts[0].replace(/^"|"$/g, ''));
                const content = FileSystem.readFile(scriptPath);
                if (content === null) {
                    doPrint('The system cannot find the path specified.');
                    errorLevel = 1;
                    return;
                }
                const argVars = {};
                for (let i = 1; i < parts.length; i++) {
                    argVars['%' + i + '%'] = parts[i];
                    vars['%' + i + '%'] = parts[i];
                }
                callStack.push(pc);
                const subLines = content.split('\n').map(l => l.replace(/\r/g, '')).filter(l => l.trim());
                const savedLines = lines;
                const savedPc = pc;
                const savedLabels = { ...labels };
                labels = {};
                lines = subLines;
                pc = 0;
                while (pc < lines.length && running) {
                    executeLine(lines[pc]);
                    if (running) pc++;
                }
                lines = savedLines;
                pc = savedPc;
                labels = savedLabels;
                if (callStack.length > 0) pc = callStack.pop();
                return;
            }

            if (lower.startsWith('goto ')) {
                const labelName = line.substring(5).trim();
                const labelLine = findLabel(labelName);
                if (labelLine >= 0) {
                    pc = labelLine;
                } else {
                    doPrint(`Label '${labelName}' not found.`);
                    running = false;
                }
                return;
            }

            if (lower.startsWith('if ')) {
                handleIf(line.substring(3).trim());
                return;
            }

            if (lower.startsWith('for ')) {
                handleFor(line.substring(4).trim());
                return;
            }

            if (lower.startsWith('shift')) {
                for (let i = 9; i >= 2; i--) {
                    vars['%' + i + '%'] = vars['%' + (i - 1) + '%'] || '';
                }
                vars['%1%'] = '';
                return;
            }

            const spaceIdx = line.indexOf(' ');
            let cmdName = (spaceIdx >= 0 ? line.substring(0, spaceIdx) : line).trim().toLowerCase();
            let cmdArgs = spaceIdx >= 0 ? line.substring(spaceIdx + 1).trim() : '';

            if (cmdName.endsWith('.bat') || cmdName.endsWith('.cmd')) {
                const scriptPath = resolvePathArray(cmdName);
                const content = FileSystem.readFile(scriptPath);
                if (content === null) {
                    doPrint(`'${cmdName}' is not recognized as an internal or external command.`);
                    errorLevel = 1;
                    return;
                }
                const argParts = parseArgs(cmdArgs);
                for (let i = 0; i < argParts.length; i++) {
                    vars['%' + (i + 1) + '%'] = argParts[i];
                }
                const savedLines = lines;
                const savedPc = pc;
                const savedLabels = { ...labels };
                labels = {};
                lines = content.split('\n').map(l => l.replace(/\r/g, '')).filter(l => l.trim());
                pc = 0;
                while (pc < lines.length && running) {
                    executeLine(lines[pc]);
                    if (running) pc++;
                }
                lines = savedLines;
                pc = savedPc;
                labels = savedLabels;
                return;
            }

            doPrint(`'${cmdName}' is not recognized as an internal or external command, operable program or batch file.`);
            errorLevel = 1;
        }

        function handleIf(expr) {
            let condition, trueAction, falseAction;

            const elseIdx = findElseIndex(expr);

            const parenStart = expr.indexOf('(');
            if (parenStart >= 0 && (elseIdx < 0 || parenStart < elseIdx)) {
                condition = expr.substring(0, parenStart).trim();
                const blockEnd = findBlockEnd(expr.substring(parenStart));
                if (blockEnd >= 0) {
                    trueAction = expr.substring(parenStart + 1, parenStart + blockEnd).trim();
                    const afterBlock = expr.substring(parenStart + blockEnd + 1).trim();
                    const innerElseIdx = findElseIndex(afterBlock);
                    if (innerElseIdx >= 0) {
                        falseAction = afterBlock.substring(innerElseIdx + 4).trim();
                    }
                } else {
                    trueAction = expr.substring(parenStart + 1).trim();
                }
            } else if (elseIdx >= 0) {
                condition = expr.substring(0, elseIdx).trim();
                trueAction = null;
                falseAction = expr.substring(elseIdx + 4).trim();
            } else {
                condition = expr;
                trueAction = null;
                falseAction = null;
            }

            let result = false;

            const notMatch = condition.match(/^not\s+(.+)$/i);
            if (notMatch) {
                result = !evalCondition(notMatch[1]);
                condition = notMatch[1];
            } else {
                const existCheck = condition.match(/^(exist|not\s+exist)\s+"?(.+?)"?\s+(.+)$/i);
                if (existCheck) {
                    const isExist = existCheck[1].toLowerCase().startsWith('not') ? false : true;
                    const path = resolvePathArray(expandVars(existCheck[2]).trim());
                    const exists = FileSystem.itemExists(path);
                    result = isExist ? exists : !exists;
                    trueAction = existCheck[3];
                } else {
                    const eqCheck = condition.match(/^(.+?)\s*==\s*(.+?)\s+(.+)$/);
                    if (eqCheck) {
                        result = expandVars(eqCheck[1]).trim() === expandVars(eqCheck[2]).trim();
                        trueAction = eqCheck[3];
                    } else {
                        result = evalCondition(condition);
                    }
                }
            }

            if (result) {
                if (trueAction) executeAction(trueAction);
            } else {
                if (falseAction) executeAction(falseAction);
            }
        }

        function findElseIndex(expr) {
            let depth = 0;
            let inQuote = false;
            for (let i = 0; i < expr.length - 4; i++) {
                if (expr[i] === '"') inQuote = !inQuote;
                if (inQuote) continue;
                if (expr[i] === '(') depth++;
                if (expr[i] === ')') depth--;
                if (depth === 0 && expr.substring(i, i + 5).toLowerCase() === ' else') {
                    return i + 1;
                }
            }
            return -1;
        }

        function executeAction(action) {
            if (!action) return;

            action = expandVars(action).trim();

            if (action.startsWith('(')) {
                const blockEnd = findBlockEnd(action);
                if (blockEnd >= 0) {
                    const block = action.substring(1, blockEnd).trim();
                    const blockLines = block.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);
                    for (const bl of blockLines) {
                        executeLine(bl);
                    }
                    return;
                }
            }

            if (action.startsWith('(') && action.endsWith(')')) {
                const inner = action.slice(1, -1).trim();
                const blockLines = inner.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);
                for (const bl of blockLines) {
                    executeLine(bl);
                }
                return;
            }

            executeLine(action);
        }

        function findBlockEnd(str) {
            let depth = 0;
            let inQuote = false;
            for (let i = 0; i < str.length; i++) {
                if (str[i] === '"') inQuote = !inQuote;
                if (inQuote) continue;
                if (str[i] === '(') depth++;
                if (str[i] === ')') {
                    depth--;
                    if (depth === 0) return i;
                }
            }
            return -1;
        }

        function handleFor(expr) {
            let match;

            match = expr.match(/^%(\w+)\s+in\s*\((.+?)\)\s+do\s*(.+)$/i);
            if (match) {
                const varName = '%' + match[1] + '%';
                const items = match[2].split(/\s+/).map(s => expandVars(s));
                const action = match[3].trim();
                for (const item of items) {
                    vars[varName] = item;
                    executeAction(action);
                }
                return;
            }

            match = expr.match(/^%(\w+)\s+in\s*\((.+?)\)\s+do\s*(.+)$/i);
            if (match) {
                const varName = '%' + match[1] + '%';
                const items = match[2].split(/\s+/).map(s => expandVars(s));
                const action = match[3].trim();
                for (const item of items) {
                    vars[varName] = item;
                    executeAction(action);
                }
                return;
            }

            match = expr.match(/^\/L\s+(\d+)\s+(\d+)\s+(\d+)\s+do\s*(.+)$/i);
            if (match) {
                const start = parseInt(match[1]);
                const step = parseInt(match[2]);
                const end = parseInt(match[3]);
                const action = match[4].trim();
                for (let i = start; i <= end; i += step) {
                    vars['%i%'] = i.toString();
                    executeAction(action);
                }
                return;
            }

            match = expr.match(/^%(\w+)\s+in\s*\((.+?)\)\s+do\s*(.+)$/i);
            if (match) {
                const varName = '%' + match[1] + '%';
                const items = match[2].split(/\s+/).map(s => expandVars(s));
                const action = match[3].trim();
                for (const item of items) {
                    vars[varName] = item;
                    executeAction(action);
                }
                return;
            }
        }

        function run(script, args) {
            lines = script.split('\n').map(l => l.replace(/\r/g, '')).filter(l => l.trim());
            pc = 0;
            running = true;
            echoOn = true;
            errorLevel = 0;
            labels = {};
            vars = {};
            waitingForAsync = false;

            if (args) {
                args.forEach((arg, i) => {
                    vars['%' + (i + 1) + '%'] = arg;
                });
            }

            return executeLoop();
        }

        function executeLoop() {
            const maxIter = 100000;
            let iter = 0;

            while (pc < lines.length && running && iter < maxIter) {
                iter++;
                let line = lines[pc].trim();

                if (line.startsWith(':')) {
                    pc++;
                    continue;
                }

                let fullLine = line;
                if (line.endsWith('(') && !line.toLowerCase().startsWith('rem')) {
                    let depth = 1;
                    let blockLines = [line];
                    pc++;
                    while (pc < lines.length && depth > 0 && iter < maxIter) {
                        iter++;
                        const nextLine = lines[pc].trim();
                        blockLines.push(nextLine);
                        for (const ch of nextLine) {
                            if (ch === '(') depth++;
                            if (ch === ')') depth--;
                        }
                        if (depth > 0) pc++;
                    }
                    fullLine = blockLines.join('\n');
                }

                executeLine(fullLine);

                if (waitingForAsync) {
                    return;
                }

                if (running) {
                    pc++;
                }
            }

            if (iter >= maxIter) {
                printFn('Batch script exceeded maximum iterations (possible infinite loop).');
            }

            running = false;
            return errorLevel;
        }

        function resumeAfterAsync() {
            waitingForAsync = false;
            running = true;
            pc++;
            executeLoop();
        }

        return { run };
    }

    return { create };
})();

export default BatchEngine;
