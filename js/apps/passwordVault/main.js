// Password Vault — AES-GCM encrypted logins, offline, auto-lock.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

let key = null, lockTimer = null;

async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vault:' + text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function deriveKey(password, saltB64) {
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJSON(k, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
    return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(ct))) };
}
async function decryptJSON(k, payload) {
    const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, data);
    return JSON.parse(new TextDecoder().decode(pt));
}

function launch() {
    const app = createApp({ id: 'passwordVault', name: 'Password Vault' });
    const win = app.window.create({
        title: 'Password Vault', icon: app.icon(),
        content: `<div class="pv-root" style="display:flex;flex-direction:column;height:100%;background:#0f172a;color:#fff;font-family:'Segoe UI',sans-serif;padding:16px;box-sizing:border-box;">
            <div class="pv-body" style="flex:1;display:flex;flex-direction:column;gap:10px;overflow:auto;"></div>
        </div>`,
        width: 380, height: 520
    });
    const el = win.element;
    const body = el.querySelector('.pv-body');

    function pokeLock() {
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => { key = null; paintLock('Locked due to inactivity.'); }, 3 * 60 * 1000);
    }

    function paintLock(msg) {
        const hasVault = app.files.exists('vault.json');
        body.innerHTML = `
            <div style="text-align:center;font-size:40px;margin-top:20px;">🔒</div>
            <h2 style="text-align:center;margin:0;">${hasVault ? 'Unlock vault' : 'Create vault'}</h2>
            ${msg ? `<div style="font-size:12px;color:#f87171;text-align:center;">${escapeHtml(msg)}</div>` : ''}
            <input type="password" class="pv-pw" placeholder="Master password" style="background:#1e293b;border:1px solid #334155;color:#fff;border-radius:8px;padding:10px;font-size:14px;outline:none;">
            ${hasVault ? '' : '<input type="password" class="pv-pw2" placeholder="Repeat master password" style="background:#1e293b;border:1px solid #334155;color:#fff;border-radius:8px;padding:10px;font-size:14px;outline:none;">'}
            <button class="pv-go" style="background:#38bdf8;border:none;color:#082f49;border-radius:8px;padding:10px;cursor:pointer;font-weight:700;">${hasVault ? 'Unlock' : 'Create vault'}</button>
            <div style="font-size:11px;color:#64748b;text-align:center;">AES-GCM · PBKDF2 120k · never leaves this device</div>`;
        const go = async () => {
            const pw = body.querySelector('.pv-pw').value;
            if (!pw) return;
            if (!hasVault) {
                if (pw !== body.querySelector('.pv-pw2').value) { paintLock('Passwords do not match.'); return; }
                const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
                app.files.write('meta.json', JSON.stringify({ salt, check: await sha256(pw) }));
                key = await deriveKey(pw, salt);
                app.files.write('vault.json', JSON.stringify(await encryptJSON(key, { entries: [] })));
                paintList([]);
            } else {
                try {
                    const meta = JSON.parse(app.files.read('meta.json'));
                    if ((await sha256(pw)) !== meta.check) { paintLock('Wrong master password.'); return; }
                    key = await deriveKey(pw, meta.salt);
                    const vault = await decryptJSON(key, JSON.parse(app.files.read('vault.json')));
                    paintList(vault.entries || []);
                } catch { paintLock('Could not decrypt vault.'); key = null; return; }
            }
            pokeLock();
        };
        body.querySelector('.pv-go').addEventListener('click', go);
        body.querySelector('.pv-pw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        body.querySelector('.pv-pw').focus();
    }

    function paintList(entries) {
        let list = entries;
        body.innerHTML = `
            <div style="display:flex;gap:8px;">
                <input class="pv-q" placeholder="Search…" style="flex:1;background:#1e293b;border:1px solid #334155;color:#fff;border-radius:8px;padding:8px;font-size:13px;outline:none;">
                <button class="pv-add" style="background:#38bdf8;border:none;color:#082f49;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700;">+ Add</button>
                <button class="pv-lock" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">Lock</button>
            </div>
            <div class="pv-items" style="display:flex;flex-direction:column;gap:6px;"></div>`;
        const itemsEl = body.querySelector('.pv-items');
        function draw(filter) {
            const shown = list.filter(e => !filter || (e.site + e.user).toLowerCase().includes(filter.toLowerCase()));
            itemsEl.innerHTML = shown.length ? shown.map(e => `
                <div data-id="${e.id}" style="background:rgba(255,255,255,.05);border-radius:8px;padding:9px 10px;">
                    <div style="font-size:13px;font-weight:600;">${escapeHtml(e.site)}</div>
                    <div style="font-size:12px;color:#94a3b8;">${escapeHtml(e.user)}</div>
                    <div style="display:flex;gap:6px;margin-top:6px;">
                        <button class="pv-copy" style="flex:1;background:#1e293b;border:1px solid #334155;color:#fff;border-radius:5px;padding:5px;cursor:pointer;font-size:12px;">Copy password</button>
                        <button class="pv-show" style="background:#1e293b;border:1px solid #334155;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;font-size:12px;">Show</button>
                        <button class="pv-del" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:12px;">Delete</button>
                    </div>
                </div>`).join('') : '<div style="color:#475569;font-size:13px;text-align:center;margin-top:20px;">No logins yet — add one.</div>';
            itemsEl.querySelectorAll('[data-id]').forEach(card => {
                const id = Number(card.dataset.id);
                const entry = list.find(x => x.id === id);
                card.querySelector('.pv-copy').addEventListener('click', async () => {
                    try { await app.clipboard.writeText(entry.pass); app.notify.info('Password Vault', 'Password copied — clipboard clears when you copy next.'); }
                    catch { await app.dialogs.alert('Copy failed', 'Clipboard permission was denied.'); }
                    pokeLock();
                });
                card.querySelector('.pv-show').addEventListener('click', async () => {
                    await app.dialogs.alert(entry.site, `Username: ${entry.user}\nPassword: ${entry.pass}`);
                    pokeLock();
                });
                card.querySelector('.pv-del').addEventListener('click', async () => {
                    if (await app.dialogs.confirm('Delete login', `Delete "${entry.site}"?`)) {
                        list = list.filter(x => x.id !== id);
                        persist();
                        draw(body.querySelector('.pv-q').value);
                    }
                    pokeLock();
                });
            });
        }
        async function persist() {
            app.files.write('vault.json', JSON.stringify(await encryptJSON(key, { entries: list })));
        }
        body.querySelector('.pv-q').addEventListener('input', (e) => draw(e.target.value));
        body.querySelector('.pv-lock').addEventListener('click', () => { key = null; clearTimeout(lockTimer); paintLock(''); });
        body.querySelector('.pv-add').addEventListener('click', async () => {
            const gen = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'[b % 71]).join('');
            const res = await app.dialogs.form('New login', [
                { key: 'site', label: 'Site / app' },
                { key: 'user', label: 'Username' },
                { key: 'pass', label: 'Password (empty = generate)', value: '' }
            ]);
            if (!res || !res.site) return;
            list.unshift({ id: Date.now(), site: res.site, user: res.user || '', pass: res.pass || gen() });
            persist();
            draw(body.querySelector('.pv-q').value);
            pokeLock();
        });
        draw('');
    }

    paintLock('');
    app.shell.activity.trackAppOpen('passwordVault');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export default { launch, icon: AppIcons.get('passwordVault') };
