// Update-flow regression test.
//
//     node test/update.smoke.mjs
//
// Covers the two update rules of the OS-core architecture:
//
//   1. The "download complete, refresh to start" prompt must NEVER come back
//      on an ordinary reload. It may only appear when the core was actually
//      just installed.
//   2. Updating a Microsoft Store app does not change the OS version, so it
//      must not update the entire operating system (no worker update, no
//      prompt, no core re-download).
//   3. A real OS release does prompt for the restart that installs it.
//
// The test server patches sw.js and the app catalog on the fly to simulate
// both kinds of release.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8124;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.md': 'text/markdown; charset=utf-8',
    '.pkg': 'application/octet-stream'
};

function findBrowser() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return null;
}

// What the server pretends the origin is publishing.
const published = { osVersion: null, storeAppVersion: null };

function serve() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('not found');
            return;
        }

        let body = fs.readFileSync(file);
        let type = MIME[path.extname(file)] || 'application/octet-stream';
        const name = rel.replace(/^\//, '');

        // Simulate an OS release: the worker script carries a new core
        // version, so the browser sees a new service worker.
        if (name === 'sw.js' && published.osVersion) {
            body = Buffer.from(body.toString('utf8').replace(
                /const CORE_VERSION = '[^']*';/,
                `const CORE_VERSION = '${published.osVersion}';`
            ));
        }
        // Simulate a store app update: only the app catalog changes.
        if (name === 'js/apps/registry.js' && published.storeAppVersion) {
            body = Buffer.from(body.toString('utf8').replace(
                /("id":"appStore","uuid":"[^"]*","name":"[^"]*","version":")[^"]*(")/,
                (_m, head, tail) => head + published.storeAppVersion + tail
            ));
        }

        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(body);
    });
    return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

async function waitForTarget(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/list`);
            const list = await res.json();
            const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (page) return page;
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 250));
    }
    return null;
}

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result);
            } else if (msg.method) {
                for (const fn of this.listeners) fn(msg);
            }
        });
    }
    on(fn) { this.listeners.push(fn); }
    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error('cdp-timeout:' + method));
                }
            }, 120000);
        });
    }
    async eval(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression, awaitPromise: true, returnByValue: true
        });
        if (res.exceptionDetails) {
            throw new Error('eval-error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
        }
        return res.result.value;
    }
}

async function main() {
    const browser = findBrowser();
    if (!browser) {
        console.log('SKIP: no Chrome/Edge binary found (set CHROME_PATH)');
        return 0;
    }

    const server = await serve();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'w12-update-'));
    const port = 9334;
    const proc = spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${port}`,
        `http://localhost:${PORT}/`
    ], { stdio: 'ignore' });

    let cdp = null;
    const errors = [];
    let dialogs = 0;
    const dialogTexts = [];

    const failures = [];
    const check = (name, cond, extra) => {
        if (cond) console.log(`  ok   ${name}`);
        else { console.log(`  FAIL ${name}${extra ? ' - ' + extra : ''}`); failures.push(name); }
    };

    try {
        const target = await waitForTarget(port, 30000);
        if (!target) throw new Error('no devtools target');
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', reject, { once: true });
        });
        cdp = new CDP(ws);
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Log.enable');

        cdp.on((msg) => {
            if (msg.method === 'Runtime.exceptionThrown') {
                const d = msg.params.exceptionDetails;
                errors.push(d.exception?.description || d.text);
            } else if (msg.method === 'Log.entryAdded') {
                const e = msg.params.entry;
                if (e.level === 'error') errors.push(e.text);
            } else if (msg.method === 'Page.javascriptDialogOpening') {
                dialogs++;
                dialogTexts.push(msg.params.message || '');
                cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => { });
            }
        });

        const waitForShell = async (timeoutMs) => {
            const deadline = Date.now() + (timeoutMs || 60000);
            while (Date.now() < deadline) {
                const state = await cdp.eval(`(() => ({
                    shell: !!document.getElementById('taskbar'),
                    fs: !!window._FileSystem,
                    status: (document.getElementById('boot-status') || {}).textContent || ''
                }))()`);
                if (state.shell && state.fs) return state;
                await new Promise(r => setTimeout(r, 400));
            }
            return null;
        };

        const reload = async () => {
            await cdp.send('Page.reload', { ignoreCache: false });
            return waitForShell();
        };

        // ---- 1. first run: the install prompt appears exactly once ----------
        console.log('[first run]');
        let state = await waitForShell(90000);
        check('the OS booted', !!state, state ? state.status : 'timeout');
        check('the "refresh to start" prompt appeared once', dialogs === 1, `dialogs=${dialogs}`);
        check('the prompt is the install prompt',
            /downloaded and installed/i.test(dialogTexts[0] || ''), JSON.stringify(dialogTexts[0] || ''));

        // The prompt reloads the page; wait for the second boot to finish.
        await new Promise(r => setTimeout(r, 3000));
        state = await waitForShell(60000);
        check('the OS is up after the restart', !!state);

        // ---- 2. ordinary reloads must never prompt again --------------------
        console.log('[ordinary reloads]');
        const before = dialogs;
        for (let i = 0; i < 3; i++) {
            const s = await reload();
            if (!s) { check(`reload ${i + 1} booted`, false); break; }
        }
        check('no prompt on ordinary reloads', dialogs === before,
            `dialogs went ${before} -> ${dialogs}: ${JSON.stringify(dialogTexts.slice(before))}`);

        // ---- 3. a store app update must not update the OS -------------------
        console.log('[store app update]');
        const swBefore = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
        published.storeAppVersion = '9.9.9';
        const beforeStore = dialogs;
        state = await reload();
        check('the OS still booted', !!state);
        check('a store app update prompts nothing', dialogs === beforeStore,
            `dialogs went ${beforeStore} -> ${dialogs}: ${JSON.stringify(dialogTexts.slice(beforeStore))}`);
        const catalogVersion = await cdp.eval(`(async () => {
            const res = await fetch('/js/apps/registry.js', { cache: 'no-store' });
            const text = await res.text();
            const m = text.match(/"id":"appStore"[^}]*?"version":"([^"]+)"/);
            return m ? m[1] : null;
        })()`);
        check('the new app catalog version is live', catalogVersion === '9.9.9', String(catalogVersion));
        published.storeAppVersion = null;

        // ---- 4. a real OS release does prompt -------------------------------
        console.log('[OS release]');
        const beforeOs = dialogs;
        published.osVersion = '99.0.0';
        // The browser checks for a new worker after a navigation: the first
        // reload installs the new worker, the second one sees it waiting.
        await reload();
        await new Promise(r => setTimeout(r, 4000));
        state = await reload();
        check('the update prompt appeared once', dialogs === beforeOs + 1,
            `dialogs went ${beforeOs} -> ${dialogs}: ${JSON.stringify(dialogTexts.slice(beforeOs))}`);
        check('the prompt is the update prompt',
            /new version of windows 12/i.test(dialogTexts[dialogs - 1] || ''),
            JSON.stringify(dialogTexts[dialogs - 1] || ''));
        await new Promise(r => setTimeout(r, 6000));
        state = await waitForShell(60000);
        check('the OS booted on the new core', !!state);
        const coreVersion = await cdp.eval(`(async () => {
            const res = await fetch('/core-manifest.json', { cache: 'no-store' });
            const m = await res.json();
            return m.version;
        })()`);
        check('the running core is the new version', coreVersion === '99.0.0', String(coreVersion));
        published.osVersion = null;

        // The worker script must be identical again -> nothing to update.
        check('the worker script was not modified by the test', fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') === swBefore);

        if (errors.length) {
            console.log('--- errors ---');
            console.log(errors.slice(-10).join('\n'));
        }

        if (failures.length) {
            console.log(`\nFAIL: ${failures.length} check(s) failed`);
            return 1;
        }
        console.log('\nUPDATE SMOKE OK');
        return 0;
    } catch (e) {
        console.error('update smoke error:', e.message);
        console.log('dialogs:', dialogs, JSON.stringify(dialogTexts));
        console.log('--- errors ---\n' + errors.slice(-10).join('\n'));
        return 1;
    } finally {
        try { proc.kill(); } catch { /* already gone */ }
        server.close();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}

process.exit(await main());
