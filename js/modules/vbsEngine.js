import FileSystem from './fileSystem.js';

/*
 * VBScript-compatible interpreter for the simulator.
 *
 * This is a deterministic emulation layer. It intentionally does not execute
 * arbitrary host COM/EXE code: supported Windows objects are backed by the
 * simulator's virtual filesystem and console.
 */
const VBEngine = (() => {
    function create(printFn, getCwd, setCwd) {
        let lines = [];
        let pc = 0;
        let running = false;
        let stopRequested = false;
        let errorResumeNext = false;
        let args = [];
        let scriptName = 'script.vbs';
        let subs = Object.create(null);
        let functions = Object.create(null);
        let consts = Object.create(null);
        let declared = new Set();
        let mainEnv = Object.create(null);

        const Err = {
            Number: 0, Description: '', Source: '', HelpFile: '', HelpContext: 0,
            Clear() { this.Number = 0; this.Description = ''; this.Source = ''; this.HelpFile = ''; this.HelpContext = 0; },
            Raise(number, source = '', description = '', helpFile = '', helpContext = 0) {
                this.Number = Number(number) || 0;
                this.Source = source;
                this.Description = description;
                this.HelpFile = helpFile;
                this.HelpContext = Number(helpContext) || 0;
                throw makeRuntimeError(this.Number, this.Description);
            }
        };

        function makeRuntimeError(number, description) {
            const e = new Error(description || `VBScript runtime error ${number}`);
            e.vbNumber = number;
            return e;
        }

        function key(name) { return String(name ?? '').toUpperCase(); }

        function valueOf(v) {
            if (v === undefined) return '';
            if (v === null) return null;
            if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') return v;
            if (Array.isArray(v)) return v.map(valueOf).join(', ');
            return v;
        }

        function toStr(v) {
            if (v === null) return 'Null';
            if (v === undefined) return '';
            if (typeof v === 'boolean') return v ? 'True' : 'False';
            if (Array.isArray(v)) return v.map(toStr).join(', ');
            return String(v);
        }

        function toNum(v) {
            if (v === null || v === undefined || v === '') return 0;
            if (typeof v === 'boolean') return v ? -1 : 0;
            const n = Number(v);
            if (!Number.isFinite(n)) throw makeRuntimeError(13, 'Type mismatch');
            return n;
        }

        function toBool(v) {
            if (v === null || v === undefined || v === '') return false;
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v !== 0;
            return /^true$/i.test(String(v));
        }

        function isObject(v) {
            return v !== null && typeof v === 'object';
        }

        function getVar(name, env = mainEnv) {
            const k = key(name);
            if (k === 'ERR') return Err;
            if (k === 'NOTHING' || k === 'NULL') return null;
            if (k === 'TRUE') return true;
            if (k === 'FALSE') return false;
            if (k === 'EMPTY') return '';
            if (k === 'WSCRIPT') return WScript;
            if (Object.prototype.hasOwnProperty.call(consts, k)) return consts[k];
            if (Object.prototype.hasOwnProperty.call(env, k)) return env[k];
            if (Object.prototype.hasOwnProperty.call(mainEnv, k)) return mainEnv[k];
            return '';
        }

        function setVar(name, value, env = mainEnv) {
            const k = key(name);
            if (!k) return;
            env[k] = value;
            declared.add(k);
        }

        function deleteVar(name, env = mainEnv) {
            delete env[key(name)];
        }

        function currentPathString() {
            const p = getCwd().join('\\');
            return p || '\\';
        }

        function resolvePathArray(input) {
            let p = String(input ?? '').replace(/\\/g, '/').trim();
            if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
            if (/^[A-Za-z]:/.test(p)) p = p.slice(2);
            const absolute = p.startsWith('/');
            const base = absolute ? ['/'] : [...getCwd()];
            const result = absolute ? ['/'] : [...base];
            for (const part of p.split('/').filter(Boolean)) {
                if (part === '.') continue;
                if (part === '..') {
                    if (result.length > 1) result.pop();
                } else {
                    result.push(part);
                }
            }
            return result;
        }

        function node(path) {
            try { return FileSystem.getNode(resolvePathArray(path)); } catch { return null; }
        }

        function fileExists(path) {
            const n = node(path);
            return !!n && n.type === 'file';
        }

        function folderExists(path) {
            const n = node(path);
            return !!n && n.type === 'folder';
        }

        function makeTextFile(path, overwrite = true) {
            const p = resolvePathArray(path);
            const existing = FileSystem.readFile(p);
            if (overwrite && existing === null) {
                const name = p[p.length - 1];
                FileSystem.createFile(p.slice(0, -1), name, '', extension(name));
            }
            return {
                Write(text) {
                    const old = FileSystem.readFile(p) ?? '';
                    FileSystem.writeFile(p, old + String(text ?? ''));
                },
                WriteLine(text) {
                    const old = FileSystem.readFile(p) ?? '';
                    FileSystem.writeFile(p, old + String(text ?? '') + '\n');
                },
                WriteBlankLines(count) {
                    const old = FileSystem.readFile(p) ?? '';
                    FileSystem.writeFile(p, old + '\n'.repeat(Math.max(0, Number(count) || 0)));
                },
                Close() {}
            };
        }

        function openTextStream(path) {
            const p = resolvePathArray(path);
            const content = FileSystem.readFile(p) ?? '';
            let pos = 0;
            return {
                ReadLine() {
                    const idx = content.indexOf('\n', pos);
                    if (idx < 0) {
                        const out = content.slice(pos).replace(/\r$/, '');
                        pos = content.length;
                        return out;
                    }
                    const out = content.slice(pos, idx).replace(/\r$/, '');
                    pos = idx + 1;
                    return out;
                },
                Read(count) {
                    const n = Math.max(0, Number(count) || 0);
                    const out = content.slice(pos, pos + n);
                    pos += n;
                    return out;
                },
                ReadAll() {
                    const out = content.slice(pos);
                    pos = content.length;
                    return out;
                },
                Write(text) {
                    const before = content.slice(0, pos);
                    const after = content.slice(pos);
                    FileSystem.writeFile(p, before + String(text ?? '') + after);
                    pos += String(text ?? '').length;
                },
                WriteLine(text) { this.Write(String(text ?? '') + '\n'); },
                Close() {},
                get AtEndOfStream() { return pos >= content.length; }
            };
        }

        function extension(name) {
            const i = String(name).lastIndexOf('.');
            return i >= 0 ? String(name).slice(i + 1) : '';
        }

        function createFileObject(path) {
            const p = resolvePathArray(path);
            const n = FileSystem.getNode(p);
            if (!n || n.type !== 'file') throw makeRuntimeError(53, 'File not found');
            return {
                __vbObject: 'File',
                Name: n.name,
                Path: currentPathString(),
                Size: FileSystem.readFile(p)?.length || 0,
                DateCreated: n.created ? new Date(n.created).toLocaleString() : '',
                DateLastModified: n.modified ? new Date(n.modified).toLocaleString() : '',
                OpenAsTextStream: () => openTextStream(path),
                Delete() { FileSystem.deleteItem(p); },
                CopyTo(dest) {
                    const c = FileSystem.readFile(p) ?? '';
                    const d = resolvePathArray(dest);
                    if (FileSystem.isFolder(d)) {
                        const final = [...d, n.name];
                        if (FileSystem.itemExists(final)) FileSystem.writeFile(final, c);
                        else FileSystem.createFile(d, n.name, c, extension(n.name));
                    } else {
                        if (FileSystem.itemExists(d)) FileSystem.writeFile(d, c);
                        else FileSystem.createFile(d.slice(0, -1), d[d.length - 1], c, extension(d[d.length - 1]));
                    }
                }
            };
        }

        function createFolderObject(path) {
            const p = resolvePathArray(path);
            const n = FileSystem.getNode(p);
            if (!n || n.type !== 'folder') throw makeRuntimeError(76, 'Path not found');
            return {
                __vbObject: 'Folder',
                Name: n.name,
                Path: p.join('\\'),
                Size: 0,
                Files: { __vbCollection: true, Item: i => {
                    const kids = FileSystem.getChildren(p).filter(x => x.type === 'file');
                    const idx = typeof i === 'number' ? i : Number(i);
                    return idx >= 0 && idx < kids.length ? createFileObject([...p, kids[idx].name]) : null;
                }, Count: () => FileSystem.getChildren(p).filter(x => x.type === 'file').length },
                SubFolders: { __vbCollection: true, Item: i => {
                    const kids = FileSystem.getChildren(p).filter(x => x.type === 'folder');
                    const idx = typeof i === 'number' ? i : Number(i);
                    return idx >= 0 && idx < kids.length ? createFolderObject([...p, kids[idx].name]) : null;
                }, Count: () => FileSystem.getChildren(p).filter(x => x.type === 'folder').length },
                Delete() { FileSystem.deleteItem(p); },
                Copy(dest) {
                    const dst = resolvePathArray(dest);
                    if (!FileSystem.itemExists(dst)) FileSystem.createFolder(dst.slice(0, -1), dst[dst.length - 1]);
                }
            };
        }

        function createCOMObject(progId) {
            const id = String(progId ?? '');
            if (/^Scripting\.FileSystemObject$/i.test(id)) {
                return {
                    __vbObject: 'Scripting.FileSystemObject',
                    FileExists: fileExists,
                    FolderExists: folderExists,
                    GetFile(path) { return createFileObject(path); },
                    GetFolder(path) { return createFolderObject(path); },
                    OpenTextFile(path) { return openTextStream(path); },
                    CreateTextFile(path, overwrite = true) { return makeTextFile(path, overwrite); },
                    DeleteFile(path) {
                        const p = resolvePathArray(path);
                        if (!fileExists(path)) throw makeRuntimeError(53, 'File not found');
                        FileSystem.deleteItem(p);
                    },
                    DeleteFolder(path) {
                        const p = resolvePathArray(path);
                        if (!folderExists(path)) throw makeRuntimeError(76, 'Path not found');
                        FileSystem.deleteItem(p);
                    },
                    CopyFile(src, dest, overwrite = true) {
                        const c = FileSystem.readFile(resolvePathArray(src));
                        if (c === null || c === undefined) throw makeRuntimeError(53, 'File not found');
                        const d = resolvePathArray(dest);
                        if (FileSystem.isFolder(d)) {
                            const name = resolvePathArray(src).at(-1);
                            const final = [...d, name];
                            if (FileSystem.itemExists(final) && !overwrite) throw makeRuntimeError(58, 'File already exists');
                            FileSystem.itemExists(final) ? FileSystem.writeFile(final, c) : FileSystem.createFile(d, name, c, extension(name));
                        } else {
                            const name = d.at(-1);
                            if (FileSystem.itemExists(d) && !overwrite) throw makeRuntimeError(58, 'File already exists');
                            FileSystem.itemExists(d) ? FileSystem.writeFile(d, c) : FileSystem.createFile(d.slice(0, -1), name, c, extension(name));
                        }
                    },
                    MoveFile(src, dest) {
                        this.CopyFile(src, dest, true);
                        FileSystem.deleteItem(resolvePathArray(src));
                    },
                    BuildPath(base, name) {
                        return String(base).replace(/[\\\/]+$/, '') + '\\' + String(name).replace(/^[\\\/]+/, '');
                    },
                    GetAbsolutePathName(path) { return resolvePathArray(path).join('\\'); }
                };
            }

            if (/^WScript\.Shell$/i.test(id) || /^Shell\.Application$/i.test(id)) {
                return {
                    __vbObject: id,
                    CurrentDirectory: currentPathString(),
                    ExpandEnvironmentStrings(s) {
                        return String(s ?? '').replace(/%([^%]+)%/g, (_, n) => {
                            const value = getVar(n);
                            return value === '' ? `%${n}%` : toStr(value);
                        });
                    },
                    Run(cmd) { printFn(`[Shell] ${cmd}`); return 0; },
                    Exec(cmd) {
                        printFn(`[Shell] ${cmd}`);
                        return {
                            ExitCode: 0,
                            StdOut: { ReadLine: () => '', ReadAll: () => '' },
                            StdErr: { ReadLine: () => '', ReadAll: () => '' }
                        };
                    }
                };
            }

            throw makeRuntimeError(429, `ActiveX component can't create object: '${id}'`);
        }

        const WScript = {
            Echo(...values) {
                printFn(values.map(valueOf).map(v => v === null ? 'Null' : String(v)).join(' '));
            },
            StdOut: {
                Write(text) { printFn(String(text ?? '')); },
                WriteLine(text = '') { printFn(String(text ?? '')); },
                WriteBlankLines(n) { for (let i = 0; i < Number(n) || 0; i++) printFn(''); }
            },
            Sleep() {},
            CreateObject: createCOMObject,
            Arguments: { Count: 0, Item: i => '', Named: {} },
            ScriptName: 'script.vbs',
            ScriptFullName: 'C:\\script.vbs'
        };

        function decodeString(token) {
            if (token.length >= 2 && token[0] === '"' && token[token.length - 1] === '"') {
                return token.slice(1, -1).replace(/""/g, '"');
            }
            return token;
        }

        function tokenize(expr) {
            const tokens = [];
            let i = 0;
            const s = String(expr ?? '');
            const multiOps = ['<>', '<=', '>='];
            while (i < s.length) {
                const ch = s[i];
                if (/\s/.test(ch)) { i++; continue; }
                if (ch === '"') {
                    let j = i + 1;
                    while (j < s.length) {
                        if (s[j] === '"' && s[j + 1] === '"') { j += 2; continue; }
                        if (s[j] === '"') { j++; break; }
                        j++;
                    }
                    tokens.push({ type: 'string', value: s.slice(i, j) });
                    i = j;
                    continue;
                }
                const two = s.slice(i, i + 2);
                if (multiOps.includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
                if ('().,+-*/\\^&=<>'.includes(ch)) {
                    tokens.push({ type: (ch === '(' || ch === ')' ? 'paren' : ch === ',' ? 'comma' : 'op'), value: ch });
                    i++;
                    continue;
                }
                const m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*|^[0-9]+(?:\.[0-9]+)?/);
                if (m) {
                    tokens.push({ type: 'word', value: m[0] });
                    i += m[0].length;
                    continue;
                }
                throw makeRuntimeError(13, `Invalid character '${ch}'`);
            }
            tokens.push({ type: 'eof', value: '' });
            return tokens;
        }

        const precedence = {
            OR: 1, XOR: 1, AND: 2, EQV: 1, IMP: 1,
            '=': 3, '<>': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, IS: 3,
            '&': 4, '+': 5, '-': 5, '*': 6, '/': 6, '\\': 6, MOD: 6, '^': 7
        };

        function splitTopLevel(s, delimiter = ',') {
            const out = [];
            let cur = '';
            let quote = false;
            let depth = 0;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (ch === '"') {
                    if (quote && s[i + 1] === '"') { cur += '""'; i++; continue; }
                    quote = !quote;
                    cur += ch;
                } else if (!quote && ch === '(') { depth++; cur += ch; }
                else if (!quote && ch === ')') { depth--; cur += ch; }
                else if (!quote && depth === 0 && ch === delimiter) { out.push(cur.trim()); cur = ''; }
                else cur += ch;
            }
            if (cur.trim() || s.trim() === '') out.push(cur.trim());
            return out;
        }

        function parser(tokens, env) {
            let index = 0;
            function peek() { return tokens[index]; }
            function take() { return tokens[index++]; }

            function parsePrimary() {
                const t = take();
                if (t.type === 'string') return decodeString(t.value);
                if (t.type === 'word') {
                    const upper = t.value.toUpperCase();
                    if (/^\d/.test(t.value)) return Number(t.value);

                    if (upper === 'TRUE') return true;
                    if (upper === 'FALSE') return false;
                    if (upper === 'NULL' || upper === 'NOTHING') return null;
                    if (upper === 'EMPTY') return '';
                    if (upper === 'NOT') return !toBool(parseUnary());

                    let value;
                    if (peek().value === '(' && (functions[upper] || builtInFunction(upper))) {
                        take();
                        const inner = [];
                        let depth = 1;
                        while (depth > 0 && peek().type !== 'eof') {
                            const x = take();
                            if (x.value === '(') depth++;
                            if (x.value === ')') depth--;
                            if (depth > 0) inner.push(x);
                        }
                        const argsText = tokensToText(inner);
                        const args = argsText.trim() ? splitTopLevel(argsText).map(a => evaluate(a, env)) : [];
                        if (functions[upper]) value = callFunction(upper, args);
                        else value = callBuiltin(upper, args);
                    } else {
                        value = getVar(upper, env);
                    }

                    // Property / method chain.
                    while (peek().value === '.') {
                        take();
                        const p = take();
                        const prop = p.value;
                        if (peek().value === '(') {
                            take();
                            const inner = [];
                            let depth = 1;
                            while (depth > 0 && peek().type !== 'eof') {
                                const x = take();
                                if (x.value === '(') depth++;
                                if (x.value === ')') depth--;
                                if (depth > 0) inner.push(x);
                            }
                            const argsText = tokensToText(inner);
                            const args = argsText.trim() ? splitTopLevel(argsText).map(a => evaluate(a, env)) : [];
                            value = invoke(value, prop, args);
                        } else {
                            value = getProperty(value, prop);
                        }
                    }

                    // Array indexing.
                    if (peek().value === '(' && Array.isArray(value)) {
                        take();
                        const inner = [];
                        let depth = 1;
                        while (depth > 0 && peek().type !== 'eof') {
                            const x = take();
                            if (x.value === '(') depth++;
                            if (x.value === ')') depth--;
                            if (depth > 0) inner.push(x);
                        }
                        const idx = toNum(evaluate(tokensToText(inner), env));
                        value = value[idx];
                    }

                    return value;
                }

                if (t.value === '(') {
                    const value = parseExpression(0);
                    if (peek().value === ')') take();
                    return value;
                }

                throw makeRuntimeError(13, 'Expected expression');
            }

            function parseUnary() {
                if (['+', '-', 'NOT'].includes(String(peek().value).toUpperCase())) {
                    const op = String(take().value).toUpperCase();
                    const v = parseUnary();
                    if (op === '+') return toNum(v);
                    if (op === '-') return -toNum(v);
                    return !toBool(v);
                }
                return parsePrimary();
            }

            function parseExpression(minPrec) {
                let left = parseUnary();
                while (true) {
                    const p = peek();
                    const op = String(p.value).toUpperCase();
                    const prec = precedence[op];
                    if (prec === undefined || prec < minPrec) break;
                    take();
                    const right = parseExpression(op === '^' ? prec : prec + 1);
                    if (op === '+') left = (typeof left === 'string' || typeof right === 'string') ? toStr(left) + toStr(right) : toNum(left) + toNum(right);
                    else if (op === '-') left = toNum(left) - toNum(right);
                    else if (op === '*') left = toNum(left) * toNum(right);
                    else if (op === '/') {
                        const r = toNum(right);
                        if (r === 0) throw makeRuntimeError(11, 'Division by zero');
                        left = toNum(left) / r;
                    } else if (op === '\\') {
                        const r = toNum(right);
                        if (r === 0) throw makeRuntimeError(11, 'Division by zero');
                        left = Math.trunc(toNum(left) / r);
                    } else if (op === 'MOD') {
                        const r = toNum(right);
                        if (r === 0) throw makeRuntimeError(11, 'Division by zero');
                        left = toNum(left) % r;
                    } else if (op === '^') left = Math.pow(toNum(left), toNum(right));
                    else if (op === '&') left = toStr(left) + toStr(right);
                    else if (['=', '<>', '<', '>', '<=', '>='].includes(op)) left = compare(left, right, op);
                    else if (op === 'IS') left = left === right;
                    else if (op === 'AND') left = toBool(left) && toBool(right);
                    else if (op === 'OR') left = toBool(left) || toBool(right);
                    else if (op === 'XOR') left = toBool(left) !== toBool(right);
                    else if (op === 'EQV') left = toBool(left) === toBool(right);
                    else if (op === 'IMP') left = !toBool(left) || toBool(right);
                }
                return left;
            }

            return () => parseExpression(0);
        }

        function tokensToText(tokens) {
            return tokens.map(t => t.value).join(' ');
        }

        function evaluate(expr, env = mainEnv) {
            const text = String(expr ?? '').trim();
            if (!text) return '';
            const p = parser(tokenize(text), env);
            return p();
        }

        function compare(a, b, op) {
            const na = typeof a === 'number' ? a : Number(a);
            const nb = typeof b === 'number' ? b : Number(b);
            const numeric = Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '';
            const x = numeric ? na : toStr(a).toUpperCase();
            const y = numeric ? nb : toStr(b).toUpperCase();
            switch (op) {
                case '=': return x == y;
                case '<>': return x != y;
                case '<': return x < y;
                case '>': return x > y;
                case '<=': return x <= y;
                case '>=': return x >= y;
                default: return false;
            }
        }

        function getProperty(obj, prop) {
            if (obj === null || obj === undefined) return null;
            const p = String(prop);
            if (Object.prototype.hasOwnProperty.call(obj, p)) return obj[p];
            if (Object.prototype.hasOwnProperty.call(obj, p.toUpperCase())) return obj[p.toUpperCase()];
            const found = Object.keys(obj).find(k => k.toUpperCase() === p.toUpperCase());
            return found ? obj[found] : '';
        }

        function invoke(obj, method, argsList) {
            if (obj === null || obj === undefined) throw makeRuntimeError(91, 'Object variable not set');
            const fn = obj[method] ?? obj[method.toUpperCase()];
            if (typeof fn === 'function') return fn.apply(obj, argsList);
            return getProperty(obj, method);
        }

        function builtInFunction(name) {
            return new Set([
                'LEN','LEFT','RIGHT','MID','INSTR','INSTRREV','REPLACE','TRIM','LTRIM','RTRIM',
                'LCASE','UCASE','STR','CSTR','CINT','CLNG','CSNG','CDBL','CBOOL','CDATE','ABS',
                'INT','FIX','ROUND','RND','SGN','SQR','EXP','LOG','SIN','COS','TAN','NOW','DATE',
                'TIME','YEAR','MONTH','DAY','HOUR','MINUTE','SECOND','WEEKDAY','FORMATNUMBER',
                'FORMATDATETIME','SPLIT','JOIN','FILTER','LBOUND','UBOUND','ISNULL','ISEMPTY',
                'ISNUMERIC','ISOBJECT','TYPENAME','VARTYPE','CHR','ASC','HEX','OCT','SPACE',
                'STRING','STRCOMP','ENVIRON','CREATEOBJECT','INPUTBOX','MSGBOX'
            ]).has(name);
        }

        function callBuiltin(name, a) {
            switch (name) {
                case 'LEN': return toStr(a[0]).length;
                case 'LEFT': return toStr(a[0]).slice(0, Math.max(0, toNum(a[1])));
                case 'RIGHT': { const s = toStr(a[0]); return s.slice(Math.max(0, s.length - toNum(a[1]))); }
                case 'MID': {
                    const s = toStr(a[0]), start = Math.max(0, toNum(a[1]) - 1);
                    return s.slice(start, a[2] === undefined ? undefined : start + Math.max(0, toNum(a[2])));
                }
                case 'INSTR': return toStr(a[0]).indexOf(toStr(a[1])) + 1;
                case 'INSTRREV': return toStr(a[0]).lastIndexOf(toStr(a[1])) + 1;
                case 'REPLACE': return toStr(a[0]).split(toStr(a[1])).join(toStr(a[2]));
                case 'TRIM': return toStr(a[0]).trim();
                case 'LTRIM': return toStr(a[0]).replace(/^\s+/, '');
                case 'RTRIM': return toStr(a[0]).replace(/\s+$/, '');
                case 'LCASE': return toStr(a[0]).toLowerCase();
                case 'UCASE': return toStr(a[0]).toUpperCase();
                case 'STR': return toStr(a[0]);
                case 'CSTR': return toStr(a[0]);
                case 'CINT': return Math.round(toNum(a[0]));
                case 'CLNG': return Math.round(toNum(a[0]));
                case 'CSNG':
                case 'CDBL': return Number(a[0]);
                case 'CBOOL': return toBool(a[0]);
                case 'CDATE': return new Date(toStr(a[0]));
                case 'ABS': return Math.abs(toNum(a[0]));
                case 'INT': return Math.floor(toNum(a[0]));
                case 'FIX': return Math.trunc(toNum(a[0]));
                case 'ROUND': return Math.round(toNum(a[0]));
                case 'RND': return Math.random();
                case 'SGN': { const n = toNum(a[0]); return n > 0 ? 1 : n < 0 ? -1 : 0; }
                case 'SQR': return Math.sqrt(toNum(a[0]));
                case 'EXP': return Math.exp(toNum(a[0]));
                case 'LOG': return Math.log(toNum(a[0]));
                case 'SIN': return Math.sin(toNum(a[0]));
                case 'COS': return Math.cos(toNum(a[0]));
                case 'TAN': return Math.tan(toNum(a[0]));
                case 'NOW': return new Date().toLocaleString();
                case 'DATE': return new Date().toLocaleDateString();
                case 'TIME': return new Date().toLocaleTimeString();
                case 'YEAR': return new Date().getFullYear();
                case 'MONTH': return new Date().getMonth() + 1;
                case 'DAY': return new Date().getDate();
                case 'HOUR': return new Date().getHours();
                case 'MINUTE': return new Date().getMinutes();
                case 'SECOND': return new Date().getSeconds();
                case 'WEEKDAY': return new Date().getDay() + 1;
                case 'FORMATNUMBER': return toNum(a[0]).toFixed(a[1] === undefined ? 0 : toNum(a[1]));
                case 'FORMATDATETIME': return toStr(a[0]);
                case 'SPLIT': return toStr(a[0]).split(a[1] === undefined ? ' ' : toStr(a[1]));
                case 'JOIN': return Array.isArray(a[0]) ? a[0].join(a[1] === undefined ? ' ' : toStr(a[1])) : '';
                case 'FILTER': return Array.isArray(a[0]) ? a[0].filter(x => toStr(x).includes(toStr(a[1]))) : [];
                case 'LBOUND': return 0;
                case 'UBOUND': return Array.isArray(a[0]) ? a[0].length - 1 : 0;
                case 'ISNULL': return a[0] === null;
                case 'ISEMPTY': return a[0] === null || a[0] === undefined || a[0] === '';
                case 'ISNUMERIC': return a[0] !== '' && Number.isFinite(Number(a[0]));
                case 'ISOBJECT': return isObject(a[0]);
                case 'TYPENAME':
                    if (a[0] === null) return 'Nothing';
                    if (Array.isArray(a[0])) return 'Variant()';
                    if (typeof a[0] === 'boolean') return 'Boolean';
                    if (typeof a[0] === 'number') return Number.isInteger(a[0]) ? 'Integer' : 'Double';
                    if (typeof a[0] === 'string') return 'String';
                    return a[0]?.__vbObject || 'Object';
                case 'VARTYPE':
                    if (a[0] === null) return 1;
                    if (typeof a[0] === 'string') return 8;
                    if (typeof a[0] === 'boolean') return 11;
                    if (typeof a[0] === 'number') return Number.isInteger(a[0]) ? 2 : 5;
                    if (Array.isArray(a[0])) return 8204;
                    return 9;
                case 'CHR': return String.fromCharCode(toNum(a[0]));
                case 'ASC': return toStr(a[0]).charCodeAt(0) || 0;
                case 'HEX': return toNum(a[0]).toString(16).toUpperCase();
                case 'OCT': return toNum(a[0]).toString(8);
                case 'SPACE': return ' '.repeat(Math.max(0, toNum(a[0])));
                case 'STRING': {
                    const count = Math.max(0, toNum(a[0]));
                    const char = a[1] === undefined ? '\0' : toStr(a[1]).charAt(0);
                    return char.repeat(count);
                }
                case 'STRCOMP': {
                    const x = toStr(a[0]), y = toStr(a[1]);
                    return x === y ? 0 : (x > y ? 1 : -1);
                }
                case 'ENVIRON': return '';
                case 'CREATEOBJECT': return createCOMObject(a[0]);
                case 'INPUTBOX': return a[0] === undefined ? '' : toStr(a[0]);
                case 'MSGBOX': WScript.Echo(...a); return 1;
                default: return '';
            }
        }

        function callFunction(name, callArgs) {
            const fn = functions[key(name)];
            if (!fn) return '';
            const previous = mainEnv;
            const local = Object.create(previous);
            for (let i = 0; i < fn.params.length; i++) local[key(fn.params[i])] = callArgs[i] ?? '';
            local[key(name)] = '';
            mainEnv = local;
            try {
                executeRange(fn.start + 1, fn.end, local, { procedure: 'function', name: key(name) });
                return local[key(name)];
            } finally {
                mainEnv = previous;
            }
        }

        function callSub(name, callArgs) {
            const sub = subs[key(name)];
            if (!sub) return;
            const previous = mainEnv;
            const local = Object.create(previous);
            for (let i = 0; i < sub.params.length; i++) local[key(sub.params[i])] = callArgs[i] ?? '';
            mainEnv = local;
            try { executeRange(sub.start + 1, sub.end, local, { procedure: 'sub', name: key(name) }); }
            finally { mainEnv = previous; }
        }

        function stripComment(line) {
            let quote = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (quote && line[i + 1] === '"') { i++; continue; }
                    quote = !quote;
                } else if (!quote && (ch === "'" || ch === '\u2018' || ch === '\u2019' || ch === '\ufeff')) {
                    return line.slice(0, i);
                }
            }
            return line;
        }

        function findTopLevelEquals(s) {
            let quote = false, depth = 0;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (ch === '"') {
                    if (quote && s[i + 1] === '"') { i++; continue; }
                    quote = !quote;
                } else if (!quote) {
                    if (ch === '(') depth++;
                    else if (ch === ')') depth--;
                    else if (ch === '=' && depth === 0) return i;
                }
            }
            return -1;
        }

        function assign(lhs, value, env = mainEnv) {
            let s = lhs.trim();
            const arr = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/s);
            if (arr) {
                const k = key(arr[1]);
                const target = env[k] ?? mainEnv[k];
                if (!Array.isArray(target)) throw makeRuntimeError(13, 'Expected array');
                const idx = toNum(evaluate(arr[2], env));
                target[idx] = value;
                return;
            }

            const dot = s.indexOf('.');
            if (dot >= 0) {
                const objName = s.slice(0, dot).trim();
                const chain = s.slice(dot + 1).trim().split('.');
                let obj = getVar(objName, env);
                for (let i = 0; i < chain.length - 1; i++) obj = getProperty(obj, chain[i]);
                const last = chain.at(-1);
                if (obj && typeof obj[last] === 'function') obj[last](value);
                else if (obj && typeof obj[last.toUpperCase()] === 'function') obj[last.toUpperCase()](value);
                else if (obj) obj[last] = value;
                return;
            }
            setVar(s, value, env);
        }

        function parseCallStatement(text) {
            const t = text.trim();
            const m = t.match(/^([A-Za-z_][A-Za-z0-9_\.]*)\s*(.*)$/s);
            if (!m) return null;
            const name = m[1];
            let rest = m[2].trim();
            if (rest.startsWith('(') && rest.endsWith(')')) rest = rest.slice(1, -1);
            const pieces = rest ? splitTopLevel(rest) : [];
            return { name, args: pieces.map(p => evaluate(p, mainEnv)) };
        }

        function parseDeclarations(line, kind) {
            const body = line.slice(kind.length).trim();
            for (const decl of splitTopLevel(body)) {
                const m = decl.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(\s*(.+?)\s*\))?(?:\s+As\s+\w+)?$/i);
                if (!m) continue;
                const name = key(m[1]);
                if (m[2]) {
                    const size = Math.max(0, toNum(evaluate(m[2], mainEnv)));
                    mainEnv[name] = new Array(size + 1).fill(null);
                } else {
                    mainEnv[name] = null;
                }
                declared.add(name);
            }
        }

        function preprocess() {
            subs = Object.create(null);
            functions = Object.create(null);
            consts = Object.create(null);
            constStackScan();
        }

        function constStackScan() {
            for (let i = 0; i < lines.length; i++) {
                const up = lines[i].trim().toUpperCase();
                if (up.startsWith('CONST ')) {
                    const body = lines[i].trim().slice(6);
                    const eq = findTopLevelEquals(body);
                    if (eq >= 0) consts[key(body.slice(0, eq).replace(/\s+AS\s+\w+$/i, '').trim())] = evaluate(body.slice(eq + 1), mainEnv);
                }

                let m = lines[i].trim().match(/^Sub\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\((.*?)\))?/i);
                if (m) {
                    const end = findEnd(i + 1, /^End\s+Sub$/i);
                    subs[key(m[1])] = {
                        start: i,
                        end,
                        params: splitTopLevel(m[2] || '').map(p => p.replace(/\s+ByVal\s+/i, '').replace(/\s+ByRef\s+/i, '').replace(/\s+As\s+\w+$/i, '').trim())
                    };
                    i = end;
                    continue;
                }
                m = lines[i].trim().match(/^Function\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\((.*?)\))?/i);
                if (m) {
                    const end = findEnd(i + 1, /^End\s+Function$/i);
                    functions[key(m[1])] = {
                        start: i,
                        end,
                        params: splitTopLevel(m[2] || '').map(p => p.replace(/\s+ByVal\s+/i, '').replace(/\s+ByRef\s+/i, '').replace(/\s+As\s+\w+$/i, '').trim())
                    };
                    i = end;
                }
            }
        }

        function findEnd(start, matcher) {
            for (let i = start; i < lines.length; i++) if (matcher.test(lines[i].trim())) return i;
            return lines.length;
        }

        function findMatchingEndIf(start) {
            let depth = 0;
            for (let i = start; i < lines.length; i++) {
                const u = lines[i].trim().toUpperCase();
                if (/^IF\b/.test(u) && /\bTHEN\b/.test(u)) depth++;
                else if (u === 'END IF') {
                    depth--;
                    if (depth === 0) return i;
                }
            }
            return lines.length - 1;
        }

        function findIfBranches(start, end) {
            let depth = 0;
            const branches = [];
            let current = start;
            for (let i = start + 1; i < end; i++) {
                const u = lines[i].trim().toUpperCase();
                if (/^IF\b/.test(u) && /\bTHEN\b/.test(u)) depth++;
                else if (u === 'END IF') depth--;
                else if (depth === 0 && (u === 'ELSE' || /^ELSEIF\b/.test(u))) {
                    branches.push({ start: current, end: i, line: i });
                    current = i;
                }
            }
            branches.push({ start: current, end, line: end });
            return branches;
        }

        function findLoopEnd(start, type) {
            let depth = 0;
            for (let i = start; i < lines.length; i++) {
                const u = lines[i].trim().toUpperCase();
                if (type === 'FOR') {
                    if (/^FOR\b/.test(u)) depth++;
                    else if (/^NEXT\b/.test(u)) {
                        depth--;
                        if (depth === 0) return i;
                    }
                } else if (type === 'DO') {
                    if (/^DO\b/.test(u)) depth++;
                    else if (/^LOOP\b/.test(u)) {
                        depth--;
                        if (depth === 0) return i;
                    }
                } else if (type === 'WHILE') {
                    if (/^WHILE\b/.test(u)) depth++;
                    else if (u === 'WEND') {
                        depth--;
                        if (depth === 0) return i;
                    }
                } else if (type === 'SELECT') {
                    if (/^SELECT\s+CASE\b/.test(u)) depth++;
                    else if (u === 'END SELECT') {
                        depth--;
                        if (depth === 0) return i;
                    }
                }
            }
            return lines.length - 1;
        }

        function executeRange(start, endExclusive, env = mainEnv, procedure = null) {
            let i = start;
            let iterations = 0;
            while (i < endExclusive && running && !stopRequested) {
                if (++iterations > 500000) throw makeRuntimeError(28, 'Out of stack space / possible infinite loop');

                const raw = lines[i].trim();
                const line = stripComment(raw).trim();
                if (!line) { i++; continue; }

                const u = line.toUpperCase().replace(/\s+/g, ' ');

                try {
                    const result = executeStatement(line, u, env, i, procedure);
                    if (result?.jump !== undefined) { i = result.jump; continue; }
                    if (result?.return) return result.value;
                    if (result?.exitProcedure) return undefined;
                    i++;
                } catch (e) {
                    if (e?.vbNumber || e instanceof Error) {
                        Err.Number = e.vbNumber || 5;
                        Err.Description = e.message || String(e);
                        if (errorResumeNext) { i++; continue; }
                    }
                    throw e;
                }
            }
            return undefined;
        }

        function executeStatement(line, u, env, lineIndex, procedure = null) {
            if (u === 'OPTION EXPLICIT' || u === 'OPTION EXPLICIT ') return null;
            if (u.startsWith('REM ') || u === 'REM') return null;

            if (/^DIM\b/i.test(line)) { parseDeclarations(line, 'Dim'); return null; }
            if (/^CONST\b/i.test(line)) {
                const body = line.slice(5).trim();
                const eq = findTopLevelEquals(body);
                if (eq >= 0) consts[key(body.slice(0, eq).replace(/\s+AS\s+\w+$/i, '').trim())] = evaluate(body.slice(eq + 1), env);
                return null;
            }
            if (/^REDIM(?:\s+PRESERVE)?\b/i.test(line)) {
                const preserve = /^ReDim\s+Preserve/i.test(line);
                const body = line.replace(/^ReDim\s+(?:Preserve\s+)?/i, '');
                const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*?)\)$/);
                if (m) {
                    const name = key(m[1]), size = Math.max(0, toNum(evaluate(m[2], env)));
                    const old = env[name];
                    const arr = new Array(size + 1).fill(null);
                    if (preserve && Array.isArray(old)) for (let j = 0; j < Math.min(old.length, arr.length); j++) arr[j] = old[j];
                    env[name] = arr;
                }
                return null;
            }
            if (/^ERASE\b/i.test(line)) {
                for (const name of splitTopLevel(line.slice(5))) {
                    if (Array.isArray(env[key(name)])) env[key(name)] = [];
                    else env[key(name)] = null;
                }
                return null;
            }

            if (/^ON\s+ERROR\s+RESUME\s+NEXT$/i.test(line)) { errorResumeNext = true; return null; }
            if (/^ON\s+ERROR\s+GOTO\s+0$/i.test(line)) { errorResumeNext = false; return null; }
            if (/^ON\s+ERROR\s+GOTO\s+-1$/i.test(line)) { Err.Clear(); errorResumeNext = false; return null; }

            if (/^(STOP|END)$/i.test(line)) { running = false; stopRequested = true; return null; }

            if (/^(EXIT\s+(SUB|FUNCTION|PROPERTY|DO|FOR))$/i.test(line)) {
                const what = line.match(/^EXIT\s+(\w+)/i)[1].toUpperCase();
                if (what === 'SUB' || what === 'FUNCTION' || what === 'PROPERTY') return { exitProcedure: true };
                return { jump: findExitTarget(lineIndex, what) };
            }

            if (/^IF\b/i.test(line) && /\bTHEN\b/i.test(line)) {
                const thenPos = findKeywordOutsideQuotes(line, 'THEN');
                const condition = line.slice(2, thenPos).trim();
                const rest = line.slice(thenPos + 4).trim();
                const cond = toBool(evaluate(condition, env));
                if (rest) {
                    if (cond) {
                        for (const stmt of splitStatements(rest)) {
                            const r = executeStatement(stmt, stmt.toUpperCase(), env, lineIndex, procedure);
                            if (r?.return || r?.exitProcedure) return r;
                        }
                    }
                    return null;
                }

                const endIf = findMatchingEndIf(lineIndex);
                const branches = findIfBranches(lineIndex, endIf);
                let selected = null;
                for (const b of branches) {
                    if (b.start === lineIndex) {
                        if (cond) { selected = { from: lineIndex + 1, to: b.end }; break; }
                    } else {
                        const bLine = lines[b.line].trim();
                        if (/^ELSEIF\b/i.test(bLine)) {
                            const p = findKeywordOutsideQuotes(bLine, 'THEN');
                            if (toBool(evaluate(bLine.slice(6, p).trim(), env))) {
                                selected = { from: b.line + 1, to: b.end };
                                break;
                            }
                        } else if (/^ELSE$/i.test(bLine)) {
                            selected = { from: b.line + 1, to: b.end };
                            break;
                        }
                    }
                }
                if (selected) executeRange(selected.from, selected.to, env, procedure);
                return { jump: endIf + 1 };
            }

            if (/^SELECT\s+CASE\b/i.test(line)) {
                const end = findLoopEnd(lineIndex, 'SELECT');
                const wanted = evaluate(line.replace(/^Select\s+Case\s+/i, ''), env);
                const cases = [];
                let current = null;
                for (let j = lineIndex + 1; j < end; j++) {
                    const x = lines[j].trim();
                    if (/^CASE\b/i.test(x)) {
                        if (current) current.end = j;
                        const exprText = x.replace(/^Case\s+/i, '').trim();
                        current = { line: j, expr: exprText, start: j + 1, end };
                        cases.push(current);
                    }
                }
                if (current) current.end = end;

                let chosen = cases.find(c => !/^ELSE$/i.test(c.expr) && caseMatches(wanted, c.expr, env));
                if (!chosen) chosen = cases.find(c => /^ELSE$/i.test(c.expr));

                if (chosen) executeRange(chosen.start, chosen.end, env, procedure);
                return { jump: end + 1 };
            }

            if (/^FOR\s+EACH\b/i.test(line)) {
                const end = findLoopEnd(lineIndex, 'FOR');
                const m = line.match(/^For\s+Each\s+([A-Za-z_][A-Za-z0-9_]*)\s+In\s+(.+)$/i);
                if (!m) return { jump: end + 1 };
                const collection = evaluate(m[2], env);
                const arr = Array.isArray(collection) ? collection : (collection?.__vbCollection ? collection : []);
                if (Array.isArray(arr)) {
                    for (const item of arr) {
                        env[key(m[1])] = item;
                        executeRange(lineIndex + 1, end, env, procedure);
                        if (!running) break;
                    }
                }
                return { jump: end + 1 };
            }

            if (/^FOR\b/i.test(line)) {
                const end = findLoopEnd(lineIndex, 'FOR');
                const m = line.match(/^For\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s+To\s+(.+?)(?:\s+Step\s+(.+))?$/i);
                if (!m) return { jump: end + 1 };
                const name = key(m[1]);
                let value = toNum(evaluate(m[2], env));
                const limit = toNum(evaluate(m[3], env));
                const step = m[4] ? toNum(evaluate(m[4], env)) : 1;
                if (step === 0) throw makeRuntimeError(5, 'Invalid procedure call or argument');
                const condition = () => step > 0 ? value <= limit : value >= limit;
                while (condition() && running) {
                    env[name] = value;
                    executeRange(lineIndex + 1, end, env, procedure);
                    value += step;
                }
                return { jump: end + 1 };
            }

            if (/^DO(?:\s|$)/i.test(line)) {
                const end = findLoopEnd(lineIndex, 'DO');
                const suffix = line.replace(/^Do\s*/i, '').trim();
                const preWhile = /^While\s+(.+)$/i.exec(suffix);
                const preUntil = /^Until\s+(.+)$/i.exec(suffix);
                while (running) {
                    if (preWhile && !toBool(evaluate(preWhile[1], env))) break;
                    if (preUntil && toBool(evaluate(preUntil[1], env))) break;
                    executeRange(lineIndex + 1, end, env, procedure);
                    if (!running) break;
                    const tail = lines[end].trim().replace(/^Loop\s*/i, '').trim();
                    if (/^While\s+/i.test(tail) && !toBool(evaluate(tail.replace(/^While\s+/i, ''), env))) break;
                    if (/^Until\s+/i.test(tail) && toBool(evaluate(tail.replace(/^Until\s+/i, ''), env))) break;
                }
                return { jump: end + 1 };
            }

            if (/^WHILE\b/i.test(line)) {
                const end = findLoopEnd(lineIndex, 'WHILE');
                const cond = line.replace(/^While\s+/i, '');
                while (running && toBool(evaluate(cond, env))) executeRange(lineIndex + 1, end, env, procedure);
                return { jump: end + 1 };
            }

            if (/^WEND$/i.test(line) || /^NEXT(?:\s+\w+)?$/i.test(line) || /^LOOP\b/i.test(line) || /^END\s+(IF|SELECT|CLASS|SUB|FUNCTION|PROPERTY)$/i.test(line) || /^ELSE(?:IF)?\b/i.test(line) || /^CASE\b/i.test(line)) return null;

            if (/^WSCRIPT\.ECHO(?:\s|$)/i.test(line)) {
                const rest = line.replace(/^WScript\.Echo\s*/i, '');
                const parts = splitTopLevel(rest);
                WScript.Echo(...parts.map(x => evaluate(x, env)));
                return null;
            }
            if (/^WSCRIPT\.STDOUT\.WRITELINE(?:\s|$)/i.test(line)) {
                WScript.StdOut.WriteLine(evaluate(line.replace(/^WScript\.StdOut\.WriteLine\s*/i, ''), env));
                return null;
            }
            if (/^WSCRIPT\.STDOUT\.WRITE(?:\s|$)/i.test(line)) {
                WScript.StdOut.Write(evaluate(line.replace(/^WScript\.StdOut\.Write\s*/i, ''), env));
                return null;
            }
            if (/^WSCRIPT\.SLEEP\b/i.test(line)) return null;

            if (/^CALL\b/i.test(line)) {
                const parsed = parseCallStatement(line.slice(4).trim());
                if (parsed && subs[key(parsed.name)]) callSub(parsed.name, parsed.args);
                else if (parsed && functions[key(parsed.name)]) callFunction(parsed.name, parsed.args);
                return null;
            }

            // "Set x = expr" and normal assignments.
            const assignmentText = line.replace(/^SET\s+/i, '');
            const eq = findTopLevelEquals(assignmentText);
            if (eq >= 0 && !/^IF\b/i.test(line)) {
                const lhs = assignmentText.slice(0, eq).trim();
                const rhs = assignmentText.slice(eq + 1).trim();
                assign(lhs, evaluate(rhs, env), env);
                return null;
            }

            const callMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/s);
            if (callMatch && (subs[key(callMatch[1])] || functions[key(callMatch[1])] || builtInStatement(key(callMatch[1])))) {
                const name = key(callMatch[1]);
                const rest = callMatch[2].trim();
                const callArgs = rest ? splitTopLevel(rest.startsWith('(') && rest.endsWith(')') ? rest.slice(1, -1) : rest).map(x => evaluate(x, env)) : [];
                if (subs[name]) callSub(name, callArgs);
                else if (functions[name]) callFunction(name, callArgs);
                else callBuiltin(name, callArgs);
                return null;
            }

            if (/^MSGBOX(?:\s|$)/i.test(line)) {
                WScript.Echo(evaluate(line.replace(/^MsgBox\s*/i, ''), env));
                return null;
            }

            // Object method statements such as Err.Clear or fso.DeleteFile "x".
            const methodStmt = line.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)\s*(.*)$/s);
            if (methodStmt) {
                const chain = methodStmt[1].split('.');
                let obj = getVar(chain.shift(), env);
                for (const prop of chain.slice(0, -1)) obj = getProperty(obj, prop);
                const method = chain.at(-1);
                const rest = methodStmt[2].trim();
                const argsList = rest ? splitTopLevel(rest.startsWith('(') && rest.endsWith(')') ? rest.slice(1, -1) : rest).map(x => evaluate(x, env)) : [];
                const fn = obj?.[method] ?? obj?.[method.toUpperCase()];
                if (typeof fn === 'function') fn.apply(obj, argsList);
                else if (rest || obj) invoke(obj, method, argsList);
                return null;
            }

            // Bare expression statement.
            evaluate(line, env);
            return null;
        }

        function builtInStatement(name) {
            return ['MSGBOX', 'INPUTBOX'].includes(name);
        }

        function findKeywordOutsideQuotes(text, keyword) {
            let quote = false, depth = 0;
            const u = text.toUpperCase();
            for (let i = 0; i <= text.length - keyword.length; i++) {
                if (text[i] === '"') {
                    if (quote && text[i + 1] === '"') { i++; continue; }
                    quote = !quote;
                } else if (!quote) {
                    if (text[i] === '(') depth++;
                    else if (text[i] === ')') depth--;
                    if (depth === 0 && u.slice(i, i + keyword.length) === keyword &&
                        (i === 0 || /\s/.test(text[i - 1])) &&
                        (i + keyword.length === text.length || /\s/.test(text[i + keyword.length]))) return i;
                }
            }
            return -1;
        }

        function splitStatements(rest) {
            const out = [];
            let cur = '', quote = false;
            for (let i = 0; i < rest.length; i++) {
                const ch = rest[i];
                if (ch === '"') {
                    if (quote && rest[i + 1] === '"') { cur += '""'; i++; continue; }
                    quote = !quote;
                    cur += ch;
                } else if (ch === ':' && !quote) {
                    if (cur.trim()) out.push(cur.trim());
                    cur = '';
                } else cur += ch;
            }
            if (cur.trim()) out.push(cur.trim());
            return out;
        }

        function caseMatches(wanted, expression, env) {
            for (const item of splitTopLevel(expression)) {
                const x = item.trim();
                const m = x.match(/^Is\s*(<>|<=|>=|<|>|=)\s*(.*)$/i);
                if (m) {
                    if (compare(wanted, evaluate(m[2], env), m[1])) return true;
                } else {
                    const range = x.match(/^(.+?)\s+To\s+(.+)$/i);
                    if (range && toNum(wanted) >= toNum(evaluate(range[1], env)) && toNum(wanted) <= toNum(evaluate(range[2], env))) return true;
                    if (compare(wanted, evaluate(x, env), '=')) return true;
                }
            }
            return false;
        }

        function findExitTarget(index, type) {
            if (type === 'FOR') return findLoopEnd(index, 'FOR') + 1;
            if (type === 'DO') return findLoopEnd(index, 'DO') + 1;
            return index + 1;
        }

        function run(script, runArgs = []) {
            lines = String(script ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
            pc = 0;
            running = true;
            stopRequested = false;
            errorResumeNext = false;
            args = (runArgs || []).map(String);
            scriptName = 'script.vbs';
            mainEnv = Object.create(null);
            declared = new Set();

            WScript.Arguments = {
                Count: args.length,
                Item: i => args[Number(i)] ?? '',
                Named: Object.create(null)
            };

            setVar('WSCRIPT', WScript, mainEnv);
            setVar('ERR', Err, mainEnv);
            setVar('NOTHING', null, mainEnv);
            setVar('NULL', null, mainEnv);
            WScript.ScriptName = scriptName;
            WScript.ScriptFullName = `C:\\${scriptName}`;

            Err.Clear();
            preprocess();

            // Skip declarations/procedure definitions are handled by the range executor;
            // all procedure bodies are skipped when encountered on the main path.
            while (pc < lines.length && running && !stopRequested) {
                const raw = lines[pc].trim();
                const line = stripComment(raw).trim();
                const up = line.toUpperCase();
                if (!line) { pc++; continue; }
                if (/^SUB\b/i.test(line)) {
                    pc = subs[key(line.match(/^Sub\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] || '')]?.end + 1 || pc + 1;
                    continue;
                }
                if (/^FUNCTION\b/i.test(line)) {
                    pc = functions[key(line.match(/^Function\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] || '')]?.end + 1 || pc + 1;
                    continue;
                }
                if (/^CLASS\b/i.test(line)) {
                    pc = findEnd(pc + 1, /^End\s+Class$/i) + 1;
                    continue;
                }

                const before = pc;
                try {
                    const r = executeStatement(line, up, mainEnv, pc);
                    if (r?.jump !== undefined) pc = r.jump;
                    else pc++;
                } catch (e) {
                    Err.Number = e?.vbNumber || 5;
                    Err.Description = e?.message || String(e);
                    if (errorResumeNext) pc++;
                    else {
                        printFn(`Error ${Err.Number}: ${Err.Description}`);
                        errorLevel = Err.Number;
                        running = false;
                    }
                }

                if (pc === before) pc++;
            }

            running = false;
            return typeof errorLevel === 'number' ? errorLevel : 0;
        }

        let errorLevel = 0;
        return { run };
    }

    return { create };
})();

export default VBEngine;
