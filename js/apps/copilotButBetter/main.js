// CopilotButBetter — ChatGPT-style AI chat powered by the user's own Gemini API key.
// Features: conversation saving, long-term memory, customizable settings page,
// liquid-glass ChatGPT-like theme. Persistence via FileSystem only.
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import Notifications from '../../modules/notifications.js';
import BatchEngine from '../../modules/batchEngine.js';

const CopilotButBetter = (() => {
    const APP_ID = 'copilotButBetter';
    const DATA_PATH = ['/', 'system', 'programs data', 'copilotButBetter'];
    const SETTINGS_FILE = 'settings.json';
    const CONVS_FILE = 'conversations.json';

    const DEFAULT_SETTINGS = {
        provider: 'gemini',
        apiKey: '',
        zenApiKey: '',
        model: '',
        systemPrompt: 'You are CopilotButBetter, a helpful, friendly AI assistant. Answer clearly and concisely with markdown formatting where useful.',
        temperature: 0.7,
        maxTokens: 2048,
        memoryEnabled: true,
        memory: [],
        accent: '#10a37f',
        glass: 0.65,
        enterToSend: true,
        agentMode: true
    };

    // Empty model field falls back per provider.
    const DEFAULT_MODEL_GEMINI = 'gemini-2.0-flash';
    const DEFAULT_MODEL_ZEN = 'gemini-3.5-flash-lite';

    const MAX_AGENT_TURNS = 8;
    const TOOL_OUTPUT_LIMIT = 6000;

    const TOOLS_DOC = `You are a hybrid agent. You can answer directly, OR use tools by ending your message with ONE inline tool call in a fenced block.

RULES:
- Put any explanation BEFORE the toolcall block. The toolcall block MUST be the very last thing in your message.
- NEVER send empty args {}. Every tool except datetime requires arguments. A call with missing args FAILS and you must retry with correct args.
- Exactly one tool call per message. After the tool runs you get another turn: its result arrives as "[TOOL RESULT status=success|failed tool=<name>] ..." — then answer the user or call another tool.
- Never invent tool output. If a tool fails, fix the args and retry.
- NEVER put your explanation / chat text into a "script" or "content" arg. "script" must contain ONLY real shell commands, "content" must contain ONLY real file text.
- Keep file work inside the per-conversation workspace (relative paths like "notes.txt"). The workspace persists until the conversation is deleted.
- Stop calling tools once you can answer. Do not call tools for plain chit-chat.

EXAMPLE — saving a file:
I'll save that for you right now.

\`\`\`toolcall
{"tool": "write", "args": {"path": "haiku.md", "content": "# Haiku\\n\\nGlass and light entwine\\nPixels dance in liquid glow\\nDigital sunrise"}}
\`\`\`

EXAMPLE — reading a file:
Let me read that file.

\`\`\`toolcall
{"tool": "read", "args": {"path": "haiku.md"}}
\`\`\`

EXAMPLE — running a command:
Let me check the date.

\`\`\`toolcall
{"tool": "cmd", "args": {"script": "echo %DATE% %TIME%"}}
\`\`\`

Available tools:
- datetime {} — current date/time. No args needed.
- powershell {"script": "..."} — run PowerShell script, workspace-rooted. Supports Get-Date, echo, ls, cat, type, mkdir, rm, etc. Falls through to CMD engine.
- cmd {"script": "..."} — run CMD/batch, workspace-rooted.
- write {"path": "file.md", "content": "full text here"} — save a file. BOTH path AND content are required.
- read {"path": "file.md", "offset": 0, "limit": 200} — read a file. path is required. offset/limit are optional.
- edit {"path": "file.md", "oldText": "...", "newText": "..."} — find and replace in a file. ALL three required.
- grep {"pattern": "TODO", "path": "", "include": ""} — regex search. pattern is required.
- websearch {"query": "...", "count": 5} — DuckDuckGo search.
- webfetch {"url": "https://..."} — fetch and strip a URL.
- analyze {"path": "file.png"} — inspect a file (text preview or image bytes). path is required.`;

    function truncateOut(s, limit) {
        const t = String(s == null ? '' : s);
        if (t.length <= (limit || TOOL_OUTPUT_LIMIT)) return t;
        return t.slice(0, (limit || TOOL_OUTPUT_LIMIT)) + `\n…[truncated ${(t.length - (limit || TOOL_OUTPUT_LIMIT))} chars]`;
    }

    const SUGGESTIONS = [
        { title: 'Write', desc: 'a haiku about glass and light' },
        { title: 'Explain', desc: 'quantum computing in simple terms' },
        { title: 'Plan', desc: 'a productive morning routine' },
        { title: 'Debug', desc: 'this JavaScript snippet for me' }
    ];

    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_PATH)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], APP_ID);
        }
    }

    function readJson(name, fallback) {
        try {
            ensureDataDir();
            const raw = FileSystem.readFile([...DATA_PATH, name]);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    function writeJson(name, value) {
        ensureDataDir();
        const json = JSON.stringify(value);
        const p = [...DATA_PATH, name];
        if (FileSystem.itemExists(p)) FileSystem.writeFile(p, json);
        else FileSystem.createFile(DATA_PATH, name, json, 'json');
    }

    function loadSettings() {
        const s = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
        // Migrate the old dropdown+custom setup to the single manual field.
        if (!s.model && s.customModel) s.model = s.customModel;
        delete s.customModel;
        if (s.provider !== 'zen') s.provider = 'gemini';
        return s;
    }

    function saveSettings(s) {
        writeJson(SETTINGS_FILE, s);
    }

    function loadConvs() {
        const c = readJson(CONVS_FILE, []);
        return Array.isArray(c) ? c : [];
    }

    function saveConvs(c) {
        writeJson(CONVS_FILE, c);
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Tiny markdown renderer: code blocks, inline code, bold, italic, headings, lists, links.
    function renderMarkdown(src) {
        let text = String(src || '');
        const blocks = [];
        text = text.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (m, lang, code) => {
            blocks.push({ lang: lang || 'code', code: code.replace(/\n$/, '') });
            return `\u0000BLOCK${blocks.length - 1}\u0000`;
        });
        let html = esc(text);
        html = html
            .replace(/^### (.*)$/gm, '<div class="cbb-h3">$1</div>')
            .replace(/^## (.*)$/gm, '<div class="cbb-h2">$1</div>')
            .replace(/^# (.*)$/gm, '<div class="cbb-h1">$1</div>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
            .replace(/`([^`\n]+)`/g, '<code class="cbb-inline">$1</code>')
            .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/^(?:-|\*) (.+)$/gm, '<div class="cbb-li"><span class="cbb-dot"></span><span>$1</span></div>')
            .replace(/^\d+\. (.+)$/gm, '<div class="cbb-li cbb-num"><span>$1</span></div>');
        html = html.replace(/\n{2,}/g, '<div style="height:8px"></div>').replace(/\n/g, '<br>');
        html = html.replace(/\u0000BLOCK(\d+)\u0000/g, (m, i) => {
            const b = blocks[parseInt(i, 10)];
            return `<div class="cbb-code"><div class="cbb-code-head"><span>${esc(b.lang)}</span>` +
                `<button class="cbb-copy" data-code="${esc(b.code).replace(/&#10;/g, '&#10;')}">Copy</button></div>` +
                `<pre>${esc(b.code)}</pre></div>`;
        });
        return html;
    }

    function effectiveModel(s) {
        const manual = (s.model || '').trim();
        if (manual) return manual;
        return (s.provider === 'zen' ? DEFAULT_MODEL_ZEN : DEFAULT_MODEL_GEMINI);
    }

    function isZen(s) {
        return (s.provider || 'gemini') === 'zen';
    }

    // Zen model ids may carry the opencode/ config prefix — endpoints take it bare.
    function zenModelId(s) {
        return effectiveModel(s).replace(/^opencode\//i, '').trim() || DEFAULT_MODEL_ZEN;
    }

    // ---------- agent workspaces (per-conversation temp dirs) ----------
    function workspacePath(convId) {
        return [...DATA_PATH, 'workspaces', String(convId)];
    }
    function ensureWorkspace(convId) {
        try {
            ensureDataDir();
            if (!FileSystem.itemExists([...DATA_PATH, 'workspaces'])) {
                FileSystem.createFolder(DATA_PATH, 'workspaces');
            }
            const ws = workspacePath(convId);
            if (!FileSystem.itemExists(ws)) {
                FileSystem.createFolder([...DATA_PATH, 'workspaces'], String(convId));
            }
        } catch (e) { /* best effort */ }
        return workspacePath(convId);
    }
    function deleteWorkspace(convId) {
        try {
            const ws = workspacePath(convId);
            if (FileSystem.itemExists(ws)) {
                if (FileSystem.permanentDelete) FileSystem.permanentDelete(ws);
                else FileSystem.deleteItem(ws);
            }
        } catch (e) { /* noop */ }
    }
    function resolveWorkspacePath(ws, rel) {
        const parts = String(rel || '').split('/').filter(Boolean);
        const clean = [];
        for (const p of parts) {
            if (p === '.') continue;
            if (p === '..') { clean.pop(); continue; }
            clean.push(p);
        }
        return [...ws, ...clean];
    }
    function ensureWorkspaceParents(ws, rel) {
        const parts = String(rel || '').split('/').filter(Boolean).filter(p => p !== '.' && p !== '..');
        parts.pop();
        let cur = [...ws];
        for (const p of parts) {
            if (!FileSystem.itemExists([...cur, p])) FileSystem.createFolder(cur, p);
            cur = [...cur, p];
        }
    }
    function walkWorkspaceFiles(ws, base) {
        const out = [];
        const dir = base && base.length ? [...ws, ...base] : [...ws];
        let children = [];
        try { children = FileSystem.getChildren(dir); } catch (e) { children = []; }
        for (const ch of children) {
            const rel = [...(base || []), ch.name].join('/');
            if (ch.type === 'folder') out.push(...walkWorkspaceFiles(ws, [...(base || []), ch.name]));
            else out.push(rel);
        }
        return out;
    }

    // ---------- toolcall parsing ----------
    function parseToolCall(text) {
        const src = String(text || '');
        const fence = src.match(/```toolcall\s*([\s\S]*?)```\s*$/i);
        const tag = !fence && src.match(/<toolcall>\s*([\s\S]*?)\s*<\/toolcall>\s*$/i);
        const raw = (fence && fence[1]) || (tag && tag[1]) || null;
        if (!raw) return null;
        try {
            const obj = JSON.parse(raw.trim());
            if (!obj || typeof obj.tool !== 'string') return null;
            return { tool: obj.tool.toLowerCase(), args: (obj.args && typeof obj.args === 'object') ? obj.args : {} };
        } catch (e) {
            return { parseError: String(e && e.message || e), raw: raw.trim() };
        }
    }
    function stripToolCall(text) {
        return String(text || '')
            .replace(/```toolcall\s*[\s\S]*?```\s*$/i, '')
            .replace(/<toolcall>\s*[\s\S]*?\s*<\/toolcall>\s*$/i, '')
            .trim();
    }

    // ---------- shell runners (built-in engines, workspace-rooted) ----------
    function runBatchCapture(script, ws) {
        const lines = [];
        let cwd = [...ws];
        const print = (t) => { lines.push(String(t == null ? '' : t)); };
        const getCwd = () => [...cwd];
        const setCwd = (next) => { if (Array.isArray(next) && next.length) cwd = [...next]; };
        try {
            const engine = BatchEngine.create(print, getCwd, setCwd);
            engine.run(String(script || ''));
        } catch (e) {
            lines.push(`[engine error] ${e && e.message || e}`);
        }
        return truncateOut(lines.join('\n') || '(no output)');
    }
    function runPowerShellCapture(script, ws) {
        // Minimal PowerShell emulation: native cmdlets + $vars, everything
        // else falls through to the built-in CMD-compatible engine.
        const out = [];
        const vars = Object.create(null);
        const expand = (s) => String(s).replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, n) => (vars[n] != null ? vars[n] : m));
        const unquote = (s) => {
            const t = String(s || '').trim();
            if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
            return t;
        };
        const listDir = (rel) => {
            const dir = rel ? resolveWorkspacePath(ws, expand(rel)) : [...ws];
            let children = [];
            try { children = FileSystem.getChildren(dir); } catch (e) { children = []; }
            if (!children.length) return '(empty)';
            return children.map(c => (c.type === 'folder' ? c.name + '/' : c.name)).join('\n');
        };
        const passthrough = [];
        const flushPassthrough = () => {
            if (!passthrough.length) return;
            out.push(runBatchCapture(passthrough.join('\n'), ws));
            passthrough.length = 0;
        };
        const lines = String(script || '').split(/\r?\n/);
        for (let rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            let m;
            if ((m = line.match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/))) {
                vars[m[1]] = unquote(expand(m[2]));
                continue;
            }
            if (/^Get-Date/i.test(line)) {
                const d = new Date();
                const extra = line.replace(/^Get-Date/i, '').trim();
                out.push(extra ? d.toISOString() : `${d.toString()} | ${d.toISOString()}`);
                continue;
            }
            if ((m = line.match(/^(Write-Output|Write-Host|echo)\b\s*(.*)$/i))) {
                out.push(unquote(expand(m[2])));
                continue;
            }
            if (/^(Get-Location|pwd)\b/i.test(line)) { out.push('/' + ws.slice(1).join('/')); continue; }
            if ((m = line.match(/^(Get-ChildItem|ls|dir)\b\s*(.*)$/i))) { out.push(listDir(unquote(expand(m[2])))); continue; }
            if ((m = line.match(/^(Get-Content|cat|type)\b\s+(.+)$/i))) {
                const p = resolveWorkspacePath(ws, unquote(expand(m[2])));
                const content = FileSystem.readFile(p);
                out.push(content == null ? `Get-Content: cannot find path '${m[2]}'` : content);
                continue;
            }
            if ((m = line.match(/^Set-Content\b\s+(.+)$/i))) {
                const parts = m[1].trim().match(/^(.*?)\s+-Value\s+(.+)$/i) || m[1].trim().match(/^(.*?)\s+(.+)$/);
                if (parts) {
                    const p = unquote(expand(parts[1]));
                    const val = unquote(expand(parts[2]));
                    ensureWorkspaceParents(ws, p);
                    const full = resolveWorkspacePath(ws, p);
                    const name = full[full.length - 1];
                    if (FileSystem.itemExists(full)) FileSystem.writeFile(full, val);
                    else FileSystem.createFile(full.slice(0, -1), name, val, name.includes('.') ? name.split('.').pop() : '');
                    out.push(`Wrote ${p}`);
                } else out.push('Set-Content: usage: Set-Content <path> [-Value] <text>');
                continue;
            }
            if ((m = line.match(/^New-Item\b\s*(.*)$/i))) {
                const rest = expand(m[1]);
                const pm = rest.match(/-Path\s+("[^"]+"|'[^']+'|\S+)/i);
                const tm = rest.match(/-ItemType\s+(\S+)/i);
                const target = pm ? unquote(pm[1]) : rest.trim();
                if (!target) { out.push('New-Item: missing -Path'); continue; }
                const isDir = tm ? /dir/i.test(tm[1]) : /\/$/.test(target);
                ensureWorkspaceParents(ws, target);
                const full = resolveWorkspacePath(ws, target);
                const name = full[full.length - 1];
                if (isDir) {
                    out.push(FileSystem.createFolder(full.slice(0, -1), name) ? `Created directory ${target}` : `New-Item: already exists '${target}'`);
                } else {
                    out.push(FileSystem.createFile(full.slice(0, -1), name, '', name.includes('.') ? name.split('.').pop() : '') ? `Created file ${target}` : `New-Item: already exists '${target}'`);
                }
                continue;
            }
            if ((m = line.match(/^(Remove-Item|rm|del)\b\s+(.+)$/i))) {
                const p = resolveWorkspacePath(ws, unquote(expand(m[2])));
                if (!FileSystem.itemExists(p)) out.push(`Remove-Item: cannot find path '${m[2]}'`);
                else { try { FileSystem.deleteItem(p); out.push(`Removed ${m[2]}`); } catch (e) { out.push(`Remove-Item failed: ${e && e.message || e}`); } }
                continue;
            }
            if (/^(Clear-Host|cls)\b/i.test(line)) { out.push('(screen cleared)'); continue; }
            passthrough.push(rawLine);
        }
        flushPassthrough();
        return truncateOut(out.join('\n') || '(no output)');
    }

    // ---------- tool executors ----------
    async function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            try {
                const fr = new FileReader();
                fr.onload = () => {
                    const s = String(fr.result || '');
                    const i = s.indexOf(',');
                    resolve(i >= 0 ? s.slice(i + 1) : s);
                };
                fr.onerror = () => reject(new Error('Failed to read blob'));
                fr.readAsDataURL(blob);
            } catch (e) { reject(e); }
        });
    }
    async function imageDimensions(blob) {
        try {
            if (typeof createImageBitmap === 'function') {
                const bmp = await createImageBitmap(blob);
                const w = bmp.width, h = bmp.height;
                if (bmp.close) bmp.close();
                return { w, h };
            }
        } catch (e) { /* fall through */ }
        return new Promise((resolve) => {
            try {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
                img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
                img.src = url;
            } catch (e) { resolve({ w: 0, h: 0 }); }
        });
    }

    async function executeTool(convId, tool, args) {
        const ws = ensureWorkspace(convId);
        const a = args || {};
        // Strict arg validation: NEVER silently substitute chat text for missing
        // args. An empty {} must fail loudly so the model retries with real args
        // instead of executing its own explanation as a shell command.
        try {
            switch (tool) {
                case 'datetime': {
                    const d = new Date();
                    return { ok: true, output: `ISO: ${d.toISOString()}\nLocal: ${d.toString()}\nTimezone offset (min): ${d.getTimezoneOffset()}`, images: [] };
                }
                case 'powershell': {
                    const script = a.script != null ? a.script : a.command;
                    if (!script || !String(script).trim()) return { ok: false, output: 'powershell: missing required "script" argument. Retry with {"tool":"powershell","args":{"script":"<real PowerShell commands>"}}. Example: {"tool":"powershell","args":{"script":"Get-ChildItem"}}. Never send {} and never put chat text in "script".', images: [] };
                    return { ok: true, output: runPowerShellCapture(String(script), ws), images: [] };
                }
                case 'cmd': {
                    const script = a.script != null ? a.script : a.command;
                    if (!script || !String(script).trim()) return { ok: false, output: 'cmd: missing required "script" argument. Retry with {"tool":"cmd","args":{"script":"<real CMD commands>"}}. Never send {} and never put chat text in "script".', images: [] };
                    return { ok: true, output: runBatchCapture(String(script), ws), images: [] };
                }
                case 'write': {
                    if (!a.path || !String(a.path).trim()) return { ok: false, output: 'write: missing required "path". Retry with {"tool":"write","args":{"path":"notes.txt","content":"<full file text>"}}. Never send {}.', images: [] };
                    if (a.content == null || !String(a.content)) return { ok: false, output: `write: missing required "content" for '${a.path}'. Retry with the FULL file text in "content". Never send {} and never substitute chat text.`, images: [] };
                    const rel = String(a.path).replace(/^\/+/, '');
                    const content = String(a.content);
                    ensureWorkspaceParents(ws, rel);
                    const full = resolveWorkspacePath(ws, rel);
                    const name = full[full.length - 1];
                    const ext = name.includes('.') ? name.split('.').pop() : '';
                    if (FileSystem.itemExists(full)) {
                        const node = FileSystem.getNode(full);
                        if (node && node.type === 'folder') return { ok: false, output: `write: '${rel}' is a directory.`, images: [] };
                        FileSystem.writeFile(full, content);
                    } else {
                        if (!FileSystem.createFile(full.slice(0, -1), name, content, ext)) return { ok: false, output: `write: could not create '${rel}'.`, images: [] };
                    }
                    return { ok: true, output: `Wrote ${content.length} chars to ${rel}`, images: [] };
                }
                case 'read': {
                    if (!a.path || !String(a.path).trim()) return { ok: false, output: 'read: missing required "path". Retry with {"tool":"read","args":{"path":"notes.txt"}}. Never send {}.', images: [] };
                    const rel = String(a.path).replace(/^\/+/, '');
                    const full = resolveWorkspacePath(ws, rel);
                    const node = FileSystem.getNode(full);
                    if (!node) return { ok: false, output: `read: no such file '${rel}'. Workspace files: ${(walkWorkspaceFiles(ws).slice(0, 20).join(', ') || '(empty)')}`, images: [] };
                    if (node.type === 'folder') {
                        const files = walkWorkspaceFiles(ws, rel === '.' ? [] : rel.split('/'));
                        return { ok: true, output: `Workspace files${rel !== '.' ? ' in ' + rel : ''} (${files.length}):\n` + (files.slice(0, 50).join('\n') || '(empty)'), images: [] };
                    }
                    if (node.blobRef) return { ok: false, output: `read: '${rel}' is binary (${node.size || 0} bytes). Use analyze instead.`, images: [] };
                    const raw = FileSystem.readFile(full);
                    if (raw == null) return { ok: false, output: `read: could not read '${rel}'.`, images: [] };
                    const offset = Math.max(0, parseInt(a.offset, 10) || 0);
                    const limit = Math.min(500, Math.max(1, parseInt(a.limit, 10) || 200));
                    const lines = String(raw).split('\n');
                    const slice = lines.slice(offset, offset + limit);
                    return { ok: true, output: `File ${rel} (${lines.length} lines, showing ${offset}-${offset + slice.length - 1}):\n` + slice.join('\n'), images: [] };
                }
                case 'edit': {
                    if (!a.path || !String(a.path).trim()) return { ok: false, output: 'edit: missing required "path". Retry with {"tool":"edit","args":{"path":"notes.txt","oldText":"...","newText":"..."}}. Never send {}.', images: [] };
                    if (a.oldText == null || a.newText == null || !String(a.oldText)) return { ok: false, output: 'edit: need non-empty "oldText" and "newText". Retry with all three args. Never send {}.', images: [] };
                    const rel = String(a.path).replace(/^\/+/, '');
                    const full = resolveWorkspacePath(ws, rel);
                    const raw = FileSystem.readFile(full);
                    if (raw == null) return { ok: false, output: `edit: no such text file '${rel}'.`, images: [] };
                    const idx = String(raw).indexOf(String(a.oldText));
                    if (idx < 0) return { ok: false, output: `edit: oldText not found in '${rel}'.`, images: [] };
                    const next = String(raw).slice(0, idx) + String(a.newText) + String(raw).slice(idx + String(a.oldText).length);
                    FileSystem.writeFile(full, next);
                    const before = String(raw).slice(Math.max(0, idx - 60), idx + String(a.oldText).length + 60).replace(/\n/g, '\\n');
                    const after = String(next).slice(Math.max(0, idx - 60), idx + String(a.newText).length + 60).replace(/\n/g, '\\n');
                    return { ok: true, output: `Edited ${rel} at char ${idx}.\n- before: ...${before}...\n+ after:  ...${after}...`, images: [] };
                }
                case 'grep': {
                    if (!a.pattern || !String(a.pattern).trim()) return { ok: false, output: 'grep: missing required "pattern". Retry with {"tool":"grep","args":{"pattern":"TODO"}}. Never send {}.', images: [] };
                    let re;
                    try { re = new RegExp(String(a.pattern), 'i'); } catch (e) { return { ok: false, output: `grep: invalid regex: ${e.message}`, images: [] }; }
                    const scope = a.path ? String(a.path).replace(/^\/+/, '') : '';
                    const incRe = a.include ? new RegExp(String(a.include)) : null;
                    const files = walkWorkspaceFiles(ws).filter(f => (!scope || f === scope || f.startsWith(scope.replace(/\/$/, '') + '/')) && (!incRe || incRe.test(f)));
                    const hits = [];
                    for (const f of files.slice(0, 200)) {
                        const raw = FileSystem.readFile(resolveWorkspacePath(ws, f));
                        if (raw == null || typeof raw !== 'string') continue;
                        if (raw.length > 200000) continue;
                        const lines = raw.split('\n');
                        for (let i = 0; i < lines.length && hits.length < 100; i++) {
                            if (re.test(lines[i])) hits.push(`${f}:${i}: ${lines[i].slice(0, 220)}`);
                        }
                        if (hits.length >= 100) break;
                    }
                    return { ok: true, output: hits.length ? `Matches (${hits.length}):\n` + hits.join('\n') : `No matches for /${a.pattern}/ in ${scope || 'workspace'} (${files.length} files searched).`, images: [] };
                }
                case 'websearch': {
                    if (!a.query || !String(a.query).trim()) return { ok: false, output: 'websearch: missing required "query". Retry with {"tool":"websearch","args":{"query":"..."}}. Never send {}.', images: [] };
                    const count = Math.min(10, Math.max(1, parseInt(a.count, 10) || 5));
                    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(String(a.query))}&format=json&no_html=1&skip_disambig=1`;
                    let data = null;
                    try {
                        const res = await fetch(url);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        data = await res.json();
                    } catch (e) {
                        return { ok: false, output: `websearch failed: ${e.message}. (Browser may block cross-origin search; try webfetch on a specific URL.)`, images: [] };
                    }
                    const lines = [];
                    if (data.AbstractText) lines.push(`Summary: ${data.AbstractText}${data.AbstractURL ? ` (${data.AbstractURL})` : ''}`);
                    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics.flatMap(t => t.Topics ? t.Topics : [t]) : [];
                    for (const t of topics.slice(0, count)) {
                        if (t && t.Text) lines.push(`- ${t.Text}${t.FirstURL ? ` [${t.FirstURL}]` : ''}`);
                    }
                    if (Array.isArray(data.Results)) {
                        for (const r of data.Results.slice(0, count)) {
                            if (r && r.Text) lines.push(`- ${r.Text}${r.FirstURL ? ` [${r.FirstURL}]` : ''}`);
                        }
                    }
                    if (!lines.length) lines.push('No instant-answer results. Try webfetch on a targeted URL.');
                    return { ok: true, output: `DuckDuckGo results for "${a.query}":\n` + truncateOut(lines.join('\n'), 5000), images: [] };
                }
                case 'webfetch': {
                    if (!a.url || !String(a.url).trim()) return { ok: false, output: 'webfetch: missing required "url". Retry with {"tool":"webfetch","args":{"url":"https://..."}}. Never send {}.', images: [] };
                    let urlStr = String(a.url).trim();
                    if (!/^https?:\/\//i.test(urlStr)) urlStr = 'https://' + urlStr;
                    let html = '';
                    try {
                        const res = await fetch(urlStr);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        html = await res.text();
                    } catch (e) {
                        return { ok: false, output: `webfetch failed for ${urlStr}: ${e.message}`, images: [] };
                    }
                    let base = urlStr;
                    try { base = new URL(urlStr).origin; } catch (e) { /* noop */ }
                    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
                    const links = [];
                    html = html.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => {
                        const clean = String(txt).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || href;
                        let abs = href;
                        try { abs = new URL(href, base).href; } catch (e) { /* keep */ }
                        links.push(`- [${clean}](${abs})`);
                        return ` ${clean} `;
                    });
                    const blocks = [];
                    const re = /<(h1|h2|h3|h4|p|li|blockquote|pre|code|td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
                    let m2;
                    while ((m2 = re.exec(html)) && blocks.length < 300) {
                        const t = m2[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        if (t) blocks.push(t);
                    }
                    let text = blocks.join('\n');
                    if (!text.trim()) text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    text = truncateOut(text, 8000);
                    const linkSection = links.length ? '\n\nLinks:\n' + truncateOut(links.slice(0, 40).join('\n'), 2000) : '';
                    return { ok: true, output: `Fetched ${urlStr}:\n${text}${linkSection}`, images: [] };
                }
                case 'analyze': {
                    if (!a.path || !String(a.path).trim()) return { ok: false, output: 'analyze: missing required "path". Retry with {"tool":"analyze","args":{"path":"file.png"}}. Workspace files: ' + (walkWorkspaceFiles(ws).slice(0, 30).join(', ') || '(empty)') + '. Never send {}.', images: [] };
                    const rel = String(a.path).replace(/^\/+/, '');
                    const full = resolveWorkspacePath(ws, rel);
                    const node = FileSystem.getNode(full);
                    if (!node) return { ok: false, output: `analyze: no such file '${rel}'.`, images: [] };
                    if (node.type === 'folder') return { ok: false, output: `analyze: '${rel}' is a folder.`, images: [] };
                    if (node.blobRef) {
                        let blob = null;
                        try { blob = await FileSystem.readFileBlob(full); } catch (e) { blob = null; }
                        if (!blob) return { ok: false, output: `analyze: could not load binary '${rel}'.`, images: [] };
                        const mime = blob.type || 'application/octet-stream';
                        if (mime.startsWith('image/')) {
                            const dim = await imageDimensions(blob);
                            const b64 = await blobToBase64(blob);
                            const limit = Math.min(4000000, Math.max(100000, parseInt(a.limit, 10) || 1500000));
                            return { ok: true, output: `Image ${rel}: type=${mime}, size=${blob.size} bytes, dimensions=${dim.w}x${dim.h}. Image bytes attached for vision-capable models.`, images: [{ mime, data: b64.slice(0, limit) }] };
                        }
                        if (mime.startsWith('text/') || /json|javascript|xml|csv/.test(mime)) {
                            const txt = await blob.text().catch(() => '');
                            return { ok: true, output: `Text blob ${rel} (${blob.size} bytes):\n` + truncateOut(txt, parseInt(a.limit, 10) || 4000), images: [] };
                        }
                        return { ok: true, output: `Binary ${rel}: type=${mime}, size=${blob.size} bytes. No preview available.`, images: [] };
                    }
                    const raw = FileSystem.readFile(full);
                    if (raw == null) return { ok: false, output: `analyze: could not read '${rel}'.`, images: [] };
                    const txt = String(raw);
                    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(rel) && txt.startsWith('data:image/')) {
                        const mm = txt.match(/^data:(image\/[^;]+);base64,(.*)$/);
                        if (mm) return { ok: true, output: `Embedded image ${rel} (${txt.length} chars). Image bytes attached for vision-capable models.`, images: [{ mime: mm[1], data: mm[2].slice(0, 1500000) }] };
                    }
                    return { ok: true, output: `File ${rel} (${txt.length} chars, ${txt.split('\n').length} lines):\n` + truncateOut(txt, parseInt(a.limit, 10) || 4000), images: [] };
                }
                default:
                    return { ok: false, output: `Unknown tool "${tool}". Available: datetime, powershell, cmd, write, read, edit, grep, websearch, webfetch, analyze.`, images: [] };
            }
        } catch (e) {
            return { ok: false, output: `Tool ${tool} crashed: ${e && e.message || e}`, images: [] };
        }
    }

    function buildPrompt(settings) {
        const memBlock = (settings.memoryEnabled && settings.memory.length)
            ? `\n\n[Long-term memory about the user — use it to personalize replies]:\n- ${settings.memory.join('\n- ')}`
            : '';
        const agentBlock = settings.agentMode === false ? '' : `\n\n${TOOLS_DOC}`;
        return (settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt) + memBlock + agentBlock;
    }

    function historyForGemini(messages) {
        return messages
            .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
            .map(m => {
                const role = m.role === 'assistant' ? 'model' : 'user';
                const parts = [{ text: String(m.content == null ? '' : m.content) }];
                if (Array.isArray(m.images)) {
                    for (const img of m.images) {
                        if (img && img.data) parts.push({ inline_data: { mime_type: img.mime || 'image/png', data: img.data } });
                    }
                }
                return { role, parts };
            });
    }

    async function postGeminiProtocol(url, extraHeaders, settings, messages) {
        const sysText = buildPrompt(settings);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: sysText }] },
                contents: historyForGemini(messages),
                generationConfig: {
                    temperature: Number(settings.temperature) || 0.7,
                    maxOutputTokens: Math.max(1, parseInt(settings.maxTokens, 10) || 2048)
                }
            })
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* fall through */ }
        if (!res.ok) {
            const msg = (data && data.error && data.error.message) ? data.error.message : `HTTP ${res.status}`;
            throw new Error(msg);
        }
        const parts = data && data.candidates && data.candidates[0] &&
            data.candidates[0].content && data.candidates[0].content.parts;
        const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '';
        if (!text.trim()) throw new Error('Empty response from the model. Try a different model or prompt.');
        return text;
    }

    async function callGemini(settings, messages) {
        const key = (settings.apiKey || '').trim();
        if (!key) throw new Error('No API key set. Open Settings and paste your Gemini API key.');
        const model = effectiveModel(settings);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
        return postGeminiProtocol(url, null, settings, messages);
    }

    // OpenCode Zen: gemini-* ids speak the Gemini protocol on a per-model
    // endpoint; every other family goes through OpenAI-compatible chat.
    async function callZen(settings, messages) {
        const key = (settings.zenApiKey || '').trim();
        if (!key) throw new Error('No Zen API key set. Open Settings and paste your OpenCode Zen API key.');
        const id = zenModelId(settings);
        if (/^gemini/i.test(id)) {
            const url = `https://opencode.ai/zen/v1/models/${encodeURIComponent(id)}`;
            return postGeminiProtocol(url, {
                'Authorization': `Bearer ${key}`,
                'x-goog-api-key': key
            }, settings, messages);
        }
        const sysText = buildPrompt(settings);
        const msgs = [{ role: 'system', content: sysText }];
        for (const m of messages) {
            if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') continue;
            const role = m.role === 'assistant' ? 'assistant' : 'user';
            const text = String(m.content == null ? '' : m.content);
            if (Array.isArray(m.images) && m.images.length) {
                const parts = [{ type: 'text', text }];
                for (const img of m.images) {
                    if (img && img.data) parts.push({
                        type: 'image_url',
                        image_url: { url: `data:${img.mime || 'image/png'};base64,${img.data}` }
                    });
                }
                msgs.push({ role, content: parts });
            } else {
                msgs.push({ role, content: text });
            }
        }
        const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: id,
                messages: msgs,
                temperature: Number(settings.temperature) || 0.7,
                max_tokens: Math.max(1, parseInt(settings.maxTokens, 10) || 2048)
            })
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* fall through */ }
        if (!res.ok) {
            const err = data && data.error;
            const msg = (err && (err.message || (typeof err === 'string' ? err : null))) || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        const content = data && data.choices && data.choices[0] && data.choices[0].message &&
            data.choices[0].message.content;
        const text = Array.isArray(content)
            ? content.map(p => (p && (p.text || p.content)) || '').join('')
            : String(content == null ? '' : content);
        if (!text.trim()) throw new Error('Empty response from the model. Try a different model or prompt.');
        return text;
    }

    async function callModel(settings, messages) {
        return isZen(settings) ? callZen(settings, messages) : callGemini(settings, messages);
    }

    function css() {
        return `
        <style>
        .cbb-root{--acc:#10a37f;--glass:0.65;--mx:70%;--my:12%;display:flex;height:100%;background:#212121;color:#ececec;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;}
        .cbb-side{width:264px;flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 40%,rgba(0,0,0,.25)),rgba(23,23,23,.78);backdrop-filter:blur(22px) saturate(170%);-webkit-backdrop-filter:blur(22px) saturate(170%);border-right:1px solid rgba(255,255,255,.12);position:relative;z-index:2;transition:width .2s ease, opacity .2s ease, transform .2s ease;overflow:hidden;}
        .cbb-side.collapsed{width:0;min-width:0;border-right:none;opacity:0;}
        .cbb-side::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.14),transparent 22%);}
        .cbb-brand{display:flex;align-items:center;gap:10px;padding:14px 14px 8px;}
        .cbb-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.45),inset 0 1px 1px rgba(255,255,255,.45);font-size:17px;color:#fff;animation:cbb-breathe 4s ease-in-out infinite;}
        @keyframes cbb-breathe{0%,100%{box-shadow:0 4px 16px rgba(0,0,0,.45),inset 0 1px 1px rgba(255,255,255,.45);}50%{box-shadow:0 4px 26px rgba(255,255,255,.22),inset 0 1px 1px rgba(255,255,255,.55);}}
        .cbb-brand b{font-size:13.5px;letter-spacing:.2px;}
        .cbb-brand small{display:block;color:#b4b4b4;font-size:11px;font-weight:400;}
        .cbb-new{margin:6px 12px 4px;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);cursor:pointer;color:#fff;font-weight:600;font-size:13px;background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.06));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 6px 18px rgba(0,0,0,.35);transition:.15s;}
        .cbb-new:hover{border-color:var(--acc);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 0 0 1px var(--acc),0 8px 22px rgba(0,0,0,.4);}
        .cbb-search{margin:6px 12px;padding:0 10px;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;}
        .cbb-search input{flex:1;background:transparent;border:none;outline:none;color:#ececec;font-size:12.5px;padding:8px 0;}
        .cbb-search input::placeholder{color:#8e8e8e;}
        .cbb-list{flex:1;overflow:auto;padding:6px 8px 12px;display:flex;flex-direction:column;gap:2px;}
        .cbb-date{font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;color:#8e8e8e;padding:10px 8px 4px;}
        .cbb-item{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:10px;cursor:pointer;font-size:13px;color:#d7d7d7;border:1px solid transparent;white-space:nowrap;position:relative;overflow:hidden;transition:background .15s,transform .15s,border-color .15s;}
        .cbb-item span{flex:1;overflow:hidden;text-overflow:ellipsis;}
        .cbb-item:hover{background:rgba(255,255,255,.08);transform:translateX(2px);}
        .cbb-item.active{background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border-color:rgba(255,255,255,.16);backdrop-filter:blur(10px);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);}
        .cbb-item .x{opacity:0;border:none;background:transparent;color:#999;cursor:pointer;font-size:14px;padding:0 2px;border-radius:6px;}
        .cbb-item:hover .x{opacity:1;} .cbb-item .x:hover{color:#ff7b7b;background:rgba(255,255,255,.1);}
        .cbb-foot{padding:10px 12px;border-top:1px solid rgba(255,255,255,.1);display:flex;gap:6px;}
        .cbb-foot button{flex:1;padding:8px 4px;font-size:12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#ddd;cursor:pointer;backdrop-filter:blur(10px);}
        .cbb-foot button:hover{border-color:var(--acc);color:#fff;}
        .cbb-main{flex:1;display:flex;flex-direction:column;min-width:0;background:radial-gradient(900px 480px at 70% -10%,rgba(255,255,255,.06),transparent 60%),#212121;position:relative;overflow:hidden;}
        .cbb-aurora{position:absolute;inset:-15%;pointer-events:none;z-index:0;background:radial-gradient(460px 460px at var(--mx) var(--my),rgba(255,255,255,.08),transparent 62%),radial-gradient(700px 500px at 15% 110%,rgba(255,255,255,.045),transparent 60%);filter:blur(6px);transition:background .12s linear;}
        .cbb-main>*:not(.cbb-aurora){position:relative;z-index:1;}
        .cbb-top{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.09);background:rgba(33,33,33,calc(var(--glass) * .55));backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);position:relative;z-index:2;}
        .cbb-top::after{content:'';position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);}
        .cbb-modelpill{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:linear-gradient(135deg,rgba(255,255,255,.18),rgba(255,255,255,.05));backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}
        .cbb-modelpill i{width:8px;height:8px;border-radius:50%;background:var(--acc);box-shadow:0 0 10px var(--acc);}
        .cbb-title{flex:1;text-align:center;font-size:13px;color:#b4b4b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .cbb-iconbtn{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#e6e6e6;cursor:pointer;font-size:16px;backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;}
        .cbb-iconbtn:hover{border-color:var(--acc);}
        .cbb-msgs{flex:1;overflow:auto;padding:26px 18px 10px;}
        .cbb-col{max-width:780px;margin:0 auto;display:flex;flex-direction:column;gap:18px;padding-bottom:10px;}
        .cbb-hero{text-align:center;padding:38px 10px 6px;animation:cbb-fade .5s ease both;}
        @keyframes cbb-fade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
        .cbb-hero .big{width:64px;height:64px;margin:0 auto 14px;border-radius:20px;background:linear-gradient(135deg,rgba(255,255,255,.28),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.3);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;font-size:30px;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.5),inset 0 2px 2px rgba(255,255,255,.5);animation:cbb-breathe 4s ease-in-out infinite;transition:transform .15s ease-out;will-change:transform;}
        .cbb-hero h1{font-size:30px;font-weight:600;margin:0 0 18px;letter-spacing:-.5px;background:linear-gradient(180deg,#ffffff,#a9a9a9);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .cbb-sugg{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:640px;margin:0 auto;text-align:left;perspective:600px;}
        .cbb-sugg button{padding:13px 15px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(135deg,rgba(255,255,255,.13),rgba(255,255,255,.03));backdrop-filter:blur(14px);color:#ececec;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.25);transition:border-color .15s,transform .15s ease-out,box-shadow .15s;text-align:left;position:relative;overflow:hidden;will-change:transform;}
        .cbb-sugg button:hover{border-color:rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 10px 28px rgba(0,0,0,.45);}
        .cbb-sugg b{display:block;font-size:13.5px;} .cbb-sugg span{font-size:12.5px;color:#a8a8a8;}
        .cbb-row{display:flex;gap:12px;align-items:flex-start;animation:cbb-in .38s cubic-bezier(.2,.7,.3,1) both;}
        @keyframes cbb-in{from{opacity:0;transform:translateY(10px) scale(.99);}to{opacity:1;transform:none;}}
        .cbb-col>.cbb-row:nth-child(2){animation-delay:.04s;} .cbb-col>.cbb-row:nth-child(3){animation-delay:.08s;}
        .cbb-col>.cbb-row:nth-child(4){animation-delay:.12s;} .cbb-col>.cbb-row:nth-child(n+5){animation-delay:.16s;}
        .cbb-row.user{justify-content:flex-end;}
        .cbb-avatar{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;background:linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.07));border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.45),0 4px 14px rgba(0,0,0,.4);}
        .cbb-ubub{max-width:75%;padding:11px 16px;border-radius:20px 20px 6px 20px;font-size:14.5px;line-height:1.55;background:linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.07));border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 24px rgba(0,0,0,.3);word-wrap:break-word;position:relative;overflow:hidden;transition:border-color .15s,transform .15s;}
        .cbb-abub{flex:1;min-width:0;padding:14px 18px;border-radius:6px 20px 20px 20px;font-size:14.5px;line-height:1.65;background:linear-gradient(135deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(calc(10px + var(--glass) * 10px));-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 8px 24px rgba(0,0,0,.25);word-wrap:break-word;position:relative;overflow:hidden;transition:border-color .15s;}
        .cbb-abub::after,.cbb-ubub::after,.cbb-sugg button::after,.cbb-box::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s;background:radial-gradient(240px 240px at var(--bx,50%) var(--by,50%),rgba(255,255,255,.16),transparent 65%);}
        .cbb-abub:hover::after,.cbb-ubub:hover::after,.cbb-sugg button:hover::after,.cbb-box:hover::after,.cbb-box:focus-within::after{opacity:1;}
        .cbb-abub:hover{border-color:rgba(255,255,255,.26);} .cbb-ubub:hover{border-color:rgba(255,255,255,.34);}
        .cbb-abub::before{content:'';position:absolute;top:0;left:12px;right:12px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);pointer-events:none;}
        .cbb-abub.error{border-color:rgba(255,90,90,.5);}
        .cbb-h1{font-size:19px;font-weight:700;margin:8px 0 4px;} .cbb-h2{font-size:17px;font-weight:700;margin:8px 0 4px;} .cbb-h3{font-size:15px;font-weight:700;margin:8px 0 4px;}
        .cbb-inline{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);padding:1px 6px;border-radius:6px;font-family:Consolas,monospace;font-size:13px;}
        .cbb-li{display:flex;gap:8px;margin:4px 0;} .cbb-dot{width:6px;height:6px;border-radius:50%;background:var(--acc);margin-top:8px;flex-shrink:0;}
        .cbb-code{margin:10px 0;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.5);}
        .cbb-code-head{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;font-size:11.5px;color:#a8a8a8;background:rgba(255,255,255,.06);}
        .cbb-copy{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#ddd;border-radius:7px;font-size:11px;padding:3px 10px;cursor:pointer;}
        .cbb-copy:hover{border-color:var(--acc);color:#fff;}
        .cbb-code pre{margin:0;padding:12px 14px;overflow:auto;font-family:Consolas,monospace;font-size:13px;line-height:1.5;color:#e8e8e8;}
        .cbb-msgacts{display:flex;gap:4px;margin-top:8px;}
        .cbb-msgacts button{border:none;background:transparent;color:#8e8e8e;cursor:pointer;font-size:12px;padding:4px 8px;border-radius:7px;}
        .cbb-msgacts button:hover{background:rgba(255,255,255,.1);color:#fff;}
        .cbb-typing{display:flex;gap:5px;padding:16px 4px;}
        .cbb-typing i{width:8px;height:8px;border-radius:50%;background:#b4b4b4;animation:cbb-b 1.2s infinite;}
        .cbb-typing i:nth-child(2){animation-delay:.15s;} .cbb-typing i:nth-child(3){animation-delay:.3s;}
        @keyframes cbb-b{0%,60%,100%{transform:none;opacity:.4;}30%{transform:translateY(-5px);opacity:1;}}
        .cbb-compwrap{padding:10px 18px 6px;} .cbb-comp{max-width:780px;margin:0 auto;}
        .cbb-box{display:flex;align-items:flex-end;gap:8px;padding:7px 7px 7px 14px;border-radius:24px;border:1px solid rgba(255,255,255,.22);background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.05));backdrop-filter:blur(24px) saturate(170%);-webkit-backdrop-filter:blur(24px) saturate(170%);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -1px 0 rgba(0,0,0,.2),0 12px 34px rgba(0,0,0,.4);position:relative;overflow:hidden;transition:border-color .15s,box-shadow .15s,transform .15s;}
        .cbb-box:focus-within{border-color:var(--acc);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 0 0 1px var(--acc),0 12px 34px rgba(0,0,0,.45);}
        .cbb-box textarea{flex:1;background:transparent;border:none;outline:none;resize:none;color:#ececec;font-size:13px;font-family:inherit;max-height:160px;padding:4px 0;line-height:1.45;}
        .cbb-box textarea::placeholder{color:#8e8e8e;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cbb-send{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.35);cursor:pointer;font-size:14px;color:#fff;background:linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.08));box-shadow:0 4px 14px rgba(0,0,0,.4),inset 0 1px 1px rgba(255,255,255,.45);flex-shrink:0;transition:transform .12s,box-shadow .15s,border-color .15s;display:flex;align-items:center;justify-content:center;}
        .cbb-send:hover:not(:disabled){border-color:var(--acc);box-shadow:0 4px 18px rgba(0,0,0,.45),0 0 14px color-mix(in srgb,var(--acc) 60%,transparent),inset 0 1px 1px rgba(255,255,255,.5);transform:translateY(-1px);}
        .cbb-send:active:not(:disabled){transform:scale(.9);}
        .cbb-new:active,.cbb-mini:active,.cbb-iconbtn:active{transform:scale(.94);}
        .cbb-new,.cbb-mini,.cbb-iconbtn{transition:transform .12s,border-color .15s,box-shadow .15s;}
        .cbb-send:disabled{opacity:.4;cursor:default;}
        .cbb-stop{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .cbb-hint{text-align:center;font-size:11.5px;color:#8e8e8e;padding:6px 0 10px;}
        .cbb-set{position:absolute;inset:0;z-index:5;display:flex;background:rgba(15,15,15,.65);backdrop-filter:blur(10px);animation:cbb-fadein .15s ease;}
        @keyframes cbb-fadein{from{opacity:0;}to{opacity:1;}}
        .cbb-set.hidden{display:none;}
        .cbb-panel{width:540px;max-width:92%;margin:auto;max-height:88%;overflow:auto;border-radius:24px;padding:26px 28px;background:linear-gradient(135deg,rgba(40,40,40,.9),rgba(22,22,22,.95));border:1px solid rgba(255,255,255,.24);backdrop-filter:blur(36px) saturate(180%);-webkit-backdrop-filter:blur(36px) saturate(180%);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 35px 90px rgba(0,0,0,.7);position:relative;}
        .cbb-panel::before{content:'';position:absolute;top:0;left:28px;right:28px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);}
        .cbb-panel h2{margin:0 0 2px;font-size:19px;letter-spacing:.2px;} .cbb-panel .sub{font-size:12.5px;color:#a8a8a8;margin-bottom:16px;}
        .cbb-sec{margin-bottom:16px;padding:16px;border-radius:16px;background:linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(14px);transition:border-color .15s,box-shadow .15s;}
        .cbb-sec:hover{border-color:rgba(255,255,255,.24);box-shadow:0 6px 22px rgba(0,0,0,.3);}
        .cbb-sec h3{margin:0 0 10px;font-size:12.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--acc);font-weight:600;}
        .cbb-sec label{display:block;font-size:12.5px;color:#c9c9c9;margin:10px 0 5px;}
        .cbb-sec input[type=text],.cbb-sec input[type=password],.cbb-sec select,.cbb-sec textarea{width:100%;box-sizing:border-box;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.16);border-radius:12px;color:#ececec;font-size:13.5px;padding:10px 12px;outline:none;font-family:inherit;transition:border-color .15s,box-shadow .15s;}
        .cbb-sec input:focus,.cbb-sec select:focus,.cbb-sec textarea:focus{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 4px 16px color-mix(in srgb,var(--acc) 30%,transparent);}
        .cbb-sec select option{background:#2b2b2b;}
        .cbb-rowline{display:flex;gap:8px;} .cbb-rowline>*{flex:1;}
        .cbb-keyrow{display:flex;gap:8px;} .cbb-keyrow input{flex:1;}
        .cbb-mini{padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:linear-gradient(135deg,rgba(255,255,255,.14),rgba(255,255,255,.05));color:#eee;cursor:pointer;font-size:12.5px;font-weight:500;white-space:nowrap;transition:all .15s;}
        .cbb-mini:hover{border-color:var(--acc);box-shadow:0 0 10px color-mix(in srgb,var(--acc) 40%,transparent);color:#fff;}
        .cbb-mini:active{transform:scale(.95);}
        .cbb-mini.danger:hover{border-color:#ff6b6b;box-shadow:0 0 10px rgba(255,107,107,.4);color:#ffb3b3;}
        .cbb-mini.primary{background:linear-gradient(135deg,var(--acc),#0ea5e9);border:1px solid rgba(255,255,255,.3);font-weight:600;box-shadow:0 4px 14px color-mix(in srgb,var(--acc) 50%,transparent);}
        .cbb-mini.primary:hover{box-shadow:0 6px 20px color-mix(in srgb,var(--acc) 70%,transparent);transform:translateY(-1px);}
        input[type=range].cbb-range{width:100%;accent-color:var(--acc);cursor:pointer;}
        .cbb-swatches{display:flex;gap:10px;margin-top:6px;}
        .cbb-sw{width:30px;height:30px;border-radius:50%;cursor:pointer;border:2px solid rgba(255,255,255,.2);transition:transform .15s,border-color .15s,box-shadow .15s;}
        .cbb-sw:hover{transform:scale(1.1);border-color:#fff;}
        .cbb-sw.sel{border-color:#fff;box-shadow:0 0 0 3px var(--acc),0 4px 12px rgba(0,0,0,.5);transform:scale(1.05);}
        .cbb-mem{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 12px;font-size:13px;margin-top:6px;transition:border-color .15s,background .15s;}
        .cbb-mem:hover{border-color:var(--acc);background:rgba(255,255,255,.04);}
        .cbb-mem span{flex:1;} .cbb-mem button{border:none;background:transparent;color:#888;cursor:pointer;font-size:14px;transition:color .15s;} .cbb-mem button:hover{color:#ff7b7b;}
        .cbb-toggle{display:flex;align-items:center;justify-content:space-between;font-size:13px;cursor:pointer;}
        .cbb-toggle input{width:18px;height:18px;accent-color:var(--acc);cursor:pointer;}
        .cbb-setfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;}
        .cbb-link{color:var(--acc);font-size:12px;text-decoration:none;} .cbb-link:hover{text-decoration:underline;}
        .cbb-tool{margin-top:10px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.45);overflow:hidden;font-size:12.5px;}
        .cbb-tool summary,.cbb-tool-head{display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(255,255,255,.06);color:#ddd;font-family:Consolas,monospace;list-style:none;cursor:pointer;user-select:none;}
        .cbb-tool summary::-webkit-details-marker{display:none;}
        .cbb-tool summary::before{content:'▶';font-size:9px;color:#888;transition:transform .15s;}
        .cbb-tool[open] summary::before{transform:rotate(90deg);}
        .cbb-tool summary .dot,.cbb-tool-head .dot{width:8px;height:8px;border-radius:50%;background:var(--acc);box-shadow:0 0 8px var(--acc);}
        .cbb-tool summary .st,.cbb-tool-head .st{margin-left:auto;font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid rgba(255,255,255,.2);}
        .cbb-tool summary .st.ok,.cbb-tool-head .st.ok{color:#7dffa8;border-color:rgba(125,255,168,.4);}
        .cbb-tool summary .st.bad,.cbb-tool-head .st.bad{color:#ff9b9b;border-color:rgba(255,107,107,.5);}
        .cbb-tool summary .st.run,.cbb-tool-head .st.run{color:#ffd97d;border-color:rgba(255,217,125,.5);}
        .cbb-tool pre{margin:0;padding:10px 12px;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#cfcfcf;font-family:Consolas,monospace;font-size:12px;line-height:1.5;}
        .cbb-toolres{margin:0;padding:8px 12px;border-top:1px solid rgba(255,255,255,.1);font-size:12px;color:#bdbdbd;}
        .cbb-toolres b{color:#eee;} .cbb-toolres pre{margin:6px 0 2px;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-family:Consolas,monospace;font-size:11.5px;color:#cfcfcf;}
        .cbb-attach{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .cbb-attach:hover{border-color:var(--acc);}
        .cbb-filechip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:3px 8px;font-size:11.5px;color:#ddd;margin:2px 4px 2px 0;}
        @media (max-width:720px){.cbb-side{position:absolute;left:0;top:0;bottom:0;transform:translateX(-100%);transition:.2s;box-shadow:20px 0 60px rgba(0,0,0,.5);} .cbb-side.open{transform:none;} .cbb-sugg{grid-template-columns:1fr;}}
        </style>`;
    }

    function shellHTML(settings) {
        const model = esc(effectiveModel(settings));
        return `
        <div class="cbb-root">
            <div class="cbb-side">
                <div class="cbb-brand"><div class="cbb-logo">✦</div><div><b>CopilotBB</b></div></div>
                <button class="cbb-new">＋ New chat</button>
                <div class="cbb-search"><span style="color:#8e8e8e;font-size:13px;">⌕</span><input class="cbb-q" type="text" placeholder="Search chats"></div>
                <div class="cbb-list"></div>
                <div class="cbb-foot">
                    <button class="cbb-export">Export</button>
                    <button class="cbb-settings-btn">⚙ Settings</button>
                </div>
            </div>
            <div class="cbb-main">
                <div class="cbb-aurora"></div>
                <div class="cbb-top">
                    <button class="cbb-iconbtn cbb-menu" title="Chats">☰</button>
                    <div class="cbb-modelpill"><i></i><span class="cbb-modelname">${model}</span></div>
                    <div class="cbb-title"></div>
                    <button class="cbb-iconbtn cbb-settings-btn2" title="Settings">⚙</button>
                </div>
                <div class="cbb-msgs"><div class="cbb-col"></div></div>
                <div class="cbb-compwrap"><div class="cbb-comp">
                    <div class="cbb-box">
                        <button class="cbb-attach" title="Attach file to workspace">📎</button>
                        <input type="file" class="cbb-fileinput" style="display:none;" multiple>
                        <textarea rows="1" placeholder="Message CopilotBB…"></textarea>
                        <button class="cbb-stop" title="Stop" style="display:none;">■</button>
                        <button class="cbb-send" title="Send">↑</button>
                    </div>
                    <div class="cbb-hint">CopilotBB agent can run tools inline (files live in this chat's workspace until deleted) · Check important info</div>
                </div></div>
            </div>
            <div class="cbb-set hidden"><div class="cbb-panel"></div></div>
        </div>`;
    }

    function groupLabel(ts) {
        const d = new Date(ts), now = new Date();
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diff = Math.round((today - day) / 86400000);
        if (diff <= 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        if (diff < 7) return 'Previous 7 days';
        if (diff < 30) return 'Previous 30 days';
        return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    function launch() {
        const icon = AppIcons.get(APP_ID);
        let settings = loadSettings();
        let convs = loadConvs();
        let activeId = convs.length ? convs[0].id : null;
        let generating = false;
        let stopFlag = false;

        const win = WindowManager.createWindow(APP_ID, 'CopilotButBetter', icon,
            css() + shellHTML(settings), { width: 1020, height: 700, minWidth: 640, minHeight: 460 });
        const el = win.element;
        const root = el.querySelector('.cbb-root');

        const listEl = el.querySelector('.cbb-list');
        const colEl = el.querySelector('.cbb-col');
        const msgsEl = el.querySelector('.cbb-msgs');
        const titleEl = el.querySelector('.cbb-title');
        const modelNameEl = el.querySelector('.cbb-modelname');
        const ta = el.querySelector('.cbb-box textarea');
        const sendBtn = el.querySelector('.cbb-send');
        const stopBtn = el.querySelector('.cbb-stop');
        const setWrap = el.querySelector('.cbb-set');
        const panel = el.querySelector('.cbb-panel');
        const side = el.querySelector('.cbb-side');
        applyTheme();

        function applyTheme() {
            root.style.setProperty('--acc', settings.accent || '#10a37f');
            root.style.setProperty('--glass', String(settings.glass == null ? 0.65 : settings.glass));
            modelNameEl.textContent = effectiveModel(settings);
        }

        function getActive() {
            return convs.find(c => c.id === activeId) || null;
        }

        function persist() {
            // Image bytes (analyze results) stay in memory for the next model
            // turn only — never persist base64 into localStorage.
            try {
                saveConvs(convs.map(c => ({
                    ...c,
                    messages: c.messages.map(m => {
                        if (!m.images) return m;
                        const copy = { ...m };
                        delete copy.images;
                        return copy;
                    })
                })));
            } catch (e) {
                try { saveConvs(convs); } catch (e2) { /* noop */ }
            }
        }

        // ---------- sidebar ----------
        function renderSidebar(filter) {
            const q = (filter || '').toLowerCase();
            const items = convs.filter(c => !q || (c.title || '').toLowerCase().includes(q) ||
                c.messages.some(m => String(m.content || '').toLowerCase().includes(q)));
            if (!items.length) {
                listEl.innerHTML = `<div style="padding:18px 12px;color:#8e8e8e;font-size:12.5px;text-align:center;">${q ? 'No matches.' : 'No conversations yet.<br>Start a new chat ✦'}</div>`;
                return;
            }
            let html = '', lastGroup = '';
            for (const c of items) {
                const g = groupLabel(c.updatedAt);
                if (g !== lastGroup) { html += `<div class="cbb-date">${esc(g)}</div>`; lastGroup = g; }
                html += `<div class="cbb-item${c.id === activeId ? ' active' : ''}" data-id="${c.id}" title="${esc(c.title)}">` +
                    `<span>${esc(c.title || 'New chat')}</span><button class="x" data-del="${c.id}" title="Delete">×</button></div>`;
            }
            listEl.innerHTML = html;
            listEl.querySelectorAll('.cbb-item').forEach(n => {
                n.addEventListener('click', (e) => {
                    const del = e.target.closest('[data-del]');
                    if (del) { e.stopPropagation(); deleteConv(del.dataset.del); return; }
                    activeId = n.dataset.id;
                    renderAll();
                    if (window.innerWidth < 720) side.classList.remove('open');
                });
                n.addEventListener('dblclick', () => renameConv(n.dataset.id));
                n.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    renameConv(n.dataset.id);
                });
            });
        }

        async function renameConv(id) {
            const c = convs.find(x => x.id === id);
            if (!c) return;
            const name = await Popup.textbox('Rename chat', 'Conversation title:', { value: c.title || '' });
            if (name && name.trim()) { c.title = name.trim().slice(0, 80); c.updatedAt = Date.now(); persist(); renderAll(); }
        }

        async function deleteConv(id) {
            const ok = await Popup.confirm('Delete chat', 'Delete this conversation and its workspace files permanently?');
            if (!ok) return;
            deleteWorkspace(id);
            convs = convs.filter(c => c.id !== id);
            if (activeId === id) activeId = convs.length ? convs[0].id : null;
            persist(); renderAll();
        }

        function newChat() {
            const c = { id: uid(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
            convs.unshift(c);
            activeId = c.id;
            persist(); renderAll();
            ta.focus();
        }

        // ---------- messages ----------
        function renderMessages() {
            const c = getActive();
            titleEl.textContent = c ? (c.title || 'New chat') : 'CopilotButBetter';
            if (!c || !c.messages.length) {
                colEl.innerHTML = `
                <div class="cbb-hero"><div class="big">✦</div><h1>What can I help with?</h1>
                <div class="cbb-sugg">${SUGGESTIONS.map((s, i) =>
                    `<button data-s="${i}"><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></button>`).join('')}</div></div>`;
                colEl.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
                    const s = SUGGESTIONS[parseInt(b.dataset.s, 10)];
                    ta.value = `${s.title} ${s.desc}`;
                    autosize(); send();
                }));
                return;
            }
            colEl.innerHTML = c.messages.filter(m => !(m.role === 'user' && String(m.content || '').startsWith('[TOOL RESULT status='))).map((m, i) => {
                if (m.role === 'user') {
                    const chips = Array.isArray(m.attachments) && m.attachments.length
                        ? `<div style="margin-top:6px;">${m.attachments.map(a => `<span class="cbb-filechip">📎 ${esc(a)}</span>`).join('')}</div>` : '';
                    return `<div class="cbb-row user"><div class="cbb-ubub">${esc(m.content)}${chips}</div></div>`;
                }
                // Legacy standalone tool messages (backward compat)
                if (m.role === 'tool') {
                    const ok = m.status !== 'failed';
                    return `<div class="cbb-row"><div class="cbb-avatar">🔧</div><div class="cbb-abub">` +
                        `<div class="cbb-tool"><div class="cbb-tool-head"><span class="dot"></span><span>🔧 ${esc(m.tool || 'tool')}</span>` +
                        `<span class="st ${ok ? 'ok' : 'bad'}">${ok ? 'success' : 'failed'}</span></div>` +
                        `<pre>${esc(truncateOut(m.content || '', 2000))}</pre></div>` +
                        `</div></div>`;
                }
                const errCls = m.error ? ' error' : '';
                const tc = m.toolcall || parseToolCall(m.content || '');
                const bodyText = stripToolCall(m.content || '');
                let toolHtml = '';
                if (tc && tc.tool) {
                    const tr = m.toolResult;
                    const toolOk = tr && tr.status !== 'failed';
                    const toolLabel = tr ? (toolOk ? 'success' : 'failed') : 'running…';
                    const toolStClass = tr ? (toolOk ? 'ok' : 'bad') : 'run';
                    // Collapsed toolcall + result block
                    toolHtml = `<details class="cbb-tool" open>` +
                        `<summary class="cbb-tool-head"><span class="dot"></span><span>🔧 ${esc(tc.tool)}</span>` +
                        `<span class="st ${toolStClass}">${toolLabel}</span></summary>` +
                        `<pre>${esc(truncateOut(JSON.stringify(tc.args, null, 2), 1500))}</pre>` +
                        (tr ? `<div class="cbb-toolres"><b>Result:</b><pre>${esc(truncateOut(tr.output || '', 2000))}</pre></div>` : '') +
                        `</details>`;
                }
                return `<div class="cbb-row"><div class="cbb-avatar">✦</div><div class="cbb-abub${errCls}">` +
                    `${renderMarkdown(bodyText)}${toolHtml}` +
                    `<div class="cbb-msgacts"><button data-copy="${i}">⧉ Copy</button>` +
                    `<button data-mem="${i}">✦ Remember</button></div></div></div>`;
            }).join('');
            if (generating) colEl.insertAdjacentHTML('beforeend',
                `<div class="cbb-row cbb-live"><div class="cbb-avatar">✦</div><div class="cbb-abub"><div class="cbb-typing"><i></i><i></i><i></i></div></div></div>`);
            colEl.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
                const m = getActive().messages[parseInt(b.dataset.copy, 10)];
                if (!m) return;
                if (navigator.clipboard) navigator.clipboard.writeText(m.content).catch(() => { });
                b.textContent = '✓ Copied';
                setTimeout(() => { b.textContent = '⧉ Copy'; }, 1200);
            }));
            colEl.querySelectorAll('[data-mem]').forEach(b => b.addEventListener('click', () => {
                const m = getActive().messages[parseInt(b.dataset.mem, 10)];
                if (!m) return;
                rememberText(m.content);
            }));
            colEl.querySelectorAll('.cbb-copy').forEach(b => b.addEventListener('click', () => {
                const pre = b.closest('.cbb-code').querySelector('pre');
                const txt = pre ? pre.innerText : '';
                if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => { });
                b.textContent = 'Copied';
                setTimeout(() => { b.textContent = 'Copy'; }, 1200);
            }));
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }

        async function rememberText(text) {
            const snippet = text.length > 220 ? text.slice(0, 220) + '…' : text;
            const fact = await Popup.textbox('Save to memory', 'CopilotButBetter will remember this in future chats:', { value: snippet });
            if (fact && fact.trim()) {
                settings.memory.push(fact.trim().slice(0, 500));
                saveSettings(settings);
                Notifications.info('Memory saved', 'CopilotButBetter will use this in future replies.', { appId: APP_ID });
                renderSettings();
            }
        }

        function renderAll() {
            renderSidebar(el.querySelector('.cbb-q').value);
            renderMessages();
        }

        function autosize() {
            ta.style.height = 'auto';
            ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
        }

        async function send() {
            const text = ta.value.trim();
            if (!text || generating) return;
            const zen = isZen(settings);
            const activeKey = zen ? settings.zenApiKey : settings.apiKey;
            if (!(activeKey || '').trim()) {
                const go = await Popup.confirm('API key needed',
                    zen
                        ? 'CopilotButBetter needs your OpenCode Zen API key first (copy it from opencode.ai/zen). Open Settings now?'
                        : 'CopilotButBetter needs your Gemini API key first (free at Google AI Studio). Open Settings now?');
                if (go) openSettings();
                return;
            }
            let c = getActive();
            if (!c) {
                c = { id: uid(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
                convs.unshift(c); activeId = c.id;
            }
            c.messages.push({ role: 'user', content: text, time: Date.now() });
            if (c.messages.length === 1 || c.title === 'New chat') {
                c.title = text.length > 42 ? text.slice(0, 42) + '…' : text;
            }
            c.updatedAt = Date.now();
            ta.value = ''; autosize();
            generating = true; stopFlag = false;
            sendBtn.style.display = 'none'; stopBtn.style.display = '';
            persist(); renderAll();
            try {
                ensureWorkspace(c.id);
                const agentOn = settings.agentMode !== false;
                let turns = 0;
                for (;;) {
                    if (stopFlag) return;
                    turns++;
                    const reply = await callModel(settings, c.messages);
                    if (stopFlag) return;
                    const tc = agentOn ? parseToolCall(reply) : null;
                    if (tc && tc.parseError) {
                        c.messages.push({ role: 'assistant', content: reply, time: Date.now() });
                        c.messages.push({ role: 'user', content: `[Tool parse error] ${tc.parseError}. Raw:\n${truncateOut(tc.raw, 800)}`, time: Date.now() });
                        c.updatedAt = Date.now();
                        persist(); renderAll();
                        continue;
                    }
                    if (!tc) {
                        c.messages.push({ role: 'assistant', content: reply, time: Date.now() });
                        c.updatedAt = Date.now();
                        break;
                    }
                    // Tool turn: keep the assistant message (with its explanation),
                    // run the tool, feed the result back for another model turn.
                    c.messages.push({ role: 'assistant', content: reply, time: Date.now(), toolcall: { tool: tc.tool, args: tc.args } });
                    persist(); renderAll();
                    if (turns >= MAX_AGENT_TURNS) {
                        const last = c.messages[c.messages.length - 1];
                        if (last && last.role === 'assistant') {
                            last.toolResult = { status: 'failed', output: `Stopped: max ${MAX_AGENT_TURNS} tool turns reached. Answer with what you have.` };
                        }
                        // Must end with a user turn for Gemini API
                        c.messages.push({ role: 'user', content: `[Tool result: max ${MAX_AGENT_TURNS} turns reached. Please answer with what you have.]`, time: Date.now() });
                        persist(); renderAll();
                        continue;
                    }
                    let result;
                    try {
                        result = await executeTool(c.id, tc.tool, tc.args);
                    } catch (e) {
                        result = { ok: false, output: `Tool ${tc.tool} crashed: ${e && e.message || e}`, images: [] };
                    }
                    if (stopFlag) return;
                    const status = result.ok ? 'success' : 'failed';
                    const out = truncateOut(result.output || '', TOOL_OUTPUT_LIMIT);
                    // Attach result to the assistant message for display
                    const lastMsg = c.messages[c.messages.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        lastMsg.toolResult = { status, output: out };
                        if (result.images && result.images.length) lastMsg.images = result.images;
                    }
                    // Push a user-role message so Gemini API sees conversation ending with user turn
                    const toolImgPayload = (result.images && result.images.length) ? result.images : undefined;
                    c.messages.push({
                        role: 'user', content: `[TOOL RESULT status=${status} tool=${tc.tool}]\n${out}`,
                        images: toolImgPayload, time: Date.now()
                    });
                    c.updatedAt = Date.now();
                    persist(); renderAll();
                }
            } catch (e) {
                if (!stopFlag) {
                    c.messages.push({ role: 'assistant', content: `⚠️ **Request failed:** ${e.message}`, time: Date.now(), error: true });
                }
            } finally {
                generating = false;
                sendBtn.style.display = ''; stopBtn.style.display = 'none';
                persist(); renderAll();
            }
        }

        // ---------- settings ----------
        function renderSettings() {
            const s = settings;
            const memHtml = s.memory.length
                ? s.memory.map((m, i) => `<div class="cbb-mem"><span>${esc(m)}</span><button data-mdel="${i}" title="Forget">×</button></div>`).join('')
                : `<div style="font-size:12.5px;color:#8e8e8e;margin-top:6px;">Nothing remembered yet. Use “✦ Remember” under any reply.</div>`;
            panel.innerHTML = `
                <h2>Settings</h2><div class="sub">API key, model, memory &amp; glass — stored locally in the virtual filesystem.</div>
                <div class="cbb-sec"><h3>Provider & API keys</h3>
                    <label>Provider</label>
                    <select class="s-provider">
                        <option value="gemini"${s.provider !== 'zen' ? ' selected' : ''}>Google Gemini (direct)</option>
                        <option value="zen"${s.provider === 'zen' ? ' selected' : ''}>OpenCode Zen</option>
                    </select>
                    <div class="s-gemini-key" style="${s.provider === 'zen' ? 'display:none;' : ''}">
                        <label>Gemini key — get one free at <a class="cbb-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></label>
                        <div class="cbb-keyrow"><input type="password" class="s-key" value="${esc(s.apiKey)}" placeholder="AIza…"><button class="cbb-mini s-show">Show</button></div>
                    </div>
                    <div class="s-zen-key" style="${s.provider === 'zen' ? '' : 'display:none;'}">
                        <label>Zen key — copy it from <a class="cbb-link" href="https://opencode.ai/zen" target="_blank" rel="noopener">opencode.ai/zen</a></label>
                        <div class="cbb-keyrow"><input type="password" class="s-zenkey" value="${esc(s.zenApiKey || '')}" placeholder="zen_…"><button class="cbb-mini s-showzen">Show</button></div>
                    </div>
                    <label>Model id — empty uses the default (<span class="s-defmodel">${s.provider === 'zen' ? esc(DEFAULT_MODEL_ZEN) : esc(DEFAULT_MODEL_GEMINI)}</span>)</label>
                    <input type="text" class="s-model" value="${esc(s.model || '')}" placeholder="e.g. gemini-3.5-flash-lite, gpt-5.5, claude-sonnet-5">
                    <div style="font-size:12px;color:#8e8e8e;margin-top:6px;">On Zen, <span style="font-family:Consolas,monospace;">gemini-*</span> ids use the Gemini endpoint, everything else uses OpenAI-compatible chat. Full list: <a class="cbb-link" href="https://opencode.ai/zen/v1/models" target="_blank" rel="noopener">opencode.ai/zen/v1/models</a></div>
                </div>
                <div class="cbb-sec"><h3>Behavior</h3>
                    <label>System prompt (personality)</label>
                    <textarea class="s-sys" rows="3">${esc(s.systemPrompt)}</textarea>
                    <label>Creativity (temperature): <b class="s-tval">${esc(String(s.temperature))}</b></label>
                    <input type="range" class="cbb-range s-temp" min="0" max="2" step="0.1" value="${esc(String(s.temperature))}">
                    <label>Max output tokens</label>
                    <select class="s-max"><option ${s.maxTokens === 1024 ? 'selected' : ''}>1024</option><option ${s.maxTokens === 2048 ? 'selected' : ''}>2048</option><option ${s.maxTokens === 4096 ? 'selected' : ''}>4096</option><option ${s.maxTokens === 8192 ? 'selected' : ''}>8192</option></select>
                    <label class="cbb-toggle" style="margin-top:10px;">Send with Enter (Shift+Enter = newline)<input type="checkbox" class="s-enter" ${s.enterToSend ? 'checked' : ''}></label>
                    <label class="cbb-toggle" style="margin-top:10px;">Agent mode — let the model call tools inline (datetime, powershell, cmd, write, read, edit, grep, websearch, webfetch, analyze)<input type="checkbox" class="s-agent" ${s.agentMode !== false ? 'checked' : ''}></label>
                </div>
                <div class="cbb-sec"><h3>Agent workspace</h3>
                    <div style="font-size:12.5px;color:#a8a8a8;">Each conversation gets its own temp folder (deleted with the chat). Attach files with 📎 or let the agent write/read/edit there.</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                        <button class="cbb-mini s-wslist">List active chat files</button>
                    </div>
                    <div class="s-wsout" style="font-size:12px;color:#c9c9c9;margin-top:8px;font-family:Consolas,monospace;white-space:pre-wrap;"></div>
                </div>
                <div class="cbb-sec"><h3>Memory</h3>
                    <label class="cbb-toggle">Long-term memory (facts are sent with every request)<input type="checkbox" class="s-memon" ${s.memoryEnabled ? 'checked' : ''}></label>
                    ${memHtml}
                    <div class="cbb-keyrow" style="margin-top:8px;"><input type="text" class="s-newmem" placeholder="e.g. My favorite language is Python"><button class="cbb-mini s-addmem">Add</button></div>
                </div>
                <div class="cbb-sec"><h3>Appearance · liquid glass</h3>
                    <label>Accent</label>
                    <div class="cbb-swatches">${['#10a37f', '#0ea5e9', '#a78bfa', '#f472b6', '#f59e0b', '#ef4444'].map(c =>
                        `<div class="cbb-sw${c === s.accent ? ' sel' : ''}" data-acc="${c}" style="background:${c}"></div>`).join('')}</div>
                    <label>Glass intensity: <b class="s-gval">${Math.round((s.glass == null ? 0.65 : s.glass) * 100)}%</b></label>
                    <input type="range" class="cbb-range s-glass" min="0.2" max="1" step="0.05" value="${s.glass == null ? 0.65 : s.glass}">
                </div>
                <div class="cbb-sec"><h3>Data</h3>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="cbb-mini s-export">Export chats (JSON)</button>
                        <button class="cbb-mini danger s-clear">Delete all chats</button>
                    </div>
                </div>
                <div class="cbb-setfoot"><button class="cbb-mini s-close">Close</button><button class="cbb-mini primary s-save">Save</button></div>`;

            panel.querySelector('.s-show').addEventListener('click', (e) => {
                const inp = panel.querySelector('.s-key');
                inp.type = inp.type === 'password' ? 'text' : 'password';
                e.target.textContent = inp.type === 'password' ? 'Show' : 'Hide';
            });
            panel.querySelector('.s-showzen').addEventListener('click', (e) => {
                const inp = panel.querySelector('.s-zenkey');
                inp.type = inp.type === 'password' ? 'text' : 'password';
                e.target.textContent = inp.type === 'password' ? 'Show' : 'Hide';
            });
            panel.querySelector('.s-provider').addEventListener('change', (e) => {
                const zen = e.target.value === 'zen';
                panel.querySelector('.s-gemini-key').style.display = zen ? 'none' : '';
                panel.querySelector('.s-zen-key').style.display = zen ? '' : 'none';
                panel.querySelector('.s-defmodel').textContent = zen ? DEFAULT_MODEL_ZEN : DEFAULT_MODEL_GEMINI;
            });
            panel.querySelector('.s-temp').addEventListener('input', (e) => {
                panel.querySelector('.s-tval').textContent = e.target.value;
            });
            panel.querySelector('.s-glass').addEventListener('input', (e) => {
                panel.querySelector('.s-gval').textContent = Math.round(e.target.value * 100) + '%';
            });
            panel.querySelectorAll('[data-acc]').forEach(n => n.addEventListener('click', () => {
                panel.querySelectorAll('[data-acc]').forEach(x => x.classList.remove('sel'));
                n.classList.add('sel');
            }));
            panel.querySelector('.s-addmem').addEventListener('click', () => {
                const v = panel.querySelector('.s-newmem').value.trim();
                if (v) { settings.memory.push(v.slice(0, 500)); saveSettings(settings); renderSettings(); }
            });
            panel.querySelectorAll('[data-mdel]').forEach(b => b.addEventListener('click', () => {
                settings.memory.splice(parseInt(b.dataset.mdel, 10), 1);
                saveSettings(settings); renderSettings();
            }));
            panel.querySelector('.s-export').addEventListener('click', () => exportChats());
            panel.querySelector('.s-clear').addEventListener('click', async () => {
                const ok = await Popup.confirm('Delete all chats', 'Permanently delete every conversation?');
                if (ok) {
                    for (const cc of convs) deleteWorkspace(cc.id);
                    convs = []; activeId = null; persist(); renderAll(); renderSettings();
                }
            });
            panel.querySelector('.s-wslist').addEventListener('click', () => {
                const cc = getActive();
                const out = panel.querySelector('.s-wsout');
                if (!cc) { out.textContent = 'No active chat.'; return; }
                const ws = ensureWorkspace(cc.id);
                const files = walkWorkspaceFiles(ws);
                out.textContent = files.length ? `Workspace of "${cc.title || 'New chat'}" (${files.length}):\n` + files.join('\n') : 'Workspace is empty. Attach files with 📎 or ask the agent to write some.';
            });
            panel.querySelector('.s-close').addEventListener('click', () => setWrap.classList.add('hidden'));
            panel.querySelector('.s-save').addEventListener('click', () => {
                const selAcc = panel.querySelector('[data-acc].sel');
                settings = {
                    ...settings,
                    provider: panel.querySelector('.s-provider').value === 'zen' ? 'zen' : 'gemini',
                    apiKey: panel.querySelector('.s-key').value.trim(),
                    zenApiKey: panel.querySelector('.s-zenkey').value.trim(),
                    model: panel.querySelector('.s-model').value.trim(),
                    systemPrompt: panel.querySelector('.s-sys').value,
                    temperature: parseFloat(panel.querySelector('.s-temp').value) || 0.7,
                    maxTokens: parseInt(panel.querySelector('.s-max').value, 10) || 2048,
                    enterToSend: panel.querySelector('.s-enter').checked,
                    memoryEnabled: panel.querySelector('.s-memon').checked,
                    agentMode: panel.querySelector('.s-agent').checked,
                    accent: selAcc ? selAcc.dataset.acc : settings.accent,
                    glass: parseFloat(panel.querySelector('.s-glass').value)
                };
                saveSettings(settings);
                applyTheme();
                setWrap.classList.add('hidden');
                Notifications.info('Settings saved', 'CopilotButBetter preferences updated.', { appId: APP_ID });
            });
        }

        function openSettings() {
            renderSettings();
            setWrap.classList.remove('hidden');
        }

        function exportChats() {
            const blob = new Blob([JSON.stringify(convs, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'copilotbutbetter-chats.json';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        }

        // ---------- wire up ----------
        el.querySelector('.cbb-new').addEventListener('click', newChat);
        el.querySelector('.cbb-menu').addEventListener('click', () => {
            if (window.innerWidth <= 720) {
                side.classList.toggle('open');
            } else {
                side.classList.toggle('collapsed');
            }
        });
        el.querySelector('.cbb-q').addEventListener('input', (e) => renderSidebar(e.target.value));
        el.querySelector('.cbb-export').addEventListener('click', exportChats);
        el.querySelector('.cbb-settings-btn').addEventListener('click', openSettings);
        el.querySelector('.cbb-settings-btn2').addEventListener('click', openSettings);
        setWrap.addEventListener('click', (e) => { if (e.target === setWrap) setWrap.classList.add('hidden'); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Escape') setWrap.classList.add('hidden'); });

        ta.addEventListener('input', autosize);
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend) { e.preventDefault(); send(); }
        });
        sendBtn.addEventListener('click', send);
        stopBtn.addEventListener('click', () => { stopFlag = true; });

        // ---------- attachments -> conversation workspace (for analyze) ----------
        const attachBtn = el.querySelector('.cbb-attach');
        const fileInput = el.querySelector('.cbb-fileinput');
        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => {
                let cc = getActive();
                if (!cc) {
                    cc = { id: uid(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
                    convs.unshift(cc); activeId = cc.id; persist(); renderAll();
                }
                ensureWorkspace(cc.id);
                fileInput.click();
            });
            fileInput.addEventListener('change', async () => {
                const cc = getActive();
                if (!cc || !fileInput.files || !fileInput.files.length) { fileInput.value = ''; return; }
                const ws = ensureWorkspace(cc.id);
                const names = [];
                for (const f of Array.from(fileInput.files).slice(0, 5)) {
                    const safe = String(f.name || 'attachment').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'attachment';
                    try {
                        if ((f.type || '').startsWith('text/') || /json|javascript|xml|csv|markdown/.test(f.type || '') || f.size < 200000) {
                            const txt = await f.text().catch(() => null);
                            if (txt != null && txt.length < 500000) {
                                const full = resolveWorkspacePath(ws, safe);
                                if (FileSystem.itemExists(full)) FileSystem.writeFile(full, txt);
                                else FileSystem.createFile(full.slice(0, -1), safe, txt, safe.includes('.') ? safe.split('.').pop() : '');
                                names.push(safe);
                                continue;
                            }
                        }
                        const ok = await FileSystem.writeFileBlob(ws, safe, f, safe.includes('.') ? safe.split('.').pop() : '').catch(() => false);
                        if (ok) names.push(safe);
                    } catch (e) { /* skip file */ }
                }
                fileInput.value = '';
                if (names.length) {
                    cc.messages.push({ role: 'user', content: `Attached ${names.length} file(s) to the workspace: ${names.join(', ')}. Use the analyze tool on them when relevant.`, attachments: names, time: Date.now() });
                    cc.updatedAt = Date.now();
                    persist(); renderAll();
                    Notifications.info('Files attached', names.join(', '), { appId: APP_ID });
                }
            });
        }

        // Mouse-reactive layer: ambient glow follows the cursor, spotlights light up
        // the hovered bubble/card/composer, hero logo + suggestion cards tilt in 3D.
        let mouseRaf = null;
        root.addEventListener('mousemove', (e) => {
            if (mouseRaf) return;
            mouseRaf = requestAnimationFrame(() => {
                mouseRaf = null;
                const rr = root.getBoundingClientRect();
                root.style.setProperty('--mx', ((e.clientX - rr.left) / rr.width * 100).toFixed(2) + '%');
                root.style.setProperty('--my', ((e.clientY - rr.top) / rr.height * 100).toFixed(2) + '%');
                const t = e.target.closest('.cbb-abub,.cbb-ubub,.cbb-sugg button,.cbb-box');
                if (t) {
                    const b = t.getBoundingClientRect();
                    t.style.setProperty('--bx', (e.clientX - b.left).toFixed(1) + 'px');
                    t.style.setProperty('--by', (e.clientY - b.top).toFixed(1) + 'px');
                    if (t.closest('.cbb-sugg')) {
                        const px = (e.clientX - b.left) / b.width - 0.5;
                        const py = (e.clientY - b.top) / b.height - 0.5;
                        t.style.transform = `perspective(600px) rotateY(${(px * 7).toFixed(2)}deg) rotateX(${(-py * 7).toFixed(2)}deg) translateY(-2px)`;
                    }
                }
                root.querySelectorAll('.cbb-sugg button').forEach(b => { if (b !== t) b.style.transform = ''; });
                const big = root.querySelector('.cbb-hero .big');
                if (big) {
                    const b = big.getBoundingClientRect();
                    const px = (e.clientX - (b.left + b.width / 2)) / Math.max(b.width, 1);
                    const py = (e.clientY - (b.top + b.height / 2)) / Math.max(b.height, 1);
                    const cl = Math.max(-1, Math.min(1, px)), ct = Math.max(-1, Math.min(1, py));
                    big.style.transform = `perspective(500px) rotateY(${(cl * 14).toFixed(2)}deg) rotateX(${(-ct * 14).toFixed(2)}deg)`;
                }
            });
        });
        root.addEventListener('mouseleave', () => {
            const big = root.querySelector('.cbb-hero .big');
            if (big) big.style.transform = '';
            root.querySelectorAll('.cbb-sugg button').forEach(b => { b.style.transform = ''; });
        });

        renderAll();
        autosize();
    }

    return { launch };
})();

export default CopilotButBetter;
