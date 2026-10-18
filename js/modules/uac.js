// UAC — User Account Control for privileged (administrator) actions.
//
// Windows-style elevation, modeled on the real flow:
//   * administrator signed in → a Yes/No *consent* prompt ("Do you want to
//     allow this app to make changes to your device?");
//   * standard user signed in → a *credential* prompt: choose an
//     administrator account and type its password (an administrator without
//     a password approves by being selected — a simulation affordance).
//
// Elevation is never persistent: every privileged action asks again. The
// dialog is a fixed, modal overlay drawn above the taskbar and every window
// (not a draggable shell window) — a stand-in for the Windows secure
// desktop. Prompts are serialized, one at a time.
//
// Callers:
//   UAC.request({ name, message, publisher }) -> Promise<boolean>
// Modules that can't import this file safely (packages.js, fsGuard.js) use
// the window._UAC global, exactly like window._FSGuard / window._Users.
import Users from './users.js';

// Classic blue-over-gold UAC shield (hard-stop gradient).
const SHIELD = '<svg viewBox="0 0 48 48" width="44" height="44" xmlns="http://www.w3.org/2000/svg">'
    + '<defs><linearGradient id="w12-uac-shield" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0.52" stop-color="#4b8fe0"/><stop offset="0.52" stop-color="#e8b73a"/>'
    + '</linearGradient></defs>'
    + '<path d="M24 3 41 9.4v12.8C41 33 34 42.7 24 46.5 14 42.7 7 33 7 22.2V9.4z" '
    + 'fill="url(#w12-uac-shield)" stroke="#1b3f77" stroke-width="1.5"/></svg>';

const INPUT_STYLE = 'width:100%;padding:8px 10px;margin-top:8px;background:rgba(255,255,255,0.06);'
    + 'border:1px solid var(--window-border,#3a3a3a);border-radius:6px;color:var(--text-primary,#fff);font-size:13px;box-sizing:border-box;';
const BTN_STYLE = 'min-width:84px;padding:8px 18px;border-radius:6px;font-size:13px;cursor:pointer;'
    + 'border:1px solid var(--window-border,#3a3a3a);background:var(--hover-bg,rgba(255,255,255,0.08));color:var(--text-primary,#fff);';
const BTN_PRIMARY_STYLE = 'min-width:84px;padding:8px 18px;border-radius:6px;font-size:13px;cursor:pointer;'
    + 'border:1px solid #2b6fd0;background:#2b6fd0;color:#fff;font-weight:600;';

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const UAC = (() => {
    let chain = Promise.resolve(); // serialize prompts

    function admins() {
        return Users.getAccounts().filter(a => a.type === 'administrator');
    }

    function credentialBlock(adminList) {
        if (adminList.length === 0) {
            return `<div style="margin-top:14px;font-size:12px;color:#ff9a9a;">No administrator account is available to approve this action.</div>`;
        }
        const single = adminList[0];
        const picker = adminList.length === 1
            ? `<div style="font-size:13px;font-weight:600;">${esc(single.name)}</div>`
            : `<select id="uac-user" style="${INPUT_STYLE}">${adminList
                  .map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>`;
        let password;
        if (adminList.length === 1 && !Users.hasPassword(single.id)) {
            password = `<div style="margin-top:6px;font-size:11px;color:#888;">This administrator has no password — approval is granted by continuing.</div>`;
        } else {
            password = `<input id="uac-pass" type="password" placeholder="Administrator password" autocomplete="off" style="${INPUT_STYLE}">`;
        }
        return `<div style="margin-top:14px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid var(--window-border,#3a3a3a);border-radius:8px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin-bottom:6px;">Administrator credentials</div>
            ${picker}${password}
        </div>`;
    }

    // Build the modal overlay. Resolves true (admin consent) / credential
    // object (standard user) / false (declined).
    function prompt(opts) {
        return new Promise(resolve => {
            const isAdmin = Users.isAdmin();
            const adminList = admins();
            const canApprove = isAdmin || adminList.length > 0;
            const name = opts.name || 'Windows 12';
            const message = opts.message || 'Do you want to allow this app to make changes to your device?';
            const publisher = opts.publisher || 'Verified publisher: Windows 12';

            const root = document.createElement('div');
            root.className = 'uac-root';
            root.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
            root.innerHTML = `
                <div class="uac-dialog" style="width:480px;max-width:calc(100vw - 40px);background:var(--window-bg,#202020);border:1px solid var(--window-border,#3a3a3a);border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,0.65);overflow:hidden;animation:windowOpen 0.15s ease-out;">
                    <div style="padding:10px 16px;background:linear-gradient(180deg,#2f63ad,#1f4c8c);color:#fff;font-size:13px;font-weight:600;">User Account Control</div>
                    <div style="padding:18px;">
                        <div style="display:flex;gap:14px;align-items:flex-start;">
                            <span style="width:44px;height:44px;flex-shrink:0;">${SHIELD}</span>
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:14px;line-height:1.45;">${esc(message)}</div>
                                <div style="margin-top:10px;font-size:14px;font-weight:600;">${esc(name)}</div>
                                <div style="font-size:12px;color:#888;">${esc(publisher)}</div>
                            </div>
                        </div>
                        ${isAdmin ? '' : credentialBlock(adminList)}
                    </div>
                    <div class="uac-actions" style="display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;background:rgba(0,0,0,0.22);border-top:1px solid var(--window-border,#3a3a3a);"></div>
                </div>`;

            const actions = root.querySelector('.uac-actions');
            const noBtn = document.createElement('button');
            noBtn.type = 'button';
            noBtn.className = 'uac-no';
            noBtn.textContent = 'No';
            noBtn.style.cssText = BTN_STYLE;
            actions.appendChild(noBtn);

            const yesBtn = document.createElement('button');
            yesBtn.type = 'button';
            yesBtn.className = 'uac-yes';
            yesBtn.textContent = canApprove ? 'Yes' : 'Close';
            yesBtn.style.cssText = canApprove ? BTN_PRIMARY_STYLE : BTN_STYLE;
            actions.appendChild(yesBtn);

            const readCreds = () => {
                const sel = root.querySelector('#uac-user');
                const pass = root.querySelector('#uac-pass');
                const user = sel ? sel.value : (adminList[0] ? adminList[0].id : null);
                return { user, password: pass ? pass.value : '' };
            };

            const finish = (approve) => {
                let value = false;
                if (approve && canApprove) value = isAdmin ? true : readCreds();
                document.removeEventListener('keydown', onKey, true);
                if (root.parentNode) root.parentNode.removeChild(root);
                resolve(value);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); finish(false); }
                else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            };

            noBtn.addEventListener('click', () => finish(false));
            yesBtn.addEventListener('click', () => finish(true));
            document.addEventListener('keydown', onKey, true);

            document.body.appendChild(root);
            const focusable = root.querySelector('#uac-pass') || root.querySelector('#uac-user') || yesBtn;
            if (focusable && focusable.focus) focusable.focus();
        });
    }

    // Ask for elevation. `opts.name` is the actor shown in the dialog (an app
    // name or "Windows Settings"), `opts.message` the action description.
    // Resolves true only when the current administrator consents, or an
    // administrator's credentials verify (standard user).
    function request(opts = {}) {
        if (typeof Users.getCurrent !== 'function' || !Users.getCurrent()) return Promise.resolve(false);
        const next = chain.then(async () => {
            const res = await prompt(opts);
            if (res === true) return true;
            if (!res || !res.user) return false;
            const acc = Users.getAccount(res.user);
            if (!acc || acc.type !== 'administrator') return false;
            if (!Users.hasPassword(acc.id)) return true; // passwordless admin approves
            try { return await Users.verifyPassword(acc.id, res.password); } catch { return false; }
        });
        chain = next.then(() => {}, () => {});
        return next;
    }

    // Whether any administrator exists to approve a standard user's request.
    function canElevate() {
        return admins().length > 0;
    }

    return { request, canElevate };
})();

export default UAC;
