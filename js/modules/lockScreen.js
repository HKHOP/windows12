// LockScreen — lock, sleep, restart, shut down and sign out.
//
// None of these reload the page any more (except Restart / the power button,
// which genuinely reboot): Lock freezes the foreground session behind a
// secure-desktop overlay and returns to it on unlock, Sleep fades the screen
// to black and wakes into the lock screen, and Sign out ends the session and
// reopens the user picker while the other sessions keep running.
//
// The lock overlay reuses the UAC "secure desktop" trick: body.locked hides
// every window, icon and the taskbar (visibility keeps their geometry) and
// keeps only the wallpaper + this overlay. The sign-in prompt verifies the
// active user's password (a passwordless account unlocks on click).
import Users from './users.js';
import Sessions from './sessions.js';
import FileSystem from './fileSystem.js';
import Keyboard from './keyboard.js';
import LoginScreen from './loginScreen.js';

const LockScreen = (() => {
    let locked = false;
    let root = null;          // lock overlay (body child, visible while locked)
    let sleepRoot = null;     // sleep black-out layer
    let clockTimer = null;

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function ensureRoot() {
        if (root && root.isConnected) return root;
        root = document.createElement('div');
        root.id = 'lock-screen';
        root.className = 'lock-root hidden';
        document.body.appendChild(root);
        return root;
    }

    function timeText() {
        const now = new Date();
        return {
            time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        };
    }

    function renderLock() {
        const el = ensureRoot();
        const user = Users.getCurrent();
        const t = timeText();
        const hasPw = user ? Users.hasPassword(user.id) : false;
        const initial = user ? user.name.charAt(0).toUpperCase() : '?';

        el.innerHTML = `
            <div class="lock-clock">
                <div class="lock-time">${esc(t.time)}</div>
                <div class="lock-date">${esc(t.date)}</div>
            </div>
            <div class="lock-signin">
                <div class="lock-avatar">${esc(initial)}</div>
                <div class="lock-name">${esc(user ? user.name : 'User')}</div>
                ${hasPw ? `
                    <div class="login-password-row">
                        <input type="password" class="login-password lock-password" placeholder="Password" autocomplete="off">
                        <button class="login-submit lock-submit" title="Unlock">&#10142;</button>
                    </div>
                    <div class="login-error lock-error"></div>
                ` : `
                    <button class="lock-unlock-btn">Sign in</button>
                `}
                <button class="lock-switch">Switch user</button>
            </div>
        `;

        const input = el.querySelector('.lock-password');
        const errorEl = el.querySelector('.lock-error');
        const tryUnlock = () => {
            if (!user) { unlock(); return; }
            Users.verifyPassword(user.id, input.value).then(ok => {
                if (ok) {
                    unlock();
                } else {
                    errorEl.textContent = 'Incorrect password. Try again.';
                    input.value = '';
                    input.focus();
                    el.querySelector('.lock-signin').classList.remove('shake');
                    void el.offsetWidth;
                    el.querySelector('.lock-signin').classList.add('shake');
                }
            });
        };
        if (input) {
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
            el.querySelector('.lock-submit').addEventListener('click', tryUnlock);
            input.focus();
        }
        const unlockBtn = el.querySelector('.lock-unlock-btn');
        if (unlockBtn) unlockBtn.addEventListener('click', () => unlock());
        el.querySelector('.lock-switch').addEventListener('click', () => { unlock(); LoginScreen.show({ canCancel: true }); });

        tickClock();
    }

    function tickClock() {
        if (!root) return;
        const t = timeText();
        const timeEl = root.querySelector('.lock-time');
        const dateEl = root.querySelector('.lock-date');
        if (timeEl) timeEl.textContent = t.time;
        if (dateEl) dateEl.textContent = t.date;
    }

    function startClock() {
        stopClock();
        clockTimer = setInterval(tickClock, 1000);
    }

    function stopClock() {
        if (clockTimer) clearInterval(clockTimer);
        clockTimer = null;
    }

    function lock() {
        if (locked) return;
        locked = true;
        // Never leave a half-open picker behind the lock.
        try { LoginScreen.hide(); } catch (e) { /* not shown */ }
        document.body.classList.add('locked');
        renderLock();
        ensureRoot().classList.remove('hidden');
        startClock();
    }

    function unlock() {
        if (!locked) return;
        locked = false;
        stopClock();
        document.body.classList.remove('locked');
        if (root) root.classList.add('hidden');
    }

    function isLocked() {
        return locked;
    }

    // ---------- sleep ----------

    function ensureSleepRoot() {
        if (sleepRoot && sleepRoot.isConnected) return sleepRoot;
        sleepRoot = document.createElement('div');
        sleepRoot.id = 'sleep-screen';
        sleepRoot.className = 'sleep-root';
        document.body.appendChild(sleepRoot);
        return sleepRoot;
    }

    function sleep() {
        const el = ensureSleepRoot();
        const wake = () => {
            window.removeEventListener('pointerdown', wake, true);
            window.removeEventListener('keydown', wake, true);
            el.classList.remove('on');
            lock();
        };
        window.addEventListener('pointerdown', wake, true);
        window.addEventListener('keydown', wake, true);
        // Fade to black, then require input to come back.
        void el.offsetWidth;
        el.classList.add('on');
    }

    // ---------- full power screens ----------

    function flushThen(fn) {
        try {
            const f = FileSystem;
            const flushed = f && f.flushAsync ? f.flushAsync() : (f && f.flush && f.flush());
            if (flushed && typeof flushed.then === 'function') {
                flushed.then(fn, fn);
                return;
            }
        } catch (e) { /* best effort */ }
        fn();
    }

    function restart() {
        showPowerScreen('Restarting', true);
        setTimeout(() => flushThen(() => window.location.reload()), 2000);
    }

    function shutdown() {
        showPowerScreen('Shutting down', false);
        setTimeout(() => {
            if (shutdownOverlay) {
                shutdownOverlay.classList.add('powered-off');
                shutdownOverlay.innerHTML = `
                    <div class="poweroff-inner">
                        <button class="poweroff-btn" title="Power on">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
                            </svg>
                        </button>
                        <div class="poweroff-hint">Power on</div>
                    </div>`;
                const btn = shutdownOverlay.querySelector('.poweroff-btn');
                if (btn) btn.addEventListener('click', () => flushThen(() => window.location.reload()));
            }
        }, 2000);
    }

    let shutdownOverlay = null;
    function showPowerScreen(label, spin) {
        if (!shutdownOverlay) {
            shutdownOverlay = document.createElement('div');
            shutdownOverlay.className = 'power-screen';
            document.body.appendChild(shutdownOverlay);
        }
        shutdownOverlay.innerHTML = `
            <div class="power-screen-inner">
                <div class="boot-spinner"></div>
                <div class="power-screen-label">${esc(label)}</div>
            </div>`;
        requestAnimationFrame(() => shutdownOverlay.classList.add('on'));
    }

    // ---------- sign out ----------

    async function logout() {
        unlock();
        const id = Sessions.getActive();
        if (!id) {
            LoginScreen.show({ canCancel: Sessions.list().length > 0 });
            return;
        }
        await Sessions.signOut(id);
        LoginScreen.show({ canCancel: false });
    }

    function switchUser() {
        unlock();
        LoginScreen.show({ canCancel: true });
    }

    function init() {
        ensureRoot();
        Keyboard.register('WIN+L', () => { lock(); }, { system: true, description: 'Lock the device' });
    }

    return { init, lock, unlock, isLocked, sleep, restart, shutdown, logout, switchUser };
})();

export default LockScreen;
