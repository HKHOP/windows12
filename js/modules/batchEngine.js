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
        let dirStack = [];
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
            if (key === 'CD') return pathToString(getCwd());
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

        // Split a command line on top-level &, && and || (quote- and
        // paren-aware). Single | is a pipe and stays inside the segment.
        // Returns [{ cmd, op }] where op is the operator BEFORE the segment.
        function splitChainTop(line) {
            const out = [];
            let cur = '';
            let quote = false;
            let paren = 0;
            let pendingOp = null;
            const src = String(line ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === '"') { quote = !quote; cur += ch; continue; }
                if (!quote) {
                    if (ch === '(') paren++;
                    else if (ch === ')') paren = Math.max(0, paren - 1);
                    else if (paren === 0 && ch === '&') {
                        if (cur.trim()) out.push({ cmd: cur.trim(), op: pendingOp });
                        else if (pendingOp) out.push({ cmd: '', op: pendingOp });
                        pendingOp = src[i + 1] === '&' ? '&&' : '&';
                        if (src[i + 1] === '&') i++;
                        cur = '';
                        continue;
                    } else if (paren === 0 && ch === '|' && src[i + 1] === '|') {
                        if (cur.trim()) out.push({ cmd: cur.trim(), op: pendingOp });
                        else if (pendingOp) out.push({ cmd: '', op: pendingOp });
                        pendingOp = '||';
                        i++;
                        cur = '';
                        continue;
                    }
                }
                cur += ch;
            }
            if (cur.trim() || pendingOp) out.push({ cmd: cur.trim(), op: pendingOp });
            return out;
        }

        // Split a chain segment on top-level single pipes.
        function splitPipeTop(line) {
            const out = [];
            let cur = '';
            let quote = false;
            let paren = 0;
            const src = String(line ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === '"') { quote = !quote; cur += ch; continue; }
                if (!quote) {
                    if (ch === '(') paren++;
                    else if (ch === ')') paren = Math.max(0, paren - 1);
                    else if (ch === '|' && paren === 0) {
                        if (src[i + 1] === '|') { cur += '||'; i++; continue; }
                        out.push(cur.trim());
                        cur = '';
                        continue;
                    }
                }
                cur += ch;
            }
            out.push(cur.trim());
            return out.filter((s, i) => s !== '' || i === out.length - 1);
        }

        // Stdin for filter commands (sort/more/find), fed by pipes or "< file".
        let pipeStdin = null;

        function findRedirection(line) {
            let quote = false;
            let command = '';
            let type = null;
            let file = null;
            let stdinFile = null;
            const src = String(line ?? '');
            let i = 0;
            let cur = '';
            const flushFile = (end) => {
                let j = end;
                while (j < src.length && /\s/.test(src[j])) j++;
                let k = j;
                let q = false;
                while (k < src.length) {
                    if (src[k] === '"') q = !q;
                    if (!q && (src[k] === '&' || src[k] === '|' || src[k] === '<' || src[k] === '>')) break;
                    k++;
                }
                return { name: stripOuterQuotes(src.slice(j, k).trim()), next: k };
            };
            while (i < src.length) {
                const ch = src[i];
                if (ch === '"') { quote = !quote; cur += ch; i++; continue; }
                if (!quote) {
                    // Handle merge operators like 2>&1 / 1>&2: strip, no-op.
                    const merge = src.slice(i).match(/^[012]?>&[012]\b/);
                    if (merge) { i += merge[0].length; continue; }
                    if (ch === '<' && src[i + 1] !== '<') {
                        const r = flushFile(i + 1);
                        stdinFile = r.name;
                        i = r.next;
                        continue;
                    }
                    if (ch === '>' || src.startsWith('>>', i)) {
                        const append = src.startsWith('>>', i);
                        // Optional leading handle digit (0/1/2): already in cur tail.
                        const hd = cur.match(/([012])\s*$/);
                        if (hd) cur = cur.slice(0, cur.length - hd[0].length);
                        const r = flushFile(i + (append ? 2 : 1));
                        type = append ? 'append' : 'overwrite';
                        file = r.name;
                        i = r.next;
                        continue;
                    }
                }
                cur += ch;
                i++;
            }
            command = cur.trim();
            return { command, type, file, stdinFile };
        }

        function resolvePathArray(input) {
            let p = String(input ?? '').trim().replace(/\\/g, '/');
            if (!p) return [...getCwd()];
            if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
            if (/^[A-Za-z]:/.test(p)) {
                p = p.replace(/^[A-Za-z]:/, '');
            }

            const absolute = p.startsWith('/');
            const result = ['/'];
            if (!absolute) {
                // Relative paths resolve against the real cwd — the old code
                // dropped the cwd segments and silently landed every file in /.
                for (const seg of getCwd()) {
                    if (seg !== '/') result.push(seg);
                }
            }
            for (const part of p.split('/').filter(Boolean)) {
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
            const parts = [...(path || [])].filter(p => p !== '/');
            return '\\' + parts.join('\\');
        }

        function escapeRegExp(s) {
            return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // Translate CMD wildcards (* and ?) into a case-insensitive RegExp.
        function wildcardToRegExp(pattern) {
            let re = '';
            for (const ch of String(pattern ?? '')) {
                if (ch === '*') re += '.*';
                else if (ch === '?') re += '.';
                else re += escapeRegExp(ch);
            }
            return new RegExp('^' + re + '$', 'i');
        }

        // Split "dir/prefix*.txt" into a directory plus matches. Returns null
        // when the argument has no wildcard characters.
        function expandWildcard(arg) {
            const raw = stripOuterQuotes(String(arg ?? '').trim()).replace(/\\/g, '/');
            if (!/[*?]/.test(raw)) return null;
            const cleaned = raw.replace(/^[A-Za-z]:/, '');
            const slash = cleaned.lastIndexOf('/');
            const dirPart = slash >= 0 ? cleaned.slice(0, slash) : '';
            const pat = slash >= 0 ? cleaned.slice(slash + 1) : cleaned;
            const dir = dirPart ? resolvePathArray(dirPart) : [...getCwd()];
            if (!FileSystem.isFolder(dir)) return { dir, matches: [] };
            let children = [];
            try { children = FileSystem.getChildren(dir) || []; } catch { children = []; }
            const re = wildcardToRegExp(pat);
            return { dir, matches: children.filter(e => re.test(e.name)) };
        }

        // Depth-first walk returning [{ path, entry }] for every descendant.
        function walkTree(dir, out = []) {
            let children = [];
            try { children = FileSystem.getChildren(dir) || []; } catch { children = []; }
            for (const c of children) {
                const full = [...dir, c.name];
                out.push({ path: full, entry: c });
                if (c.type === 'folder') walkTree(full, out);
            }
            return out;
        }

        function relDisplay(base, full) {
            const rest = full.slice(base.length);
            return rest.join('\\') || '.';
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

            // Lone %X (single %A-style loop variable, interactive form).
            // Without this, the generic %...% rule below pairs the two ends
            // of "for %A ... do ... %A" into one fake variable and wipes the
            // whole FOR statement. Closed %A% stays a normal variable.
            s = s.replace(/%([A-Za-z])(?![A-Za-z0-9_])/g, (m, v, off, str) => {
                if (str[off + 2] === '%') return m;
                return `%FOR_${v.toUpperCase()}%`;
            });

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

        // Output capture for pipeline stages. A file redirect on the same
        // stage still wins and writes to the file instead of the pipe.
        let captureHook = null;

        function doPrint(text, redirect = null) {
            const output = String(text ?? '');
            if (captureHook && !redirect?.file) {
                captureHook(output);
                return;
            }
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
            // Hex literals (0x1F) are not valid JS identifiers — fold first.
            source = source.replace(/\b0[xX]([0-9a-fA-F]+)\b/g, (_, h) => String(parseInt(h, 16)));
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

        function evalIfCondition(condition, ignoreCase = false) {
            let c = expand(condition).trim();

            let negate = false;
            if (/^not\s+/i.test(c)) {
                negate = true;
                c = c.replace(/^not\s+/i, '').trim();
            }

            let             m = c.match(/^exist\s+"?(.+?)"?$/i);
            if (m) {
                let exists = fileExists(m[1]);
                if (!exists && /[*?]/.test(m[1])) {
                    const wx = expandWildcard(m[1]);
                    exists = !!wx && wx.matches.length > 0;
                }
                return negate ? !exists : exists;
            }

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
                if (op === '==' || op === 'EQU') ok = na !== null && nb !== null && !ignoreCase ? na === nb : compareStrings(a, b, ignoreCase) === 0;
                else if (op === 'NEQ') ok = na !== null && nb !== null && !ignoreCase ? na !== nb : compareStrings(a, b, ignoreCase) !== 0;
                else if (op === 'LSS') ok = na !== null && nb !== null ? na < nb : compareStrings(a, b, ignoreCase) < 0;
                else if (op === 'LEQ') ok = na !== null && nb !== null ? na <= nb : compareStrings(a, b, ignoreCase) <= 0;
                else if (op === 'GTR') ok = na !== null && nb !== null ? na > nb : compareStrings(a, b, ignoreCase) > 0;
                else ok = na !== null && nb !== null ? na >= nb : compareStrings(a, b, ignoreCase) >= 0;
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
            let text = expand(expr.trim());
            let ignoreCase = false;
            if (/^\/i(?:\s+|$)/i.test(text)) {
                ignoreCase = true;
                text = text.replace(/^\/i\s*/i, '');
            }

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

                    if (evalIfCondition(condition, ignoreCase)) runInline(trueBlock);
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
                if (evalIfCondition(condition, ignoreCase)) runInline(elseMatch ? elseMatch[1] : action);
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
            if (evalIfCondition(condition, ignoreCase)) runInline(elseMatch ? elseMatch[1] : action);
            else if (elseMatch) runInline(elseMatch[2]);
        }

        function runInline(action) {
            const expanded = expand(action.trim());
            if (!expanded) return;
            if (expanded.startsWith('(') && expanded.endsWith(')')) {
                const inner = expanded.slice(1, -1);
                for (const part of inner.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
                    // Each part may itself chain (&, &&, ||) or pipe — routing
                    // lives in executeLine.
                    executeLine(part, true);
                    if (!running || waitingForAsync) break;
                }
            } else {
                for (const part of expanded.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
                    executeLine(part, true);
                    if (!running || waitingForAsync) break;
                }
            }
        }

        function parseForFOptions(optStr) {
            const o = { tokens: '1', delims: ' \t', skip: 0, eol: ';', usebackq: false };
            if (!optStr) return o;
            for (const t of String(optStr).trim().split(/\s+/)) {
                let m;
                if ((m = t.match(/^tokens=(.*)$/i))) { o.tokens = m[1] || '*'; continue; }
                if ((m = t.match(/^delims=(.*)$/i))) { o.delims = m[1]; continue; }
                if ((m = t.match(/^skip=(\d+)$/i))) { o.skip = Number(m[1]); continue; }
                if ((m = t.match(/^eol=(.)$/i))) { o.eol = m[1]; continue; }
                if (/^usebackq$/i.test(t)) o.usebackq = true;
            }
            return o;
        }

        // "1,3-4,5*" -> [{token,1},{token,3},{token,4},{token,5},{rest,5}]
        // "*" alone -> [{rest,0}] (whole line).
        function parseTokens(spec) {
            const out = [];
            for (const part of String(spec || '1').split(',')) {
                const p = part.trim();
                if (!p) continue;
                if (p === '*') { out.push({ rest: 0 }); continue; }
                const m = p.match(/^(\d+)(?:-(\d+))?(\*)?$/);
                if (!m) continue;
                const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
                for (let n = a; n <= b; n++) out.push({ token: n });
                if (m[3]) out.push({ rest: b });
            }
            return out.length ? out : [{ token: 1 }];
        }

        function splitDelims(line, delims) {
            const src = String(line ?? '');
            if (delims === '') return src ? [{ text: src, start: 0, end: src.length }] : [];
            const isDel = (ch) => delims.includes(ch);
            const out = [];
            let i = 0;
            while (i < src.length) {
                while (i < src.length && isDel(src[i])) i++;
                if (i >= src.length) break;
                const s = i;
                while (i < src.length && !isDel(src[i])) i++;
                out.push({ text: src.slice(s, i), start: s, end: i });
            }
            return out;
        }

        function runForFLines(rawLines, opts, varName, action) {
            const spec = parseTokens(opts.tokens);
            const base = varName.toUpperCase().charCodeAt(0);
            let skipped = 0;
            for (const raw of rawLines) {
                if (!running || waitingForAsync) break;
                if (raw === '') continue;
                if (skipped < opts.skip) { skipped++; continue; }
                if (opts.eol && raw.startsWith(opts.eol)) continue;
                const parts = splitDelims(raw, opts.delims);
                spec.forEach((sel, pos) => {
                    const letter = String.fromCharCode(base + pos);
                    let val = '';
                    if (sel.rest != null) {
                        if (sel.rest === 0) {
                            val = raw;
                        } else {
                            const anchor = parts[sel.rest - 1];
                            if (anchor) {
                                let j = anchor.end;
                                while (j < raw.length && opts.delims.includes(raw[j])) j++;
                                val = raw.slice(j);
                            }
                        }
                    } else {
                        val = parts[sel.token - 1] ? parts[sel.token - 1].text : '';
                    }
                    setVar(`FOR_${letter}`, val);
                    setVar(`FOR_${letter}_FULL`, val);
                });
                runInline(replaceForVars(action));
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

            // for /F ["options"] %A in (source) do command
            // options: tokens= delims= skip= eol= usebackq
            m = expr.match(/^\/F(?:\s+"([^"]*)")?\s+(?:%%?([A-Za-z])|%FOR_([A-Z])%)\s+in\s*\((.*)\)\s+do\s+(.+)$/is);
            if (m) {
                const name = (m[2] || m[3]).toUpperCase();
                const opts = parseForFOptions(m[1] || '');
                const source = m[4].trim();
                const action = m[5];
                const feed = (lines) => runForFLines(lines, opts, name, action);
                if (opts.usebackq) {
                    if (source.startsWith('"') && source.endsWith('"') && source.length >= 2) {
                        const full = resolvePathArray(source.slice(1, -1));
                        const content = FileSystem.readFile(full);
                        if (content === null || content === undefined || FileSystem.isFolder(full)) {
                            doPrint('The system cannot find the file specified.');
                            errorLevel = 1;
                            return;
                        }
                        feed(String(content).split(/\r?\n/));
                    } else {
                        // 'command' / `command`: host processes cannot be
                        // executed — expose the text as a single record.
                        const q = source.match(/^'(.*)'$/s) || source.match(/^`(.*)`$/s);
                        feed([(q ? q[1] : source).split(/\r?\n/)].flat());
                    }
                } else if (source.startsWith('"') && source.endsWith('"') && source.length >= 2) {
                    feed(source.slice(1, -1).split(/\r?\n/));
                } else if (source.startsWith("'") && source.endsWith("'") && source.length >= 2) {
                    feed([source.slice(1, -1)]);
                } else {
                    // Bare set: existing files are read line by line,
                    // anything else falls back to plain word records.
                    const items = parseForSet(source);
                    const lines = [];
                    let usedFile = false;
                    for (const item of items) {
                        const full = resolvePathArray(item);
                        const content = FileSystem.readFile(full);
                        if (content !== null && content !== undefined && !FileSystem.isFolder(full)) {
                            usedFile = true;
                            lines.push(...String(content).split(/\r?\n/));
                        }
                    }
                    feed(usedFile && lines.length ? lines : items);
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
            const full = resolvePathArray(stripOuterQuotes(path));
            let current = ['/'];
            let ok = true;
            for (const part of full.slice(1)) {
                const child = [...current, part];
                if (!FileSystem.itemExists(child)) {
                    if (!FileSystem.createFolder(current, part)) { ok = false; break; }
                }
                current = child;
            }
            return ok;
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

        function writeFileAt(full, content) {
            if (FileSystem.itemExists(full)) {
                const node = FileSystem.getNode(full);
                if (node && node.type === 'folder') return false;
                return FileSystem.writeFile(full, content);
            }
            const name = full[full.length - 1];
            const parent = full.slice(0, -1);
            const dot = name.lastIndexOf('.');
            const ext = dot >= 0 ? name.slice(dot + 1) : '';
            return FileSystem.createFile(parent, name, content, ext);
        }

        // Collect source files for copy/move: expands "+" concatenation and
        // wildcards. Returns { files: [pathArray], concat: bool }.
        function collectCopySources(token) {
            const chunks = String(token).split('+');
            const concat = chunks.length > 1;
            const files = [];
            for (const chunk of chunks) {
                const c = stripOuterQuotes(chunk.trim());
                if (!c) continue;
                const wx = expandWildcard(c);
                if (wx) {
                    for (const m of wx.matches) {
                        if (m.type !== 'folder') files.push([...wx.dir, m.name]);
                    }
                    continue;
                }
                const full = resolvePathArray(c);
                if (FileSystem.itemExists(full) && !FileSystem.isFolder(full)) files.push(full);
            }
            return { files, concat };
        }

        function copyMany(srcToken, dstArg, move = false) {
            const { files, concat } = collectCopySources(srcToken);
            if (!files.length) {
                doPrint('The system cannot find the file specified.');
                errorLevel = 1;
                return;
            }
            const dst = resolvePathArray(stripOuterQuotes(dstArg));
            const dstIsDir = FileSystem.isFolder(dst);
            if (concat) {
                let combined = '';
                for (const f of files) combined += FileSystem.readFile(f) ?? '';
                let finalDst = dst;
                if (dstIsDir) finalDst = [...dst, files[0][files[0].length - 1]];
                if (!writeFileAt(finalDst, combined)) {
                    doPrint('The system cannot find the path specified.');
                    errorLevel = 1;
                    return;
                }
                if (move) for (const f of files) FileSystem.deleteItem(f);
                doPrint(move ? '        1 file(s) moved.' : '        1 file(s) copied.');
                errorLevel = 0;
                return;
            }
            if (files.length > 1 && !dstIsDir) {
                doPrint('The syntax of the command is incorrect.');
                errorLevel = 1;
                return;
            }
            let count = 0;
            for (const f of files) {
                const content = FileSystem.readFile(f);
                if (content === null || content === undefined) continue;
                const finalDst = dstIsDir ? [...dst, f[f.length - 1]] : dst;
                if (!writeFileAt(finalDst, content)) continue;
                if (move) FileSystem.deleteItem(f);
                count++;
            }
            if (!count) {
                doPrint('The system cannot find the path specified.');
                errorLevel = 1;
                return;
            }
            doPrint(`        ${count} file(s) ${move ? 'moved' : 'copied'}.`);
            errorLevel = 0;
        }

        function copyFile(srcArg, dstArg, move = false) {
            copyMany(srcArg, dstArg, move);
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

            // A :label reached in normal sequence is a no-op (not a command).
            if (/^:/.test(line)) return;

            // Parenthesized block is only a grouping construct; execute each line.
            if (line.startsWith('(') && line.endsWith(')') && !/^if\b/i.test(line)) {
                const inner = line.slice(1, -1);
                for (const part of inner.split(/\r?\n/)) executeLine(part, true);
                return;
            }

            const originalBeforeExpansion = line;

            if (!inline) setEchoOutput(originalBeforeExpansion, suppressed);

            // Compound lines: IF/FOR manage their own bodies, but anything
            // else may chain (&, &&, ||) or pipe (|) several commands.
            if (!/^(if|for)[\s(]/i.test(line)) {
                const steps = splitChainTop(line);
                if (steps.length > 1) {
                    for (const step of steps) {
                        if (!running || waitingForAsync) break;
                        if (!step.cmd) continue;
                        if (step.op === '&&' && errorLevel !== 0) continue;
                        if (step.op === '||' && errorLevel === 0) continue;
                        runPipeline(step.cmd, true);
                    }
                    return;
                }
                const pipes = splitPipeTop(line);
                if (pipes.length > 1) {
                    runPipeline(line, true);
                    return;
                }
            }

            const redir = findRedirection(line);
            line = expand(redir.command);

            if (redir.stdinFile) {
                const savedStdin = pipeStdin;
                const data = FileSystem.readFile(resolvePathArray(expand(redir.stdinFile)));
                pipeStdin = data == null ? '' : String(data);
                try {
                    execSingle(line, redir, true);
                } finally {
                    pipeStdin = savedStdin;
                }
                return;
            }

            execSingle(line, redir, inline);
        }

        // Run one chain segment, which may itself be a pipeline.
        function runPipeline(segment, inline) {
            const stages = splitPipeTop(segment);
            if (stages.length < 2) {
                const redir = findRedirection(segment);
                execSingle(expand(redir.command), redir, inline);
                return;
            }
            const savedStdin = pipeStdin;
            const savedCapture = captureHook;
            let stdin = null;
            try {
                for (let s = 0; s < stages.length; s++) {
                    if (!running || waitingForAsync) break;
                    const last = s === stages.length - 1;
                    pipeStdin = stdin;
                    const redir = findRedirection(stages[s]);
                    if (redir.stdinFile) {
                        const data = FileSystem.readFile(resolvePathArray(expand(redir.stdinFile)));
                        pipeStdin = data == null ? '' : String(data);
                    }
                    if (last) {
                        execSingle(expand(redir.command), redir, inline);
                    } else {
                        const captured = [];
                        captureHook = (t) => captured.push(t);
                        try {
                            execSingle(expand(redir.command), redir, true);
                        } finally {
                            captureHook = savedCapture;
                        }
                        stdin = captured.join('\n');
                    }
                }
            } finally {
                pipeStdin = savedStdin;
                captureHook = savedCapture;
            }
        }

        function execSingle(line, redir, inline) {
            if (!running) return;

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
                const rest = line.replace(/^(md|mkdir)\s+/i, '').trim();
                if (!rest) { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; return; }
                let ok = true;
                for (const part of splitArgs(rest)) {
                    if (!makeDir(part)) ok = false;
                }
                errorLevel = ok ? 0 : 1;
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
                let recursive = false;
                const patterns = [];
                for (const part of parts) {
                    if (/^\/(p|f|q|s|a)(:.*)?$/i.test(part)) {
                        if (/s/i.test(part.slice(1, 2))) recursive = true;
                        // /p /f /q /a are accepted: the simulator never prompts.
                        continue;
                    }
                    patterns.push(stripOuterQuotes(part));
                }
                if (!patterns.length) { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; return; }
                let deleted = 0;
                let missing = 0;
                const eraseFile = (full) => {
                    if (FileSystem.itemExists(full) && !FileSystem.isFolder(full)) {
                        FileSystem.deleteItem(full);
                        deleted++;
                    }
                };
                for (const pat of patterns) {
                    const wx = expandWildcard(pat);
                    if (wx) {
                        const re = wildcardToRegExp(pat.split(/[\\/]/).pop());
                        if (recursive) {
                            for (const n of walkTree(wx.dir)) {
                                if (n.entry.type !== 'folder' && re.test(n.path[n.path.length - 1])) eraseFile(n.path);
                            }
                        } else {
                            for (const m of wx.matches) {
                                if (m.type !== 'folder') eraseFile([...wx.dir, m.name]);
                            }
                        }
                        continue;
                    }
                    const target = resolvePathArray(pat);
                    if (FileSystem.itemExists(target) && !FileSystem.isFolder(target)) eraseFile(target);
                    else missing++;
                }
                if (!deleted) {
                    if (missing) doPrint('Could Not Find ' + pathToString(resolvePathArray(patterns[0])));
                    errorLevel = 1;
                    return;
                }
                errorLevel = 0;
                return;
            }

            if (/^type(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^type\s*/i, '').trim();
                const showOne = (target) => {
                    const content = FileSystem.readFile(target);
                    if (content === null || content === undefined || FileSystem.isFolder(target)) {
                        doPrint('The system cannot find the file specified.');
                        return false;
                    }
                    doPrint(content, redir);
                    return true;
                };
                if (!rest) {
                    if (pipeStdin != null) { doPrint(pipeStdin, redir); errorLevel = 0; }
                    else { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; }
                    return;
                }
                let ok = true;
                for (const part of splitArgs(rest)) {
                    const arg = stripOuterQuotes(part);
                    const wx = expandWildcard(arg);
                    if (wx) {
                        if (!wx.matches.length) { doPrint('The system cannot find the file specified.'); ok = false; continue; }
                        for (const m of wx.matches) {
                            if (m.type === 'folder') { doPrint('The system cannot find the file specified.'); ok = false; continue; }
                            if (!showOne([...wx.dir, m.name])) ok = false;
                        }
                        continue;
                    }
                    if (!showOne(resolvePathArray(arg))) ok = false;
                }
                errorLevel = ok ? 0 : 1;
                return;
            }

            if (/^(copy|xcopy)(?:\s|$)/i.test(line)) {
                const parts = splitArgs(line.replace(/^(copy|xcopy)\s+/i, '').trim())
                    .filter(p => !(/^\/(y|v|d|a|b|q|s|e|i|h|k|o|x|exclude)(:.*)?$/i.test(p)));
                if (parts.length < 2) { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; }
                else copyMany(parts.slice(0, -1).join(' '), parts[parts.length - 1], false);
                return;
            }

            if (/^move(?:\s|$)/i.test(line)) {
                const parts = splitArgs(line.replace(/^move\s+/i, '').trim())
                    .filter(p => !(/^\/(y|-y)$/i.test(p)));
                if (parts.length < 2) { doPrint('The syntax of the command is incorrect.'); errorLevel = 1; }
                else copyMany(parts.slice(0, -1).join(' '), parts[parts.length - 1], true);
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
                const toks = splitArgs(rest);
                let bare = false, recursive = false, wide = false;
                let targetArg = null;
                for (const t of toks) {
                    // Single-letter switches only, so absolute paths like
                    // /users/docs are never mistaken for flags.
                    if (/^\/(b|s|w|p|q|d|a|o)(:.*)?$/i.test(t)) {
                        const sw = t.slice(1).toLowerCase();
                        if (sw.startsWith('b')) bare = true;
                        else if (sw.startsWith('s')) recursive = true;
                        else if (sw.startsWith('w')) wide = true;
                        // /p /q /d /a (attributes) /o (order) are accepted and
                        // ignored: no paging or attribute store in the simulator.
                        continue;
                    }
                    if (targetArg === null) targetArg = stripOuterQuotes(t);
                }
                const listOne = (dir, matches, showHeader) => {
                    const lines = [];
                    if (showHeader && !bare) lines.push(`\n Directory of ${pathToString(dir)}\n`);
                    if (wide && !bare) {
                        lines.push(matches.map(e => (e.type === 'folder' ? `[${e.name}]` : e.name)).join('  '));
                    } else {
                        for (const e of matches) {
                            if (bare) { lines.push(e.name); continue; }
                            const date = e.modified ? new Date(e.modified).toLocaleDateString() : '';
                            lines.push(`${date}  ${e.type === 'folder' ? '<DIR>' : String(e.size ?? 0).padStart(14)}  ${e.name}`);
                        }
                    }
                    return lines.join('\n');
                };
                const out = bare ? [] : [' Volume in drive has no label.'];
                // Wildcard or explicit path argument.
                if (targetArg) {
                    const wx = expandWildcard(targetArg);
                    if (wx) {
                        if (!wx.matches.length) { doPrint('File Not Found', redir); errorLevel = 1; return; }
                        if (recursive) {
                            const all = walkTree(wx.dir).filter(n => wildcardToRegExp(targetArg.split(/[\\/]/).pop()).test(n.path[n.path.length - 1]));
                            if (bare) out.push(all.map(n => relDisplay(wx.dir, n.path)).join('\n'));
                            else {
                                const byDir = new Map();
                                for (const n of all) {
                                    const d = n.path.slice(0, -1);
                                    const k = pathToString(d);
                                    if (!byDir.has(k)) byDir.set(k, { dir: d, items: [] });
                                    byDir.get(k).items.push({ ...n.entry, name: n.path[n.path.length - 1] });
                                }
                                for (const { dir, items } of byDir.values()) out.push(listOne(dir, items, true));
                            }
                        } else {
                            out.push(listOne(wx.dir, wx.matches, true));
                        }
                        doPrint(out.join('\n'), redir);
                        errorLevel = 0;
                        return;
                    }
                    const resolved = resolvePathArray(targetArg);
                    const node = FileSystem.getNode(resolved);
                    if (node && node.type !== 'folder') {
                        if (bare) out.push(targetArg.split(/[\\/]/).pop());
                        else out.push(listOne(resolved.slice(0, -1), [{ name: resolved[resolved.length - 1], type: 'file', size: node.size ?? 0, modified: node.modified || 0 }], true));
                        doPrint(out.join('\n'), redir);
                        errorLevel = 0;
                        return;
                    }
                    if (!FileSystem.isFolder(resolved)) { doPrint('File Not Found', redir); errorLevel = 1; return; }
                    if (recursive) {
                        const seen = [{ dir: resolved, items: FileSystem.getChildren(resolved) || [] }];
                        for (const n of walkTree(resolved)) {
                            if (n.entry.type === 'folder') {
                                try { seen.push({ dir: n.path, items: FileSystem.getChildren(n.path) || [] }); } catch { /* noop */ }
                            }
                        }
                        if (bare) {
                            const names = [];
                            for (const { dir, items } of seen) for (const e of items) names.push(relDisplay(resolved, [...dir, e.name]));
                            out.push(names.join('\n'));
                        } else {
                            for (const { dir, items } of seen) out.push(listOne(dir, items, true));
                        }
                    } else {
                        out.push(listOne(resolved, FileSystem.getChildren(resolved) || [], true));
                    }
                    doPrint(out.join('\n'), redir);
                    errorLevel = 0;
                    return;
                }
                const cwd = getCwd();
                if (recursive) {
                    const seen = [{ dir: cwd, items: FileSystem.getChildren(cwd) || [] }];
                    for (const n of walkTree(cwd)) {
                        if (n.entry.type === 'folder') {
                            try { seen.push({ dir: n.path, items: FileSystem.getChildren(n.path) || [] }); } catch { /* noop */ }
                        }
                    }
                    if (bare) {
                        const names = [];
                        for (const { dir, items } of seen) for (const e of items) names.push(relDisplay(cwd, [...dir, e.name]));
                        out.push(names.join('\n'));
                    } else {
                        for (const { dir, items } of seen) out.push(listOne(dir, items, true));
                    }
                } else {
                    out.push(listOne(cwd, FileSystem.getChildren(cwd) || [], true));
                }
                doPrint(out.join('\n'), redir);
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
                        // Popup.pick resolves with the chosen option object ({label, value}).
                        const picked = result && typeof result === 'object' && result.value != null ? result.value : result;
                        if (picked !== null && picked !== undefined && picked !== '') errorLevel = Number(picked) || 0;
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
                const codeMatch = rest.match(/(?:\/b\s*)?(-?\d+)\s*$/i);
                if (/^\/b\b/i.test(rest)) {
                    if (codeMatch) errorLevel = Number(codeMatch[1]);
                    returnFromCall = true;
                    return;
                }
                if (codeMatch) errorLevel = Number(codeMatch[1]);
                running = false;
                return;
            }

            if (/^shift(?:\s|$)/i.test(line)) {
                const m = line.match(/^shift\s*(?:\/(\d+))?/i);
                const start = m && m[1] ? Number(m[1]) : 1;
                if (args.length > start) args.splice(start, 1);
                errorLevel = 0;
                return;
            }

            if (/^pause$/i.test(line)) {
                doPrint('Press any key to continue . . .', redir);
                errorLevel = 0;
                return;
            }

            if (/^pushd(?:\s|$)/i.test(line)) {
                const arg = stripOuterQuotes(line.replace(/^pushd\s*/i, '').trim());
                if (!arg) { dirStack.push([...getCwd()]); errorLevel = 0; return; }
                const target = resolvePathArray(arg);
                if (folderExists(arg)) { dirStack.push([...getCwd()]); setCwd(target); errorLevel = 0; }
                else { doPrint('The system cannot find the path specified.'); errorLevel = 1; }
                return;
            }

            if (/^popd$/i.test(line)) {
                const prev = dirStack.pop();
                if (!prev) { doPrint('The directory stack is empty.'); errorLevel = 1; }
                else if (!FileSystem.isFolder(prev)) { doPrint('The system cannot find the path specified.'); errorLevel = 1; }
                else { setCwd(prev); errorLevel = 0; }
                return;
            }

            if (/^path(?:\s|;|$)/i.test(line)) {
                const rest = line.replace(/^path\s*/i, '').trim();
                if (!rest) {
                    doPrint(`PATH=${getVar('PATH') || '\\system'}`, redir);
                } else if (rest === ';') {
                    setVar('PATH', '');
                } else {
                    setVar('PATH', stripOuterQuotes(rest));
                }
                errorLevel = 0;
                return;
            }

            if (/^prompt(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^prompt\s*/i, '').trim();
                setVar('PROMPT', rest || '$P$G');
                errorLevel = 0;
                return;
            }

            if (/^vol(?:\s|$)/i.test(line)) {
                doPrint(' Volume in drive \\ has no label.\n Volume Serial Number is 12AB-34CD', redir);
                errorLevel = 0;
                return;
            }

            if (/^date(?:\s|$|\/)/i.test(line)) {
                const arg = line.replace(/^date\s*/i, '').trim();
                const now = new Date();
                if (!arg || /^\/t\b/i.test(arg)) doPrint(`The current date is: ${now.toLocaleDateString()}`, redir);
                else doPrint(`The current date is: ${now.toLocaleDateString()}`, redir);
                errorLevel = 0;
                return;
            }

            if (/^time(?:\s|$|\/)/i.test(line)) {
                const arg = line.replace(/^time\s*/i, '').trim();
                const now = new Date();
                if (!arg || /^\/t\b/i.test(arg)) doPrint(`The current time is: ${now.toLocaleTimeString()}`, redir);
                else doPrint(`The current time is: ${now.toLocaleTimeString()}`, redir);
                errorLevel = 0;
                return;
            }

            if (/^tree(?:\s|$)/i.test(line)) {
                const toks = splitArgs(line.replace(/^tree\s*/i, '').trim());
                let showFiles = false;
                let targetArg = null;
                for (const t of toks) {
                    if (/^\/f$/i.test(t)) showFiles = true;
                    else if (targetArg === null) targetArg = stripOuterQuotes(t);
                }
                const root = targetArg ? resolvePathArray(targetArg) : [...getCwd()];
                if (!FileSystem.isFolder(root)) { doPrint('Invalid path - ' + (targetArg || '')); errorLevel = 1; return; }
                const out = ['Folder PATH listing for volume OS', 'Volume serial number is 12AB-34CD', pathToString(root)];
                const walk = (dir, prefix) => {
                    let kids = [];
                    try { kids = (FileSystem.getChildren(dir) || []).filter(e => showFiles || e.type === 'folder'); } catch { kids = []; }
                    kids.forEach((e, idx) => {
                        const last = idx === kids.length - 1;
                        out.push(`${prefix}${last ? '└───' : '├───'}${e.name}`);
                        if (e.type === 'folder') walk([...dir, e.name], prefix + (last ? '    ' : '│   '));
                    });
                };
                walk(root, '');
                doPrint(out.join('\n'), redir);
                errorLevel = 0;
                return;
            }

            if (/^find(?:\s|$)/i.test(line)) {
                const toks = splitArgs(line.replace(/^find\s*/i, '').trim());
                let v = false, c = false, n = false, ic = false;
                let needle = null;
                const files = [];
                for (const t of toks) {
                    if (needle === null && files.length === 0 && /^\/[vcni]+$/i.test(t)) {
                        const s = t.slice(1).toLowerCase();
                        if (s.includes('v')) v = true;
                        if (s.includes('c')) c = true;
                        if (s.includes('n')) n = true;
                        if (s.includes('i')) ic = true;
                        continue;
                    }
                    if (needle === null) needle = stripOuterQuotes(t);
                    else files.push(stripOuterQuotes(t));
                }
                if (needle === null || needle === '') { doPrint('FIND: Parameter format not correct'); errorLevel = 2; return; }
                const sources = [];
                if (!files.length) {
                    if (pipeStdin != null) sources.push({ label: '', text: String(pipeStdin) });
                    else { doPrint('FIND: Parameter format not correct'); errorLevel = 2; return; }
                } else {
                    for (const f of files) {
                        const wx = expandWildcard(f);
                        if (wx) {
                            for (const m of wx.matches) {
                                if (m.type === 'folder') continue;
                                const content = FileSystem.readFile([...wx.dir, m.name]);
                                if (content != null) sources.push({ label: m.name, text: String(content) });
                            }
                            continue;
                        }
                        const full = resolvePathArray(f);
                        const content = FileSystem.readFile(full);
                        if (content === null || content === undefined || FileSystem.isFolder(full)) {
                            doPrint(`FIND: ${f}: No such file`);
                            errorLevel = 1;
                            return;
                        }
                        sources.push({ label: f, text: String(content) });
                    }
                }
                const has = ic
                    ? (a, b) => a.toLowerCase().includes(b.toLowerCase())
                    : (a, b) => a.includes(b);
                const out = [];
                let hits = 0;
                for (const g of sources) {
                    if (!c && sources.length > 1 && g.label) out.push(`---------- ${g.label}`);
                    g.text.split(/\r?\n/).forEach((ln, idx) => {
                        const hit = has(ln, needle);
                        if (v ? !hit : hit) {
                            hits++;
                            if (!c) out.push(`${n ? `[${idx + 1}]` : ''}${ln}`);
                        }
                    });
                }
                if (c) out.push(String(hits));
                doPrint(out.join('\n'), redir);
                errorLevel = hits ? 0 : 1;
                return;
            }

            if (/^sort(?:\s|$)/i.test(line)) {
                const toks = splitArgs(line.replace(/^sort\s*/i, '').trim());
                let rev = false;
                let fileArg = null;
                for (const t of toks) {
                    if (/^\/r$/i.test(t)) rev = true;
                    else if (/^\//.test(t)) continue;
                    else if (fileArg === null) fileArg = stripOuterQuotes(t);
                }
                let text = null;
                if (fileArg) {
                    const full = resolvePathArray(fileArg);
                    const content = FileSystem.readFile(full);
                    if (content === null || content === undefined || FileSystem.isFolder(full)) {
                        doPrint('The system cannot find the file specified.');
                        errorLevel = 1;
                        return;
                    }
                    text = String(content);
                } else if (pipeStdin != null) {
                    text = String(pipeStdin);
                } else {
                    doPrint('SORT: Missing file argument.');
                    errorLevel = 1;
                    return;
                }
                const lines = text.split(/\r?\n/);
                // A trailing newline is a terminator, not an extra blank line.
                if (lines.length && lines[lines.length - 1] === '') lines.pop();
                lines.sort((a, b) => {
                    const x = a.toLowerCase(), y = b.toLowerCase();
                    return x < y ? -1 : (x > y ? 1 : 0);
                });
                if (rev) lines.reverse();
                doPrint(lines.join('\n'), redir);
                errorLevel = 0;
                return;
            }

            if (/^more(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^more\s*/i, '').trim();
                if (!rest) {
                    if (pipeStdin != null) { doPrint(String(pipeStdin), redir); errorLevel = 0; }
                    else { doPrint('MORE: Missing file argument.'); errorLevel = 1; }
                    return;
                }
                let ok = true;
                for (const part of splitArgs(rest)) {
                    const arg = stripOuterQuotes(part);
                    if (/^\//.test(arg)) continue;
                    const wx = expandWildcard(arg);
                    if (wx) {
                        for (const m of wx.matches) {
                            if (m.type === 'folder') continue;
                            const content = FileSystem.readFile([...wx.dir, m.name]);
                            if (content != null) doPrint(String(content), redir);
                        }
                        continue;
                    }
                    const full = resolvePathArray(arg);
                    const content = FileSystem.readFile(full);
                    if (content === null || content === undefined || FileSystem.isFolder(full)) {
                        doPrint('The system cannot find the file specified.');
                        ok = false;
                    } else doPrint(String(content), redir);
                }
                errorLevel = ok ? 0 : 1;
                return;
            }

            if (/^fc(?:\s|$)/i.test(line)) {
                const parts = splitArgs(line.replace(/^fc\s*/i, '').trim()).filter(p => !(/^\/(b|l|n|t|c)(:.*)?$/i.test(p)));
                if (parts.length < 2) { doPrint('FC: Missing file arguments. Usage: FC file1 file2'); errorLevel = 2; return; }
                const a = FileSystem.readFile(resolvePathArray(stripOuterQuotes(parts[0])));
                const b = FileSystem.readFile(resolvePathArray(stripOuterQuotes(parts[1])));
                if (a === null || a === undefined || b === null || b === undefined) {
                    doPrint('FC: Cannot find one of the files.');
                    errorLevel = 2;
                    return;
                }
                const la = String(a).split(/\r?\n/), lb = String(b).split(/\r?\n/);
                const out = [`Comparing files ${parts[0]} and ${parts[1]}`];
                let diff = 0;
                const top = Math.max(la.length, lb.length);
                for (let i = 0; i < top; i++) {
                    if (la[i] !== lb[i]) {
                        diff++;
                        if (diff <= 20) out.push(`***** ${parts[0]} [line ${i + 1}]\n${la[i] ?? '*missing*'}\n***** ${parts[1]} [line ${i + 1}]\n${lb[i] ?? '*missing*'}\n*****`);
                    }
                }
                if (!diff) out.push('FC: no differences encountered');
                else if (diff > 20) out.push(`... (${diff - 20} more differences)`);
                doPrint(out.join('\n'), redir);
                errorLevel = diff ? 1 : 0;
                return;
            }

            if (/^where(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^where\s*/i, '').trim();
                const pat = stripOuterQuotes(splitArgs(rest)[0] || '');
                if (!pat) { doPrint('WHERE: Missing pattern. Usage: WHERE pattern'); errorLevel = 2; return; }
                const re = wildcardToRegExp(pat.includes('.') || /[*?]/.test(pat) ? pat : pat + '.*');
                const pathDirs = (getVar('PATH') || '\\system').split(';').map(d => resolvePathArray(d.trim() || '\\'));
                const seen = new Set();
                const hits = [];
                for (const d of [[...getCwd()], ...pathDirs]) {
                    let kids = [];
                    try { kids = FileSystem.getChildren(d) || []; } catch { kids = []; }
                    for (const k of kids) {
                        if (k.type !== 'folder' && re.test(k.name)) {
                            const full = pathToString([...d, k.name]);
                            if (!seen.has(full)) { seen.add(full); hits.push(full); }
                        }
                    }
                }
                if (!hits.length) { doPrint(`INFO: Could not find files for the given pattern(s).`); errorLevel = 1; return; }
                doPrint(hits.join('\n'), redir);
                errorLevel = 0;
                return;
            }

            if (/^chcp(?:\s|$)/i.test(line)) {
                const arg = line.replace(/^chcp\s*/i, '').trim();
                if (!arg) { doPrint('Active code page: 437', redir); errorLevel = 0; return; }
                if (/^(437|850|1252|65001)$/.test(arg)) { doPrint(`Active code page: ${arg}`, redir); errorLevel = 0; }
                else { doPrint('Invalid code page'); errorLevel = 1; }
                return;
            }

            if (/^systeminfo$/i.test(line)) {
                const now = new Date();
                doPrint([
                    `Host Name:                 ${getVar('COMPUTERNAME')}`,
                    'OS Name:                   Microsoft Windows 12',
                    'OS Version:                12.0.0',
                    `Registered Owner:          ${getVar('USERNAME')}`,
                    'System Type:               x64-based PC',
                    'System Directory:          \\system',
                    `System Boot Time:          ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
                ].join('\n'), redir);
                errorLevel = 0;
                return;
            }

            if (/^ipconfig(?:\s|$)/i.test(line)) {
                doPrint([
                    'Windows IP Configuration',
                    '',
                    'Ethernet adapter Loopback:',
                    '   Connection-specific DNS Suffix  . : local',
                    '   IPv4 Address. . . . . . . . . . . : 127.0.0.1',
                    '   Subnet Mask . . . . . . . . . . . : 255.0.0.0',
                    '   Default Gateway . . . . . . . . . :'
                ].join('\n'), redir);
                errorLevel = 0;
                return;
            }

            if (/^ping(?:\s|$)/i.test(line)) {
                const toks = splitArgs(line.replace(/^ping\s*/i, '').trim()).filter(t => !(/^\//.test(t)));
                const target = stripOuterQuotes(toks[toks.length - 1] || '');
                if (!target) { doPrint('Usage: ping [-n count] [-l size] target'); errorLevel = 1; return; }
                if (!/^(localhost|127\.0\.0\.1|::1)$/i.test(target)) {
                    doPrint(`Ping request could not find host ${target}. Please check the name and try again.`);
                    errorLevel = 1;
                    return;
                }
                const addr = /localhost|::1/i.test(target) ? target : '127.0.0.1';
                doPrint([
                    `Pinging ${addr} with 32 bytes of data:`,
                    'Reply from 127.0.0.1: bytes=32 time<1ms TTL=128',
                    'Reply from 127.0.0.1: bytes=32 time<1ms TTL=128',
                    'Reply from 127.0.0.1: bytes=32 time<1ms TTL=128',
                    'Reply from 127.0.0.1: bytes=32 time<1ms TTL=128',
                    '',
                    'Ping statistics for 127.0.0.1:',
                    '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),'
                ].join('\n'), redir);
                errorLevel = 0;
                return;
            }

            if (/^help(?:\s|$)/i.test(line)) {
                const topic = line.replace(/^help\s*/i, '').trim().toLowerCase();
                const topics = {
                    cd: 'CD — Displays the current directory or changes it. Usage: CD [path] | CD ..',
                    dir: 'DIR — Lists files and folders. Usage: DIR [/B] [/S] [/W] [path|pattern]',
                    md: 'MD/MKDIR — Creates directories (intermediate folders too). Usage: MD name [name2 ...]',
                    rd: 'RD/RMDIR — Removes folders. Usage: RD [/S] [/Q] folder',
                    del: 'DEL/ERASE — Deletes files. Usage: DEL [/S] file [pattern ...]  (wildcards * ? allowed)',
                    copy: 'COPY — Copies files. Usage: COPY source[+] dest  (wildcards and a+b concat allowed)',
                    move: 'MOVE — Moves files. Usage: MOVE source[+] dest',
                    ren: 'REN/RENAME — Renames a file or folder. Usage: REN old new',
                    type: 'TYPE — Prints file contents. Usage: TYPE file [file2 ...]  (wildcards allowed)',
                    echo: 'ECHO — Prints text. ECHO [ON|OFF|.|text]. Redirect with > (write) or >> (append).',
                    set: 'SET — Shows, sets or evaluates variables. SET [name=[value]] | SET /A expr | SET /P (kept, non-interactive)',
                    if: 'IF — Conditional. IF [/I] [NOT] EXIST|DEFINED|ERRORLEVEL|cmdextversion|a==b ...',                    for: 'FOR — Loops. FOR %A IN (set) DO cmd | FOR /L %A IN (s,step,e) DO cmd | FOR /F ["opts"] %A IN (file|"str") DO cmd',
                    call: 'CALL — Calls a :label or another .bat file. CALL :label [args] | CALL other.bat [args]',
                    goto: 'GOTO — Jumps to a :label. GOTO label | GOTO :EOF',
                    exit: 'EXIT — Ends the script (EXIT /B [code] returns from a CALL).',
                    shift: 'SHIFT — Shifts batch args. SHIFT [/n]',
                    cls: 'CLS — Clears the screen.',
                    title: 'TITLE — Sets the window title. Usage: TITLE text',
                    color: 'COLOR — Accepted (no visual effect in this build).',
                    timeout: 'TIMEOUT — Accepted (scripts continue immediately).',
                    choice: 'CHOICE — Asks the user to pick. Usage: CHOICE [/C ABC] [/M text] [/D default]',
                    pushd: 'PUSHD — Saves the folder and changes to it. Usage: PUSHD [path]',
                    popd: 'POPD — Restores the folder saved by PUSHD.',
                    path: 'PATH — Shows or sets the search path. Usage: PATH [dirs] | PATH ;',
                    vol: 'VOL — Shows the volume label and serial number.',
                    date: 'DATE — Shows the current date. Usage: DATE [/T]',
                    time: 'TIME — Shows the current time. Usage: TIME [/T]',
                    tree: 'TREE — Draws the folder tree. Usage: TREE [/F] [path]',
                    find: 'FIND — Searches text. Usage: FIND [/V] [/C] [/N] [/I] "text" [files...]',
                    sort: 'SORT — Sorts lines. Usage: SORT [/R] [file]  (also reads pipes and < input)',
                    more: 'MORE — Prints files. Usage: MORE file [file2 ...]',
                    fc: 'FC — Compares two files. Usage: FC file1 file2',
                    where: 'WHERE — Locates files. Usage: WHERE pattern  (searches folder + PATH)',
                    chcp: 'CHCP — Shows the code page. Usage: CHCP [437|850|1252|65001]',
                    ver: 'VER — Shows the Windows version.',
                    whoami: 'WHOAMI — Shows COMPUTERNAME\\USERNAME.',
                    hostname: 'HOSTNAME — Shows the computer name.',
                    systeminfo: 'SYSTEMINFO — Shows system summary.',
                    ping: 'PING — Pings loopback only in this build. Usage: PING 127.0.0.1',
                    ipconfig: 'IPCONFIG — Shows the loopback network configuration.',
                    pause: 'PAUSE — Prints "Press any key to continue . . ."',
                    setlocal: 'SETLOCAL — Saves variables. SETLOCAL [ENABLEDELAYEDEXPANSION|DISABLEDELAYEDEXPANSION]',
                    endlocal: 'ENDLOCAL — Restores variables saved by SETLOCAL.',
                    rem: 'REM — A comment. Ignored.'
                };
                if (!topic) {
                    const names = Object.keys(topics);
                    doPrint('Supported commands (type HELP <name> for details):\n' +
                        names.map(n => n.toUpperCase()).join('  '), redir);
                } else if (topics[topic]) {
                    doPrint(topics[topic], redir);
                } else {
                    doPrint('This command is not supported by the help utility.');
                    errorLevel = 1;
                    return;
                }
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
            dirStack = [];
            pipeStdin = null;
            captureHook = null;
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
