import FileSystem from './fileSystem.js';

const VBEngine = (() => {
    function create(printFn, getCwd, setCwd) {
        let vars = {};
        let subs = {};
        let functions = {};
        let consts = {};
        let lines = [];
        let pc = 0;
        let running = false;
        let errorLevel = 0;
        let callStack = [];
        let forStack = [];
        let doStack = [];
        let selectStack = [];
        let errorResume = false;
        let stopRequested = false;

        const WScript = {
            Echo: (...args) => printFn(args.map(v => valueOf(v)).join(' ')),
            StdOut: {
                Write: (text) => printFn(String(text)),
                WriteBlankLines: (n) => { for (let i = 0; i < n; i++) printFn(''); },
                WriteLine: (text) => printFn(String(text ?? ''))
            },
            Sleep: (ms) => { /* async not supported in sync engine */ },
            Arguments: { Count: 0, Item: (i) => '', Named: {} },
            ScriptName: 'script.vbs',
            ScriptFullName: 'C:\\script.vbs',
            CreateObject: (progId) => createCOMObject(progId)
        };

        const Err = {
            Number: 0,
            Description: '',
            Source: '',
            HelpFile: '',
            HelpContext: 0,
            Clear: function() { this.Number = 0; this.Description = ''; this.Source = ''; this.HelpFile = ''; this.HelpContext = 0; },
            Raise: function(num, source, desc, helpfile, helpcontext) {
                this.Number = num || 0;
                this.Source = source || '';
                this.Description = desc || '';
                this.HelpFile = helpfile || '';
                this.HelpContext = helpcontext || 0;
            }
        };

        function createCOMObject(progId) {
            if (/Shell\.Application/i.test(progId)) {
                return {
                    Run: (cmd) => { printFn(`[Shell] ${cmd}`); return 0; },
                    ExpandEnvironmentStrings: (s) => s
                };
            }
            if (/Scripting\.FileSystemObject/i.test(progId)) {
                return {
                    FileExists: (path) => { const n = FileSystem.getNode(resolvePathArray(path)); return n !== null && n.type === 'file'; },
                    FolderExists: (path) => { const n = FileSystem.getNode(resolvePathArray(path)); return n !== null && n.type === 'folder'; },
                    CopyFile: (src, dest) => { const c = FileSystem.readFile(resolvePathArray(src)); if (c !== null) FileSystem.writeFile(resolvePathArray(dest), c); },
                    DeleteFile: (path) => { FileSystem.deleteItem(resolvePathArray(path)); },
                    CreateTextFile: (path) => {
                        const p = resolvePathArray(path);
                        return {
                            Write: (text) => { const existing = FileSystem.readFile(p) || ''; FileSystem.writeFile(p, existing + text); },
                            WriteLine: (text) => { const existing = FileSystem.readFile(p) || ''; FileSystem.writeFile(p, existing + text + '\n'); },
                            WriteBlankLines: (n) => { const existing = FileSystem.readFile(p) || ''; FileSystem.writeFile(p, existing + '\n'.repeat(n)); },
                            Close: () => {}
                        };
                    },
                    GetFile: (path) => {
                        const p = resolvePathArray(path);
                        const node = FileSystem.getNode(p);
                        if (!node || node.type !== 'file') return null;
                        return {
                            Name: node.name,
                            Path: path,
                            Size: FileSystem.readFile(p)?.length || 0,
                            OpenAsTextStream: () => {
                                const content = FileSystem.readFile(p) || '';
                                let pos = 0;
                                return {
                                    ReadLine: () => {
                                        const nl = content.indexOf('\n', pos);
                                        if (nl === -1) { const line = content.substring(pos); pos = content.length; return line.replace(/\r$/, ''); }
                                        const line = content.substring(pos, nl); pos = nl + 1; return line.replace(/\r$/, '');
                                    },
                                    Read: (n) => { const chunk = content.substring(pos, pos + n); pos += n; return chunk; },
                                    ReadAll: () => content,
                                    Write: (text) => {},
                                    WriteLine: (text) => {},
                                    Close: () => {},
                                    AtEndOfStream: () => pos >= content.length
                                };
                            }
                        };
                    }
                };
            }
            if (/WScript\.Shell/i.test(progId)) {
                return {
                    Run: (cmd, style, wait) => { printFn(`[Shell] ${cmd}`); return 0; },
                    Exec: (cmd) => ({ StdOut: { ReadLine: () => '' }, ExitCode: 0 }),
                    ExpandEnvironmentStrings: (s) => s,
                    CurrentDirectory: getCwd().join('/')
                };
            }
            return {};
        }

        function resolvePathArray(p) {
            if (!p) return [...getCwd()];
            p = p.replace(/\\/g, '/');
            if (p.startsWith('/')) return p.split('/').filter(Boolean);
            return [...getCwd(), ...p.split('/').filter(Boolean)];
        }

        function expandVars(str) {
            if (str === null || str === undefined) return '';
            let s = String(str);
            s = s.replace(/\bTrue\b/gi, 'true');
            s = s.replace(/\bFalse\b/gi, 'false');
            s = s.replace(/\bNothing\b/gi, 'null');
            s = s.replace(/\bNull\b/gi, 'null');
            return s;
        }

        function valueOf(expr) {
            if (expr === null || expr === undefined) return '';
            if (typeof expr === 'boolean') return expr;
            if (typeof expr === 'number') return expr;
            if (typeof expr === 'string') return expr;
            if (Array.isArray(expr)) return expr.join(', ');
            return String(expr);
        }

        function toNum(expr) {
            const v = valueOf(expr);
            if (v === '' || v === null || v === undefined) return 0;
            const n = Number(v);
            return isNaN(n) ? 0 : n;
        }

        function toBool(expr) {
            const v = valueOf(expr);
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v !== 0;
            if (typeof v === 'string') return v.toLowerCase() === 'true';
            return !!v;
        }

        function toStr(expr) {
            return String(valueOf(expr));
        }

        function evaluate(expr) {
            if (expr === null || expr === undefined) return '';
            expr = expr.trim();
            if (expr === '') return '';

            if (/^\(.*\)$/.test(expr)) {
                return evaluate(expr.slice(1, -1));
            }

            let depth = 0;
            let lowestOp = -1;
            let lowestPrec = 999;
            let lowestAssoc = 'left';
            let inString = false;
            let stringChar = '';
            let i = 0;

            while (i < expr.length) {
                const ch = expr[i];
                if (inString) {
                    if (ch === stringChar && expr[i + 1] !== stringChar) inString = false;
                    i++;
                    continue;
                }
                if (ch === '"' || ch === "'") {
                    if (ch === '"' && expr.substring(i).match(/^&"/)) { /* VB string concat */ }
                    inString = true; stringChar = ch; i++; continue;
                }
                if (ch === '(') { depth++; i++; continue; }
                if (ch === ')') { depth--; i++; continue; }
                if (depth > 0) { i++; continue; }

                if (ch === '+' || ch === '-') {
                    const prev = expr.substring(0, i).trimEnd();
                    if (prev && /[a-zA-Z0-9_\)\"]\s*$/.test(prev)) {
                        const prec = 6;
                        if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; }
                    }
                    i++; continue;
                }
                if (ch === '*') { const prec = 7; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i++; continue; }
                if (ch === '/') { const prec = 7; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i++; continue; }
                if (ch === '\\') { const prec = 7; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i++; continue; }
                if (ch === '^') { const prec = 8; if (prec < lowestPrec || (prec === lowestPrec && lowestAssoc === 'right')) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'right'; } i++; continue; }

                if (ch === '<') {
                    if (expr[i + 1] === '>') { const prec = 4; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i += 2; continue; }
                    if (expr[i + 1] === '=') { const prec = 4; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i += 2; continue; }
                    const prec = 4; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; }
                    i++; continue;
                }
                if (ch === '>') {
                    if (expr[i + 1] === '=') { const prec = 4; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i += 2; continue; }
                    const prec = 4; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; }
                    i++; continue;
                }
                if (ch === '=' && i > 0) { const prec = 4; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i++; continue; }

                if (ch === '&') { const prec = 5; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; } i++; continue; }

                if (i + 1 < expr.length && expr.substring(i, i + 2).toLowerCase() === 'is') {
                    const before = i > 0 ? expr[i - 1] : ' ';
                    const after = expr[i + 2] || ' ';
                    const beforeOk = i === 0 || !/[a-zA-Z0-9_]/.test(before);
                    const afterOk = i + 2 >= expr.length || !/[a-zA-Z0-9_]/.test(after);
                    if (beforeOk && afterOk) {
                        const prec = 4;
                        if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; }
                        i += 2; continue;
                    }
                }

                if (i + 2 < expr.length) {
                    const word = expr.substring(i, i + 3).toLowerCase();
                    if (word === 'and') {
                        const before = i > 0 ? expr[i - 1] : ' ';
                        const after = expr[i + 3] || ' ';
                        const beforeOk = i === 0 || !/[a-zA-Z0-9_]/.test(before);
                        const afterOk = i + 3 >= expr.length || !/[a-zA-Z0-9_]/.test(after);
                        if (beforeOk && afterOk) {
                            const prec = 3; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; i += 3; continue; }
                        }
                    }
                    if (word === 'mod') {
                        const before = i > 0 ? expr[i - 1] : ' ';
                        const after = expr[i + 3] || ' ';
                        const beforeOk = i === 0 || !/[a-zA-Z0-9_]/.test(before);
                        const afterOk = i + 3 >= expr.length || !/[a-zA-Z0-9_]/.test(after);
                        if (beforeOk && afterOk) {
                            const prec = 7; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; i += 3; continue; }
                        }
                    }
                }
                if (i + 1 < expr.length) {
                    const word = expr.substring(i, i + 2).toLowerCase();
                    if (word === 'or') {
                        const before = i > 0 ? expr[i - 1] : ' ';
                        const after = expr[i + 2] || ' ';
                        const beforeOk = i === 0 || !/[a-zA-Z0-9_]/.test(before);
                        const afterOk = i + 2 >= expr.length || !/[a-zA-Z0-9_]/.test(after);
                        if (beforeOk && afterOk) {
                            const prec = 2; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; i += 2; continue; }
                        }
                    }
                }

                if (i + 2 < expr.length) {
                    const word = expr.substring(i, i + 3).toLowerCase();
                    if (word === 'not') {
                        const before = i > 0 ? expr[i - 1] : ' ';
                        const after = expr[i + 3] || ' ';
                        const beforeOk = i === 0 || !/[a-zA-Z0-9_]/.test(before);
                        const afterOk = i + 3 >= expr.length || !/[a-zA-Z0-9_]/.test(after);
                        if (beforeOk && (afterOk || after === '(')) {
                            const prec = 5; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; i += 3; continue; }
                        }
                    }
                }

                if (i + 2 < expr.length && expr.substring(i, i + 3).toLowerCase() === 'xor') {
                    const before = i > 0 ? expr[i - 1] : ' ';
                    const after = expr[i + 3] || ' ';
                    const beforeOk = i === 0 || !/[a-zA-Z0-9_]/.test(before);
                    const afterOk = i + 3 >= expr.length || !/[a-zA-Z0-9_]/.test(after);
                    if (beforeOk && afterOk) {
                        const prec = 2; if (prec <= lowestPrec) { lowestOp = i; lowestPrec = prec; lowestAssoc = 'left'; i += 3; continue; }
                    }
                }

                i++;
            }

            if (lowestOp > 0 && lowestPrec < 999) {
                const op = expr.substring(lowestOp, lowestOp + (expr[lowestOp + 1] === '>' || expr[lowestOp + 1] === '=' ? 2 : 1));
                const left = expr.substring(0, lowestOp).trim();
                const right = expr.substring(lowestOp + op.length).trim();

                if (op === '+') {
                    const l = evaluate(left);
                    const r = evaluate(right);
                    if (typeof l === 'number' || typeof r === 'number') return toNum(l) + toNum(r);
                    return toStr(l) + toStr(r);
                }
                if (op === '&') return toStr(evaluate(left)) + toStr(evaluate(right));
                if (op === '-') return toNum(evaluate(left)) - toNum(evaluate(right));
                if (op === '*') return toNum(evaluate(left)) * toNum(evaluate(right));
                if (op === '/') { const r = toNum(evaluate(right)); if (r === 0) throw new Error('Division by zero'); return toNum(evaluate(left)) / r; }
                if (op === '\\') return Math.floor(toNum(evaluate(left)) / toNum(evaluate(right)));
                if (op === '^') return Math.pow(toNum(evaluate(left)), toNum(evaluate(right)));
                if (op.toLowerCase() === 'mod') return toNum(evaluate(left)) % toNum(evaluate(right));
                if (op === '=' || op === '==') return valueOf(evaluate(left)) == valueOf(evaluate(right));
                if (op === '<>') return valueOf(evaluate(left)) != valueOf(evaluate(right));
                if (op === '<') return toNum(evaluate(left)) < toNum(evaluate(right));
                if (op === '>') return toNum(evaluate(left)) > toNum(evaluate(right));
                if (op === '<=') return toNum(evaluate(left)) <= toNum(evaluate(right));
                if (op === '>=') return toNum(evaluate(left)) >= toNum(evaluate(right));
                if (op.toLowerCase() === 'is') {
                    const l = evaluate(left);
                    const r = evaluate(right);
                    const rStr = (typeof r === 'string') ? r.toUpperCase() : '';
                    const lStr = (typeof l === 'string') ? l.toUpperCase() : '';
                    if (r === null || rStr === 'NULL' || rStr === 'NOTHING') return l === null || lStr === 'NULL' || lStr === 'NOTHING';
                    if (l === null || lStr === 'NULL' || lStr === 'NOTHING') return r === null || rStr === 'NULL' || rStr === 'NOTHING';
                    return l === r;
                }
                if (op.toLowerCase() === 'and') return toBool(evaluate(left)) && toBool(evaluate(right));
                if (op.toLowerCase() === 'or') return toBool(evaluate(left)) || toBool(evaluate(right));
                if (op.toLowerCase() === 'xor') return toBool(evaluate(left)) !== toBool(evaluate(right));
                if (op.toLowerCase() === 'not') return !toBool(evaluate(right));
            }

            if (expr.startsWith('"') && expr.endsWith('"')) return expr.slice(1, -1);
            if (expr.startsWith('"')) return expr.slice(1);

            const upper = expr.toUpperCase();

            if (upper === 'TRUE') return true;
            if (upper === 'FALSE') return false;
            if (upper === 'NOTHING' || upper === 'NULL') return null;

            if (/^\d+\.\d+$/.test(expr)) return parseFloat(expr);
            if (/^\d+$/.test(expr)) return parseInt(expr, 10);
            if (/^&H[0-9A-F]+$/i.test(expr)) return parseInt(expr.substring(2), 16);
            if (/^&O[0-7]+$/i.test(expr)) return parseInt(expr.substring(2), 8);

            if (vars.hasOwnProperty(upper)) return vars[upper];
            if (consts.hasOwnProperty(upper)) return consts[upper];

            const fnMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)?\)$/s);
            if (fnMatch) {
                const fnName = fnMatch[1].toUpperCase();
                const argStr = fnMatch[2] || '';
                const args = splitArgs(argStr).map(a => evaluate(a.trim()));

                if (functions[fnName]) {
                    return callFunction(fnName, args);
                }
                return callBuiltinFunction(fnName, args);
            }

            const propChain = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(.+)$/);
            if (propChain) {
                const objName = propChain[1].toUpperCase();
                const propExpr = propChain[2];
                const obj = vars[objName];
                if (obj && typeof obj === 'object') {
                    if (propExpr.includes('(') || propExpr.includes('.')) {
                        return evaluatePropertyChain(obj, propExpr);
                    }
                    const propName = propExpr.toUpperCase();
                    if (obj[propName] !== undefined) return obj[propName];
                    if (obj[propExpr] !== undefined) return obj[propExpr];
                }
            }

            return expr;
        }

        function evaluatePropertyChain(obj, chain) {
            let current = obj;
            const parts = chain.split('.');
            for (const part of parts) {
                const callMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)?\)$/s);
                if (callMatch) {
                    const methodName = callMatch[1];
                    const argStr = callMatch[2] || '';
                    const args = splitArgs(argStr).map(a => evaluate(a.trim()));
                    if (current && typeof current[methodName] === 'function') {
                        current = current[methodName](...args);
                    } else if (current && current[methodName.toUpperCase()] && typeof current[methodName.toUpperCase()] === 'function') {
                        current = current[methodName.toUpperCase()](...args);
                    } else if (current && current[methodName] !== undefined) {
                        current = current[methodName];
                    } else {
                        return '';
                    }
                } else {
                    const propName = part.trim();
                    if (current && current[propName] !== undefined) current = current[propName];
                    else if (current && current[propName.toUpperCase()] !== undefined) current = current[propName.toUpperCase()];
                    else return '';
                }
            }
            return current;
        }

        function splitArgs(str) {
            const args = [];
            let depth = 0;
            let current = '';
            let inStr = false;
            let strChar = '';

            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                if (inStr) {
                    if (ch === strChar && str[i + 1] !== strChar) inStr = false;
                    current += ch;
                    continue;
                }
                if (ch === '"' || ch === "'") { inStr = true; strChar = ch; current += ch; continue; }
                if (ch === '(') { depth++; current += ch; continue; }
                if (ch === ')') { depth--; current += ch; continue; }
                if (ch === ',' && depth === 0) {
                    args.push(current);
                    current = '';
                    continue;
                }
                current += ch;
            }
            if (current.trim()) args.push(current);
            return args;
        }

        function callBuiltinFunction(name, args) {
            switch (name) {
                case 'LEN': return toStr(args[0]).length;
                case 'LEFT': return toStr(args[0]).substring(0, toNum(args[1]));
                case 'RIGHT': { const s = toStr(args[0]); return s.substring(s.length - toNum(args[1])); }
                case 'MID': return toStr(args[0]).substring(toNum(args[1]) - 1, toNum(args[1]) - 1 + (args[2] !== undefined ? toNum(args[2]) : toStr(args[0]).length));
                case 'INSTR': return toStr(args[0]).indexOf(toStr(args[1])) + 1;
                case 'REPLACE': return toStr(args[0]).split(toStr(args[1])).join(toStr(args[2]));
                case 'TRIM': return toStr(args[0]).trim();
                case 'LTRIM': return toStr(args[0]).replace(/^\s+/, '');
                case 'RTRIM': return toStr(args[0]).replace(/\s+$/, '');
                case 'LCASE': return toStr(args[0]).toLowerCase();
                case 'UCASE': return toStr(args[0]).toUpperCase();
                case 'CSTR': return toStr(args[0]);
                case 'CINT': return Math.round(toNum(args[0]));
                case 'CLNG': return Math.round(toNum(args[0]));
                case 'CDBL': return toNum(args[0]);
                case 'CBOOL': return toBool(args[0]);
                case 'ABS': return Math.abs(toNum(args[0]));
                case 'INT': return Math.floor(toNum(args[0]));
                case 'FIX': return Math.trunc(toNum(args[0]));
                case 'ROUND': return Math.round(toNum(args[0]));
                case 'RND': return Math.random();
                case 'SGN': { const n = toNum(args[0]); return n > 0 ? 1 : n < 0 ? -1 : 0; }
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
                case 'FORMATDATETIME': return toStr(args[0]);
                case 'FORMATNUMBER': return toNum(args[0]).toFixed(args[1] !== undefined ? toNum(args[1]) : 0);
                case 'SPLIT': return toStr(args[0]).split(args[1] !== undefined ? toStr(args[1]) : ' ');
                case 'JOIN': return Array.isArray(args[0]) ? args[0].join(args[1] !== undefined ? toStr(args[1]) : ' ') : '';
                case 'ARRAY': return args;
                case 'LBOUND': return 0;
                case 'UBOUND': return Array.isArray(args[0]) ? args[0].length - 1 : 0;
                case 'ISNULL': return args[0] === null;
                case 'ISEMPTY': return args[0] === undefined || args[0] === null || args[0] === '';
                case 'ISNUMERIC': return !isNaN(Number(args[0]));
                case 'TYPENAME': return typeof args[0];
                case 'VARTYPE': return typeof args[0];
                case 'CHR': return String.fromCharCode(toNum(args[0]));
                case 'ASC': return toStr(args[0]).charCodeAt(0) || 0;
                case 'HEX': return toNum(args[0]).toString(16).toUpperCase();
                case 'OCT': return toNum(args[0]).toString(8).toUpperCase();
                case 'STRCOMP': return toStr(args[0]).localeCompare(toStr(args[1]));
                case 'STRING': return toStr(args[1] || args[0]).repeat(toNum(args[0] || 1));
                case 'SPACE': return ' '.repeat(toNum(args[0]));
                case 'TAB': return '\t'.repeat(toNum(args[0]));
                case 'MSGBOX': { const msg = args.map(a => valueOf(a)).join(' '); printFn(msg); return 1; }
                case 'INPUTBOX': return args[0] || '';
                case 'ENVIRON': return '';
                case 'WSCRIPT': return WScript;
                default: return '';
            }
        }

        function callFunction(name, args) {
            const fn = functions[name];
            if (!fn) return '';
            const savedVars = { ...vars };
            if (fn.params) {
                fn.params.forEach((p, i) => { vars[p.toUpperCase()] = args[i] !== undefined ? args[i] : ''; });
            }
            vars[name] = '';
            executeBlock(fn.body, fn.startLine + 1, 'function');
            const result = vars[name];
            vars = savedVars;
            return result;
        }

        function executePropertyAssign(obj, chain, value) {
            const dotIdx = chain.indexOf('.');
            if (dotIdx === -1) return;
            const methodName = chain.substring(0, dotIdx).trim();
            const rest = chain.substring(dotIdx + 1).trim();

            if (rest.includes('(') || rest.includes('.')) {
                let current = obj;
                const parts = rest.split('.');
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    const callMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)?\)$/s);
                    if (callMatch) {
                        const methodName2 = callMatch[1];
                        const argStr = callMatch[2] || '';
                        const args2 = splitArgs(argStr).map(a => evaluate(a.trim()));
                        if (current && typeof current[methodName2] === 'function') current = current[methodName2](...args2);
                        else if (current && current[methodName2.toUpperCase()] && typeof current[methodName2.toUpperCase()] === 'function') current = current[methodName2.toUpperCase()](...args2);
                        else current = current[methodName2] || current[methodName2.toUpperCase()];
                    } else {
                        const propName = part.trim();
                        current = current[propName] || current[propName.toUpperCase()];
                    }
                }
                const lastPart = parts[parts.length - 1];
                const lastCallMatch = lastPart.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)?\)$/s);
                if (lastCallMatch) {
                    const methodName2 = lastCallMatch[1];
                    const argStr = lastCallMatch[2] || '';
                    const args2 = splitArgs(argStr).map(a => evaluate(a.trim()));
                    args2.push(value);
                    if (current && typeof current[methodName2] === 'function') current[methodName2](...args2);
                    else if (current && current[methodName2.toUpperCase()] && typeof current[methodName2.toUpperCase()] === 'function') current[methodName2.toUpperCase()](...args2);
                } else {
                    const propName = lastPart.trim();
                    if (current) {
                        if (current[propName] !== undefined) current[propName] = value;
                        else if (current[propName.toUpperCase()] !== undefined) current[propName.toUpperCase()] = value;
                        else current[propName] = value;
                    }
                }
            } else {
                if (obj && typeof obj[methodName] === 'function') obj[methodName](value);
                else if (obj && obj[methodName.toUpperCase()] && typeof obj[methodName.toUpperCase()] === 'function') obj[methodName.toUpperCase()](value);
                else if (obj) obj[methodName] = value;
            }
        }

        function parseBlock(startLine, blockType) {
            let depth = 1;
            let i = startLine;
            let endLine = startLine;
            const body = [];
            while (i < lines.length && depth > 0) {
                const line = lines[i].trim();
                const upper = line.toUpperCase().replace(/\s+/g, ' ');
                if (upper.startsWith(blockType + ' ') || upper === blockType) {
                    depth++;
                } else if (upper.startsWith('end ' + blockType) || upper === 'end ' + blockType) {
                    depth--;
                    if (depth === 0) { endLine = i; break; }
                }
                body.push(i);
                i++;
            }
            return { body, endLine };
        }

        function executeBlock(body, startLine, blockType) {
            let i = 0;
            while (i < body.length && running) {
                pc = body[i];
                const line = lines[body[i]].trim();
                const result = executeLine(line);
                if (result && (result.type === 'return' || result.type === 'exit' || result.type === 'continue' || result.type === 'break')) {
                    return result;
                }
                i++;
            }
            return null;
        }

        function executeLine(raw) {
            const line = raw.trim();
            if (!line) return null;
            if (line.startsWith("'") || line.startsWith('Rem ') || line.startsWith('REM ')) return null;

            const upper = line.toUpperCase().replace(/\s+/g, ' ').trim();

            if (upper.startsWith('DIM ')) {
                const decls = line.substring(4).split(',');
                for (const d of decls) {
                    const trimmed = d.trim();
                    const arrMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.+?)\)(?:\s+As\s+(\w+))?$/i);
                    if (arrMatch) {
                        const name = arrMatch[1].toUpperCase();
                        const size = toNum(evaluate(arrMatch[2]));
                        vars[name] = new Array(size + 1).fill(null);
                    } else {
                        const varName = trimmed.replace(/\s+As\s+\w+/i, '').trim().toUpperCase();
                        vars[varName] = null;
                    }
                }
                return null;
            }

            if (upper.startsWith('CONST ')) {
                const rest = line.substring(6).trim();
                const eqIdx = rest.indexOf('=');
                if (eqIdx > -1) {
                    const name = rest.substring(0, eqIdx).trim().replace(/\s+As\s+\w+/i, '').toUpperCase();
                    const val = evaluate(rest.substring(eqIdx + 1).trim());
                    consts[name] = val;
                }
                return null;
            }

            if (upper.startsWith('REDIM ') || upper.startsWith('REDIMPRESERVE ')) {
                const isPreserve = upper.startsWith('REDIMPRESERVE ');
                const rest = line.substring(isPreserve ? 13 : 6).trim();
                const arrMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.+?)\)$/i);
                if (arrMatch) {
                    const name = arrMatch[1].toUpperCase();
                    const size = toNum(evaluate(arrMatch[2]));
                    if (isPreserve && vars[name]) {
                        const old = vars[name];
                        vars[name] = new Array(size + 1).fill(null);
                        for (let i = 0; i < Math.min(old.length, vars[name].length); i++) vars[name][i] = old[i];
                    } else {
                        vars[name] = new Array(size + 1).fill(null);
                    }
                }
                return null;
            }

            if (upper.startsWith('SET ') || upper.startsWith('SET(')) {
                let rest = line.substring(3).trim();
                const eqIdx = findEquals(rest);
                if (eqIdx > -1) {
                    const left = rest.substring(0, eqIdx).trim();
                    const right = rest.substring(eqIdx + 1).trim();
                    const val = evaluate(right);
                    const dotIdx = left.indexOf('.');
                    if (dotIdx > -1) {
                        const objName = left.substring(0, dotIdx).trim().toUpperCase();
                        const chain = left.substring(dotIdx + 1).trim();
                        const obj = vars[objName];
                        if (obj && typeof obj === 'object') {
                            executePropertyAssign(obj, chain, val);
                        }
                    } else {
                        const varName = left.toUpperCase();
                        vars[varName] = val;
                    }
                }
                return null;
            }

            if (upper.startsWith('SELECT CASE ')) {
                const expr = line.substring(12).trim();
                const val = valueOf(evaluate(expr));
                selectStack.push({ value: val, matched: false, exited: false });
                return null;
            }

            if (upper === 'CASE ELSE') {
                if (selectStack.length > 0) {
                    const ctx = selectStack[selectStack.length - 1];
                    if (!ctx.matched) ctx.matched = true;
                    else ctx.exited = true;
                }
                return null;
            }

            if (upper.startsWith('CASE ')) {
                if (selectStack.length > 0) {
                    const ctx = selectStack[selectStack.length - 1];
                    if (ctx.exited) return null;
                    if (ctx.matched) { ctx.exited = true; return null; }
                    const caseExpr = line.substring(5).trim();
                    if (caseExpr.includes('To')) {
                        const [lo, hi] = caseExpr.split('To').map(s => valueOf(evaluate(s.trim())));
                        if (valueOf(ctx.value) >= lo && valueOf(ctx.value) <= hi) ctx.matched = true;
                    } else if (caseExpr.toUpperCase().startsWith('IS ')) {
                        const op = caseExpr.substring(3).trim();
                        const upperOp = op.toUpperCase();
                        if (upperOp.startsWith('<>')) { if (valueOf(ctx.value) !== valueOf(evaluate(op.substring(2).trim()))) ctx.matched = true; }
                        else if (upperOp.startsWith('>=')) { if (toNum(ctx.value) >= toNum(evaluate(op.substring(2).trim()))) ctx.matched = true; }
                        else if (upperOp.startsWith('<=')) { if (toNum(ctx.value) <= toNum(evaluate(op.substring(2).trim()))) ctx.matched = true; }
                        else if (upperOp.startsWith('>')) { if (toNum(ctx.value) > toNum(evaluate(op.substring(1).trim()))) ctx.matched = true; }
                        else if (upperOp.startsWith('<')) { if (toNum(ctx.value) < toNum(evaluate(op.substring(1).trim()))) ctx.matched = true; }
                        else if (upperOp.startsWith('=')) { if (valueOf(ctx.value) === valueOf(evaluate(op.substring(1).trim()))) ctx.matched = true; }
                    } else {
                        const caseVals = caseExpr.split(',').map(s => valueOf(evaluate(s.trim())));
                        if (caseVals.includes(valueOf(ctx.value))) ctx.matched = true;
                    }
                }
                return null;
            }

            if (upper === 'END SELECT') {
                if (selectStack.length > 0) selectStack.pop();
                return null;
            }

            if (upper.startsWith('IF ') && (upper.includes(' THEN') || upper.endsWith(' THEN'))) {
                const thenIdx = upper.indexOf(' THEN');
                const condStr = line.substring(3, thenIdx).trim();
                const rest = line.substring(thenIdx + 5).trim();
                const cond = toBool(evaluate(condStr));

                if (rest) {
                    if (cond) {
                        const stmts = rest.split(':');
                        for (const stmt of stmts) {
                            const r = executeLine(stmt.trim());
                            if (r) return r;
                        }
                    }
                    return null;
                }

                if (!cond) {
                    skipToElseOrEndIf();
                }
                return null;
            }

            if (upper.startsWith('ELSEIF ') && upper.includes(' THEN')) {
                return null;
            }

            if (upper === 'ELSE') {
                return null;
            }

            if (upper === 'END IF') {
                return null;
            }

            if (upper.startsWith('SUB ')) {
                const nameMatch = line.match(/^Sub\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?/i);
                if (nameMatch) {
                    const name = nameMatch[1].toUpperCase();
                    const params = nameMatch[2] ? nameMatch[2].split(',').map(p => p.trim().replace(/\s+As\s+\w+/i, '').toUpperCase()) : [];
                    const { body, endLine } = parseBlock(pc + 1, 'sub');
                    subs[name] = { params, body, startLine: pc, endLine };
                    pc = endLine;
                }
                return null;
            }

            if (upper === 'END SUB') {
                return null;
            }

            if (upper.startsWith('FUNCTION ')) {
                const nameMatch = line.match(/^Function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?/i);
                if (nameMatch) {
                    const name = nameMatch[1].toUpperCase();
                    const params = nameMatch[2] ? nameMatch[2].split(',').map(p => p.trim().replace(/\s+As\s+\w+/i, '').toUpperCase()) : [];
                    const { body, endLine } = parseBlock(pc + 1, 'function');
                    functions[name] = { params, body, startLine: pc, endLine };
                    pc = endLine;
                }
                return null;
            }

            if (upper === 'END FUNCTION') {
                return null;
            }

            if (upper.startsWith('CALL ')) {
                const callExpr = line.substring(5).trim();
                const fnMatch = callExpr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?$/);
                if (fnMatch) {
                    const name = fnMatch[1].toUpperCase();
                    const argStr = fnMatch[2] || '';
                    const args = argStr ? splitArgs(argStr).map(a => evaluate(a.trim())) : [];
                    if (subs[name]) {
                        return callSub(name, args);
                    }
                    evaluate(callExpr);
                }
                return null;
            }

            if (upper.startsWith('FOR ')) {
                const forMatch = line.match(/^For\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+?)\s+To\s+(.+?)(?:\s+Step\s+(.+))?$/i);
                if (forMatch) {
                    const varName = forMatch[1].toUpperCase();
                    const from = toNum(evaluate(forMatch[2]));
                    const to = toNum(evaluate(forMatch[3]));
                    const step = forMatch[4] ? toNum(evaluate(forMatch[4])) : 1;
                    vars[varName] = from;
                    forStack.push({ varName, to, step, startPc: pc + 1, loopStartLine: pc });
                }
                return null;
            }

            if (upper.startsWith('FOR EACH ') || upper.startsWith('FOREACH ')) {
                const feMatch = line.match(/^For\s+Each\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+In\s+(.+?)$/i) || line.match(/^ForEach\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+In\s+(.+?)$/i);
                if (feMatch) {
                    const varName = feMatch[1].toUpperCase();
                    const collection = evaluate(feMatch[2]);
                    const arr = Array.isArray(collection) ? collection : [];
                    forStack.push({ varName, collection: arr, index: 0, startPc: pc + 1, isForEach: true, loopStartLine: pc });
                    if (arr.length > 0) vars[varName] = arr[0];
                    else {
                        skipToNext();
                    }
                }
                return null;
            }

            if (upper === 'NEXT') {
                if (forStack.length > 0) {
                    const ctx = forStack[forStack.length - 1];
                    if (ctx.isForEach) {
                        ctx.index++;
                        if (ctx.index < ctx.collection.length) {
                            vars[ctx.varName] = ctx.collection[ctx.index];
                            pc = ctx.startPc;
                        } else {
                            forStack.pop();
                        }
                    } else {
                        vars[ctx.varName] += ctx.step;
                        const done = ctx.step > 0 ? vars[ctx.varName] > ctx.to : vars[ctx.varName] < ctx.to;
                        if (!done) pc = ctx.startPc;
                        else forStack.pop();
                    }
                }
                return null;
            }

            if (upper.startsWith('NEXT ')) {
                return executeLine('Next');
            }

            if (upper.startsWith('DO ') || upper === 'DO') {
                const doMatch = upper.match(/^DO\s+(WHILE|UNTIL)\s+(.+)$/);
                if (doMatch) {
                    const type = doMatch[1];
                    const cond = doMatch[2].trim();
                    const condVal = type === 'WHILE' ? toBool(evaluate(cond)) : !toBool(evaluate(cond));
                    doStack.push({ type: 'do', condType: type, cond, startPc: pc + 1, condStr: cond, loopStartLine: pc });
                    if (!condVal) skipToLoopEnd();
                } else {
                    doStack.push({ type: 'do', condType: null, startPc: pc + 1, loopStartLine: pc });
                }
                return null;
            }

            if (upper.startsWith('LOOP')) {
                const loopMatch = upper.match(/^LOOP\s*(WHILE|UNTIL)?\s*(.*)?$/);
                if (doStack.length > 0) {
                    const ctx = doStack[doStack.length - 1];
                    if (loopMatch && loopMatch[1]) {
                        const loopType = loopMatch[1];
                        const cond = loopMatch[2] ? loopMatch[2].trim() : ctx.condStr;
                        const condVal = loopType === 'WHILE' ? toBool(evaluate(cond)) : !toBool(evaluate(cond));
                        if (condVal) pc = ctx.startPc;
                        else doStack.pop();
                    } else {
                        if (ctx.condType) {
                            const condVal = ctx.condType === 'WHILE' ? toBool(evaluate(ctx.condStr)) : !toBool(evaluate(ctx.condStr));
                            if (condVal) pc = ctx.startPc;
                            else doStack.pop();
                        } else {
                            pc = ctx.startPc;
                        }
                    }
                }
                return null;
            }

            if (upper.startsWith('WHILE ') || upper === 'WHILE') {
                const whileMatch = upper.match(/^WHILE\s+(.+)$/);
                if (whileMatch) {
                    const cond = whileMatch[1].trim();
                    const condVal = toBool(evaluate(cond));
                    doStack.push({ type: 'while', cond, startPc: pc + 1, condStr: cond, loopStartLine: pc });
                    if (!condVal) skipToWend();
                }
                return null;
            }

            if (upper === 'WEND') {
                if (doStack.length > 0 && doStack[doStack.length - 1].type === 'while') {
                    const ctx = doStack.pop();
                    const condVal = toBool(evaluate(ctx.condStr));
                    if (condVal) pc = ctx.startPc;
                }
                return null;
            }

            if (upper.startsWith('EXIT FOR')) {
                if (forStack.length > 0) {
                    const ctx = forStack.pop();
                    skipToNext();
                }
                return null;
            }

            if (upper.startsWith('EXIT DO')) {
                if (doStack.length > 0) {
                    doStack.pop();
                    skipToLoopEnd();
                }
                return null;
            }

            if (upper.startsWith('EXIT SUB') || upper === 'EXIT SUB') {
                return { type: 'exit' };
            }

            if (upper.startsWith('EXIT FUNCTION') || upper === 'EXIT FUNCTION') {
                return { type: 'exit' };
            }

            if (upper.startsWith('ON ERROR RESUME NEXT')) {
                errorResume = true;
                return null;
            }

            if (upper.startsWith('ON ERROR GOTO 0') || upper === 'ON ERROR GOTO 0') {
                errorResume = false;
                return null;
            }

            if (upper.startsWith('WSCRIPT.ECHO ') || upper === 'WSCRIPT.ECHO') {
                const args = splitArgs(line.substring(13).trim());
                const msg = args.map(a => valueOf(evaluate(a))).join(' ');
                printFn(msg);
                return null;
            }

            if (upper.startsWith('WSCRIPT.STDOUT.WRITELINE ') || upper === 'WSCRIPT.STDOUT.WRITELINE') {
                const arg = line.substring(25).trim();
                printFn(toStr(evaluate(arg)));
                return null;
            }

            if (upper.startsWith('WSCRIPT.STDOUT.WRITE ') || upper === 'WSCRIPT.STDOUT.WRITE') {
                const arg = line.substring(21).trim();
                printFn(toStr(evaluate(arg)));
                return null;
            }

            if (upper.startsWith('WSCRIPT.SLEEP ')) {
                return null;
            }

            if (upper === 'STOP' || upper === 'END') {
                running = false;
                stopRequested = true;
                return null;
            }

            const assignMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_.]*(?:\([^)]*\))?)\s*=\s*(.+)$/);
            if (assignMatch) {
                const left = assignMatch[1].trim();
                const right = assignMatch[2].trim();
                const val = evaluate(right);

                const dotIdx = left.indexOf('.');
                const parenIdx = left.indexOf('(');
                if (dotIdx > -1 && (parenIdx === -1 || dotIdx < parenIdx)) {
                    const objName = left.substring(0, dotIdx).trim().toUpperCase();
                    const chain = left.substring(dotIdx + 1).trim();
                    const obj = vars[objName];
                    if (obj && typeof obj === 'object') {
                        executePropertyAssign(obj, chain, val);
                    }
                } else if (parenIdx > -1) {
                    const arrMatch = left.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.+?)\)$/);
                    if (arrMatch) {
                        const arrName = arrMatch[1].toUpperCase();
                        const idx = toNum(evaluate(arrMatch[2]));
                        if (vars[arrName] && Array.isArray(vars[arrName])) {
                            vars[arrName][idx] = val;
                        }
                    }
                } else {
                    vars[left.toUpperCase()] = val;
                }
                return null;
            }

            const upperClean = upper.replace(/\s+/g, ' ').trim();

            if (upperClean.startsWith('MSGBOX ')) {
                const args = splitArgs(line.substring(7).trim());
                const msg = args.map(a => valueOf(evaluate(a))).join(' ');
                printFn(msg);
                return null;
            }

            const subCallMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?$/);
            if (subCallMatch) {
                const name = subCallMatch[1].toUpperCase();
                const argStr = subCallMatch[2] || '';
                const args = argStr ? splitArgs(argStr).map(a => evaluate(a.trim())) : [];
                if (subs[name]) return callSub(name, args);
                if (functions[name]) { callFunction(name, args); return null; }
                evaluate(line);
                return null;
            }

            try {
                evaluate(line);
            } catch (e) {
                Err.Number = 1;
                Err.Description = e.message || String(e);
                if (!errorResume) printFn('Error: ' + Err.Description);
            }

            return null;
        }

        function callSub(name, args) {
            const sub = subs[name];
            if (!sub) return null;
            const savedVars = { ...vars };
            if (sub.params) {
                sub.params.forEach((p, i) => { vars[p] = args[i] !== undefined ? args[i] : ''; });
            }
            const result = executeBlock(sub.body, sub.startLine + 1, 'sub');
            vars = savedVars;
            return result;
        }

        function skipToElseOrEndIf() {
            let depth = 1;
            let i = pc + 1;
            while (i < lines.length && depth > 0) {
                const line = lines[i].trim().toUpperCase().replace(/\s+/g, ' ');
                if (line.startsWith('IF ') && line.includes(' THEN')) depth++;
                else if (line === 'END IF') depth--;
                else if (depth === 1 && (line === 'ELSE' || line.startsWith('ELSEIF '))) {
                    pc = i - 1;
                    return;
                }
                if (depth === 0) { pc = i - 1; return; }
                i++;
            }
            pc = i - 1;
        }

        function skipToNext() {
            let depth = 1;
            let i = pc + 1;
            while (i < lines.length && depth > 0) {
                const line = lines[i].trim().toUpperCase().replace(/\s+/g, ' ');
                if (line.startsWith('FOR ') || line.startsWith('FOR EACH ') || line.startsWith('FOREACH ')) depth++;
                else if (line.startsWith('NEXT')) depth--;
                if (depth === 0) { pc = i - 1; return; }
                i++;
            }
        }

        function skipToLoopEnd() {
            let depth = 1;
            let i = pc + 1;
            while (i < lines.length && depth > 0) {
                const line = lines[i].trim().toUpperCase().replace(/\s+/g, ' ');
                if (line.startsWith('DO ') || line === 'DO') depth++;
                else if (line.startsWith('LOOP') || line === 'LOOP') depth--;
                if (depth === 0) { pc = i - 1; return; }
                i++;
            }
        }

        function skipToWend() {
            let depth = 1;
            let i = pc + 1;
            while (i < lines.length && depth > 0) {
                const line = lines[i].trim().toUpperCase().replace(/\s+/g, ' ');
                if (line.startsWith('WHILE ')) depth++;
                else if (line === 'WEND') depth--;
                if (depth === 0) { pc = i - 1; return; }
                i++;
            }
        }

        function findEquals(str) {
            let depth = 0;
            let inStr = false;
            let strChar = '';
            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                if (inStr) {
                    if (ch === strChar && str[i + 1] !== strChar) inStr = false;
                    continue;
                }
                if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
                if (ch === '(') { depth++; continue; }
                if (ch === ')') { depth--; continue; }
                if (ch === '=' && depth === 0 && i > 0) return i;
            }
            return -1;
        }

        function run(script, args) {
            lines = script.split('\n').map(l => l.replace(/\r/g, ''));
            pc = 0;
            running = true;
            errorLevel = 0;
            vars = {};
            subs = {};
            functions = {};
            consts = {};
            callStack = [];
            forStack = [];
            doStack = [];
            selectStack = [];
            errorResume = false;
            stopRequested = false;

            WScript.Arguments = { Count: args ? args.length : 0, Item: (i) => args ? args[i] || '' : '', Named: {} };
            WScript.ScriptName = 'script.vbs';

            if (args) {
                vars['WSCRIPT.ARGUMENTS'] = args;
            }

            vars['WSCRIPT'] = WScript;
            vars['WSCRIPT.SCRIPTNAME'] = 'script.vbs';
            vars['ERR'] = Err;
            vars['NOTHING'] = null;
            vars['NULL'] = null;

            const maxIter = 500000;
            let iter = 0;

            while (pc < lines.length && running && iter < maxIter) {
                iter++;
                const line = lines[pc].trim();

                const upper = line.toUpperCase().replace(/\s+/g, ' ').trim();

                if (upper === 'OPTION EXPLICIT') { pc++; continue; }

                if (upper.startsWith('SUB ') || upper.startsWith('FUNCTION ') || upper.startsWith('CLASS ')) {
                    const blockType = upper.startsWith('CLASS ') ? 'class' : upper.startsWith('SUB ') ? 'sub' : 'function';
                    const { endLine } = parseBlock(pc + 1, blockType);
                    pc = endLine + 1;
                    continue;
                }

                if (upper.startsWith('DIM ') || upper.startsWith('CONST ') || upper.startsWith('REDIM ') || upper.startsWith('REDIMPRESERVE ')) {
                    executeLine(line);
                    pc++;
                    continue;
                }

                if (upper.startsWith('CLASS ')) {
                    const { endLine } = parseBlock(pc + 1, 'class');
                    pc = endLine + 1;
                    continue;
                }

                if (upper === 'END CLASS') { pc++; continue; }

                executeLine(line);

                if (running && !stopRequested) {
                    pc++;
                }
            }

            if (iter >= maxIter) {
                printFn('VBScript exceeded maximum iterations (possible infinite loop).');
            }

            running = false;
            return errorLevel;
        }

        return { run };
    }

    return { create };
})();

export default VBEngine;
