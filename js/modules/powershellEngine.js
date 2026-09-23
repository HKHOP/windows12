import FileSystem from './fileSystem.js';

/*
 * PowerShell-compatible interpreter for the Windows 12 simulator.
 *
 * Mirrors the BatchEngine/VBEngine factory shape:
 *   PowershellEngine.create(printFn, getCwd, setCwd, opts)
 *
 * Pipes carry real PSObjects (not text) so Where/Select/Sort work on
 * properties, like real PowerShell. Only the final stage formats to text.
 *
 * opts (all optional, wired by the host app to avoid import cycles):
 *   shell      'powershell' | 'terminal' (default 'powershell')
 *   noProfile  skip $PROFILE loading
 *   onNotify(title, msg)   -> toast via Notifications
 *   launchApp(appId)       -> Start-Process integration
 *   getProcesses()         -> [{ name, id }] for Get-Process
 *   killProcess(id)        -> boolean for Stop-Process
 *   allowNet               -> true when the host app holds `network` perm
 *   readHost(prompt)       -> string|Promise<string> for Read-Host
 *   onHistory(line)        -> history persistence hook
 */
const PowershellEngine = (() => {
    const VERSION = '7.4-sim';
    const VALID_POLICIES = ['Restricted', 'AllSigned', 'RemoteSigned', 'Unrestricted', 'Bypass'];

    function create(printFn, getCwd, setCwd, opts = {}) {
        const shell = opts.shell || 'powershell';
        const vars = Object.create(null);      // case-insensitive (UPPER keys)
        const functions = Object.create(null); // user functions
        const jobs = new Map();
        const locStack = [];
        let jobSeq = 0;
        let lastOk = true;
        let lastExit = 0;
        let profileLoaded = false;
        let policy = null; // lazy-loaded per user

        // ---------- tiny helpers ----------

        function normKey(name) {
            return String(name ?? '').toUpperCase();
        }

        function currentUserName() {
            try {
                const u = window?._Users?.getCurrent?.();
                if (u && u.name && u.name !== 'User') return String(u.name);
            } catch { /* fall through */ }
            try {
                const c = window?.SystemConfig?.get?.('userName');
                if (c && c !== 'User') return String(c);
            } catch { /* fall through */ }
            return 'User';
        }

        function appDataDir() {
            // Lazy: current user isn't resolved at module-eval time.
            try {
                const U = window?._Users;
                if (U && typeof U.appData === 'function') return U.appData('powershell');
            } catch { /* fall through */ }
            return null;
        }

        function readAppFile(name) {
            try {
                const dir = appDataDir();
                if (!dir) return null;
                return FileSystem.readFile([...dir, name]);
            } catch { return null; }
        }

        function writeAppFile(name, content) {
            try {
                const dir = appDataDir();
                if (!dir) return false;
                if (!FileSystem.itemExists(dir)) {
                    try {
                        const U = window._Users;
                        FileSystem.createFolder(U.home(['AppData']), 'powershell');
                    } catch { return false; }
                }
                const full = [...dir, name];
                if (FileSystem.itemExists(full)) return FileSystem.writeFile(full, content);
                const dot = name.lastIndexOf('.');
                return FileSystem.createFile(dir, name, content, dot >= 0 ? name.slice(dot + 1) : '');
            } catch { return false; }
        }

        function loadPolicy() {
            if (policy) return policy;
            try {
                const raw = readAppFile('executionpolicy.json');
                if (raw) {
                    const p = JSON.parse(raw);
                    if (p && VALID_POLICIES.includes(p.policy)) {
                        policy = p.policy;
                        return policy;
                    }
                }
            } catch { /* fall through */ }
            policy = 'RemoteSigned';
            return policy;
        }

        function savePolicy(p) {
            policy = p;
            writeAppFile('executionpolicy.json', JSON.stringify({ policy: p }, null, 2));
        }

        // ---------- PSObject layer ----------

        function psObj(type, props, str) {
            return { __ps: true, __type: type || 'PSObject', props: props || {}, __str: str ?? null };
        }

        function isPs(v) {
            return v !== null && typeof v === 'object' && v.__ps === true;
        }

        function getProp(v, name) {
            if (v === null || v === undefined) return undefined;
            const key = String(name);
            if (isPs(v)) {
                const hit = Object.keys(v.props).find(k => k.toLowerCase() === key.toLowerCase());
                if (hit !== undefined) return v.props[hit];
                if (key.toLowerCase() === 'tostring') return psStr(v);
                return undefined;
            }
            if (Array.isArray(v)) {
                if (key.toLowerCase() === 'length' || key.toLowerCase() === 'count') return v.length;
                const n = Number(key);
                if (Number.isInteger(n)) return v[n];
                return undefined;
            }
            if (typeof v === 'string') {
                if (key.toLowerCase() === 'length') return v.length;
                return undefined;
            }
            const hit = Object.keys(v).find(k => k.toLowerCase() === key.toLowerCase());
            return hit !== undefined ? v[hit] : undefined;
        }

        function psStr(v) {
            if (v === null || v === undefined) return '';
            if (v === true) return 'True';
            if (v === false) return 'False';
            if (isPs(v)) {
                if (v.__str !== null && v.__str !== undefined) return String(v.__str);
                if (v.props.Name !== undefined) return String(v.props.Name);
                return JSON.stringify(v.props);
            }
            if (Array.isArray(v)) return v.map(psStr).join(' ');
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
        }

        function filePs(entry, dir) {
            const isDir = entry.type === 'folder';
            const full = [...dir, entry.name];
            return psObj(isDir ? 'DirectoryInfo' : 'FileInfo', {
                Name: entry.name,
                FullName: psDisplayPath(full),
                Length: isDir ? null : (entry.size ?? 0),
                Mode: isDir ? 'd-----' : '-a----',
                LastWriteTime: entry.modified ? new Date(entry.modified).toLocaleString() : '',
                Extension: isDir ? '' : (entry.ext ? '.' + entry.ext : ''),
                PSIsContainer: isDir
            }, entry.name + (isDir ? '/' : ''));
        }

        // ---------- output ----------

        function emit(text) {
            printFn(String(text ?? ''));
        }

        function emitError(text) {
            const msg = String(text ?? '');
            // Blue-app UI colors lines with this prefix red; terminal bridge
            // passes them through as-is.
            if (shell === 'powershell') printFn('PS-ERROR: ' + msg);
            else printFn(msg);
            lastOk = false;
        }

        function formatOne(v) {
            if (isPs(v) && (v.__type === 'FileInfo' || v.__type === 'DirectoryInfo')) {
                const p = v.props;
                const d = p.LastWriteTime ? new Date(p.LastWriteTime) : null;
                const ds = d && !isNaN(d) ? d.toLocaleDateString() : '';
                const ts = d && !isNaN(d) ? d.toLocaleTimeString() : '';
                const len = p.PSIsContainer ? '' : String(p.Length ?? '');
                return `${p.Mode}  ${ds} ${ts}  ${len.padStart(10)} ${p.Name}`;
            }
            return psStr(v);
        }

        function printValues(list, redirect) {
            const lines = [];
            for (const v of list || []) {
                if (v === undefined) continue;
                lines.push(formatOne(v));
            }
            const text = lines.join('\n');
            if (!redirect || !redirect.file) {
                if (text) emit(text);
                return;
            }
            writeRedirect(redirect, text);
        }

        function writeRedirect(redirect, text) {
            try {
                const target = resolvePSPath(String(redirect.file || '').trim());
                const body = text ? text + '\n' : '';
                if (redirect.append) {
                    const old = FileSystem.readFile(target) ?? '';
                    if (FileSystem.itemExists(target)) FileSystem.writeFile(target, old + body);
                    else createAtPath(target, body);
                } else {
                    if (FileSystem.itemExists(target)) {
                        const node = FileSystem.getNode(target);
                        if (node && node.type !== 'folder') FileSystem.writeFile(target, body);
                    } else createAtPath(target, body);
                }
            } catch { /* best effort */ }
        }

        function createAtPath(full, content) {
            const name = full[full.length - 1];
            const parent = full.slice(0, -1);
            let cur = ['/'];
            for (const seg of parent.slice(1)) {
                const next = [...cur, seg];
                if (!FileSystem.itemExists(next)) FileSystem.createFolder(cur, seg);
                cur = next;
            }
            const dot = name.lastIndexOf('.');
            FileSystem.createFile(parent, name, content, dot >= 0 ? name.slice(dot + 1) : '');
        }

        // ---------- paths ----------

        function stripQuotes(s) {
            const t = String(s ?? '').trim();
            if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
                return t.slice(1, -1);
            }
            return t;
        }

        function resolvePSPath(input) {
            let s = stripQuotes(input);
            if (!s || s === '~') return [...homeDir()];
            s = s.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
            // PSProvider prefixes: Env:/Variable:/Alias:/FileSystem:
            const prov = s.match(/^(Env|Variable|Alias|FileSystem):\/?(.*)$/i);
            if (prov) s = '/' + prov[2];
            let parts;
            if (s.startsWith('/')) parts = s.split('/').filter(Boolean);
            else if (s === '~' || s.startsWith('~/')) parts = [...homeDir().slice(1), ...s.slice(2).split('/').filter(Boolean)];
            else parts = [...getCwd().slice(1), ...s.split('/').filter(Boolean)];
            const resolved = [];
            for (const part of parts) {
                if (part === '.' || part === '') continue;
                if (part === '..') { resolved.pop(); continue; }
                resolved.push(part);
            }
            return ['/', ...resolved];
        }

        function homeDir() {
            try {
                const U = window?._Users;
                if (U && typeof U.home === 'function') return U.home();
            } catch { /* fall through */ }
            return ['/', 'users', 'default'];
        }

        function psDisplayPath(arr) {
            const win = (arr || []).filter(p => p !== '/').join('\\');
            return (win ? 'C:\\' + win : 'C:\\').replace(/\\\\/g, '\\');
        }

        function escapeRegExp(s) {
            return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function wildcardToRegExp(pattern) {
            let re = '';
            for (const ch of String(pattern ?? '')) {
                if (ch === '*') re += '.*';
                else if (ch === '?') re += '.';
                else re += escapeRegExp(ch);
            }
            return new RegExp('^' + re + '$', 'i');
        }

        function expandWildcard(arg) {
            const raw = stripQuotes(String(arg ?? '').trim()).replace(/\\/g, '/');
            if (!/[*?]/.test(raw)) return null;
            const cleaned = raw.replace(/^[A-Za-z]:/, '');
            const slash = cleaned.lastIndexOf('/');
            const dirPart = slash >= 0 ? cleaned.slice(0, slash) : '';
            const pat = slash >= 0 ? cleaned.slice(slash + 1) : cleaned;
            const dir = dirPart ? resolvePSPath(dirPart) : [...getCwd()];
            if (!FileSystem.isFolder(dir)) return { dir, matches: [] };
            let children = [];
            try { children = FileSystem.getChildren(dir) || []; } catch { children = []; }
            const re = wildcardToRegExp(pat);
            return { dir, matches: children.filter(e => re.test(e.name)) };
        }
        // ---------- variables ----------

        function getVar(name) {
            const key = normKey(name);
            if (key === 'NULL') return null;
            if (key === 'TRUE') return true;
            if (key === 'FALSE') return false;
            if (key === '?') return lastOk;
            if (key === 'LASTEXITCODE') return lastExit;
            if (key === 'HOME') return psDisplayPath(homeDir());
            if (key === 'PWD') return psDisplayPath(getCwd());
            if (key === 'PSVERSIONTABLE') return psObj('PSVersionTable', { PSVersion: VERSION, PSEdition: 'Desktop-sim' });
            if (key === 'PROFILE') return psDisplayPath([...homeDir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1']);
            if (key === 'PSHOME') return 'C:\\system';
            if (key === 'HOST') return psObj('Host', { Name: 'Windows 12 Simulator Host', Version: VERSION });
            if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key];
            return null;
        }

        function setVar(name, value) {
            const key = normKey(name);
            if (!key) return;
            vars[key] = value;
        }

        // ---------- lexer ----------

        function splitStatements(script) {
            const out = [];
            let cur = '';
            let sq = false, dq = false, depth = 0, line = '';
            const src = String(script ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === "'" && !dq) {
                    if (sq && src[i + 1] === "'") { cur += "''"; i++; continue; }
                    sq = !sq; cur += ch; continue;
                }
                if (ch === '"' && !sq) { dq = !dq; cur += ch; continue; }
                if (!sq && !dq) {
                    if (ch === '{' || ch === '(') depth++;
                    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1);
                    else if ((ch === ';' || ch === '\n') && depth === 0) {
                        line += cur; cur = '';
                        if (line.trim() && !line.trim().startsWith('#')) out.push(line.trim());
                        line = '';
                        continue;
                    }
                }
                if (ch === '\n' && (sq || dq)) { line += cur + '\n'; cur = ''; continue; }
                cur += ch;
            }
            line += cur;
            if (line.trim() && !line.trim().startsWith('#')) out.push(line.trim());
            return out.filter(s => s && !/^#/.test(s));
        }

        function splitChainTop(stmt) {
            // PowerShell 7 chain ops: ; && || & (single & = background -> run sync)
            const out = [];
            let cur = '';
            let sq = false, dq = false, depth = 0, pendingOp = null;
            const src = String(stmt ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === "'" && !dq) { sq = !sq; cur += ch; continue; }
                if (ch === '"' && !sq) { dq = !dq; cur += ch; continue; }
                if (!sq && !dq) {
                    if (ch === '{' || ch === '(') depth++;
                    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1);
                    else if (depth === 0 && ch === '&' && src[i + 1] === '&') {
                        if (cur.trim()) out.push({ cmd: cur.trim(), op: pendingOp });
                        pendingOp = '&&'; i++; cur = '';
                        continue;
                    } else if (depth === 0 && ch === '|' && src[i + 1] === '|') {
                        if (cur.trim()) out.push({ cmd: cur.trim(), op: pendingOp });
                        pendingOp = '||'; i++; cur = '';
                        continue;
                    }
                }
                cur += ch;
            }
            if (cur.trim() || pendingOp) out.push({ cmd: cur.trim(), op: pendingOp });
            return out;
        }

        function splitPipeline(stmt) {
            const out = [];
            let cur = '';
            let sq = false, dq = false, depth = 0;
            const src = String(stmt ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === "'" && !dq) { sq = !sq; cur += ch; continue; }
                if (ch === '"' && !sq) { dq = !dq; cur += ch; continue; }
                if (!sq && !dq) {
                    if (ch === '{' || ch === '(') depth++;
                    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1);
                    else if (ch === '|' && depth === 0) {
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

        function tokenizeStage(stage) {
            const toks = [];
            let cur = '';
            let sq = false, dq = false, depth = 0;
            const src = String(stage ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === "'" && !dq) { sq = !sq; cur += ch; continue; }
                if (ch === '"' && !sq) { dq = !dq; cur += ch; continue; }
                if (!sq && !dq) {
                    if (ch === '{' || ch === '(') depth++;
                    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1);
                    else if (/\s/.test(ch) && depth === 0) {
                        if (cur) { toks.push(cur); cur = ''; }
                        continue;
                    }
                }
                cur += ch;
            }
            if (cur) toks.push(cur);
            return toks;
        }

        function findRedirect(stage) {
            let type = null, file = null, append = false, errFile = null, errAppend = false, mergeErr = false;
            let sq = false, dq = false, clean = '';
            const src = String(stage ?? '');
            let i = 0;
            const readFile = (j) => {
                while (j < src.length && /\s/.test(src[j])) j++;
                let name = '', q2 = null;
                while (j < src.length) {
                    const c = src[j];
                    if (q2) {
                        name += c;
                        if (c === q2) q2 = null;
                        j++;
                    } else if (c === '"' || c === "'") { q2 = c; name += c; j++; }
                    else if (/[\s|&;]/.test(c)) break;
                    else { name += c; j++; }
                }
                return { name: name.trim(), next: j };
            };
            while (i < src.length) {
                const ch = src[i];
                if (ch === "'" && !dq) { sq = !sq; clean += ch; i++; continue; }
                if (ch === '"' && !sq) { dq = !dq; clean += ch; i++; continue; }
                if (!sq && !dq) {
                    if (src.startsWith('2>&1', i)) { mergeErr = true; i += 4; continue; }
                    if (src.startsWith('2>>', i)) {
                        const r = readFile(i + 3);
                        errFile = stripQuotes(r.name); errAppend = true; i = r.next; continue;
                    }
                    if (src.startsWith('2>', i)) {
                        const r = readFile(i + 2);
                        errFile = stripQuotes(r.name); errAppend = false; i = r.next; continue;
                    }
                    if (src.startsWith('>>', i)) {
                        const r = readFile(i + 2);
                        file = stripQuotes(r.name); append = true; type = 'overwrite'; i = r.next; continue;
                    }
                    if (ch === '>' && src[i + 1] !== '>') {
                        const r = readFile(i + 1);
                        file = stripQuotes(r.name); append = false; type = 'overwrite'; i = r.next; continue;
                    }
                }
                clean += ch; i++;
            }
            return { command: clean.trim(), file, append, errFile, errAppend, mergeErr };
        }

        // Expand $vars inside a double-quoted string or bare token.
        function expandString(s, inputObj) {
            return String(s ?? '').replace(/\$(\w+)(?::(\w+))?|\$\{([^}]+)\}|\$＼/g, (m, a, _b, c) => {
                const name = a || c;
                if (!name) return m;
                return psStr(resolveVariable(name, inputObj));
            }).replace(/\$_(\.\w+)?/g, (m, prop) => {
                if (!prop) return psStr(inputObj);
                return psStr(getProp(inputObj, prop.slice(1)));
            });
        }

        function resolveVariable(name, inputObj) {
            const n = String(name);
            if (n === '_') return inputObj;
            if (/^args(\[(\d+)\])?$/i.test(n)) {
                const m = n.match(/\[(\d+)\]/);
                const arr = getVar('ARGS') || [];
                return m ? (arr[Number(m[1])] ?? null) : arr;
            }
            if (/^env:/i.test(n)) {
                const key = normKey(n.slice(4));
                if (key === 'USERNAME') return currentUserName();
                if (key === 'COMPUTERNAME') return 'PC';
                if (key === 'OS') return 'Windows_NT';
                if (key === 'HOME' || key === 'USERPROFILE') return psDisplayPath(homeDir());
                if (key === 'TEMP' || key === 'TMP') return psDisplayPath([...homeDir(), 'AppData', 'Local', 'Temp']);
                if (key === 'PATH') return 'C:\\system;C:\\system\\wbem';
                if (key === 'PSMODULEPATH') return 'C:\\system\\Modules';
                if (Object.prototype.hasOwnProperty.call(vars, 'ENV_' + key)) return vars['ENV_' + key];
                return '';
            }
            if (/^(variable|alias|function):/i.test(n)) return getVar(n.split(':')[1]);
            return getVar(n);
        }

        function expandToken(tok, inputObj) {
            const t = String(tok ?? '');
            if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
                return t.slice(1, -1).replace(/''/g, "'");
            }
            if (t.startsWith('$(') && t.endsWith(')')) {
                const inner = t.slice(2, -1);
                captureDepth++;
                try {
                    const vals = runPipelineCapture(inner, []);
                    return vals.map(psStr).join('\n');
                } finally {
                    captureDepth--;
                }
            }
            if (t.startsWith('(') && t.endsWith(')') && t.length >= 2) {
                return evalValuePart(t, inputObj);
            }
            if (t[0] === '$') {
                const body = t.slice(1);
                if (body.startsWith('{') && body.endsWith('}')) return body.slice(1, -1);
                const m = body.match(/^(\w+)\[(\d+)\]$/);
                if (m) {
                    const arr = resolveVariable(m[1], inputObj);
                    return Array.isArray(arr) ? (arr[Number(m[2])] ?? null) : null;
                }
                const pm = body.match(/^(\w+)\.(\w+)$/);
                if (pm) return getProp(resolveVariable(pm[1], inputObj), pm[2]);
                return resolveVariable(body, inputObj);
            }
            if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
                let inner = t.slice(1, -1).replace(/`"([^`])?/g, '$1');
                inner = inner.replace(/\$(\w+)(\.\w+)?|\$\{([^}]+)\}|\$_(\.\w+)?/g, (m, a, prop, braced, uprop) => {
                    if (a) {
                        const v = resolveVariable(a, inputObj);
                        return psStr(prop ? getProp(v, prop.slice(1)) : v);
                    }
                    if (braced) return psStr(resolveVariable(braced, inputObj));
                    if (m.startsWith('$_')) {
                        const v = inputObj;
                        return psStr(uprop ? getProp(v, uprop.slice(1)) : v);
                    }
                    return m;
                });
                return inner;
            }
            if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
            if (/^\$?(true|false)$/i.test(t)) return /^true$/i.test(t.replace('$', ''));
            if (/^\$null$/i.test(t)) return null;
            return t;
        }
        // ---------- expression / condition evaluator ----------

        function toNumLoose(v) {
            if (typeof v === 'number') return v;
            if (v === null || v === undefined || v === '') return 0;
            if (typeof v === 'boolean') return v ? 1 : 0;
            const n = Number(psStr(v));
            return Number.isFinite(n) ? n : NaN;
        }

        function likeMatch(text, pattern) {
            return wildcardToRegExp(String(pattern)).test(String(text));
        }

        function evalOperand(tok, inputObj) {
            let t = String(tok ?? '').trim();
            const propM = t.match(/^\$_\.([\w]+)$/);
            if (propM) return getProp(inputObj, propM[1]);
            if (t === '$_') return inputObj;
            // Top-level commas build arrays: 1,2,3  "a","b"
            const commaParts = splitTopCommas(t);
            if (commaParts) return commaParts.map(p => evalOperand(p, inputObj));
            if (/^@\(.*\)$/s.test(t)) {
                const inner = t.slice(2, -1).trim();
                if (!inner) return [];
                return inner.split(',').map(s => evalOperand(s.trim(), inputObj));
            }
            if (/^@\{.*\}$/s.test(t)) {
                const ht = {};
                const inner = t.slice(2, -1).trim();
                if (inner) {
                    for (const pair of inner.split(';')) {
                        const eq = pair.indexOf('=');
                        if (eq >= 0) ht[pair.slice(0, eq).trim()] = evalOperand(pair.slice(eq + 1).trim(), inputObj);
                    }
                }
                return ht;
            }
            const expanded = expandToken(t, inputObj);
            // Bare words name a property of the pipeline object, so
            // `Where-Object Length -gt 100` reads $_.Length.
            if (typeof expanded === 'string' && expanded === t && inputObj !== null && inputObj !== undefined) {
                const pv = getProp(inputObj, t);
                if (pv !== undefined) return pv;
            }
            return expanded;
        }

        function evalCondition(expr, inputObj) {
            const e = String(expr ?? '').trim();
            if (!e) return false;
            // -not / ! prefix
            let m = e.match(/^(-not|!)\s+(.+)$/is);
            if (m) return !evalCondition(m[2], inputObj);
            // -and / -or (left-assoc, no precedence games beyond this)
            let parts = splitBool(e, '-or');
            if (parts) return parts.some(p => evalCondition(p, inputObj));
            parts = splitBool(e, '-and');
            if (parts) return parts.every(p => evalCondition(p, inputObj));
            // comparison ops
            m = e.match(/^(.+?)\s+(-eq|-ne|-gt|-ge|-lt|-le|-like|-notlike|-match|-notmatch|-contains|-notcontains|-in|-notin|-is)\s+(.+)$/is);
            if (m) {
                const a = evalOperand(m[1].trim(), inputObj);
                const b = evalOperand(m[3].trim(), inputObj);
                return compareOp(a, String(m[2]).toLowerCase(), b);
            }
            const v = evalOperand(e, inputObj);
            if (v === null || v === undefined || v === false || v === '' || v === 0) return false;
            if (Array.isArray(v)) return v.length > 0;
            return true;
        }

        function splitBool(expr, op) {
            let sq = false, dq = false, depth = 0;
            const low = expr.toLowerCase();
            for (let i = 0; i < expr.length; i++) {
                const ch = expr[i];
                if (ch === "'" && !dq) sq = !sq;
                else if (ch === '"' && !sq) dq = !dq;
                else if (!sq && !dq) {
                    if (ch === '(') depth++;
                    else if (ch === ')') depth--;
                    else if (depth === 0 && low.startsWith(op, i)) {
                        const before = expr[i - 1] || ' ';
                        const after = expr[i + op.length] || ' ';
                        if (/\s/.test(before) && /\s/.test(after)) {
                            return [expr.slice(0, i).trim(), expr.slice(i + op.length).trim()];
                        }
                    }
                }
            }
            return null;
        }

        function compareOp(a, op, b) {
            const an = toNumLoose(a), bn = toNumLoose(b);
            const numeric = Number.isFinite(an) && Number.isFinite(bn) && String(psStr(a)).trim() !== '' && String(psStr(b)).trim() !== '';
            const x = numeric ? an : String(psStr(a)).toLowerCase();
            const y = numeric ? bn : String(psStr(b)).toLowerCase();
            switch (op) {
                case '-eq': return x == y;
                case '-ne': return x != y;
                case '-gt': return x > y;
                case '-ge': return x >= y;
                case '-lt': return x < y;
                case '-le': return x <= y;
                case '-like': return likeMatch(psStr(a), psStr(b));
                case '-notlike': return !likeMatch(psStr(a), psStr(b));
                case '-match': {
                    try { return new RegExp(String(psStr(b)), 'i').test(String(psStr(a))); }
                    catch { return false; }
                }
                case '-notmatch': {
                    try { return !new RegExp(String(psStr(b)), 'i').test(String(psStr(a))); }
                    catch { return true; }
                }
                case '-contains': {
                    const arr = Array.isArray(a) ? a.map(psStr) : [psStr(a)];
                    return arr.some(v => v.toLowerCase() === String(psStr(b)).toLowerCase());
                }
                case '-notcontains': {
                    const arr = Array.isArray(a) ? a.map(psStr) : [psStr(a)];
                    return !arr.some(v => v.toLowerCase() === String(psStr(b)).toLowerCase());
                }
                case '-in': {
                    const arr = Array.isArray(b) ? b.map(psStr) : [psStr(b)];
                    return arr.some(v => v.toLowerCase() === String(psStr(a)).toLowerCase());
                }
                case '-notin': {
                    const arr = Array.isArray(b) ? b.map(psStr) : [psStr(b)];
                    return !arr.some(v => v.toLowerCase() === String(psStr(a)).toLowerCase());
                }
                case '-is': {
                    const t = String(psStr(b)).toLowerCase().replace(/^\[(.*)\]$/, '$1');
                    if (t === 'string') return typeof a === 'string';
                    if (t === 'int' || t === 'int32') return typeof a === 'number';
                    if (t === 'bool') return typeof a === 'boolean';
                    if (t === 'array') return Array.isArray(a);
                    return false;
                }
                default: return false;
            }
        }

        function evalArithmetic(expr, inputObj) {
            let src = String(expr ?? '').trim();
            src = src.replace(/\$(\w+)(\.\w+)?/g, (mm, a, prop) => {
                const v = resolveVariable(a, inputObj);
                const val = prop ? getProp(v, prop.slice(1)) : v;
                return typeof val === 'string' ? JSON.stringify(val) : (val ?? 0);
            });
            src = src.replace(/\b(-?[\d.]+)\s*\+\s*("(?:[^"]*)"|'(?:[^']*)')/g, 'String($1) + $2');
            if (!/^[0-9+\-*/%().\s"']+$/.test(src)) return expandToken(expr, inputObj);
            try {
                const v = Function(`"use strict"; return (${src});`)();
                return typeof v === 'number' && Number.isFinite(v) ? v : v;
            } catch { return expandToken(expr, inputObj); }
        }

        // ---------- block / control-flow executor ----------

        function findBraceBlock(lines, startIdx) {
            let depth = 0, started = false;
            for (let i = startIdx; i < lines.length; i++) {
                for (const ch of lines[i]) {
                    if (ch === '{') { depth++; started = true; }
                    else if (ch === '}') depth--;
                }
                if (started && depth === 0) return { end: i };
            }
            return { end: lines.length - 1 };
        }

        function collectBlock(lines, startIdx) {
            // Returns { body: string, end: idx } joining lines through the
            // closing brace.
            const { end } = findBraceBlock(lines, startIdx);
            let body = lines.slice(startIdx, end + 1).join('\n');
            const first = body.indexOf('{');
            const last = body.lastIndexOf('}');
            body = (first >= 0 && last > first) ? body.slice(first + 1, last) : '';
            return { body, end };
        }

        function splitTopCommas(s) {
            let sq = false, dq = false, depth = 0;
            const parts = [];
            let cur = '';
            const src = String(s ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === "'" && !dq) { sq = !sq; cur += ch; continue; }
                if (ch === '"' && !sq) { dq = !dq; cur += ch; continue; }
                if (!sq && !dq) {
                    if (ch === '(' || ch === '{' || ch === '[') depth++;
                    else if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
                    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
                }
                cur += ch;
            }
            if (!parts.length) return null;
            parts.push(cur.trim());
            return parts;
        }

        // Scanners for inline (single-line) block statements.
        function extractParen(s, openIdx) {
            let depth = 0, sq = false, dq = false;
            for (let i = openIdx; i < s.length; i++) {
                const ch = s[i];
                if (ch === "'" && !dq) sq = !sq;
                else if (ch === '"' && !sq) dq = !dq;
                else if (!sq && !dq) {
                    if (ch === '(') depth++;
                    else if (ch === ')') {
                        depth--;
                        if (depth === 0) return { inner: s.slice(openIdx + 1, i), end: i };
                    }
                }
            }
            return null;
        }

        function extractBrace(s, openIdx) {
            let depth = 0, sq = false, dq = false;
            for (let i = openIdx; i < s.length; i++) {
                const ch = s[i];
                if (ch === "'" && !dq) sq = !sq;
                else if (ch === '"' && !sq) dq = !dq;
                else if (!sq && !dq) {
                    if (ch === '{') depth++;
                    else if (ch === '}') {
                        depth--;
                        if (depth === 0) return { inner: s.slice(openIdx + 1, i), rest: s.slice(i + 1) };
                    }
                }
            }
            return null;
        }

        function evalValuePart(part, inputObj) {
            const t = String(part ?? '').trim();
            if (!t) return null;
            if (/^\s*\(.*\)\s*$/.test(t)) {
                const inner = t.trim().slice(1, -1);
                if (/[|;]/.test(inner) || /^(Get|Set|New|Remove|Write|Select|Sort|Where|ForEach|Test|Copy|Move|Invoke|Start|Stop|Out|Format|Convert|Measure|Group|Compare|Join|Split|Resolve|Clear|Add|Push|Pop|Tee)\b/i.test(inner.trim())) {
                    const vals = runPipelineCapture(inner, []);
                    return vals.length <= 1 ? (vals[0] ?? null) : vals;
                }
                return evalConcatOrArithmetic(inner, inputObj);
            }
            if (/[+\-*/%]\s*(\$|["'(\d])/.test(t)) {
                const v = evalConcatOrArithmetic(t, inputObj);
                if (typeof v === 'number' || (typeof v === 'string' && v !== t)) return v;
            }
            return evalOperand(t, inputObj);
        }

        function splitTopPlus(s) {
            let sq = false, dq = false, depth = 0;
            const parts = [];
            let cur = '';
            const src = String(s ?? '');
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                if (ch === "'" && !dq) { sq = !sq; cur += ch; continue; }
                if (ch === '"' && !sq) { dq = !dq; cur += ch; continue; }
                if (!sq && !dq) {
                    if (ch === '(') depth++;
                    else if (ch === ')') depth = Math.max(0, depth - 1);
                    else if (ch === '+' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
                }
                cur += ch;
            }
            if (!parts.length) return null;
            parts.push(cur.trim());
            return parts;
        }

        function evalConcatOrArithmetic(expr, inputObj) {
            // "a" + "b" concatenates like real PowerShell.
            const plus = splitTopPlus(String(expr ?? ''));
            if (plus && plus.length > 1) {
                const vals = plus.map(p => {
                    const q = p.trim();
                    if (/^".*"$/.test(q) || /^'.*'$/.test(q)) return expandToken(q, inputObj);
                    if (/^-?\d+(\.\d+)?$/.test(q)) return Number(q);
                    if (/^\$\w+(\.\w+)?$/.test(q)) return expandToken(q, inputObj);
                    const n = evalArithmetic(q, inputObj);
                    return (typeof n === 'string' && n === q) ? expandToken(q, inputObj) : n;
                });
                if (vals.some(v => typeof v === 'string')) return vals.map(psStr).join('');
                return vals.reduce((a, b) => toNumLoose(a) + toNumLoose(b), 0);
            }
            return evalArithmetic(expr, inputObj);
        }

        // A bare value statement: 3,1,2  "hi"  40 + 2  $x
        function evalValueStage(stage, inputObjs) {
            const first = String(stage || '').trim()[0] || '';
            if (!(/["'$@(\[.\d-]/.test(first))) return null;
            const parts = splitTopCommas(String(stage).trim()) || [String(stage).trim()];
            let out = [];
            for (const p of parts) {
                const v = evalValuePart(p, inputObjs && inputObjs[0]);
                if (Array.isArray(v)) out = out.concat(v);
                else if (v !== null && v !== undefined) out.push(v);
            }
            return out;
        }

        const flowControl = { break: false, continue: false, return: false, returnValue: null };
        let captureDepth = 0; // >0 while running nested (function/scriptblock/.ps1): stages don't print, values bubble up

        function execScript(script, inputObjs) {
            const lines = String(script ?? '').split(/\r?\n/);
            let out = [];
            let i = 0;
            while (i < lines.length) {
                if (flowControl.break || flowControl.continue || flowControl.return) break;
                const raw = lines[i];
                const line = raw.trim();
                if (!line || line.startsWith('#')) { i++; continue; }
                const low = line.toLowerCase();
                // Single-line balanced blocks run through the inline parser
                // (it handles chained else/catch/default on the same line).
                const singleLineBlock = /^(function|filter|if|foreach|for|while|do|switch|try)\b/i.test(line) &&
                    findBraceBlock(lines, i).end === i;
                if (singleLineBlock) {
                    const r = execInlineBlock(line);
                    out = out.concat(r.output || []);
                    if (!r.handled) {
                        for (const s of splitStatements(line)) {
                            const rr = execChains(s, inputObjs || []);
                            out = out.concat(rr);
                            if (flowControl.break || flowControl.continue || flowControl.return) break;
                        }
                    }
                    i++;
                    continue;
                }
                if (/^(function|filter)\s+/i.test(line)) {
                    const mm = line.match(/^(function|filter)\s+([\w-]+)/i);
                    const fname = mm ? mm[2] : '';
                    const { body, end } = collectBlock(lines, i);
                    if (fname) functions[normKey(fname)] = body;
                    i = end + 1;
                    continue;
                }
                if (/^if\s*\(/i.test(line)) {
                    const r = execIf(lines, i);
                    out = out.concat(r.output);
                    i = r.next;
                    continue;
                }
                if (/^foreach\s*\(/i.test(line)) {
                    const r = execForEach(lines, i);
                    out = out.concat(r.output);
                    i = r.next;
                    continue;
                }
                if (/^for\s*\(/i.test(line)) {
                    const r = execFor(lines, i);
                    out = out.concat(r.output);
                    i = r.next;
                    continue;
                }
                if (/^while\s*\(/i.test(line)) {
                    const r = execWhile(lines, i, false);
                    out = out.concat(r.output);
                    i = r.next;
                    continue;
                }
                if (/^do\s*\{?/i.test(line)) {
                    const r = execDo(lines, i);
                    out = out.concat(r.output);
                    i = r.next;
                    continue;
                }
                if (/^switch\s*\(/i.test(line)) {
                    const r = execSwitch(lines, i);
                    out = out.concat(r.output);
                    i = r.next;
                    continue;
                }
                if (/^try\s*\{?/i.test(line)) {
                    const r = execTry(lines, i);
                    out = out.concat(r.output);
                    i = r.next;
                    continue;
                }
                if (/^trap\s/i.test(line)) { i++; continue; }
                if (/^return(\s|$)/i.test(line)) {
                    const expr = line.replace(/^return\s*/i, '').trim();
                    flowControl.return = true;
                    flowControl.returnValue = expr ? runPipelineCapture(expr, inputObjs || []) : [];
                    break;
                }
                if (/^break(\s|$)/i.test(line)) { flowControl.break = true; i++; break; }
                if (/^continue(\s|$)/i.test(line)) { flowControl.continue = true; i++; break; }
                if (/^exit(\s|$)/i.test(line)) {
                    const n = line.replace(/^exit\s*/i, '').trim();
                    lastExit = n ? (Number(n) || 0) : 0;
                    flowControl.return = true;
                    flowControl.returnValue = [];
                    break;
                }
                // Accumulate brace-open statements split across lines.
                let stmt = raw;
                let opens = (stmt.match(/\{/g) || []).length - (stmt.match(/\}/g) || []).length;
                while (opens > 0 && i + 1 < lines.length) {
                    i++;
                    stmt += '\n' + lines[i];
                    opens = (stmt.match(/\{/g) || []).length - (stmt.match(/\}/g) || []).length;
                }
                for (const s of splitStatements(stmt)) {
                    const r = execChains(s, inputObjs || []);
                    out = out.concat(r);
                    if (flowControl.break || flowControl.continue || flowControl.return) break;
                }
                i++;
            }
            return out;
        }

        function execIf(lines, idx) {
            let i = idx;
            const out = [];
            const m = lines[i].match(/^if\s*\((.*)\)\s*\{?\s*$/i) || lines[i].match(/^if\s*\((.*)\)\s*(.*)$/i);
            const cond = m ? m[1] : '';
            const { body, end } = collectBlock(lines, i);
            let done = false;
            if (evalCondition(cond, null)) { out.push(...execScript(body, [])); done = true; }
            i = end + 1;
            while (i < lines.length) {
                const t = lines[i].trim();
                const em = t.match(/^elseif\s*\((.*)\)\s*\{?\s*$/i);
                if (em) {
                    const { body: b2, end: e2 } = collectBlock(lines, i);
                    if (!done && evalCondition(em[1], null)) { out.push(...execScript(b2, [])); done = true; }
                    i = e2 + 1;
                    continue;
                }
                if (/^else\s*\{?\s*$/i.test(t)) {
                    const { body: b3, end: e3 } = collectBlock(lines, i);
                    if (!done) out.push(...execScript(b3, []));
                    i = e3 + 1;
                    break;
                }
                break;
            }
            return { next: i, output: out };
        }

        function execForEach(lines, idx) {
            const m = lines[idx].match(/^foreach\s*\(\s*(\$\w+)\s+in\s+(.*)\)\s*\{?\s*$/i);
            const { body, end } = collectBlock(lines, idx);
            const out = [];
            if (m) {
                const varName = m[1].slice(1);
                let coll = evalOperand(m[2].trim(), null);
                if (!Array.isArray(coll)) coll = coll === null || coll === undefined ? [] : [coll];
                for (const item of coll) {
                    setVar(varName, item);
                    setVar('_', item);
                    flowControl.continue = false;
                    out.push(...execScript(body, []));
                    if (flowControl.break) { flowControl.break = false; break; }
                    if (flowControl.return) break;
                }
                flowControl.continue = false;
            }
            return { next: end + 1, output: out };
        }

        function execFor(lines, idx) {
            const m = lines[idx].match(/^for\s*\((.*)\)\s*\{?\s*$/i);
            const { body, end } = collectBlock(lines, idx);
            const out = [];
            if (m) {
                const parts = m[1].split(';').map(s => s.trim());
                if (parts[0]) execChains(parts[0].replace(/^\$/, '$'), []);
                let guard = 0;
                while (guard++ < 100000) {
                    if (parts[1] && !evalCondition(parts[1], null)) break;
                    flowControl.continue = false;
                    out.push(...execScript(body, []));
                    if (flowControl.break) { flowControl.break = false; break; }
                    if (flowControl.return) break;
                    if (parts[2]) execChains(parts[2], []);
                }
            }
            return { next: end + 1, output: out };
        }

        function execWhile(lines, idx, isUntil) {
            const m = lines[idx].match(/^while\s*\((.*)\)\s*\{?\s*$/i);
            const { body, end } = collectBlock(lines, idx);
            const out = [];
            if (m) {
                let guard = 0;
                while (guard++ < 100000) {
                    const ok = evalCondition(m[1], null);
                    if (isUntil ? ok : !ok) break;
                    flowControl.continue = false;
                    out.push(...execScript(body, []));
                    if (flowControl.break) { flowControl.break = false; break; }
                    if (flowControl.return) break;
                }
            }
            return { next: end + 1, output: out };
        }

        function execDo(lines, idx) {
            const { body, end } = collectBlock(lines, idx);
            let condLine = (lines[end + 1] || '').trim();
            const m = condLine.match(/^(while|until)\s*\((.*)\)\s*$/i);
            let guard = 0;
            const out = [];
            const isUntil = m && m[1].toLowerCase() === 'until';
            const cond = m ? m[2] : '';
            do {
                if (guard++ > 100000) break;
                flowControl.continue = false;
                out.push(...execScript(body, []));
                if (flowControl.break) { flowControl.break = false; break; }
                if (flowControl.return) break;
                if (!m) break;
                const ok = evalCondition(cond, null);
                if (isUntil ? ok : !ok) break;
            } while (true);
            return { next: m ? end + 2 : end + 1, output: out };
        }

        function execSwitch(lines, idx) {
            const m = lines[idx].match(/^switch\s*\((.*)\)\s*\{?\s*$/i);
            const { body, end } = collectBlock(lines, idx);
            const out = [];
            if (m) {
                const val = evalOperand(m[1].trim(), null);
                const caseLines = body.split(/\r?\n/);
                let ci = 0;
                while (ci < caseLines.length) {
                    const ct = caseLines[ci].trim();
                    if (!ct) { ci++; continue; }
                    const cm = ct.match(/^(.+?)\s*\{\s*(.*)$/);
                    if (cm) {
                        const label = cm[1].trim();
                        let cbody = cm[2] || '';
                        let depth = (cbody.match(/\{/g) || []).length + 1 - (cbody.match(/\}/g) || []).length;
                        while (depth > 0 && ci + 1 < caseLines.length) {
                            ci++;
                            cbody += '\n' + caseLines[ci];
                            depth += (caseLines[ci].match(/\{/g) || []).length - (caseLines[ci].match(/\}/g) || []).length;
                        }
                        const inner = cbody.slice(0, cbody.lastIndexOf('}'));
                        if (/^default$/i.test(label) || String(psStr(val)).toLowerCase() === label.replace(/^['"]|['"]$/g, '').toLowerCase()) {
                            out.push(...execScript(inner, []));
                        }
                    }
                    ci++;
                }
            }
            return { next: end + 1, output: out };
        }

        function execTry(lines, idx) {
            const { body, end } = collectBlock(lines, idx);
            let i = end + 1;
            const out = [];
            let catchBody = null, finallyBody = null;
            const ct = (lines[i] || '').trim();
            const cm = ct.match(/^catch.*\{?\s*$/i);
            if (cm) {
                const r = collectBlock(lines, i);
                catchBody = r.body;
                i = r.end + 1;
            }
            const ft = (lines[i] || '').trim();
            if (/^finally\s*\{?\s*$/i.test(ft)) {
                const r = collectBlock(lines, i);
                finallyBody = r.body;
                i = r.end + 1;
            }
            try {
                out.push(...execScript(body, []));
            } catch (e) {
                setVar('ERROR', psStr(e && e.message ? e.message : e));
                if (catchBody !== null) out.push(...execScript(catchBody, []));
                else emitError(e && e.message ? e.message : String(e));
            }
            if (finallyBody !== null) out.push(...execScript(finallyBody, []));
            return { next: i, output: out };
        }
        // ---------- inline single-line blocks (if/for/switch/try/...) ----------

        function skipWs(s, i) {
            while (i < s.length && /\s/.test(s[i])) i++;
            return i;
        }

        function wordAt(s, i, w) {
            return s.slice(i, i + w.length).toLowerCase() === w.toLowerCase() &&
                !/[\w]/.test(s[i + w.length] || ' ');
        }

        function execInlineIf(s) {
            let i = skipWs(s, 2);
            const par = extractParen(s, i);
            if (!par) throw new Error('if : missing condition.');
            i = skipWs(s, par.end + 1);
            const br = extractBrace(s, i);
            if (!br) throw new Error('if : missing { block }.');
            const branches = [{ cond: par.inner, body: br.inner }];
            i = skipWs(s, s.length - br.rest.length);
            while (true) {
                if (wordAt(s, i, 'elseif')) {
                    i = skipWs(s, i + 6);
                    const p2 = extractParen(s, i);
                    if (!p2) break;
                    i = skipWs(s, p2.end + 1);
                    const b2 = extractBrace(s, i);
                    if (!b2) break;
                    branches.push({ cond: p2.inner, body: b2.inner });
                    i = skipWs(s, s.length - b2.rest.length);
                } else if (wordAt(s, i, 'else')) {
                    i = skipWs(s, i + 4);
                    const b3 = extractBrace(s, i);
                    if (!b3) break;
                    branches.push({ cond: null, body: b3.inner });
                    i = skipWs(s, s.length - b3.rest.length);
                    break;
                } else break;
            }
            const branchOut = [];
            for (const b of branches) {
                if (b.cond === null || evalCondition(b.cond, null)) {
                    captureDepth++;
                    try { branchOut.push(...execScript(b.body, [])); }
                    finally { captureDepth--; }
                    break;
                }
            }
            const rest = s.slice(i).trim().replace(/^;+/, '').trim();
            return branchOut.concat(rest ? execChains(rest, []) : []);
        }

        function execInlineForEach(s) {
            const m = s.match(/^foreach\s*/i);
            const par = extractParen(s, m[0].length);
            if (!par) throw new Error('foreach : missing ( $var in collection ).');
            const im = par.inner.match(/^\s*(\$\w+)\s+in\s+([\s\S]+)$/);
            if (!im) throw new Error('foreach : expected ($var in collection).');
            const varName = im[1].slice(1);
            const coll = evalOperand(im[2].trim(), null);
            const arr = Array.isArray(coll) ? coll : (coll === null || coll === undefined ? [] : [coll]);
            let i = skipWs(s, par.end + 1);
            const b = extractBrace(s, i);
            if (!b) throw new Error('foreach : missing { block }.');
            const out = [];
            for (const item of arr) {
                setVar(varName, item);
                setVar('_', item);
                flowControl.continue = false;
                captureDepth++;
                try { out.push(...execScript(b.inner, [])); }
                finally { captureDepth--; }
                if (flowControl.break) { flowControl.break = false; break; }
                if (flowControl.return) break;
            }
            flowControl.continue = false;
            const rest = s.slice(s.length - b.rest.length).trim().replace(/^;+/, '').trim();
            return out.concat(rest ? execChains(rest, []) : []);
        }

        function execInlineFor(s) {
            const m = s.match(/^for\s*/i);
            const par = extractParen(s, m[0].length);
            if (!par) throw new Error('for : missing ( init; cond; incr ).');
            const parts = par.inner.split(';').map(x => x.trim());
            let i = skipWs(s, par.end + 1);
            const b = extractBrace(s, i);
            if (!b) throw new Error('for : missing { block }.');
            if (parts[0]) execChains(parts[0], []);
            const out = [];
            let guard = 0;
            while (guard++ < 100000) {
                if (parts[1] && !evalCondition(parts[1], null)) break;
                flowControl.continue = false;
                captureDepth++;
                try { out.push(...execScript(b.inner, [])); }
                finally { captureDepth--; }
                if (flowControl.break) { flowControl.break = false; break; }
                if (flowControl.return) break;
                if (parts[2]) execChains(parts[2], []);
            }
            const rest = s.slice(s.length - b.rest.length).trim().replace(/^;+/, '').trim();
            return out.concat(rest ? execChains(rest, []) : []);
        }

        function execInlineWhile(s) {
            const m = s.match(/^while\s*/i);
            const par = extractParen(s, m[0].length);
            if (!par) throw new Error('while : missing condition.');
            let i = skipWs(s, par.end + 1);
            const b = extractBrace(s, i);
            if (!b) throw new Error('while : missing { block }.');
            const out = [];
            let guard = 0;
            while (guard++ < 100000) {
                if (!evalCondition(par.inner, null)) break;
                flowControl.continue = false;
                captureDepth++;
                try { out.push(...execScript(b.inner, [])); }
                finally { captureDepth--; }
                if (flowControl.break) { flowControl.break = false; break; }
                if (flowControl.return) break;
            }
            const rest = s.slice(s.length - b.rest.length).trim().replace(/^;+/, '').trim();
            return out.concat(rest ? execChains(rest, []) : []);
        }

        function execInlineDo(s) {
            const m = s.match(/^do\s*/i);
            let i = skipWs(s, m[0].length);
            const b = extractBrace(s, i);
            if (!b) throw new Error('do : missing { block }.');
            let tail = skipWs(s, s.length - b.rest.length);
            const wm = s.slice(tail).match(/^(while|until)\s*/i);
            let cond = null, isUntil = false;
            if (wm) {
                isUntil = wm[1].toLowerCase() === 'until';
                const p = extractParen(s, tail + wm[0].length);
                cond = p ? p.inner : '';
            }
            let guard = 0;
            const out = [];
            do {
                if (guard++ > 100000) break;
                flowControl.continue = false;
                captureDepth++;
                try { out.push(...execScript(b.inner, [])); }
                finally { captureDepth--; }
                if (flowControl.break) { flowControl.break = false; break; }
                if (flowControl.return) break;
                if (!cond) break;
                const ok = evalCondition(cond, null);
                if (isUntil ? ok : !ok) break;
            } while (true);
            return out;
        }

        function execInlineSwitch(s) {
            const m = s.match(/^switch\s*/i);
            const par = extractParen(s, m[0].length);
            if (!par) throw new Error('switch : missing ( expression ).');
            const val = evalOperand(par.inner.trim(), null);
            let i = skipWs(s, par.end + 1);
            const b = extractBrace(s, i);
            if (!b) throw new Error('switch : missing { block }.');
            const body = b.inner;
            let ci = 0;
            let matched = false;
            const out = [];
            while (ci < body.length) {
                ci = skipWs(body, ci);
                if (ci >= body.length) break;
                // read label: quoted string or bare word
                let label;
                if (body[ci] === '"' || body[ci] === "'") {
                    const q = body[ci];
                    let j = ci + 1;
                    while (j < body.length && body[j] !== q) j++;
                    label = body.slice(ci + 1, j);
                    ci = skipWs(body, j + 1);
                } else {
                    const lm = body.slice(ci).match(/^([^\s{]+)\s*/);
                    if (!lm) break;
                    label = lm[1];
                    ci = skipWs(body, ci + lm[0].length);
                }
                if (body[ci] !== '{') break;
                const cb = extractBrace(body, ci);
                if (!cb) break;
                ci = body.length - cb.rest.length;
                const isDefault = /^default$/i.test(label);
                if (!matched && (isDefault || String(psStr(val)).toLowerCase() === String(label).toLowerCase())) {
                    matched = true;
                    captureDepth++;
                    try { out.push(...execScript(cb.inner, [])); }
                    finally { captureDepth--; }
                }
            }
            // default runs when nothing matched
            if (!matched) {
                let di = 0;
                while (di < body.length) {
                    di = skipWs(body, di);
                    if (wordAt(body, di, 'default')) {
                        const cb = extractBrace(body, skipWs(body, di + 7));
                        if (cb) {
                            captureDepth++;
                            try { out.push(...execScript(cb.inner, [])); }
                            finally { captureDepth--; }
                        }
                        break;
                    }
                    di++;
                }
            }
            const rest = s.slice(s.length - b.rest.length).trim().replace(/^;+/, '').trim();
            return out.concat(rest ? execChains(rest, []) : []);
        }

        function execInlineTry(s) {
            const m = s.match(/^try\s*/i);
            let i = skipWs(s, m[0].length);
            const tb = extractBrace(s, i);
            if (!tb) throw new Error('try : missing { block }.');
            i = skipWs(s, s.length - tb.rest.length);
            let catchBody = null, finallyBody = null;
            if (wordAt(s, i, 'catch')) {
                i = skipWs(s, i + 5);
                // optional: catch [Type] $var
                const tm = s.slice(i).match(/^\[[\w.]+\]\s*/);
                if (tm) i += tm[0].length;
                const vm = s.slice(i).match(/^(\$\w+)\s*/);
                if (vm) i += vm[0].length;
                const cb = extractBrace(s, i);
                if (cb) { catchBody = cb.inner; i = skipWs(s, s.length - cb.rest.length); }
            }
            if (wordAt(s, i, 'finally')) {
                i = skipWs(s, i + 7);
                const fb = extractBrace(s, i);
                if (fb) { finallyBody = fb.inner; i = skipWs(s, s.length - fb.rest.length); }
            }
            const out = [];
            try {
                captureDepth++;
                try { out.push(...execScript(tb.inner, [])); }
                finally { captureDepth--; }
            } catch (e) {
                setVar('ERROR', e && e.message ? e.message : String(e));
                if (catchBody !== null) {
                    captureDepth++;
                    try { out.push(...execScript(catchBody, [])); }
                    finally { captureDepth--; }
                } else {
                    emitError(e && e.message ? e.message : String(e));
                }
            }
            if (finallyBody !== null) {
                captureDepth++;
                try { out.push(...execScript(finallyBody, [])); }
                finally { captureDepth--; }
            }
            const rest = s.slice(i).trim().replace(/^;+/, '').trim();
            return out.concat(rest ? execChains(rest, []) : []);
        }

        function execInlineBlock(stmt) {
            const s = String(stmt || '').trim();
            let m;
            if ((m = s.match(/^(function|filter)\s+([\w-]+)\s*([\s\S]*)$/i))) {
                const bi = m[3].indexOf('{');
                if (bi < 0) return { handled: true, output: [] };
                const b = extractBrace(m[3], bi);
                if (!b) return { handled: true, output: [] };
                functions[normKey(m[2])] = b.inner;
                const rest = b.rest.trim().replace(/^;+/, '').trim();
                return { handled: true, output: rest ? execChains(rest, []) : [] };
            }
            if (/^if\s*\(/i.test(s)) return { handled: true, output: execInlineIf(s) };
            if (/^foreach\s*\(/i.test(s)) return { handled: true, output: execInlineForEach(s) };
            if (/^for\s*\(/i.test(s)) return { handled: true, output: execInlineFor(s) };
            if (/^while\s*\(/i.test(s)) return { handled: true, output: execInlineWhile(s) };
            if (/^do\s*\{/i.test(s)) return { handled: true, output: execInlineDo(s) };
            if (/^switch\s*\(/i.test(s)) return { handled: true, output: execInlineSwitch(s) };
            if (/^try\s*\{/i.test(s)) return { handled: true, output: execInlineTry(s) };
            if (/^return(\s|;|$)/i.test(s)) {
                const expr = s.replace(/^return\s*/i, '').trim().replace(/;$/, '');
                flowControl.return = true;
                flowControl.returnValue = expr ? runPipelineCapture(expr, []) : [];
                return { handled: true, output: [] };
            }
            if (/^(break|continue|exit)(\s|;|$)/i.test(s)) {
                const kw = s.match(/^(break|continue|exit)/i)[1].toLowerCase();
                if (kw === 'break') flowControl.break = true;
                else if (kw === 'continue') flowControl.continue = true;
                else { flowControl.return = true; flowControl.returnValue = []; }
                return { handled: true, output: [] };
            }
            return { handled: false };
        }

        // ---------- chains, pipelines, dispatch ----------

        function execChains(stmt, inputObjs) {
            const steps = splitChainTop(stmt);
            if (!steps.length) return [];
            let out = [];
            for (const step of steps) {
                if (!step.cmd) continue;
                if (step.op === '&&' && !lastOk) continue;
                if (step.op === '||' && lastOk) continue;
                out = out.concat(runPipelineCapture(step.cmd, inputObjs));
            }
            return out;
        }

        function runPipelineCapture(stmt, inputObjs) {
            const inline = execInlineBlock(stmt);
            if (inline.handled) return inline.output || [];
            const stages = splitPipeline(stmt);
            if (!stages.length) return [];
            if (stages.length === 1) {
                return execSingleStage(stages[0], inputObjs || [], true);
            }
            let current = inputObjs || [];
            for (let s = 0; s < stages.length; s++) {
                const last = s === stages.length - 1;
                current = execSingleStage(stages[s], current, last) || [];
            }
            return current;
        }

        function parseStage(stage) {
            const redir = findRedirect(stage);
            const toks = tokenizeStage(redir.command);
            if (!toks.length) return { name: '', pos: [], named: {}, redir };
            let name = toks[0];
            // call operator & / dot-sourcing .
            if ((name === '&' || name === '.') && toks.length > 1) {
                name = toks[1];
                toks.splice(0, 1);
                toks[0] = name;
            }
            const pos = [];
            const named = {};
            // Comparison/logical operators are never parameter names, so
            // `Where-Object Length -gt 100` keeps -gt as a positional.
            const PS_OPERATORS = new Set(['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'like', 'notlike', 'match', 'notmatch', 'contains', 'notcontains', 'in', 'notin', 'is', 'and', 'or', 'not']);
            let i = 1;
            while (i < toks.length) {
                const t = toks[i];
                const nm = t.match(/^(-{1,2})([\w]+)(?::(.*))?$/);
                if (nm && !/^-?\d/.test(t) && !PS_OPERATORS.has(nm[2].toLowerCase())) {
                    const key = nm[2].toLowerCase();
                    if (nm[3] !== undefined) {
                        named[key] = expandToken(nm[3], null);
                        i++;
                    } else if (i + 1 < toks.length && !/^-/.test(toks[i + 1]) && !isScriptBlock(toks[i + 1])) {
                        named[key] = expandToken(toks[i + 1], null);
                        i += 2;
                    } else if (i + 1 < toks.length && isScriptBlock(toks[i + 1])) {
                        named[key] = scriptBlockOf(toks[i + 1]);
                        i += 2;
                    } else {
                        named[key] = true;
                        i++;
                    }
                } else if (isScriptBlock(t)) {
                    pos.push(scriptBlockOf(t));
                    i++;
                } else {
                    pos.push(t);
                    i++;
                }
            }
            return { name, pos, named, redir };
        }

        function isScriptBlock(t) {
            const s = String(t).trim();
            return s.startsWith('{') && s.endsWith('}');
        }

        function scriptBlockOf(t) {
            const s = String(t).trim();
            return { __scriptblock: true, body: s.slice(1, -1) };
        }

        function isScriptBlockVal(v) {
            return v !== null && typeof v === 'object' && v.__scriptblock === true;
        }

        function runScriptBlock(sb, inputObj) {
            const saved = getVar('_');
            setVar('_', inputObj === undefined ? null : inputObj);
            flowControl.break = false; flowControl.continue = false; flowControl.return = false;
            flowControl.returnValue = null;
            let out;
            captureDepth++;
            try {
                out = execScript(sb.body, inputObj === undefined ? [] : [inputObj]);
                if (flowControl.return) {
                    out = flowControl.returnValue || [];
                    flowControl.return = false;
                    flowControl.returnValue = null;
                }
            } finally {
                captureDepth--;
                setVar('_', saved);
                flowControl.break = false; flowControl.continue = false;
            }
            if (out && out.length === 1 && Array.isArray(out[0]) && out.length === 1) return out[0];
            return out || [];
        }

        const ALIASES = {
            ls: 'Get-ChildItem', dir: 'Get-ChildItem', gci: 'Get-ChildItem',
            cd: 'Set-Location', chdir: 'Set-Location', sl: 'Set-Location',
            pwd: 'Get-Location', gl: 'Get-Location',
            ni: 'New-Item', md: 'New-Item',
            rm: 'Remove-Item', del: 'Remove-Item', erase: 'Remove-Item', rd: 'Remove-Item', ri: 'Remove-Item',
            cp: 'Copy-Item', copy: 'Copy-Item',
            mv: 'Move-Item', move: 'Move-Item', ren: 'Rename-Item', rni: 'Rename-Item',
            gi: 'Get-Item',
            cat: 'Get-Content', type: 'Get-Content', gc: 'Get-Content',
            sc: 'Set-Content', ac: 'Add-Content', clc: 'Clear-Content',
            echo: 'Write-Output', write: 'Write-Output',
            cls: 'Clear-Host', clear: 'Clear-Host',
            help: 'Get-Help', man: 'Get-Help',
            gcm: 'Get-Command',
            gal: 'Get-Alias', sal: 'Set-Alias', nal: 'New-Alias',
            ghy: 'Get-History', h: 'Get-History', history: 'Get-History', r: 'Invoke-History', clhy: 'Clear-History',
            gv: 'Get-Variable', sv: 'Set-Variable', nv: 'New-Variable', rv: 'Remove-Variable', clv: 'Clear-Variable',
            where: 'Where-Object', '?': 'Where-Object',
            '%': 'ForEach-Object', foreach: 'ForEach-Object',
            select: 'Select-Object', sort: 'Sort-Object', group: 'Group-Object',
            measure: 'Measure-Object', diff: 'Compare-Object', compare: 'Compare-Object',
            tee: 'Tee-Object',
            ft: 'Format-Table', fl: 'Format-List', fw: 'Format-Wide',
            gps: 'Get-Process', ps: 'Get-Process', saps: 'Start-Process', start: 'Start-Process',
            sleep: 'Start-Sleep', gsv: 'Get-Service', gdr: 'Get-PSDrive',
            sajb: 'Start-Job', gjb: 'Get-Job', rcjb: 'Receive-Job',
            iwr: 'Invoke-WebRequest', curl: 'Invoke-WebRequest', wget: 'Invoke-WebRequest',
            ping: 'Test-Connection', tnc: 'Test-Connection'
        };
        const customAliases = {};

        function resolveName(name) {
            const raw = String(name || '');
            if (customAliases[raw.toLowerCase()]) return customAliases[raw.toLowerCase()];
            if (ALIASES[raw.toLowerCase()]) return ALIASES[raw.toLowerCase()];
            const hit = Object.keys(CMDLETS).find(k => k.toLowerCase() === raw.toLowerCase());
            if (hit) return hit;
            const fn = Object.keys(functions).find(k => k.toLowerCase() === raw.toLowerCase());
            if (fn) return '##function:' + fn;
            // external .ps1 / .bat passthrough
            if (/\.ps1$/i.test(raw) || /\.bat$/i.test(raw) || /\.cmd$/i.test(raw)) return '##file:' + raw;
            return raw;
        }

        function execSingleStage(stage, inputObjs, isLast) {
            const parsed = parseStage(stage);
            if (!parsed.name) return [];
            const redir = parsed.redir;
            const target = resolveName(parsed.name);
            const ctx = {
                pos: parsed.pos.map(t => (typeof t === 'string' ? expandToken(t, null) : t)),
                rawPos: parsed.pos,
                named: parsed.named,
                input: inputObjs || [],
                redir,
                print: emit,
                error: emitError
            };
            // assignment: $x = <pipeline rest> (spaced or $x=... form)
            const noSpaceAssign = parsed.name.match(/^\$([\w]+)=(.*)$/s);
            if (noSpaceAssign) {
                const vals = runPipelineCapture(noSpaceAssign[2] || "''", []);
                setVar(noSpaceAssign[1], vals.length <= 1 ? (vals[0] ?? null) : vals);
                lastOk = true;
                return [];
            }
            const assignM = parsed.name.match(/^\$(\w+)$/);
            if (assignM && (ctx.pos[0] === '=' || String(parsed.pos[0] || '') === '=')) {
                const rest = parsed.pos.slice(1).join(' ');
                const vals = runPipelineCapture(rest || "''", []);
                const v = vals.length <= 1 ? (vals[0] ?? null) : vals;
                setVar(assignM[1], v);
                lastOk = true;
                return [];
            }
            let result = [];
            try {
                if (target.startsWith('##function:')) {
                    const key = target.slice('##function:'.length);
                    const savedArgs = getVar('ARGS');
                    setVar('ARGS', ctx.pos);
                    captureDepth++;
                    try {
                        result = execScript(functions[key], ctx.input);
                    } finally {
                        captureDepth--;
                        setVar('ARGS', savedArgs);
                    }
                } else if (target.startsWith('##file:')) {
                    result = runScriptFile(target.slice('##file:'.length), ctx.pos);
                } else if (CMDLETS[target]) {
                    result = CMDLETS[target](ctx) || [];
                } else {
                    const asValue = evalValueStage(stage, ctx.input);
                    if (asValue !== null) {
                        result = asValue;
                    } else {
                        const err = new Error(`${parsed.name} : The term '${parsed.name}' is not recognized as the name of a cmdlet, function, script file, or operable program.`);
                        err.psTerminating = true;
                        throw err;
                    }
                }
                lastOk = true;
            } catch (e) {
                if (e && e.psTerminating) throw e;
                emitError(e && e.message ? e.message : String(e));
                lastExit = 1;
                return [];
            }
            if (!isLast) return result;
            // error stream to file?
            if (redir.errFile && !redir.mergeErr) {
                writeRedirect({ file: redir.errFile, append: redir.errAppend }, '');
            }
            if (redir.file) {
                const lines = result.map(formatOne);
                writeRedirect(redir, lines.join('\n'));
                return [];
            }
            if (isLast && captureDepth === 0) printValues(result, null);
            return result;
        }

        function listDir(dir, force) {
            let kids = [];
            try { kids = FileSystem.getChildren(dir) || []; } catch { kids = []; }
            if (!force) kids = kids.filter(k => !String(k.name).startsWith('.'));
            return kids.map(k => filePs(k, dir));
        }

        function ensureParentDirs(full) {
            let cur = ['/'];
            for (const seg of full.slice(1, -1)) {
                const next = [...cur, seg];
                if (!FileSystem.itemExists(next)) FileSystem.createFolder(cur, seg);
                cur = next;
            }
        }
        // ---------- cmdlet implementations ----------

        const CMDLETS = {
            'Get-ChildItem'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const filter = ctx.named.filter ?? ctx.named.include ?? null;
                const rec = ctx.named.recurse || ctx.named.recursive || ctx.named.s || false;
                const force = ctx.named.force || false;
                const dirOnly = ctx.named.directory || false;
                const fileOnly = ctx.named.file || false;
                let target = p !== undefined && p !== null && String(p) !== '' ? resolvePSPath(String(p)) : [...getCwd()];
                // file target -> return the file itself
                const node = FileSystem.getNode(target);
                if (node && node.type === 'file') {
                    return [filePs({ name: target[target.length - 1], type: 'file', ext: '', modified: node.modified, size: (node.content || '').length }, target.slice(0, -1))];
                }
                if (!FileSystem.isFolder(target)) {
                    const wx = expandWildcard(String(p));
                    if (wx) return wx.matches.map(m2 => filePs(m2, wx.dir));
                    throw new Error(`Get-ChildItem : Cannot find path '${p}' because it does not exist.`);
                }
                let items = listDir(target, force);
                if (filter) {
                    const re = wildcardToRegExp(String(filter));
                    items = items.filter(o => re.test(o.props.Name));
                } else if (p !== undefined && /[*?]/.test(String(p))) {
                    const base = String(p).split(/[/\\]/).pop();
                    const re = wildcardToRegExp(base);
                    items = items.filter(o => re.test(o.props.Name));
                }
                if (dirOnly) items = items.filter(o => o.props.PSIsContainer);
                if (fileOnly) items = items.filter(o => !o.props.PSIsContainer);
                if (rec) {
                    const all = [...items];
                    for (const d of items.filter(o => o.props.PSIsContainer)) {
                        const sub = resolvePSPath(psDisplayPath([...target, d.props.Name]).replace(/^C:/, ''));
                        try {
                            const kids = FileSystem.getChildren([...target, d.props.Name]) || [];
                            kids.forEach(k => all.push(filePs(k, [...target, d.props.Name])));
                        } catch { /* skip */ }
                    }
                    return all;
                }
                return items;
            },

            'Set-Location'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                if (p === undefined || String(p) === '' || String(p) === '~') {
                    setCwd([...homeDir()]);
                    return [];
                }
                if (String(p) === '-') { ctx.error('Set-Location : OLDPWD is not set.'); return []; }
                const target = resolvePSPath(String(p));
                if (!FileSystem.isFolder(target)) throw new Error(`Set-Location : Cannot find path '${p}' because it does not exist.`);
                setCwd(target);
                return [];
            },

            'Get-Location'(ctx) {
                const cwd = getCwd();
                if (ctx.named.stack) return locStack.map(d => psObj('PathInfo', { Path: psDisplayPath(d) }, psDisplayPath(d)));
                return [psObj('PathInfo', { Path: psDisplayPath(cwd), ProviderPath: '/' + cwd.slice(1).join('/') }, psDisplayPath(cwd))];
            },

            'Push-Location'(ctx) {
                locStack.push([...getCwd()]);
                if (ctx.pos[0] !== undefined) CMDLETS['Set-Location'](ctx);
                return [];
            },

            'Pop-Location'() {
                const d = locStack.pop();
                if (!d) throw new Error('Pop-Location : Location stack is empty.');
                if (FileSystem.isFolder(d)) setCwd(d);
                return [];
            },

            'New-Item'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const type = String(ctx.named.itemtype ?? ctx.named.type ?? 'file').toLowerCase();
                const value = ctx.named.value ?? '';
                const force = ctx.named.force || false;
                if (p === undefined) throw new Error('New-Item : Cannot bind argument to parameter \'Path\' because it is an empty string.');
                const full = resolvePSPath(String(p));
                const name = full[full.length - 1];
                const parent = full.slice(0, -1);
                if (FileSystem.itemExists(full)) {
                    if (!force) throw new Error(`New-Item : An item with the specified name ${psDisplayPath(full)} already exists.`);
                    return [psObj('Item', { Name: name, FullName: psDisplayPath(full) }, name)];
                }
                ensureParentDirs(full);
                if (type.startsWith('dir')) {
                    FileSystem.createFolder(parent, name);
                } else {
                    const dot = name.lastIndexOf('.');
                    FileSystem.createFile(parent, name, String(value ?? ''), dot >= 0 ? name.slice(dot + 1) : '');
                }
                return [psObj('Item', { Name: name, FullName: psDisplayPath(full) }, name)];
            },

            'Remove-Item'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const rec = ctx.named.recurse || ctx.named.recursive || ctx.named.force || false;
                if (p === undefined) throw new Error('Remove-Item : Cannot bind argument to parameter \'Path\' because it is an empty string.');
                const wx = /[*?]/.test(String(p)) ? expandWildcard(String(p)) : null;
                const targets = wx ? wx.matches.map(m2 => [...wx.dir, m2.name]) : [resolvePSPath(String(p))];
                if (!targets.length) throw new Error(`Remove-Item : Cannot find path '${p}' because it does not exist.`);
                for (const t of targets) {
                    if (!FileSystem.itemExists(t)) throw new Error(`Remove-Item : Cannot find path '${p}' because it does not exist.`);
                    const node = FileSystem.getNode(t);
                    if (node && node.type === 'folder' && !rec) {
                        const kids = FileSystem.getChildren(t) || [];
                        if (kids.length) throw new Error(`Remove-Item : Cannot remove item ${psDisplayPath(t)}: Directory not empty. Use -Recurse.`);
                    }
                    FileSystem.deleteItem(t);
                }
                return [];
            },

            'Copy-Item'(ctx) {
                const src = ctx.named.path ?? ctx.pos[0];
                const dst = ctx.named.destination ?? ctx.pos[1];
                if (src === undefined || dst === undefined) throw new Error('Copy-Item : Cannot bind argument to parameter \'Path\' because it is missing.');
                const wx = /[*?]/.test(String(src)) ? expandWildcard(String(src)) : null;
                const sources = wx ? wx.matches.filter(m2 => m2.type !== 'folder').map(m2 => [...wx.dir, m2.name]) : [resolvePSPath(String(src))];
                const dstPath = resolvePSPath(String(dst));
                const dstIsDir = FileSystem.isFolder(dstPath);
                let count = 0;
                for (const s of sources) {
                    const content = FileSystem.readFile(s);
                    if (content === null || content === undefined) continue;
                    const final = dstIsDir ? [...dstPath, s[s.length - 1]] : dstPath;
                    ensureParentDirs(final);
                    if (FileSystem.itemExists(final)) FileSystem.writeFile(final, content);
                    else {
                        const nm = final[final.length - 1];
                        const dot = nm.lastIndexOf('.');
                        FileSystem.createFile(final.slice(0, -1), nm, content, dot >= 0 ? nm.slice(dot + 1) : '');
                    }
                    count++;
                }
                if (!count) throw new Error('Copy-Item : Cannot find path \'' + src + '\' because it does not exist.');
                return [];
            },

            'Move-Item'(ctx) {
                CMDLETS['Copy-Item'](ctx);
                const src = ctx.named.path ?? ctx.pos[0];
                const wx = /[*?]/.test(String(src)) ? expandWildcard(String(src)) : null;
                const sources = wx ? wx.matches.map(m2 => [...wx.dir, m2.name]) : [resolvePSPath(String(src))];
                for (const s of sources) { try { FileSystem.deleteItem(s); } catch { /* noop */ } }
                return [];
            },

            'Rename-Item'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const nn = ctx.named.newname ?? ctx.pos[1];
                if (p === undefined || nn === undefined) throw new Error('Rename-Item : Cannot bind argument to parameter because it is missing.');
                const full = resolvePSPath(String(p));
                const leaf = String(nn).split(/[/\\]/).pop();
                if (!FileSystem.renameItem(full, leaf)) throw new Error(`Rename-Item : Cannot rename '${p}'.`);
                return [];
            },

            'Get-Item'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const full = p !== undefined ? resolvePSPath(String(p)) : [...getCwd()];
                const node = FileSystem.getNode(full);
                if (!node) throw new Error(`Get-Item : Cannot find path '${p}' because it does not exist.`);
                if (full.length <= 1) return [psObj('DirectoryInfo', { Name: '/', FullName: 'C:\\', PSIsContainer: true }, '/')];
                return [filePs({ name: full[full.length - 1], type: node.type, ext: node.ext || '', modified: node.modified, size: (node.content || '').length }, full.slice(0, -1))];
            },

            'Test-Path'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                if (p === undefined) return [false];
                if (/[*?]/.test(String(p))) {
                    const wx = expandWildcard(String(p));
                    return [!!wx && wx.matches.length > 0];
                }
                return [FileSystem.itemExists(resolvePSPath(String(p)))];
            },

            'Get-Content'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                if (p === undefined) throw new Error('Get-Content : Cannot bind argument to parameter \'Path\' because it is an empty string.');
                const raw = ctx.named.raw || ctx.named.rawtext || false;
                const total = ctx.named.totalcount ?? ctx.named.first ?? null;
                const full = resolvePSPath(String(p));
                const node = FileSystem.getNode(full);
                if (!node) throw new Error(`Get-Content : Cannot find path '${p}' because it does not exist.`);
                if (node.type === 'folder') throw new Error(`Get-Content : Access to the path '${p}' is denied (is a directory).`);
                if (node.blobRef) throw new Error(`Get-Content : '${p}' is a binary file and cannot be displayed as text.`);
                const content = FileSystem.readFile(full) ?? '';
                if (raw) return [content];
                let lines = String(content).split('\n');
                if (lines.length && lines[lines.length - 1] === '') lines.pop();
                if (total !== null && total !== undefined) lines = lines.slice(0, Number(total));
                return lines.map(l => l.replace(/\r$/, ''));
            },

            'Set-Content'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const val = ctx.named.value ?? (ctx.pos.length > 1 ? ctx.pos.slice(1).join(' ') : (ctx.input.length ? ctx.input.map(psStr).join('\n') : ''));
                if (p === undefined) throw new Error('Set-Content : Cannot bind argument to parameter \'Path\'.');
                const full = resolvePSPath(String(p));
                ensureParentDirs(full);
                const text = Array.isArray(val) ? val.map(psStr).join('\n') : psStr(val);
                if (FileSystem.itemExists(full)) {
                    const node = FileSystem.getNode(full);
                    if (node && node.type === 'folder') throw new Error(`Set-Content : Access to the path '${p}' is denied.`);
                    FileSystem.writeFile(full, text + (text.endsWith('\n') ? '' : '\n'));
                } else {
                    const nm = full[full.length - 1];
                    const dot = nm.lastIndexOf('.');
                    FileSystem.createFile(full.slice(0, -1), nm, text + '\n', dot >= 0 ? nm.slice(dot + 1) : '');
                }
                return [];
            },

            'Add-Content'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const val = ctx.named.value ?? (ctx.pos.length > 1 ? ctx.pos.slice(1).join(' ') : (ctx.input.length ? ctx.input.map(psStr).join('\n') : ''));
                if (p === undefined) throw new Error('Add-Content : Cannot bind argument to parameter \'Path\'.');
                const full = resolvePSPath(String(p));
                const text = Array.isArray(val) ? val.map(psStr).join('\n') : psStr(val);
                if (FileSystem.itemExists(full)) {
                    const old = FileSystem.readFile(full) ?? '';
                    FileSystem.writeFile(full, old + text + '\n');
                } else {
                    ensureParentDirs(full);
                    const nm = full[full.length - 1];
                    const dot = nm.lastIndexOf('.');
                    FileSystem.createFile(full.slice(0, -1), nm, text + '\n', dot >= 0 ? nm.slice(dot + 1) : '');
                }
                return [];
            },

            'Clear-Content'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                if (p === undefined) throw new Error('Clear-Content : Cannot bind argument to parameter \'Path\'.');
                const full = resolvePSPath(String(p));
                if (!FileSystem.itemExists(full)) throw new Error(`Clear-Content : Cannot find path '${p}'.`);
                FileSystem.writeFile(full, '');
                return [];
            },

            'Join-Path'(ctx) {
                const base = String(ctx.named.path ?? ctx.pos[0] ?? '');
                const child = String(ctx.named.childpath ?? ctx.pos[1] ?? '');
                const sep = base.endsWith('\\') || base.endsWith('/') ? '' : '\\';
                return [base + sep + child];
            },

            'Split-Path'(ctx) {
                const p = String(ctx.named.path ?? ctx.pos[0] ?? '');
                const leaf = ctx.named.leaf || false;
                const parent = ctx.named.parent || (!leaf && ctx.pos.length < 2);
                const noqual = ctx.named.noqualifier || false;
                let s = p.replace(/\//g, '\\');
                if (noqual) s = s.replace(/^[A-Za-z]:/, '');
                if (leaf || (!parent && ctx.named.leaf === undefined && ctx.pos[1] === undefined)) {
                    const parts = s.split('\\').filter(Boolean);
                    return [parts.pop() || ''];
                }
                const idx = s.lastIndexOf('\\');
                return [idx <= 0 ? (s.startsWith('\\') ? '\\' : '') : s.slice(0, idx)];
            },

            'Resolve-Path'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const full = p !== undefined ? resolvePSPath(String(p)) : [...getCwd()];
                return [psObj('PathInfo', { Path: psDisplayPath(full) }, psDisplayPath(full))];
            },

            'Get-ItemProperty'(ctx) {
                const item = CMDLETS['Get-Item'](ctx)[0];
                const nm = ctx.named.name ?? ctx.pos[1];
                if (!item) return [];
                if (nm !== undefined) return [getProp(item, String(nm))];
                return [item];
            },

            'Set-ItemProperty'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                const nm = ctx.named.name ?? ctx.pos[1];
                const val = ctx.named.value ?? ctx.pos[2];
                if (p === undefined || nm === undefined) throw new Error('Set-ItemProperty : Path and Name are required.');
                const full = resolvePSPath(String(p));
                const node = FileSystem.getNode(full);
                if (!node) throw new Error(`Set-ItemProperty : Cannot find path '${p}'.`);
                node[String(nm)] = val;
                try { FileSystem.save(); } catch { /* noop */ }
                return [];
            },
            'Write-Host'(ctx) {
                const fg = ctx.named.foregroundcolor;
                const bg = ctx.named.backgroundcolor;
                const noNew = ctx.named.nonewline || false;
                const sep = ctx.named.separator ?? ' ';
                const text = ctx.pos.map(psStr).join(String(sep));
                if (noNew) printFn(String(text));
                else emit(text);
                if (fg || bg) { /* colors honored by the blue-app theme via stream */ }
                return [];
            },

            'Write-Output'(ctx) {
                const flat = [];
                for (const v of ctx.pos) {
                    if (typeof v === 'string') {
                        const parts = splitTopCommas(v);
                        if (parts) parts.forEach(p => flat.push(evalValuePart(p, null)));
                        else flat.push(/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
                    } else flat.push(v);
                }
                if (flat.length) return flat;
                return (ctx.input || []).map(v => v);
            },

            'Read-Host'(ctx) {
                const prompt = String(ctx.named.prompt ?? ctx.pos[0] ?? 'Enter value');
                const asSecure = ctx.named.assecurestring || false;
                if (typeof opts.readHost === 'function') {
                    try {
                        const r = opts.readHost(prompt);
                        if (r && typeof r.then === 'function') {
                            r.then(v => emit(asSecure ? '***' : String(v ?? '')));
                            return [''];
                        }
                        return [String(r ?? '')];
                    } catch { return ['']; }
                }
                emit(prompt + ': (interactive input is unavailable headless — pipe a value instead)');
                return [''];
            },

            'Clear-Host'() {
                printFn('CLS');
                return [];
            },

            'Get-Help'(ctx) {
                const topic = String(ctx.named.name ?? ctx.pos[0] ?? '').toLowerCase();
                const online = ctx.named.online || false;
                if (!topic) {
                    return [HELP_OVERVIEW];
                }
                const hit = Object.keys(HELP).find(k => k.toLowerCase() === topic);
                if (hit) return [HELP[hit]];
                const aliasHit = Object.keys(ALIASES).find(a => a.toLowerCase() === topic);
                if (aliasHit) return [`NAME\n    ${aliasHit}\n\nSYNOPSIS\n    Alias for ${ALIASES[aliasHit]}.\n\nSEE ALSO\n    Get-Help ${ALIASES[aliasHit]}`];
                if (['about_profiles', 'about_execution_policies', 'about_pipelines', 'about_comparison_operators'].includes(topic)) {
                    return [HELP[topic]];
                }
                throw new Error(`Get-Help : Cannot find Help for topic '${ctx.pos[0]}'.`);
            },

            'Get-Command'(ctx) {
                const filter = String(ctx.named.name ?? ctx.pos[0] ?? '*');
                const cmdType = String(ctx.named.commandtype ?? '').toLowerCase();
                const re = wildcardToRegExp(filter);
                let rows = Object.keys(CMDLETS).filter(n => re.test(n)).map(n => psObj('CommandInfo', {
                    Name: n, CommandType: 'Cmdlet', Source: 'Windows12.Simulator'
                }, n));
                if (!cmdType || cmdType === 'alias') {
                    Object.keys(ALIASES).filter(a => re.test(a)).forEach(a => rows.push(psObj('CommandInfo', {
                        Name: a, CommandType: 'Alias', Definition: ALIASES[a], Source: ''
                    }, a)));
                }
                if (!cmdType || cmdType === 'function') {
                    Object.keys(functions).filter(f => re.test(f)).forEach(f => rows.push(psObj('CommandInfo', {
                        Name: f, CommandType: 'Function', Source: ''
                    }, f)));
                }
                rows.sort((a, b) => String(a.props.Name).localeCompare(String(b.props.Name)));
                return rows;
            },

            'Get-Alias'(ctx) {
                const filter = ctx.named.name ?? ctx.pos[0];
                const re = filter !== undefined ? wildcardToRegExp(String(filter)) : /.*/;
                const rows = [];
                const push = (n, d) => { if (re.test(n) || re.test(d)) rows.push(psObj('AliasInfo', { Name: n, Definition: d }, `${n} -> ${d}`)); };
                Object.keys(ALIASES).forEach(a => push(a, ALIASES[a]));
                Object.keys(customAliases).forEach(a => push(a, customAliases[a]));
                return rows;
            },

            'Set-Alias'(ctx) {
                const n = ctx.named.name ?? ctx.pos[0];
                const v = ctx.named.value ?? ctx.pos[1];
                if (n === undefined || v === undefined) throw new Error('Set-Alias : Name and Value are required.');
                customAliases[String(n).toLowerCase()] = String(v);
                return [];
            },

            'New-Alias'(ctx) {
                return CMDLETS['Set-Alias'](ctx);
            },

            'Remove-Alias'(ctx) {
                const n = ctx.named.name ?? ctx.pos[0];
                if (n === undefined) throw new Error('Remove-Alias : Name is required.');
                delete customAliases[String(n).toLowerCase()];
                return [];
            },

            'Get-History'() {
                return (getVar('HISTORY') || []).map((h, i) => psObj('HistoryInfo', {
                    Id: i + 1, CommandLine: h
                }, `  ${i + 1}  ${h}`));
            },

            'Add-History'(ctx) {
                const items = ctx.input.length ? ctx.input.map(psStr) : ctx.pos.map(psStr);
                const h = getVar('HISTORY') || [];
                items.forEach(t => h.push(t));
                setVar('HISTORY', h.slice(-500));
                return [];
            },

            'Clear-History'() {
                setVar('HISTORY', []);
                return [];
            },

            'Invoke-History'(ctx) {
                const id = ctx.named.id ?? ctx.pos[0];
                const h = getVar('HISTORY') || [];
                if (id === undefined) {
                    const last = h[h.length - 1];
                    return last ? runPipelineCapture(last, []) : [];
                }
                const line = h[Number(id) - 1];
                if (line === undefined) throw new Error(`Invoke-History : No history entry for id '${id}'.`);
                return runPipelineCapture(line, []);
            },

            'Get-Variable'(ctx) {
                const filter = ctx.named.name ?? ctx.pos[0];
                const re = filter !== undefined ? wildcardToRegExp(String(filter)) : /.*/;
                return Object.keys(vars).filter(k => re.test(k)).sort().map(k => psObj('VariableInfo', {
                    Name: k, Value: vars[k]
                }, `${k} = ${psStr(vars[k])}`));
            },

            'Set-Variable'(ctx) {
                const n = ctx.named.name ?? ctx.pos[0];
                const v = ctx.named.value ?? (ctx.pos.length > 1 ? ctx.pos[1] : (ctx.input.length ? ctx.input : null));
                if (n === undefined) throw new Error('Set-Variable : Name is required.');
                setVar(String(n), Array.isArray(v) && v.length === 1 ? v[0] : v);
                return [];
            },

            'New-Variable'(ctx) {
                return CMDLETS['Set-Variable'](ctx);
            },

            'Remove-Variable'(ctx) {
                const n = ctx.named.name ?? ctx.pos[0];
                if (n === undefined) throw new Error('Remove-Variable : Name is required.');
                delete vars[normKey(String(n))];
                return [];
            },

            'Clear-Variable'(ctx) {
                const n = ctx.named.name ?? ctx.pos[0];
                if (n === undefined) throw new Error('Clear-Variable : Name is required.');
                setVar(String(n), null);
                return [];
            },

            'Where-Object'(ctx) {
                let sb = ctx.named.filterscript ?? ctx.named.filter ?? null;
                if (!sb && ctx.pos.length) {
                    const raw = ctx.rawPos.map(t => (typeof t === 'string' ? t : '{...}')).join(' ');
                    const propM = String(ctx.pos[0] || '').match(/^\$?([\w.]+)$/);
                    if (ctx.pos.length >= 2 && /^-(eq|ne|gt|ge|lt|le|like|match|contains|in|is)/i.test(String(ctx.pos[1]))) {
                        const cond = ctx.pos.map(t => (typeof t === 'string' ? t : psStr(t))).join(' ');
                        return (ctx.input || []).filter(o => evalCondition(cond.replace(/^\$_\.?/, '$_'), o));
                    }
                    void propM; void raw;
                    sb = ctx.pos[0];
                }
                if (typeof sb === 'string' && isScriptBlock(sb)) sb = scriptBlockOf(sb);
                if (!isScriptBlockVal(sb)) {
                    // property truthiness form: Where Length
                    const prop = typeof sb === 'string' ? sb : psStr(sb);
                    return (ctx.input || []).filter(o => !!getProp(o, prop.replace(/^\$_\.?/, '')));
                }
                return (ctx.input || []).filter(o => {
                    const r = runScriptBlock(sb, o);
                    const v = r.length ? r[r.length - 1] : null;
                    return !!v && v !== 'False' && v !== '0' && v !== '';
                });
            },

            'ForEach-Object'(ctx) {
                const sb = ctx.named.process ?? ctx.pos[0];
                const begin = ctx.named.begin;
                const end = ctx.named.end;
                if (begin && isScriptBlockVal(typeof begin === 'string' && isScriptBlock(begin) ? scriptBlockOf(begin) : begin)) {
                    runScriptBlock(isScriptBlockVal(begin) ? begin : scriptBlockOf(String(begin)), null);
                }
                const proc = typeof sb === 'string' && isScriptBlock(sb) ? scriptBlockOf(sb) : sb;
                let out = [];
                (ctx.input || []).forEach(o => {
                    if (isScriptBlockVal(proc)) out = out.concat(runScriptBlock(proc, o));
                    else if (proc !== undefined) out.push(expandToken(String(proc), o));
                });
                if (end) {
                    const e = typeof end === 'string' && isScriptBlock(end) ? scriptBlockOf(end) : end;
                    if (isScriptBlockVal(e)) out = out.concat(runScriptBlock(e, null));
                }
                return out;
            },

            'Select-Object'(ctx) {
                const props = ctx.named.property ?? null;
                const first = ctx.named.first !== undefined ? Number(ctx.named.first) : null;
                const last = ctx.named.last !== undefined ? Number(ctx.named.last) : null;
                const skip = ctx.named.skip !== undefined ? Number(ctx.named.skip) : 0;
                const unique = ctx.named.unique || false;
                const expand = ctx.named.expandproperty ?? null;
                let items = [...(ctx.input || [])];
                if (expand) return items.map(o => getProp(o, String(expand)));
                if (props !== null && props !== undefined) {
                    const list = Array.isArray(props) ? props : String(props).split(',').map(s => s.trim());
                    items = items.map(o => {
                        const p = {};
                        list.forEach(nm => { p[nm] = getProp(o, nm); });
                        return psObj('Selected', p);
                    });
                }
                if (skip) items = items.slice(skip);
                if (first !== null) items = items.slice(0, first);
                if (last !== null) items = items.slice(-last);
                if (unique) {
                    const seen = new Set();
                    items = items.filter(o => {
                        const k = psStr(o);
                        if (seen.has(k)) return false;
                        seen.add(k);
                        return true;
                    });
                }
                return items;
            },

            'Sort-Object'(ctx) {
                const prop = ctx.named.property ?? ctx.pos[0] ?? null;
                const desc = ctx.named.descending || false;
                const unique = ctx.named.unique || false;
                let items = [...(ctx.input || [])];
                const keyOf = (o) => (prop ? getProp(o, String(prop)) : o);
                items.sort((a, b) => {
                    const x = keyOf(a), y = keyOf(b);
                    const xn = toNumLoose(x), yn = toNumLoose(y);
                    let c;
                    if (Number.isFinite(xn) && Number.isFinite(yn) && psStr(x) !== '' && psStr(y) !== '') c = xn - yn;
                    else c = String(psStr(x)).toLowerCase() < String(psStr(y)).toLowerCase() ? -1 : (String(psStr(x)).toLowerCase() > String(psStr(y)).toLowerCase() ? 1 : 0);
                    return desc ? -c : c;
                });
                if (unique) {
                    const seen = new Set();
                    items = items.filter(o => {
                        const k = psStr(prop ? getProp(o, String(prop)) : o);
                        if (seen.has(k)) return false;
                        seen.add(k);
                        return true;
                    });
                }
                return items;
            },

            'Group-Object'(ctx) {
                const prop = ctx.named.property ?? ctx.pos[0];
                const groups = new Map();
                (ctx.input || []).forEach(o => {
                    const k = prop ? String(psStr(getProp(o, String(prop)))) : String(psStr(o));
                    if (!groups.has(k)) groups.set(k, []);
                    groups.get(k).push(o);
                });
                return [...groups.entries()].map(([k, v]) => psObj('GroupInfo', {
                    Name: k, Count: v.length, Group: v
                }, `${k}: ${v.length}`));
            },

            'Measure-Object'(ctx) {
                const prop = ctx.named.property ?? null;
                const doSum = ctx.named.sum || false;
                const doAvg = ctx.named.average || false;
                const doMin = ctx.named.minimum || false;
                const doMax = ctx.named.maximum || false;
                const items = (ctx.input || []).map(o => (prop ? toNumLoose(getProp(o, String(prop))) : toNumLoose(o))).filter(n => Number.isFinite(n));
                const count = (ctx.input || []).length;
                const sum = items.reduce((a, b) => a + b, 0);
                const p = { Count: count };
                if (doSum || (!doAvg && !doMin && !doMax)) p.Sum = sum;
                if (doAvg) p.Average = items.length ? sum / items.length : null;
                if (doMin) p.Minimum = items.length ? Math.min(...items) : null;
                if (doMax) p.Maximum = items.length ? Math.max(...items) : null;
                if (!doSum && !doAvg && !doMin && !doMax) { p.Sum = sum; p.Average = items.length ? sum / items.length : null; }
                return [psObj('MeasureInfo', p)];
            },

            'Compare-Object'(ctx) {
                const ref = ctx.named.referenceobject ?? ctx.pos[0];
                const diff = ctx.named.differenceobject ?? ctx.pos[1] ?? ctx.input;
                const toArr = (v) => (Array.isArray(v) ? v : (v === undefined || v === null ? [] : [v])).map(psStr);
                const r = toArr(ref), d = toArr(diff);
                const out = [];
                r.filter(x => !d.includes(x)).forEach(x => out.push(psObj('CompareInfo', { InputObject: x, SideIndicator: '<=' }, `<= ${x}`)));
                d.filter(x => !r.includes(x)).forEach(x => out.push(psObj('CompareInfo', { InputObject: x, SideIndicator: '=>' }, `=> ${x}`)));
                return out;
            },

            'Tee-Object'(ctx) {
                const p = ctx.named.filepath ?? ctx.named.variable ?? ctx.pos[0];
                const items = [...(ctx.input || [])];
                if (p !== undefined) {
                    if (ctx.named.variable !== undefined || (!ctx.named.filepath && /^[A-Za-z_][\w]*$/.test(String(p)))) {
                        setVar(String(p), items.length === 1 ? items[0] : items);
                    } else {
                        CMDLETS['Set-Content']({ ...ctx, named: { path: String(p) }, pos: [String(p), items.map(psStr).join('\n')] });
                    }
                }
                return items;
            },

            'Out-String'(_ctx) {
                const ctx = _ctx;
                return [ctx.input.map(formatOne).join('\n')];
            },

            'Out-Null'() { return []; },

            'Out-File'(ctx) {
                const p = ctx.named.filepath ?? ctx.pos[0];
                const append = ctx.named.append || false;
                if (p === undefined) throw new Error('Out-File : FilePath is required.');
                writeRedirect({ file: String(p), append }, ctx.input.map(formatOne).join('\n'));
                return [];
            },

            'Format-Table'(ctx) {
                const props = ctx.named.property ? String(ctx.named.property).split(',').map(s => s.trim()) : null;
                const auto = ctx.named.autosize || false;
                void auto;
                const items = ctx.input || [];
                if (!items.length) return [];
                const keys = props || Object.keys(isPs(items[0]) ? items[0].props : (typeof items[0] === 'object' ? items[0] : { Value: 1 }));
                const rows = items.map(o => keys.map(k => String(psStr(getProp(o, k) ?? (isPs(o) ? '' : o[k])))));
                const widths = keys.map((k, i) => Math.max(k.length, ...rows.map(r => (r[i] || '').length)));
                const head = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
                const sep = widths.map(w => '-'.repeat(w)).join('  ');
                return [head, sep, ...rows.map(r => r.map((c, i) => (c || '').padEnd(widths[i])).join('  '))].map(s => String(s).replace(/\s+$/, ''));
            },

            'Format-List'(ctx) {
                const props = ctx.named.property ? String(ctx.named.property).split(',').map(s => s.trim()) : null;
                const out = [];
                (ctx.input || []).forEach(o => {
                    const keys = props || Object.keys(isPs(o) ? o.props : (typeof o === 'object' && o !== null ? o : { Value: 1 }));
                    keys.forEach(k => out.push(`${k} : ${psStr(getProp(o, k) ?? (o !== null && typeof o === 'object' ? o[k] : o))}`));
                    out.push('');
                });
                return out;
            },

            'Format-Wide'(ctx) {
                const prop = ctx.named.property ?? null;
                const cols = Math.max(1, Number(ctx.named.column ?? 3));
                const vals = (ctx.input || []).map(o => String(psStr(prop ? getProp(o, String(prop)) : o)));
                const out = [];
                for (let i = 0; i < vals.length; i += cols) out.push(vals.slice(i, i + cols).join('   '));
                return out;
            },
            'ConvertTo-Json'(ctx) {
                const depth = Number(ctx.named.depth ?? 4);
                const compress = ctx.named.compress || false;
                const val = ctx.input.length === 1 ? plainOf(ctx.input[0]) : ctx.input.map(plainOf);
                void depth;
                return [compress ? JSON.stringify(val) : JSON.stringify(val, null, 2)];
            },

            'ConvertFrom-Json'(ctx) {
                const text = ctx.named.inputobject ?? (ctx.pos.length ? ctx.pos.join(' ') : ctx.input.map(psStr).join('\n'));
                try {
                    const v = JSON.parse(String(text));
                    return Array.isArray(v) ? v : [v];
                } catch { throw new Error('ConvertFrom-Json : Invalid JSON primitive.'); }
            },

            'ConvertTo-Csv'(ctx) {
                const delim = String(ctx.named.delimiter ?? ',');
                const noHeader = ctx.named.noheader || ctx.named.notypeinformation || false;
                void noHeader;
                const items = ctx.input || [];
                if (!items.length) return [];
                const keys = Object.keys(isPs(items[0]) ? items[0].props : items[0]);
                const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
                const out = [keys.map(q).join(delim)];
                items.forEach(o => out.push(keys.map(k => q(psStr(getProp(o, k)))).join(delim)));
                return out;
            },

            'ConvertFrom-Csv'(ctx) {
                const delim = String(ctx.named.delimiter ?? ',');
                const text = ctx.named.inputobject ?? (ctx.pos.length ? ctx.pos.join(' ') : ctx.input.map(psStr).join('\n'));
                const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
                if (!lines.length) return [];
                const parse = (l) => l.split(delim).map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                const header = ctx.named.header ? String(ctx.named.header).split(',').map(s => s.trim()) : parse(lines[0]);
                const start = ctx.named.header ? 0 : 1;
                return lines.slice(start).map(l => {
                    const cells = parse(l);
                    const p = {};
                    header.forEach((h, i) => { p[h] = cells[i] ?? ''; });
                    return psObj('CsvRow', p);
                });
            },

            'Export-Csv'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                if (p === undefined) throw new Error('Export-Csv : Path is required.');
                const rows = CMDLETS['ConvertTo-Csv'](ctx);
                writeRedirect({ file: String(p), append: false }, rows.join('\n'));
                return [];
            },

            'Import-Csv'(ctx) {
                const p = ctx.named.path ?? ctx.pos[0];
                if (p === undefined) throw new Error('Import-Csv : Path is required.');
                const full = resolvePSPath(String(p));
                const content = FileSystem.readFile(full);
                if (content === null || content === undefined) throw new Error(`Import-Csv : Cannot find path '${p}'.`);
                return CMDLETS['ConvertFrom-Csv']({ ...ctx, named: { ...ctx.named, inputobject: String(content) }, pos: [] });
            },

            'Get-Date'(ctx) {
                const d = ctx.pos[0] !== undefined ? new Date(String(ctx.pos[0])) : new Date();
                const fmt = ctx.named.format ?? ctx.named.f ?? null;
                if (fmt) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return [String(fmt).replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()))];
                }
                return [psObj('DateTime', {
                    DateTime: d.toLocaleString(), Date: d.toLocaleDateString(),
                    DayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()],
                    Year: d.getFullYear(), Month: d.getMonth() + 1, Day: d.getDate()
                }, d.toString())];
            },

            'Start-Sleep'(ctx) {
                const s = Number(ctx.named.seconds ?? ctx.pos[0] ?? 0);
                const ms = ctx.named.milliseconds !== undefined ? Number(ctx.named.milliseconds) : s * 1000;
                const end = Date.now() + Math.min(ms, 5000);
                while (Date.now() < end) { /* simulated; capped at 5s */ }
                return [];
            },

            'Get-Host'() {
                return [psObj('Host', {
                    Name: 'Windows 12 Simulator Host', Version: VERSION,
                    CurrentCulture: 'en-US', CurrentUICulture: 'en-US'
                }, 'Windows 12 Simulator Host')];
            },

            'Get-Process'(ctx) {
                const filter = String(ctx.named.name ?? ctx.pos[0] ?? '*');
                const re = wildcardToRegExp(filter);
                let list = [];
                try {
                    if (typeof opts.getProcesses === 'function') list = opts.getProcesses() || [];
                    else if (window?._WindowManager?.getAllWindows) {
                        list = window._WindowManager.getAllWindows().map(w => ({ name: w.appId || w.title, id: w.id }));
                    }
                } catch { list = []; }
                if (!list.length) list = [{ name: 'powershell', id: 'sim-1' }, { name: 'explorer', id: 'sim-2' }];
                return list.filter(p => re.test(p.name)).map((p, i) => psObj('Process', {
                    Name: p.name, Id: p.id ?? (1000 + i), CPU: (Math.random() * 5).toFixed(1), WorkingSet: Math.floor(Math.random() * 90000) + 10000
                }, `${p.name} (${p.id ?? (1000 + i)})`));
            },

            'Stop-Process'(ctx) {
                const id = ctx.named.id ?? ctx.pos[0] ?? ctx.named.name;
                if (id === undefined && !ctx.input.length) throw new Error('Stop-Process : Id or Name is required.');
                const targets = ctx.input.length ? ctx.input : [id];
                let ok = true;
                for (const t of targets) {
                    const pid = isPs(t) ? (t.props.Id ?? t.props.Name) : t;
                    try {
                        if (typeof opts.killProcess === 'function') ok = opts.killProcess(pid) && ok;
                        else if (window?._WindowManager?.closeWindow && typeof pid === 'string' && pid.startsWith('window-')) {
                            window._WindowManager.closeWindow(pid);
                        }
                    } catch { ok = false; }
                }
                if (!ok) throw new Error('Stop-Process : Cannot stop one or more processes.');
                return [];
            },

            'Start-Process'(ctx) {
                const app = String(ctx.named.filepath ?? ctx.pos[0] ?? '');
                const args = ctx.pos.slice(1).map(psStr).join(' ');
                if (!app) throw new Error('Start-Process : FilePath is required.');
                const id = app.replace(/\.exe$/i, '').toLowerCase();
                try {
                    if (typeof opts.launchApp === 'function' && opts.launchApp(id, args)) return [];
                    if (window?.Taskbar?.openApp) { window.Taskbar.openApp(id); return []; }
                } catch { /* fall through */ }
                emit(`Start-Process : launched '${app}' (simulated${args ? ' ' + args : ''}).`);
                return [];
            },

            'Get-Service'(ctx) {
                const filter = String(ctx.named.name ?? ctx.pos[0] ?? '*');
                const re = wildcardToRegExp(filter);
                let svcs = [];
                try {
                    if (window?._BackgroundApps?.getStartupEntries) {
                        svcs = window._BackgroundApps.getStartupEntries().map(e => ({ name: e.id, status: e.running ? 'Running' : 'Stopped' }));
                    }
                } catch { svcs = []; }
                if (!svcs.length) svcs = [{ name: 'w12-shell', status: 'Running' }, { name: 'w12-updates', status: 'Stopped' }];
                return svcs.filter(s => re.test(s.name)).map(s => psObj('Service', {
                    Name: s.name, Status: s.status, StartType: 'Automatic'
                }, `${s.status}  ${s.name}`));
            },

            'Start-Service'(ctx) {
                const n = String(ctx.named.name ?? ctx.pos[0] ?? '');
                if (!n) throw new Error('Start-Service : Name is required.');
                try {
                    if (window?._BackgroundApps?.startService) { window._BackgroundApps.startService(n); return []; }
                } catch { /* noop */ }
                emit(`Start-Service : '${n}' started (simulated).`);
                return [];
            },

            'Stop-Service'(ctx) {
                const n = String(ctx.named.name ?? ctx.pos[0] ?? '');
                if (!n) throw new Error('Stop-Service : Name is required.');
                try {
                    if (window?._BackgroundApps?.stopService) { window._BackgroundApps.stopService(n); return []; }
                } catch { /* noop */ }
                emit(`Stop-Service : '${n}' stopped (simulated).`);
                return [];
            },

            'Get-ComputerInfo'() {
                let accent = '', theme = '', w = 0, h = 0;
                try { accent = window?.SystemConfig?.get?.('accentColor') ?? ''; } catch { /* noop */ }
                try { theme = window?.SystemConfig?.get?.('darkMode') ? 'Dark' : 'Light'; } catch { theme = 'Dark'; }
                try { w = window.innerWidth; h = window.innerHeight; } catch { /* noop */ }
                return [psObj('ComputerInfo', {
                    CsName: 'PC', CsUserName: currentUserName(),
                    OsName: 'Windows 12 (Simulator)', OsVersion: VERSION,
                    OsArchitecture: 'x64-sim', WindowsTheme: theme, AccentColor: accent,
                    ScreenResolution: `${w}x${h}`
                })];
            },

            'Get-PSDrive'() {
                return [
                    psObj('PSDrive', { Name: 'C', Provider: 'FileSystem', Root: 'C:\\', CurrentLocation: psDisplayPath(getCwd()) }, 'C'),
                    psObj('PSDrive', { Name: 'Env', Provider: 'Environment', Root: 'Env:\\', CurrentLocation: 'Env:\\' }, 'Env'),
                    psObj('PSDrive', { Name: 'Variable', Provider: 'Variable', Root: 'Variable:\\', CurrentLocation: 'Variable:\\' }, 'Variable'),
                    psObj('PSDrive', { Name: 'Alias', Provider: 'Alias', Root: 'Alias:\\', CurrentLocation: 'Alias:\\' }, 'Alias')
                ];
            },

            'Get-ExecutionPolicy'() {
                return [loadPolicy()];
            },

            'Set-ExecutionPolicy'(ctx) {
                const p = String(ctx.named.executionpolicy ?? ctx.pos[0] ?? '');
                const canon = VALID_POLICIES.find(v => v.toLowerCase() === p.toLowerCase());
                if (!canon) throw new Error(`Set-ExecutionPolicy : Cannot bind parameter 'ExecutionPolicy' to '${p}'. Valid values: ${VALID_POLICIES.join(', ')}.`);
                if (!ctx.named.force) emit('Set-ExecutionPolicy : applying to the current user scope (simulated registry).');
                savePolicy(canon);
                return [];
            },

            'Start-Job'(ctx) {
                const sbRaw = ctx.named.scriptblock ?? ctx.pos[0];
                const name = String(ctx.named.name ?? `Job${jobSeq + 1}`);
                const sb = typeof sbRaw === 'string' && isScriptBlock(sbRaw) ? scriptBlockOf(sbRaw) : sbRaw;
                if (!isScriptBlockVal(sb)) throw new Error('Start-Job : ScriptBlock is required, e.g. Start-Job { Get-Process }.');
                const id = ++jobSeq;
                const job = { id, name, state: 'Running', output: [], error: null };
                jobs.set(id, job);
                setTimeout(() => {
                    try {
                        job.output = runScriptBlock(sb, null);
                        job.state = 'Completed';
                    } catch (e) {
                        job.state = 'Failed';
                        job.error = e && e.message ? e.message : String(e);
                    }
                    try {
                        if (typeof opts.onNotify === 'function') opts.onNotify('PowerShell job finished', `${name} (Id ${id}) is ${job.state}. Use Receive-Job ${id}.`);
                    } catch { /* noop */ }
                }, 0);
                return [psObj('Job', { Id: id, Name: name, State: 'Running' }, `Id ${id} (${name})`)];
            },

            'Get-Job'(ctx) {
                const id = ctx.named.id ?? ctx.pos[0];
                let list = [...jobs.values()];
                if (id !== undefined) list = list.filter(j => j.id === Number(id) || j.name === String(id));
                return list.map(j => psObj('Job', { Id: j.id, Name: j.name, State: j.state }, `Id ${j.id} ${j.state} (${j.name})`));
            },

            'Receive-Job'(ctx) {
                const id = ctx.named.id ?? ctx.pos[0];
                const keep = ctx.named.keep || false;
                let list = [...jobs.values()];
                if (id !== undefined) list = list.filter(j => j.id === Number(id) || j.name === String(id));
                const out = [];
                list.forEach(j => {
                    if (j.error) emitError(j.error);
                    j.output.forEach(o => out.push(o));
                    if (!keep) jobs.delete(j.id);
                    else j.output = [];
                });
                return out;
            },

            'Remove-Job'(ctx) {
                const id = ctx.named.id ?? ctx.pos[0];
                if (id === undefined) { jobs.clear(); return []; }
                for (const [k, j] of jobs) {
                    if (j.id === Number(id) || j.name === String(id)) jobs.delete(k);
                }
                return [];
            },

            'Stop-Job'(ctx) {
                const id = ctx.named.id ?? ctx.pos[0];
                for (const j of jobs.values()) {
                    if (id === undefined || j.id === Number(id) || j.name === String(id)) j.state = 'Stopped';
                }
                return [];
            },

            'Test-Connection'(ctx) {
                const host = String(ctx.named.computername ?? ctx.pos[0] ?? 'localhost');
                const count = Math.min(Number(ctx.named.count ?? 4), 4);
                const out = [];
                for (let i = 0; i < count; i++) {
                    const ms = Math.floor(Math.random() * 8) + 1;
                    out.push(psObj('PingReply', {
                        Address: host, ReplyTime: ms, Status: 'Success'
                    }, `Reply from ${host}: time=${ms}ms (simulated)`));
                }
                return out;
            },

            'Invoke-WebRequest'(ctx) {
                const uri = String(ctx.named.uri ?? ctx.pos[0] ?? '');
                if (!uri) throw new Error('Invoke-WebRequest : Uri is required.');
                if (!opts.allowNet) throw new Error('Invoke-WebRequest : Network access is not granted to this shell (declare the `network` permission).');
                const outFile = ctx.named.outfile ?? null;
                emit(`Invoke-WebRequest : fetching ${uri} ...`);
                try {
                    fetch(uri).then(async (r) => {
                        const text = await r.text().catch(() => '');
                        const info = psObj('WebResponse', { StatusCode: r.status, Uri: uri, Length: text.length }, `StatusCode: ${r.status}`);
                        if (outFile) {
                            writeRedirect({ file: String(outFile), append: false }, text);
                            emit(`Saved to ${outFile}.`);
                        } else {
                            emit(text.slice(0, 2000));
                        }
                        void info;
                    }).catch(e => emitError('Invoke-WebRequest : ' + (e && e.message ? e.message : e)));
                } catch (e) {
                    throw new Error('Invoke-WebRequest : ' + (e && e.message ? e.message : e));
                }
                return [];
            }
        };

        function plainOf(v) {
            if (isPs(v)) {
                const o = {};
                Object.keys(v.props).forEach(k => { o[k] = plainOf(v.props[k]); });
                return o;
            }
            if (Array.isArray(v)) return v.map(plainOf);
            return v;
        }

        // ---------- help texts ----------

        const HELP = {};
        const HELP_OVERVIEW = [
            'Windows 12 Simulator PowerShell ' + VERSION,
            'Type Get-Command for all cmdlets, Get-Help <name> for details.',
            'Providers: FileSystem (default), Env:, Variable:, Alias: drives.',
            'Pipes carry objects: Get-ChildItem | Where-Object Length -gt 100 | Sort-Object Name',
            'Scripts: .\\script.ps1  |  Policy: Get/Set-ExecutionPolicy  |  Profile: $PROFILE'
        ].join('\n');

        [
            ['Get-ChildItem', 'ls, dir, gci', 'Get-ChildItem [-Path] <path> [-Recurse] [-Filter <wild>] [-Directory] [-File] [-Force]', 'Lists files as FileInfo/DirectoryInfo objects.'],
            ['Set-Location', 'cd, chdir, sl', 'Set-Location [-Path] <path>', 'Changes the current directory.'],
            ['Get-Location', 'pwd, gl', 'Get-Location', 'Shows the current directory (C:\\ style).'],
            ['Push-Location', 'pushd', 'Push-Location [path]', 'Pushes cwd onto the stack, optionally changing directory.'],
            ['Pop-Location', 'popd', 'Pop-Location', 'Pops the directory stack.'],
            ['New-Item', 'ni, md', 'New-Item [-Path] <p> [-ItemType file|directory] [-Value <t>] [-Force]', 'Creates files or folders (parents auto-created).'],
            ['Remove-Item', 'rm, del, erase, rd, ri', 'Remove-Item [-Path] <p> [-Recurse] [-Force]', 'Deletes files/folders (use -Recurse for non-empty).'],
            ['Copy-Item', 'cp, copy', 'Copy-Item [-Path] <s> [-Destination] <d>', 'Copies files (wildcards ok).'],
            ['Move-Item', 'mv, move', 'Move-Item [-Path] <s> [-Destination] <d>', 'Moves files.'],
            ['Rename-Item', 'ren, rni', 'Rename-Item [-Path] <p> [-NewName] <n>', 'Renames a file or folder.'],
            ['Get-Item', 'gi', 'Get-Item [-Path] <p>', 'Gets the item at a path.'],
            ['Test-Path', '-', 'Test-Path [-Path] <p>', 'True when the path exists (wildcards ok). Returns Boolean.'],
            ['Get-Content', 'cat, type, gc', 'Get-Content [-Path] <file> [-Raw] [-TotalCount <n>]', 'Reads text lines (use -Raw for one string).'],
            ['Set-Content', 'sc', 'Set-Content [-Path] <f> [-Value] <text>', 'Overwrites a file (pipeline input ok).'],
            ['Add-Content', 'ac', 'Add-Content [-Path] <f> [-Value] <text>', 'Appends to a file.'],
            ['Clear-Content', 'clc', 'Clear-Content [-Path] <f>', 'Empties a file.'],
            ['Join-Path', '-', 'Join-Path [-Path] <b> [-ChildPath] <c>', 'Joins path segments.'],
            ['Split-Path', '-', 'Split-Path [-Path] <p> [-Leaf] [-Parent] [-NoQualifier]', 'Splits a path.'],
            ['Resolve-Path', '-', 'Resolve-Path [[-Path] <p>]', 'Resolves to a full C:\\ style path.'],
            ['Write-Host', '-', 'Write-Host <text> [-ForegroundColor c] [-NoNewline]', 'Writes directly to the host (not the pipeline).'],
            ['Write-Output', 'echo, write', 'Write-Output <value>', 'Sends values down the pipeline.'],
            ['Read-Host', '-', 'Read-Host [-Prompt] <p> [-AsSecureString]', 'Prompts for input (dialog in the app, piped value headless).'],
            ['Clear-Host', 'cls, clear', 'Clear-Host', 'Clears the screen.'],
            ['Get-Help', 'help, man', 'Get-Help [[-Name] <cmd>]', 'Shows help for cmdlets and about-topics.'],
            ['Get-Command', 'gcm', 'Get-Command [[-Name] <wild>] [-CommandType cmdlet|alias|function]', 'Lists cmdlets, aliases and functions.'],
            ['Get-Alias', 'gal', 'Get-Alias [[-Name] <wild>]', 'Lists aliases.'],
            ['Set-Alias', 'sal', 'Set-Alias [-Name] <n> [-Value] <cmd>', 'Creates or changes an alias.'],
            ['Get-History', 'ghy, h, history', 'Get-History', 'Lists session history.'],
            ['Invoke-History', 'r', 'Invoke-History [[-Id] <n>]', 'Re-runs a history entry (default: last).'],
            ['Clear-History', 'clhy', 'Clear-History', 'Clears session history.'],
            ['Get-Variable', 'gv', 'Get-Variable [[-Name] <wild>]', 'Lists session variables.'],
            ['Set-Variable', 'sv', 'Set-Variable [-Name] <n> [-Value] <v>', 'Sets a session variable ($x = v also works).'],
            ['Where-Object', 'where, ?', '... | Where-Object { $_ ... }  OR  ... | Where-Object Length -gt 100', 'Filters objects (-eq -ne -gt -like -match -contains -in ...).'],
            ['ForEach-Object', '%, foreach', '... | ForEach-Object { ... }', 'Runs a scriptblock per object ($_ is the current one).'],
            ['Select-Object', 'select', '... | Select-Object [-Property] a,b [-First n] [-Last n] [-Skip n] [-Unique] [-ExpandProperty p]', 'Picks properties/rows.'],
            ['Sort-Object', 'sort', '... | Sort-Object [prop] [-Descending] [-Unique]', 'Sorts objects.'],
            ['Group-Object', 'group', '... | Group-Object [prop]', 'Groups by property value.'],
            ['Measure-Object', 'measure', '... | Measure-Object [-Property p] [-Sum] [-Average] [-Minimum] [-Maximum]', 'Counts and aggregates numbers.'],
            ['Compare-Object', 'diff, compare', 'Compare-Object [-ReferenceObject] <a> [-DifferenceObject] <b>', 'Diffs two sets (<= only-in-ref, => only-in-diff).'],
            ['Tee-Object', 'tee', '... | Tee-Object [-FilePath] <f> | [-Variable] <v>', 'Saves a copy while passing input through.'],
            ['Out-File', '-', '... | Out-File [-FilePath] <f> [-Append]', 'Writes formatted output to a file.'],
            ['Format-Table', 'ft', '... | Format-Table [-Property] a,b', 'Formats as a table.'],
            ['Format-List', 'fl', '... | Format-List [-Property] a,b', 'Formats as a list.'],
            ['ConvertTo-Json', '-', '... | ConvertTo-Json [-Compress] [-Depth n]', 'Serializes to JSON.'],
            ['ConvertFrom-Json', '-', 'ConvertFrom-Json [-InputObject] <json>', 'Parses JSON.'],
            ['ConvertTo-Csv', '-', '... | ConvertTo-Csv', 'Serializes to CSV.'],
            ['ConvertFrom-Csv', '-', 'ConvertFrom-Csv [-InputObject] <csv>', 'Parses CSV.'],
            ['Export-Csv', '-', '... | Export-Csv [-Path] <f>', 'Writes objects as CSV.'],
            ['Import-Csv', '-', 'Import-Csv [-Path] <f>', 'Reads CSV rows as objects.'],
            ['Get-Date', '-', 'Get-Date [date] [-Format <fmt>]', 'Current date/time (or parses one).'],
            ['Start-Sleep', 'sleep', 'Start-Sleep [-Seconds] <n>', 'Pauses (capped at 5s in the simulator).'],
            ['Get-Host', '-', 'Get-Host', 'Host information.'],
            ['Get-Process', 'gps, ps', 'Get-Process [[-Name] <wild>]', 'Lists open apps/windows as processes.'],
            ['Stop-Process', 'kill', 'Stop-Process [-Id] <id>', 'Closes a process/window.'],
            ['Start-Process', 'saps, start', 'Start-Process [-FilePath] <app>', 'Launches an installed app by id.'],
            ['Get-Service', 'gsv', 'Get-Service [[-Name] <wild>]', 'Lists background apps/services.'],
            ['Get-ComputerInfo', '-', 'Get-ComputerInfo', 'OS, user, theme and resolution.'],
            ['Get-PSDrive', 'gdr', 'Get-PSDrive', 'Lists C, Env, Variable and Alias drives.'],
            ['Get-ExecutionPolicy', '-', 'Get-ExecutionPolicy', 'Shows the script policy (per-user, default RemoteSigned).'],
            ['Set-ExecutionPolicy', '-', 'Set-ExecutionPolicy [-ExecutionPolicy] <policy>', 'Restricted|AllSigned|RemoteSigned|Unrestricted|Bypass.'],
            ['Start-Job', 'sajb', 'Start-Job [-ScriptBlock] { ... } [-Name <n>]', 'Runs a scriptblock as a job; completion toasts.'],
            ['Get-Job', 'gjb', 'Get-Job [[-Id] <n>]', 'Lists jobs.'],
            ['Receive-Job', 'rcjb', 'Receive-Job [-Id] <n> [-Keep]', 'Collects job output (removes the job unless -Keep).'],
            ['Remove-Job', '-', 'Remove-Job [[-Id] <n>]', 'Deletes jobs.'],
            ['Test-Connection', 'ping, tnc', 'Test-Connection [-ComputerName] <h> [-Count n]', 'Simulated ping (honest label).'],
            ['Invoke-WebRequest', 'iwr, curl, wget', 'Invoke-WebRequest [-Uri] <url> [-OutFile <f>]', 'Fetches a URL when the network permission is granted.']
        ].forEach(([n, al, syn, desc]) => {
            HELP[n] = `NAME\n    ${n}\n\nSYNOPSIS\n    ${desc}\n\nSYNTAX\n    ${syn}\n\nALIASES\n    ${al}`;
            HELP[n.toLowerCase()] = HELP[n];
        });
        HELP['about_profiles'] = 'ABOUT_PROFILES\n    $PROFILE points at Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1 (per user).\n    Create it with New-Item $PROFILE -Force, then add functions/aliases — it runs at shell start unless -NoProfile.';
        HELP['about_execution_policies'] = 'ABOUT_EXECUTION_POLICIES\n    Restricted blocks .ps1 files. RemoteSigned (default) runs local scripts.\n    Unrestricted/Bypass run everything. Per-user, stored under AppData\\powershell.';
        HELP['about_pipelines'] = 'ABOUT_PIPELINES\n    Pipes carry objects with properties: Get-ChildItem | Where-Object Length -gt 100 | Sort-Object Name | Format-Table Name, Length.';
        HELP['about_comparison_operators'] = 'ABOUT_COMPARISON_OPERATORS\n    -eq -ne -gt -ge -lt -le -like -notlike -match -notmatch -contains -in -is, plus -and -or -not.';

        // ---------- script files, profiles, entry points ----------

        function checkPolicyForScript(pathStr) {
            const p = loadPolicy();
            if (p === 'Restricted') {
                throw new Error(`File ${pathStr} cannot be loaded because running scripts is disabled. Run Set-ExecutionPolicy RemoteSigned to allow local scripts.`);
            }
            return p;
        }

        function runScriptContent(content, scriptPath, args) {
            const savedArgs = getVar('ARGS');
            setVar('ARGS', args || []);
            if (scriptPath) {
                setVar('PSCOMMANDPATH', scriptPath);
                const dir = String(scriptPath).split(/[/\\]/).slice(0, -1).join('\\');
                setVar('PSSCRIPTROOT', dir);
            }
            try {
                captureDepth++;
                try {
                    return execScript(String(content ?? ''), []);
                } finally {
                    captureDepth--;
                }
            } finally {
                setVar('ARGS', savedArgs);
            }
        }

        function runScriptFile(pathArg, args) {
            const label = String(pathArg);
            const full = resolvePSPath(label);
            const node = FileSystem.getNode(full);
            if (!node) throw new Error(`The term '${label}' is not recognized as a cmdlet, function, or script file.`);
            if (node.type === 'folder') throw new Error(`'${label}' is a directory.`);
            if (!/\.ps1$/i.test(full[full.length - 1]) && !/\.(bat|cmd)$/i.test(full[full.length - 1])) {
                throw new Error(`'${label}' is not a PowerShell script. Only .ps1 files run here.`);
            }
            checkPolicyForScript(label);
            const content = FileSystem.readFile(full);
            if (content === null || content === undefined) throw new Error(`Error reading '${label}'.`);
            return runScriptContent(content, psDisplayPath(full), args || []);
        }

        function profilePaths() {
            const home = homeDir();
            return [
                [...home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'],
                ['/', 'system', 'programs data', 'powershell', 'profile.ps1']
            ];
        }

        function loadProfiles() {
            if (profileLoaded || opts.noProfile) return;
            profileLoaded = true;
            if (loadPolicy() === 'Restricted') return;
            for (const p of profilePaths()) {
                try {
                    if (FileSystem.itemExists(p)) {
                        const content = FileSystem.readFile(p);
                        if (content) runScriptContent(content, psDisplayPath(p), []);
                    }
                } catch { /* a broken profile must not wedge the shell */ }
            }
        }

        function parseCliTokens(toks) {
            const out = { noProfile: false, policy: null, file: null, fileArgs: [], command: null, stmts: [] };
            let i = 0;
            while (i < toks.length) {
                const t = String(toks[i]);
                const low = t.toLowerCase().replace(/^[-\/]/, '');
                if (low === 'noprofile') { out.noProfile = true; i++; }
                else if (low === 'executionpolicy' && toks[i + 1]) { out.policy = String(toks[i + 1]); i += 2; }
                else if (low === 'file' && toks[i + 1]) {
                    out.file = String(toks[i + 1]).replace(/^['"]|['"]$/g, '');
                    out.fileArgs = toks.slice(i + 2).map(x => String(x));
                    break;
                } else if (low === 'command' || low === 'c') {
                    out.command = toks.slice(i + 1).map(x => String(x)).join(' ');
                    break;
                } else if (low === 'noexit' || low === 'nologo' || low === 'noninteractive') { i++; }
                else { out.stmts.push(t); i++; }
            }
            return out;
        }

        // Main entry: one line or a whole script. Prints the final stage and
        // records history (unless quiet). Returns captured output values.
        function run(input, runOpts = {}) {
            const text = String(input ?? '');
            if (!text.trim()) return [];
            loadProfiles();
            if (!runOpts.quiet && typeof opts.onHistory === 'function') {
                try { opts.onHistory(text.trim()); } catch { /* noop */ }
            }
            if (!runOpts.quiet) {
                const h = getVar('HISTORY') || [];
                h.push(text.trim());
                setVar('HISTORY', h.slice(-500));
            }
            const cli = /^\s*(-|powershell)/i.test(text) ? null : null;
            void cli;
            let out;
            captureDepth++;
            try {
                out = execScript(text, []);
            } catch (e) {
                emitError(e && e.message ? e.message : String(e));
                lastExit = 1;
                return [];
            } finally {
                captureDepth--;
            }
            flowControl.break = false; flowControl.continue = false;
            printValues(out || [], null);
            return out || [];
        }

        // Handles `powershell -File x -NoProfile ...` / `-Command ...` tails
        // (used by the Terminal bridge after stripping the leading word).
        function runCliTail(tail) {
            const toks = tokenizeStage(String(tail || ''));
            const cli = parseCliTokens(toks);
            if (cli.policy) {
                const canon = VALID_POLICIES.find(v => v.toLowerCase() === cli.policy.toLowerCase());
                if (!canon) { emitError(`Bad ExecutionPolicy '${cli.policy}'.`); return []; }
                savePolicy(canon);
            }
            if (cli.noProfile) opts.noProfile = true;
            if (cli.file) {
                try {
                    return runScriptFile(cli.file, cli.fileArgs);
                } catch (e) {
                    emitError(e && e.message ? e.message : String(e));
                    return [];
                }
            }
            if (cli.command !== null) return run(cli.command, { quiet: true });
            if (cli.stmts.length) return run(cli.stmts.join(' '), { quiet: true });
            return [];
        }

        function completeCommand(frag) {
            const f = String(frag || '').toLowerCase().replace(/^-/, '');
            const names = new Set([
                ...Object.keys(CMDLETS),
                ...Object.keys(ALIASES).map(a => ALIASES[a]),
                ...Object.keys(ALIASES),
                ...Object.keys(functions)
            ]);
            return [...names].filter(n => n.toLowerCase().startsWith(f)).sort();
        }

        function cmdletNames() {
            return Object.keys(CMDLETS).sort();
        }

        // Seed a couple of conveniences real shells have.
        setVar('ARGS', []);
        setVar('HISTORY', getVar('HISTORY') || []);

        return {
            run, runCliTail, runScriptFile, runScriptContent,
            getVar, setVar,
            getPolicy: loadPolicy, setPolicy: savePolicy,
            completeCommand, cmdletNames,
            getAliases: () => ({ ...ALIASES, ...customAliases }),
            getCwdDisplay: () => psDisplayPath(getCwd()),
            get lastOk() { return lastOk; },
            get lastExit() { return lastExit; }
        };
    }

    return { create, VERSION };
})();

export default PowershellEngine;
