import FileSystem from './fileSystem.js';
import Popup from './popup.js';

/*
 * Windows Batch/CMD compatible interpreter for the simulator.
 *
 * Design goals:
 * - Keep the existing create(printFn, getCwd, setCwd) API.
 * - Model CMD's line-oriented execution instead of trying to execute
 *   parenthesized blocks as a single string.
 * - Support normal batch parameter syntax (%%A, %1..%9, %*), delayed
 *   expansion (!VAR!), SET /A, IF, FOR, CALL/GOTO, SETLOCAL and common
 *   filesystem commands.
 * - Fail closed when a host feature cannot be emulated.
 */
const BatchEngine = (() => {
    function create(printFn, getCwd, setCwd) {
        let lines = [];
        let pc = 0;
        let running = false;
        let waitingForAsync = false;
        let echoOn = true;
        let delayedExpansion = false;
        let errorLevel = 0;
        let labels = new Map();
        let envStack = [];
        let args = [];
        let scriptName = 'script.bat';
        let scriptPath = '';

        const vars = Object.create(null);

        const cloneEnv = () => ({ ...vars });

        function normName(name) {
            return String(name ?? '').toUpperCase();
        }

        function getVar(name) {
            const key = normName(name);
            if (key === 'ERRORLEVEL') return String(errorLevel);
            if (key === 'CD') return getCwd().join('\\').replace(/^\/$/, '\\');
            if (key === 'DATE') return new Date().toLocaleDateString();
            if (key === 'TIME') return new Date().toLocaleTimeString();
            if (key === 'RANDOM') return String(Math.floor(Math.random() * 32768));
            if (key === 'USERNAME') {
                try { return String(window?.SystemConfig?.get?.('userName') ?? 'User'); } catch { return 'User'; }
            }
            if (key === 'OS') return 'Windows_NT';
            if (key === 'WINDIR') return '\\system';
            if (key === 'SYSTEMROOT') return '\\system';
            if (key === 'COMPUTERNAME') return 'PC';
            if (key === 'HOMEPATH') return '\\Users\\Default';
            if (key === 'TEMP' || key === 'TMP') return '\\Users\\Default\\AppData\\Local\\Temp';
            if (key === '0') return args[0] ?? scriptName;
            if (/^[1-9]$/.test(key)) return args[Number(key)] ?? '';
            if (key === '*') return args.slice(1).join(' ');
            return vars[key] ?? '';
        }

        function setVar(name, value) {
            const key = normName(name);
            if (!key) return;
            if (value === null || value === undefined) delete vars[key];
            else vars[key] = String(value);
        }

        function buildLabels() {
            labels = new Map();
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].trim().match(/^:([^\s].*)$/);
                if (m) {
                    const name = m[1].trim().split(/\s+/)[0].toUpperCase();
                    if (!labels.has(name)) labels.set(name, i);
                }
            }
        }

        function stripOuterQuotes(s) {
            const v = String(s ?? '').trim();
            return v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"' ? v.slice(1, -1) : v;
        }

        function splitArgs(text) {
            const out = [];
            let cur = '';
            let quote = false;
            for (let i = 0; i < String(text ?? '').length; i++) {
                const ch = text[i];
                if (ch === '"') {
                    quote = !quote;
                    cur += ch;
                } else if (/\s/.test(ch) && !quote) {
                    if (cur) { out.push(cur); cur = ''; }
                } else {
                    cur += ch;
                }
            }
            if (cur) out.push(cur);
            return out;
        }

        function splitCommandChain(line) {
            const out = [];
            let cur = '';
            let quote = false;
            let paren = 0;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    quote = !quote;
                    cur += ch;
                    continue;
                }
                if (!quote) {
                    if (ch === '(') paren++;
                    else if (ch === ')') paren = Math.max(0, paren - 1);
                    else if (ch === '&' && paren === 0) {
                        if (cur.trim()) out.push(cur.trim());
                        cur = '';
                        continue;
                    }
                }
                cur += ch;
            }
            if (cur.trim()) out.push(cur.trim());
            return out;
        }

        function findRedirection(line) {
            let quote = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') quote = !quote;
                if (quote) continue;

                if (line.startsWith('>>', i) || ch === '>') {
                    const append = line.startsWith('>>', i);
                    let j = i + (append ? 2 : 1);
                    while (j < line.length && /\s/.test(line[j])) j++;
                    let k = j;
                    let q = false;
                    while (k < line.length) {
                        if (line[k] === '"') q = !q;
                        if (!q && (line[k] === '&')) break;
                        k++;
                    }
                    return {
                        command: line.slice(0, i).trim(),
                        type: append ? 'append' : 'overwrite',
                        file: stripOuterQuotes(line.slice(j, k).trim())
                    };
                }
            }
            return { command: line, type: null, file: null };
        }

        function resolvePathArray(input) {
            let p = String(input ?? '').trim().replace(/\\/g, '/');
            if (!p) return [...getCwd()];
            if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
            if (/^[A-Za-z]:/.test(p)) {
                p = p.replace(/^[A-Za-z]:/, '');
            }

            const base = p.startsWith('/') ? ['/'] : [...getCwd()];
            const parts = p.split('/').filter(Boolean);
            const result = base.length && base[0] === '/' ? ['/'] : [];
            if (base[0] !== '/') result.push(...base);

            for (const part of parts) {
                if (part === '.') continue;
                if (part === '..') {
                    if (result.length > 1) result.pop();
                    continue;
                }
                result.push(part);
            }
            return result.length ? result : ['/'];
        }

        function pathToString(path) {
            const p = path.join('\\');
            return p === '' ? '\\' : (p.startsWith('\\') ? p : '\\' + p);
        }

        function fileExists(path) {
            try { return FileSystem.itemExists(resolvePathArray(path)); } catch { return false; }
        }

        function folderExists(path) {
            try { return FileSystem.isFolder(resolvePathArray(path)); } catch { return false; }
        }

        function expandPercent(text) {
            let s = String(text ?? '');

            // %% -> literal %, except %%A-style FOR variables and %%~A modifiers.
            s = s.replace(/%%~([a-zA-Z])/g, (_, v) => `%FOR_${v.toUpperCase()}_FULL%`);
            s = s.replace(/%%([a-zA-Z])/g, (_, v) => `%FOR_${v.toUpperCase()}%`);

            // Positional batch parameters: %0..%9 and %*.
            s = s.replace(/%(10|[0-9])/g, (_, n) => getVar(n));

            // Parameter modifiers such as %~f1 and %~dp0.
            s = s.replace(/%~([fdnspaxe]*)([0-9])/gi, (_, mods, n) => {
                const value = n === '0' ? scriptName : (args[Number(n)] ?? '');
                return applyParamModifiers(value, mods);
            });

            // Standard %VAR% expansion, including %VAR:old=new%.
            s = s.replace(/%([^%]+)%/g, (full, name) => {
                if (/^FOR_[A-Z]_FULL$/.test(name.toUpperCase())) return full;
                if (/^FOR_[A-Z]$/.test(name.toUpperCase())) return full;

                const colon = name.indexOf(':');
                if (colon >= 0) {
                    const varName = name.slice(0, colon);
                    const modifier = name.slice(colon + 1);
                    const current = getVar(varName);
                    const eq = modifier.indexOf('=');
                    if (eq >= 0) {
                        const oldText = modifier.slice(0, eq);
                        const newText = modifier.slice(eq + 1);
                        return current.split(oldText).join(newText);
                    }
                    return current;
                }
                return getVar(name);
            });

            return s;
        }

        function expandDelayed(text) {
            if (!delayedExpansion) return text;
            return text.replace(/!([^!]+)!/g, (_, name) => getVar(name));
        }

        function expand(text) {
            return expandDelayed(expandPercent(text));
        }

        function applyParamModifiers(value, mods) {
            let result = String(value ?? '');
            const lower = String(mods ?? '').toLowerCase();
            if (lower.includes('f')) result = result;
            const slash = Math.max(result.lastIndexOf('\\'), result.lastIndexOf('/'));
            const dir = slash >= 0 ? result.slice(0, slash) : '';
            const name = slash >= 0 ? result.slice(slash + 1) : result;
            const dot = name.lastIndexOf('.');
            if (lower.includes('d')) result = dir;
            if (lower.includes('p')) result = dir ? dir + '\\' : '\\';
            if (lower.includes('n')) result = dot > 0 ? name.slice(0, dot) : name;
            if (lower.includes('x')) result = dot > 0 ? name.slice(dot) : '';
            if (lower.includes('s')) result = name;
            if (!lower) result = value;
            return result;
        }

        function doPrint(text, redirect = null) {
            const output = String(text ?? '');
            if (!redirect?.file) {
                printFn(output);
                return;
            }

            const target = resolvePathArray(expand(redirect.file));
            const existing = FileSystem.readFile(target) ?? '';
            const content = redirect.type === 'append'
                ? existing + output + '\n'
                : output + '\n';

            try {
                if (FileSystem.itemExists(target)) FileSystem.writeFile(target, content);
                else {
                    const name = target[target.length - 1];
                    const parent = target.slice(0, -1);
                    const dot = name.lastIndexOf('.');
                    const ext = dot >= 0 ? name.slice(dot + 1) : '';
                    FileSystem.createFile(parent, name, content, ext);
                }
                errorLevel = 0;
            } catch {
                errorLevel = 1;
            }
        }

        function setEchoOutput(line, suppressed) {
            if (!echoOn || suppressed) return;
            if (!line) return;
            const prompt = `${pathToString(getCwd())}>`;
            printFn(`${prompt}${line}`);
        }

        function numeric(s) {
            const n = Number(String(s).trim());
            return Number.isFinite(n) ? n : null;
        }

        function compareStrings(a, b, ignoreCase) {
            const x = ignoreCase ? String(a).toLowerCase() : String(a);
            const y = ignoreCase ? String(b).toLowerCase() : String(b);
            return x === y ? 0 : (x < y ? -1 : 1);
        }

        function evalSetA(expr) {
            let source = expand(expr).trim();
            source = source.replace(/([A-Za-z_][A-Za-z0-9_]*)/g, (name) => {
                const value = getVar(name);
                return numeric(value) !== null ? String(numeric(value)) : '0';
            });
            source = source.replace(/\b(EQ|NEQ|LSS|LEQ|GTR|GEQ)\b/gi, (_, op) => ({
                EQ: '==', NEQ: '!=', LSS: '<', LEQ: '<=', GTR: '>', GEQ: '>='
            }[op.toUpperCase()]));
            if (!/^[0-9+\-*/%()<>!=&|^ ]+$/.test(source)) throw new Error('Invalid SET /A expression');

            // Bitwise operators are intentionally handled by JS; arithmetic precedence
            // matches CMD closely enough for simulator scripts.
            const value = Function(`"use strict"; return (${source});`)();
            return Math.trunc(Number(value));
        }

        function evalIfCondition(condition) {
            let c = expand(condition).trim();

            let negate = false;
            if (/^not\s+/i.test(c)) {
                negate = true;
                c = c.replace(/^not\s+/i, '').trim();
            }

            let m = c.match(/^exist\s+"?(.+?)"?$/i);
            if (m) return negate ? !fileExists(m[1]) : fileExists(m[1]);

            m = c.match(/^cmdextversion\s+(\d+)$/i);
            if (m) return negate ? false : Number(m[1]) <= 2;

            m = c.match(/^defined\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
            if (m) {
                const defined = vars[normName(m[1])] !== undefined;
                return negate ? !defined : defined;
            }

            m = c.match(/^errorlevel\s+(-?\d+)$/i);
            if (m) {
                const ok = errorLevel >= Number(m[1]);
                return negate ? !ok : ok;
            }

            m = c.match(/^["]?(.*?)["]?\s+(==|EQU|NEQ|LSS|LEQ|GTR|GEQ)\s+["]?(.*?)["]?$/i);
            if (m) {
                const a = stripOuterQuotes(m[1]);
                const b = stripOuterQuotes(m[3]);
                const op = m[2].toUpperCase();
                const na = numeric(a);
                const nb = numeric(b);
                let ok;
                if (op === '==' || op === 'EQU') ok = na !== null && nb !== null ? na === nb : compareStrings(a, b, false) === 0;
                else if (op === 'NEQ') ok = na !== null && nb !== null ? na !== nb : compareStrings(a, b, false) !== 0;
                else if (op === 'LSS') ok = na !== null && nb !== null ? na < nb : compareStrings(a, b, false) < 0;
                else if (op === 'LEQ') ok = na !== null && nb !== null ? na <= nb : compareStrings(a, b, false) <= 0;
                else if (op === 'GTR') ok = na !== null && nb !== null ? na > nb : compareStrings(a, b, false) > 0;
                else ok = na !== null && nb !== null ? na >= nb : compareStrings(a, b, false) >= 0;
                return negate ? !ok : ok;
            }

            const result = !!c && !/^0+(\.0+)?$/.test(c) && !/^false$/i.test(c);
            return negate ? !result : result;
        }

        function splitIfThenElse(expr) {
            let quote = false;
            let paren = 0;
            for (let i = 0; i < expr.length; i++) {
                const ch = expr[i];
                if (ch === '"') quote = !quote;
                if (quote) continue;
                if (ch === '(') paren++;
                else if (ch === ')') paren = Math.max(0, paren - 1);
                else if (paren === 0 && /\s/i.test(ch) && expr.slice(i + 1).match(/^else\b/i)) {
                    const before = expr.slice(0, i).trim();
                    return { condition: before, trueAction: null, falseAction: expr.slice(i + 1).replace(/^else\s+/i, '').trim() };
                }
            }
            return { condition: expr, trueAction: null, falseAction: null };
        }

        function nextTopLevelToken(text, token) {
            let quote = false, depth = 0;
            const lower = text.toLowerCase();
            const needle = token.toLowerCase();
            for (let i = 0; i <= text.length - needle.length; i++) {
                const ch = text[i];
                if (ch === '"') quote = !quote;
                if (quote) continue;
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
                if (depth === 0 && lower.startsWith(needle, i)) return i;
            }
            return -1;
        }

        function findMatchingParen(text, openIndex) {
            let depth = 0, quote = false;
            for (let i = openIndex; i < text.length; i++) {
                const ch = text[i];
                if (ch === '"') quote = !quote;
                if (quote) continue;
                if (ch === '(') depth++;
                else if (ch === ')') {
                    depth--;
                    if (depth === 0) return i;
                }
            }
            return -1;
        }

        function handleIf(expr) {
            const text = expand(expr.trim());

            // Full block form:
            // IF condition (
            //   ...
            // ) ELSE (
            //   ...
            // )
            const open = nextTopLevelToken(text, '(');
            if (open >= 0) {
                const close = findMatchingParen(text, open);
                if (close >= 0) {
                    const condition = text.slice(0, open).trim();
                    let after = text.slice(close + 1).trim();
                    let elseBlock = null;
                    let trueBlock = text.slice(open + 1, close);

                    if (/^else\b/i.test(after)) {
                        after = after.replace(/^else\s*/i, '').trim();
                        if (after.startsWith('(')) {
                            const elseClose = findMatchingParen(after, 0);
                            if (elseClose >= 0) elseBlock = after.slice(1, elseClose);
                        } else {
                            elseBlock = after;
                        }
                    }

                    if (evalIfCondition(condition)) runInline(trueBlock);
                    else if (elseBlock !== null) runInline(elseBlock);
                    return;
                }
            }

            const tokens = splitArgs(text);
            if (tokens.length < 2) return;

            const opIndex = tokens.findIndex(t => /^(==|EQU|NEQ|LSS|LEQ|GTR|GEQ)$/i.test(t));
            if (opIndex > 0 && tokens.length > opIndex + 2) {
                const condition = tokens.slice(0, opIndex + 2).join(' ');
                let action = tokens.slice(opIndex + 2).join(' ');
                const elseMatch = action.match(/^(.+?)\s+else\s+(.+)$/i);
                if (evalIfCondition(condition)) runInline(elseMatch ? elseMatch[1] : action);
                else if (elseMatch) runInline(elseMatch[2]);
                return;
            }

            let cursor = 0;
            let negate = false;
            if ((tokens[0] || '').toLowerCase() === 'not') {
                negate = true;
                cursor = 1;
            }

            const kind = (tokens[cursor] || '').toLowerCase();
            let condition;
            let action;

            if (['exist', 'defined', 'errorlevel', 'cmdextversion'].includes(kind)) {
                if (!tokens[cursor + 1]) return;
                condition = tokens.slice(0, cursor + 2).join(' ');
                action = tokens.slice(cursor + 2).join(' ');
                if (negate) condition = 'not ' + condition.replace(/^not\s+/i, '');
            } else {
                condition = negate ? `not ${tokens[cursor]}` : tokens[cursor];
                action = tokens.slice(cursor + 1).join(' ');
            }

            const elseMatch = action.match(/^(.+?)\s+else\s+(.+)$/i);
            if (evalIfCondition(condition)) runInline(elseMatch ? elseMatch[1] : action);
            else if (elseMatch) runInline(elseMatch[2]);
        }

        function runInline(action) {
            const expanded = expand(action.trim());
            if (!expanded) return;
            if (expanded.startsWith('(') && expanded.endsWith(')')) {
                const inner = expanded.slice(1, -1);
                for (const part of inner.split(/\r?\n|(?<!^)&(?!&)/).map(s => s.trim()).filter(Boolean)) {
                    executeLine(part, true);
                    if (!running) break;
                }
            } else {
                for (const part of splitCommandChain(expanded)) {
                    executeLine(part, true);
                    if (!running) break;
                }
            }
        }

        function parseFor(expr) {
            // for /L %A in (start,step,end) do command
            let m = expr.match(/^(?:\/L\s+)?(?:%%?([A-Za-z])|%FOR_([A-Z])%)\s+in\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s+do\s+(.+)$/is);
            if (m) {
                const name = (m[1] || m[2]).toUpperCase();
                let [start, step, end] = [Number(m[3]), Number(m[4]), Number(m[5])];
                const action = m[6];
                if (step === 0) { errorLevel = 1; return; }
                for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
                    setVar(`FOR_${name}`, String(value));
                    setVar(`FOR_${name}_FULL`, String(value));
                    runInline(replaceForVars(action));
                    if (!running) break;
                }
                errorLevel = 0;
                return;
            }

            // for %A in (one two "three four") do command
            m = expr.match(/^(?:%%?([A-Za-z])|%FOR_([A-Z])%)\s+in\s*\((.*)\)\s+do\s+(.+)$/is);
            if (m) {
                const name = (m[1] || m[2]).toUpperCase();
                const items = parseForSet(m[3]);
                const action = m[4];
                for (const item of items) {
                    setVar(`FOR_${name}`, item);
                    setVar(`FOR_${name}_FULL`, item);
                    runInline(replaceForVars(action));
                    if (!running) break;
                }
                errorLevel = 0;
                return;
            }

            // for /F with a quoted command: lightweight command-output mode.
            m = expr.match(/^\/F(?:\s+"([^"]*)")?\s+(?:%%?([A-Za-z])|%FOR_([A-Z])%)\s+in\s*\((.*)\)\s+do\s+(.+)$/is);
            if (m) {
                const name = (m[2] || m[3]).toUpperCase();
                const source = m[4].trim();
                const action = m[5];
                let records = [];
                if (source.startsWith('"') && source.endsWith('"')) {
                    records = source.slice(1, -1).split(/\r?\n/);
                } else if (source.startsWith("'") && source.endsWith("'")) {
                    // We do not execute host processes. Treat it as command text and
                    // expose one logical record if it matches a built-in output source.
                    records = [source.slice(1, -1)];
                } else {
                    records = parseForSet(source);
                }
                for (const item of records) {
                    setVar(`FOR_${name}`, item);
                    setVar(`FOR_${name}_FULL`, item);
                    runInline(replaceForVars(action));
                }
                errorLevel = 0;
                return;
            }

            errorLevel = 1;
        }

        function parseForSet(text) {
            const result = [];
            let cur = '';
            let quote = false;
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch === '"') {
                    quote = !quote;
                    continue;
                }
                if (/\s/.test(ch) && !quote) {
                    if (cur) { result.push(cur); cur = ''; }
                } else cur += ch;
            }
            if (cur) result.push(cur);
            return result;
        }

        function replaceForVars(text) {
            return text.replace(/%FOR_([A-Z])(?:_FULL)?%|%%~([A-Za-z])|%%([A-Za-z])|%([A-Za-z])/g,
                (m, direct, mod, a, b) => {
                    if (direct) {
                        const full = /_FULL%$/i.test(m);
                        return getVar(`FOR_${direct.toUpperCase()}${full ? '_FULL' : ''}`);
                    }
                    const name = (mod || a || b).toUpperCase();
                    return getVar(`FOR_${name}${mod ? '_FULL' : ''}`);
                });
        }

        function makeDir(path) {
            const parts = String(path).replace(/\\/g, '/').split('/').filter(Boolean);
            let current = String(path).startsWith('/') ? ['/'] : [...getCwd()];
            for (const part of parts) {
                const child = [...current, part];
                if (!FileSystem.itemExists(child)) FileSystem.createFolder(current, part);
                current = child;
            }
        }

        function deletePath(path, recursive = false) {
            const target = resolvePathArray(path);
            if (!FileSystem.itemExists(target)) {
                errorLevel = 1;
                return false;
            }
            if (FileSystem.isFolder(target) && !recursive && FileSystem.getChildren(target).length) {
                errorLevel = 1;
                return false;
            }
            FileSystem.deleteItem(target);
            errorLevel = 0;
            return true;
        }

        function copyFile(srcArg, dstArg, move = false) {
            const src = resolvePathArray(stripOuterQuotes(srcArg));
            const srcContent = FileSystem.readFile(src);
            if (srcContent === null || srcContent === undefined) {
                doPrint('The system cannot find the file specified.');
                errorLevel = 1;
                return;
            }

            const dst = resolvePathArray(stripOuterQuotes(dstArg));
            let finalDst = dst;
            if (FileSystem.isFolder(dst)) finalDst = [...dst, src[src.length - 1]];

            if (FileSystem.itemExists(finalDst)) FileSystem.writeFile(finalDst, srcContent);
            else {
                const name = finalDst[finalDst.length - 1];
                const parent = finalDst.slice(0, -1);
                const dot = name.lastIndexOf('.');
                const ext = dot >= 0 ? name.slice(dot + 1) : '';
                FileSystem.createFile(parent, name, srcContent, ext);
            }
            if (move) FileSystem.deleteItem(src);
            doPrint(move ? '        1 file(s) moved.' : '        1 file(s) copied.');
            errorLevel = 0;
        }

        function executeLine(rawLine, inline = false) {
            if (!running) return;

            let line = String(rawLine ?? '').replace(/\r$/, '').trim();
            if (!line) return;

            let suppressed = false;
            if (line.startsWith('@')) {
                suppressed = true;
                line = line.slice(1).trim();
            }

            if (/^rem(?:\s|$)/i.test(line) || /^::/.test(line)) return;

            // Parenthesized block is only a grouping construct; execute each line.
            if (line.startsWith('(') && line.endsWith(')') && !/^if\b/i.test(line)) {
                const inner = line.slice(1, -1);
                for (const part of inner.split(/\r?\n/)) executeLine(part, true);
                return;
            }

            const originalBeforeExpansion = line;
            const redir = findRedirection(line);
            line = expand(redir.command);

            if (!inline) setEchoOutput(originalBeforeExpansion, suppressed);

            if (!line) return;

            const lower = line.toLowerCase();

            if (lower === 'echo off') { echoOn = false; errorLevel = 0; return; }
            if (lower === 'echo on') { echoOn = true; errorLevel = 0; return; }
            if (lower === 'echo.' || lower === 'echo;') { doPrint('', redir); errorLevel = 0; return; }
            if (lower === 'echo') { doPrint(echoOn ? 'ECHO is on.' : 'ECHO is off.', redir); return; }
            if (lower.startsWith('echo ')) { doPrint(line.slice(5), redir); errorLevel = 0; return; }

            if (/^setlocal(?:\s+|$)/i.test(line)) {
                envStack.push({ env: cloneEnv(), delayedExpansion, echoOn });
                if (/\benableextensions\b/i.test(line)) {}
                if (/\benabledelayedexpansion\b/i.test(line)) delayedExpansion = true;
                if (/\bdisabledelayedexpansion\b/i.test(line)) delayedExpansion = false;
                errorLevel = 0;
                return;
            }

            if (/^endlocal$/i.test(line)) {
                const saved = envStack.pop();
                if (saved) {
                    for (const key of Object.keys(vars)) delete vars[key];
                    Object.assign(vars, saved.env);
                    delayedExpansion = saved.delayedExpansion;
                    echoOn = saved.echoOn;
                }
                errorLevel = 0;
                return;
            }

            if (/^set\s+\/a(?:\s+|$)/i.test(line)) {
                let expr = line.replace(/^set\s+\/a(?:\s+)?/i, '').trim();
                const quoted = stripOuterQuotes(expr);
                const eq = quoted.indexOf('=');
                if (eq >= 0) {
                    const name = quoted.slice(0, eq).trim();
                    const rhs = quoted.slice(eq + 1).trim();
                    try { setVar(name, evalSetA(rhs)); errorLevel = 0; } catch { errorLevel = 1; }
                } else {
                    try { const n = evalSetA(quoted); doPrint(String(n), redir); errorLevel = 0; } catch { errorLevel = 1; }
                }
                return;
            }

            if (/^set\s+\/p\b/i.test(line)) {
                // No interactive stdin in the simulator. Keep the existing value or
                // create an empty variable, matching a non-input environment safely.
                const m = line.match(/^set\s+\/p\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/i);
                if (m) setVar(m[1], getVar(m[1]) || '');
                errorLevel = 0;
                return;
            }

            if (/^set(?:\s|$)/i.test(line)) {
                const rest = line.slice(3).trim();
                if (!rest) {
                    const entries = Object.entries(vars).sort(([a], [b]) => a.localeCompare(b));
                    doPrint(entries.map(([k, v]) => `${k}=${v}`).join('\n'), redir);
                    errorLevel = 0;
                    return;
                }

                let setText = rest;
                const quoted = /^"([^"]*)"$/.exec(setText);
                if (quoted) setText = quoted[1];
                const eq = setText.indexOf('=');
                if (eq < 0) {
                    const prefix = normName(setText);
                    const entries = Object.entries(vars).filter(([k]) => k.startsWith(prefix));
                    doPrint(entries.map(([k, v]) => `${k}=${v}`).join('\n'), redir);
                    return;
                }
                const name = setText.slice(0, eq).trim();
                const value = setText.slice(eq + 1);
                setVar(name, value);
                errorLevel = 0;
                return;
            }

            if (/^(cd|chdir)(?:\s|$)/i.test(line)) {
                const arg = stripOuterQuotes(line.replace(/^(cd|chdir)\s*/i, '').trim());
                if (!arg) {
                    doPrint(pathToString(getCwd()), redir);
                } else {
                    const target = resolvePathArray(arg);
                    if (folderExists(arg)) { setCwd(target); errorLevel = 0; }
                    else { doPrint('The system cannot find the path specified.'); errorLevel = 1; }
                }
                return;
            }

            if (/^(md|mkdir)(?:\s|$)/i.test(line)) {
                const arg = line.replace(/^(md|mkdir)\s+/i, '').trim().replace(/\/p\b/ig, '').trim();
                makeDir(stripOuterQuotes(arg));
                errorLevel = 0;
                return;
            }

            if (/^(rd|rmdir)(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^(rd|rmdir)\s+/i, '').trim();
                const recursive = /(?:^|\s)\/s\b/i.test(rest);
                if (!deletePath(rest.replace(/\/[sq]\b/ig, '').trim(), recursive)) {
                    doPrint('The directory is not empty or cannot be found.');
                }
                return;
            }

            if (/^(del|erase)(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^(del|erase)\s+/i, '').trim();
                const parts = splitArgs(rest);
                let deleted = false;
                for (const part of parts) {
                    if (/^\/[a-z]+/i.test(part)) continue;
                    const target = resolvePathArray(stripOuterQuotes(part));
                    if (FileSystem.itemExists(target) && !FileSystem.isFolder(target)) {
                        FileSystem.deleteItem(target);
                        deleted = true;
                    }
                }
                errorLevel = deleted ? 0 : 1;
                return;
            }

            if (/^type(?:\s|$)/i.test(line)) {
                const arg = stripOuterQuotes(line.replace(/^type\s*/i, '').trim());
                const target = resolvePathArray(arg);
                const content = FileSystem.readFile(target);
                if (content === null || content === undefined || FileSystem.isFolder(target)) {
                    doPrint('The system cannot find the file specified.', redir);
                    errorLevel = 1;
                } else {
                    doPrint(content, redir);
                    errorLevel = 0;
                }
                return;
            }

            if (/^(copy|xcopy)(?:\s|$)/i.test(line)) {
                const parts = splitArgs(line.replace(/^(copy|xcopy)\s+/i, '').trim()).filter(p => !/^\/[a-z]/i.test(p));
                if (parts.length < 2) { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; }
                else copyFile(parts[0], parts[1], false);
                return;
            }

            if (/^move(?:\s|$)/i.test(line)) {
                const parts = splitArgs(line.replace(/^move\s+/i, '').trim()).filter(p => !/^\/[a-z]/i.test(p));
                if (parts.length < 2) { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; }
                else copyFile(parts[0], parts[1], true);
                return;
            }

            if (/^(ren|rename)(?:\s|$)/i.test(line)) {
                const parts = splitArgs(line.replace(/^(ren|rename)\s+/i, '').trim());
                if (parts.length < 2) { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; return; }
                const target = resolvePathArray(stripOuterQuotes(parts[0]));
                const ok = FileSystem.renameItem(target, stripOuterQuotes(parts[1]));
                if (!ok) { doPrint('The system cannot find the file specified.'); errorLevel = 1; }
                else errorLevel = 0;
                return;
            }

            if (/^dir(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^dir\s*/i, '').trim();
                const target = rest ? resolvePathArray(stripOuterQuotes(splitArgs(rest)[0])) : getCwd();
                if (!FileSystem.isFolder(target)) { doPrint('File Not Found', redir); errorLevel = 1; return; }
                const children = FileSystem.getChildren(target) || [];
                const header = ` Volume in drive has no label.\n\n Directory of ${pathToString(target)}\n\n`;
                const body = children.map(e => {
                    const date = e.modified ? new Date(e.modified).toLocaleDateString() : '';
                    return `${date}  ${e.type === 'folder' ? '<DIR>' : String(e.size ?? 0).padStart(14)}  ${e.name}`;
                }).join('\n');
                doPrint(header + body, redir);
                errorLevel = 0;
                return;
            }

            if (lower === 'cls') { printFn('\x1BCLS'); errorLevel = 0; return; }
            if (/^title\s+/i.test(line)) { printFn('\x1BTITLE:' + stripOuterQuotes(line.slice(6).trim())); errorLevel = 0; return; }
            if (/^color\s+/i.test(line)) { printFn('\x1BCOLOR:' + line.slice(6).trim()); errorLevel = 0; return; }
            if (/^timeout\s+/i.test(line)) {
                // Timing the UI is outside the synchronous interpreter; return success.
                errorLevel = 0;
                return;
            }

            if (/^choice(?:\s|$)/i.test(line)) {
                const raw = line.replace(/^choice\s*/i, '').trim();
                const parts = splitArgs(raw);
                let choices = 'YN'.split('');
                let message = 'Y,N?';
                let defaultChoice = null;

                for (let i = 0; i < parts.length; i++) {
                    if (/^\/c$/i.test(parts[i]) && parts[i + 1]) choices = stripOuterQuotes(parts[++i]).split('');
                    else if (/^\/m$/i.test(parts[i]) && parts[i + 1]) message = stripOuterQuotes(parts[++i]);
                    else if (/^\/d$/i.test(parts[i]) && parts[i + 1]) defaultChoice = stripOuterQuotes(parts[++i]);
                }

                doPrint(message, redir);
                waitingForAsync = true;
                running = false;
                Popup.pick('Choice', message, choices.map((c, i) => ({ label: `[${c}] ${c}`, value: i + 1 })))
                    .then(result => {
                        if (result !== null && result !== undefined) errorLevel = Number(result);
                        else if (defaultChoice) {
                            const idx = choices.findIndex(c => c.toUpperCase() === defaultChoice.toUpperCase());
                            errorLevel = idx >= 0 ? idx + 1 : 1;
                        } else errorLevel = 1;
                        running = true;
                        waitingForAsync = false;
                        pc++;
                        executeLoop();
                    })
                    .catch(() => {
                        errorLevel = 1;
                        running = true;
                        waitingForAsync = false;
                        pc++;
                        executeLoop();
                    });
                return;
            }

            if (/^if(?:\s|$)/i.test(line)) {
                handleIf(line.replace(/^if\s+/i, ''));
                return;
            }

            if (/^for(?:\s|$)/i.test(line)) {
                parseFor(line.replace(/^for\s+/i, ''));
                return;
            }

            if (/^goto(?:\s|$)/i.test(line)) {
                const label = line.replace(/^goto\s+/i, '').trim();
                const name = label.startsWith(':') ? label.slice(1) : label;
                if (name.toLowerCase() === 'eof') {
                    running = false;
                    return;
                }
                const target = labels.get(name.toUpperCase());
                if (target === undefined) {
                    doPrint(`The system cannot find the batch label specified - ${name}.`);
                    errorLevel = 1;
                } else pc = target;
                return;
            }

            if (/^call(?:\s|$)/i.test(line)) {
                const target = line.replace(/^call\s+/i, '').trim();
                const labelCall = target.match(/^:([^\s]+)(?:\s+(.*))?$/);
                if (labelCall) {
                    const targetPc = labels.get(labelCall[1].toUpperCase());
                    if (targetPc === undefined) {
                        doPrint(`The system cannot find the batch label specified - ${labelCall[1]}.`);
                        errorLevel = 1;
                        return;
                    }

                    const savedPc = pc;
                    const savedArgs = args;
                    const savedScriptName = scriptName;
                    const savedReturn = returnFromCall;
                    const localArgs = splitArgs(labelCall[2] || '');
                    args = [scriptName, ...localArgs];
                    scriptName = `${savedScriptName}:${labelCall[1]}`;
                    returnFromCall = false;
                    pc = targetPc + 1;

                    let guard = 0;
                    while (running && pc < lines.length && !waitingForAsync && !returnFromCall && guard++ < 500000) {
                        const before = pc;
                        executeLine(lines[pc]);
                        if (returnFromCall) break;
                        if (pc === before) pc++;
                    }

                    if (guard >= 500000) {
                        doPrint('Batch subroutine exceeded maximum iterations (possible infinite loop).');
                        errorLevel = 1;
                    }

                    returnFromCall = savedReturn;
                    args = savedArgs;
                    scriptName = savedScriptName;
                    pc = savedPc;
                    return;
                }

                const parts = splitArgs(target);
                const file = stripOuterQuotes(parts.shift() || '');
                if (/\.(bat|cmd)$/i.test(file)) {
                    const content = FileSystem.readFile(resolvePathArray(file));
                    if (content === null || content === undefined) {
                        doPrint(`'${file}' is not recognized as an internal or external command.`);
                        errorLevel = 1;
                        return;
                    }

                    const saved = { lines, pc, labels, args, scriptName };
                    args = [file, ...parts];
                    scriptName = file;
                    lines = content.split(/\r?\n/);
                    pc = 0;
                    buildLabels();

                    let guard = 0;
                    while (running && pc < lines.length && !waitingForAsync && guard++ < 500000) {
                        const before = pc;
                        executeLine(lines[pc]);
                        if (returnFromCall) {
                            returnFromCall = false;
                            break;
                        }
                        if (pc === before) pc++;
                    }

                    if (guard >= 500000) {
                        doPrint('Called batch script exceeded maximum iterations (possible infinite loop).');
                        errorLevel = 1;
                    }

                    lines = saved.lines;
                    pc = saved.pc;
                    labels = saved.labels;
                    args = saved.args;
                    scriptName = saved.scriptName;
                    return;
                }

                doPrint(`'${file}' is not recognized as an internal or external command, operable program or batch file.`);
                errorLevel = 1;
                return;
            }

            if (/^exit(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^exit\s*/i, '').trim();
                if (/^\/b\b/i.test(rest)) {
                    returnFromCall = true;
                    return;
                }
                running = false;
                return;
            }

            if (/^shift\b/i.test(line)) {
                if (args.length > 1) args.splice(1, 1);
                errorLevel = 0;
                return;
            }

            if (/^pause$/i.test(line)) {
                doPrint('Press any key to continue . . .', redir);
                errorLevel = 0;
                return;
            }

            // Common executable aliases can be simulated rather than touching the host.
            if (/^(ver|whoami|hostname)$/i.test(line)) {
                if (/^ver$/i.test(line)) doPrint('Microsoft Windows [Version 12.0.0]');
                else if (/^whoami$/i.test(line)) doPrint(`${getVar('COMPUTERNAME')}\\${getVar('USERNAME')}`);
                else doPrint(getVar('COMPUTERNAME'));
                errorLevel = 0;
                return;
            }

            doPrint(`'${splitArgs(line)[0] || line}' is not recognized as an internal or external command, operable program or batch file.`);
            errorLevel = 9009;
        }

        let returnFromCall = false;
        function countParens(text) {
            let depth = 0, quote = false;
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch === '"') quote = !quote;
                if (quote) continue;
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
            }
            return depth;
        }

        function executeLoop() {
            const maxIter = 500000;
            let iter = 0;
            while (running && pc < lines.length && iter++ < maxIter) {
                const before = pc;
                let sourceLine = lines[pc];
                let groupedEnd = null;

                // CMD treats parenthesized command groups as one compound command.
                // Gather multiline groups before dispatching IF / FOR blocks.
                if (countParens(sourceLine) > 0 && !/^\s*rem(?:\s|$)/i.test(sourceLine)) {
                    const group = [sourceLine];
                    let depth = countParens(sourceLine);
                    let cursor = pc + 1;
                    while (cursor < lines.length && depth > 0) {
                        group.push(lines[cursor]);
                        depth += countParens(lines[cursor]);
                        cursor++;
                    }
                    sourceLine = group.join('\n');
                    groupedEnd = cursor;
                    pc = cursor - 1;
                }

                executeLine(sourceLine);

                if (waitingForAsync) return;
                if (!running) break;
                if (returnFromCall) break;
                if (groupedEnd !== null && pc === groupedEnd - 1) {
                    pc = groupedEnd;
                } else if (pc === before) {
                    pc++;
                }
            }

            if (iter >= maxIter) {
                printFn('Batch script exceeded maximum iterations (possible infinite loop).');
                errorLevel = 1;
            }
            if (!waitingForAsync) running = false;
            return errorLevel;
        }

        function run(script, runArgs = []) {
            lines = String(script ?? '').split(/\r?\n/);
            pc = 0;
            running = true;
            waitingForAsync = false;
            echoOn = true;
            delayedExpansion = false;
            errorLevel = 0;
            envStack = [];
            for (const key of Object.keys(vars)) delete vars[key];
            args = [scriptName, ...(runArgs || [])].map(v => String(v));
            scriptName = 'script.bat';
            buildLabels();
            return executeLoop();
        }

        return { run };
    }

    return { create };
})();

export default BatchEngine;
