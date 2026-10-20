// Headless smoke test for the OPFS boot flow.
//
//     node test/boot.smoke.mjs
//
// Serves the repo over http://localhost (a secure context, so service
// workers and OPFS work), drives headless Edge/Chrome through the DevTools
// protocol and checks that:
//
//   1. the bootstrap installs the OS core into OPFS,
//   2. it asks for the refresh and survives the reload,
//   3. the shell boots and the OS core shows up as a read-only \Windows tree.
//
// Zero dependencies: Node's built-in WebSocket talks to the DevTools protocol.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8123;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.png': 'image/png',
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
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(file).pipe(res);
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
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'w12-boot-'));
    const port = 9333;
    const proc = spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate,MediaRouter',
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${port}`,
        `http://localhost:${PORT}/`
    ], { stdio: 'ignore' });

    let cdp = null;
    const consoleLines = [];
    const errors = [];
    let dialogs = 0;

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
        await cdp.send('Network.enable');

        cdp.on((msg) => {
            if (msg.method === 'Runtime.consoleAPICalled') {
                const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
                consoleLines.push(text);
            } else if (msg.method === 'Runtime.exceptionThrown') {
                const d = msg.params.exceptionDetails;
                errors.push(d.exception?.description || d.text);
            } else if (msg.method === 'Log.entryAdded') {
                const e = msg.params.entry;
                if (e.level === 'error') errors.push(e.text);
            } else if (msg.method === 'Network.responseReceived') {
                const r = msg.params.response;
                if (r.status >= 400) errors.push(`HTTP ${r.status} ${r.url}`);
            } else if (msg.method === 'Network.loadingFailed') {
                errors.push(`NETFAIL ${msg.params.errorText} ${msg.params.requestId}`);
            } else if (msg.method === 'Page.javascriptDialogOpening') {
                dialogs++;
                cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => { });
            }
        });

        // Wait for the OS to boot: the shell is in the document and the
        // filesystem module is live.
        let booted = false;
        let lastStatus = '';
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
            const state = await cdp.eval(`(() => {
                const shell = !!document.getElementById('taskbar');
                const fs = !!window._FileSystem;
                const status = (document.getElementById('boot-status') || {}).textContent || '';
                return { shell, fs, status };
            })()`);
            lastStatus = state.status;
            if (state.shell && state.fs) { booted = true; break; }
            await new Promise(r => setTimeout(r, 500));
        }
        console.log('last status text:', JSON.stringify(lastStatus));

        // Sign in so the shell (and File Explorer) is fully alive. The login
        // screen appears once the machine phase (filesystem, OS core) is
        // done, so wait for it before signing in.
        await cdp.eval(`(async () => {
            const deadline = Date.now() + 60000;
            while (Date.now() < deadline) {
                const el = document.getElementById('login-screen');
                if (el && !el.classList.contains('hidden')) break;
                await new Promise(r => setTimeout(r, 200));
            }
            const accounts = window._Users.getAccounts();
            if (accounts && accounts.length) {
                await window._Sessions.signIn(accounts[0].id);
            }
            return true;
        })()`);
        // The shell is built after the sign-in: wait until the taskbar shows
        // its pins, so nothing races the shell construction.
        await cdp.eval(`(async () => {
            const deadline = Date.now() + 60000;
            while (Date.now() < deadline) {
                const pins = document.querySelectorAll('#taskbar-center .taskbar-app, #taskbar-center .taskbar-item, #taskbar-center button');
                if (window._Users.getCurrent() && pins.length > 0) break;
                await new Promise(r => setTimeout(r, 200));
            }
            return true;
        })()`);
        await new Promise(r => setTimeout(r, 1500));

        console.log('--- after sign in ---');
        console.log(JSON.stringify(await cdp.eval(`(() => {
            const FS = window._FileSystem;
            const root = FS ? FS.getNode(['/']) : null;
            const pf = FS ? FS.getNode(['Program Files']) : null;
            return {
                users: window._Users ? window._Users.getCurrent() : null,
                accounts: window._Users ? window._Users.getAccounts().length : -1,
                rootKids: root && root.children ? Object.keys(root.children).sort() : [],
                pfKids: pf && pf.children ? Object.keys(pf.children).sort() : []
            };
        })()`)));

        // A builtin app must launch from the copy on disk.
        const appLaunch = await cdp.eval(`(async () => {
            try {
                const mod = await import('/js/modules/appLoader.js');
                const folder = mod.default.folderFor('notepad');
                if (!folder) return { ok: false, error: 'notepad has no folder' };
                const opened = await mod.default.launch(folder);
                await new Promise(r => setTimeout(r, 1500));
                const wins = document.querySelectorAll('.app-window').length;
                return { ok: opened === true, folder, windows: wins };
            } catch (e) {
                return { ok: false, error: String(e && e.message) };
            }
        })()`);

        const result = await cdp.eval(`(async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            const FS = window._FileSystem;
            const root = FS ? FS.getNode(['Windows']) : null;
            const children = root && root.children ? Object.keys(root.children) : [];
            const mainNode = FS ? FS.getNode(['Windows', 'js', 'main.js']) : null;
            // Writing a core file must be refused, and the bytes on disk must
            // still be the ones the service worker serves.
            const denied = FS ? FS.writeFile(['Windows', 'js', 'main.js'], 'hacked') : null;
            const deniedCreate = FS ? FS.createFile(['Windows', 'js'], 'evil.js', 'x', 'js') : null;
            let served = null;
            try {
                const res = await fetch('/js/main.js');
                served = { status: res.status, bytes: (await res.text()).length };
            } catch (e) { served = { error: String(e.message) }; }
            return {
                shell: !!document.getElementById('taskbar'),
                controlled: !!navigator.serviceWorker.controller,
                swState: reg ? {
                    installing: !!reg.installing, waiting: !!reg.waiting,
                    active: reg.active ? reg.active.state : null
                } : null,
                windowsFolder: !!root,
                windowsChildren: children.sort(),
                coreFileIsBlob: !!(mainNode && mainNode.blobRef),
                coreBlobRef: mainNode ? mainNode.blobRef : null,
                writeDenied: denied === false,
                createDenied: deniedCreate === false,
                served,
                users: window._Users ? window._Users.getCurrent() : null
            };
        })()`);
        result.appLaunch = appLaunch;

        // ---- offline reload: everything must come from OPFS ----
        await cdp.send('Network.emulateNetworkConditions', {
            offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
        });
        await cdp.send('Page.reload', { ignoreCache: false });
        let offlineBooted = false;
        const offlineDeadline = Date.now() + 60000;
        while (Date.now() < offlineDeadline) {
            const state = await cdp.eval(`(() => ({
                shell: !!document.getElementById('taskbar'),
                fs: !!window._FileSystem
            }))()`);
            if (state.shell && state.fs) { offlineBooted = true; break; }
            await new Promise(r => setTimeout(r, 500));
        }
        const offlineStatus = await cdp.eval(`(() => {
            const el = document.getElementById('boot-status');
            return { text: el ? el.textContent : null, hasShell: !!document.getElementById('taskbar') };
        })()`);
        console.log('--- after offline reload ---');
        console.log(JSON.stringify(await cdp.eval(`(async () => {
            const FS = window._FileSystem;
            const root = FS ? FS.getNode(['/']) : null;
            const reg = await navigator.serviceWorker.getRegistration();
            return {
                rootKids: root && root.children ? Object.keys(root.children).sort() : [],
                backend: FS ? FS.backendId() : null,
                controller: !!navigator.serviceWorker.controller,
                sw: reg ? {
                    installing: reg.installing ? reg.installing.state : null,
                    waiting: reg.waiting ? reg.waiting.state : null,
                    active: reg.active ? reg.active.state : null
                } : null
            };
        })()`)));
        await cdp.send('Network.emulateNetworkConditions', {
            offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
        });

        console.log('--- offline reload ---');
        console.log(JSON.stringify({ offlineBooted, ...offlineStatus }));
        console.log('--- result ---');
        console.log(JSON.stringify(result, null, 2));
        console.log('dialogs:', dialogs);
        if (consoleLines.length) {
            console.log('--- console ---');
            console.log(consoleLines.slice(-25).join('\n'));
        }
        if (errors.length) {
            console.log('--- errors ---');
            console.log(errors.slice(-15).join('\n'));
        }

        const failures = [];
        if (!result.shell) failures.push('shell did not boot');
        if (!result.controlled) failures.push('service worker does not control the page');
        if (!result.windowsFolder) failures.push('\\Windows core mirror missing');
        if (!result.coreFileIsBlob) failures.push('core file is not a blob reference');
        if (!result.writeDenied) failures.push('core file was writable');
        if (!result.createDenied) failures.push('core folder accepted a new file');
        if (!result.served || result.served.status !== 200) failures.push('core module not served from OPFS');
        if (!result.appLaunch || !result.appLaunch.ok) failures.push('builtin app failed to launch: ' + (result.appLaunch && result.appLaunch.error));
        if (!offlineBooted) failures.push('offline reload did not boot: ' + JSON.stringify(offlineStatus));
        if (!booted) failures.push('boot timed out');
        if (errors.length) failures.push(errors.length + ' console error(s)');

        if (failures.length) {
            console.log('\nFAIL: ' + failures.join('; '));
            return 1;
        }
        console.log('\nBOOT SMOKE OK');
        return 0;
    } catch (e) {
        console.error('boot smoke error:', e.message);
        console.log('--- console ---\n' + consoleLines.slice(-30).join('\n'));
        console.log('--- errors ---\n' + errors.slice(-15).join('\n'));
        return 1;
    } finally {
        try { proc.kill(); } catch { /* already gone */ }
        server.close();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}

process.exit(await main());
