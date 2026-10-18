// LoginScreen — boot sequence, user picker and sign-in.
//
// Flow: boot screen (2s) → user picker → password (only for accounts that
// have one) → Welcome spinner → desktop.
//
// Nothing per-user is preloaded: boot only initializes the filesystem and the
// account store, so the picker appears immediately and the CHOSEN profile
// loads afterwards (the shell is built while the Welcome spinner shows), the
// way Windows loads a profile only after you sign in.
//
// The screen is dressed with the primary administrator's personalization
// (Settings > Personalization is admin territory), read straight from that
// profile's config — no session is activated to paint it.
//
// The same picker doubles as the "Switch user" / "Sign out" surface: show()
// brings it back over a live session (with a Cancel button), and signing in
// hands off to the handler captured by bootSequence().
import Users from './users.js';
import SystemConfig from './systemConfig.js';

const LoginScreen = (() => {
    let signInHandler = null;

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function typeLabel(acc) {
        return acc.type === 'administrator' ? 'Administrator' : 'Standard user';
    }

    function ensureScreen() {
        let screen = document.getElementById('login-screen');
        if (screen) return screen;
        screen = document.createElement('div');
        screen.id = 'login-screen';
        screen.className = 'hidden';
        screen.innerHTML = '<div class="login-content"></div>';
        document.body.appendChild(screen);
        return screen;
    }

    // Paint the primary administrator's theme on the login screen.
    async function applyTheme() {
        let screen;
        try { screen = ensureScreen(); } catch (e) { return; }
        let theme = null;
        try {
            const adminId = Users.primaryAdminId();
            if (adminId) theme = SystemConfig.readThemeFor(adminId);
        } catch (e) { /* defaults */ }
        const isDark = !theme || theme.darkMode !== false;
        screen.classList.toggle('login-light', !isDark);
        screen.style.setProperty('--accent-color', (theme && theme.accentColor) || '#0078D4');
        const style = (theme && theme.backgroundStyle) || 'gradient';
        screen.style.background = SystemConfig.wallpaperGradient(style, isDark);
        if (theme && theme.wallpaperImage) {
            try {
                const url = await SystemConfig.resolveWallpaperURL(theme.wallpaperImage);
                if (url) SystemConfig.setWallpaperImageProps(screen, url, theme.wallpaperFit);
            } catch (e) { /* gradient stays */ }
        }
    }

    function signedInIds() {
        try {
            return (window._Sessions && window._Sessions.list()) || [];
        } catch (e) { return []; }
    }

    function sessionsAlive() {
        const ids = signedInIds();
        return ids.length > 0 && !!window._Sessions.getActive();
    }

    function showPicker(opts = {}) {
        const canCancel = !!opts.canCancel;
        const screen = ensureScreen();
        screen.classList.remove('hidden', 'fade-out');
        screen.style.opacity = '1';
        applyTheme();

        const accounts = Users.getAccounts();
        const last = Users.lastUserId();
        const live = signedInIds();

        const tiles = accounts.map(acc => `
            <button class="login-tile${last && acc.id === last ? ' login-tile-last' : ''}" data-user="${acc.id}">
                <div class="login-tile-avatar">${esc(acc.name.charAt(0).toUpperCase())}</div>
                <div class="login-tile-name">${esc(acc.name)}</div>
                <div class="login-tile-role">${esc(typeLabel(acc))}</div>
                ${live.includes(acc.id) ? '<div class="login-tile-live">Signed in</div>' : ''}
            </button>
        `).join('');

        screen.querySelector('.login-content').innerHTML = `
            <div class="login-title">Sign in</div>
            <div class="login-picker">${tiles}</div>
            ${canCancel ? '<button class="login-cancel" title="Back to your session">Cancel</button>' : ''}
        `;

        screen.querySelectorAll('.login-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                const acc = Users.getAccount(tile.dataset.user);
                if (acc) selectAccount(acc, canCancel);
            });
        });
        const cancel = screen.querySelector('.login-cancel');
        if (cancel) cancel.addEventListener('click', () => hide());
    }

    function selectAccount(account, canCancel) {
        if (!Users.hasPassword(account.id)) {
            doSignIn(account);
            return;
        }
        const screen = ensureScreen();
        const content = screen.querySelector('.login-content');
        content.innerHTML = `
            <div class="login-avatar">${esc(account.name.charAt(0).toUpperCase())}</div>
            <div class="login-username">${esc(account.name)}</div>
            <div class="login-userrole">${esc(typeLabel(account))}</div>
            <div class="login-password-row">
                <input type="password" class="login-password" placeholder="Password" autocomplete="off">
                <button class="login-submit" title="Sign in">&#10142;</button>
            </div>
            <div class="login-error"></div>
            <button class="login-back" title="Back">&#8592;</button>
        `;

        const input = content.querySelector('.login-password');
        const errorEl = content.querySelector('.login-error');
        const submit = content.querySelector('.login-submit');

        const tryPassword = () => {
            Users.verifyPassword(account.id, input.value).then(ok => {
                if (ok) {
                    doSignIn(account);
                } else {
                    errorEl.textContent = 'Incorrect password. Try again.';
                    content.classList.remove('shake');
                    void content.offsetWidth; // restart the animation
                    content.classList.add('shake');
                    input.value = '';
                    input.focus();
                }
            });
        };

        submit.addEventListener('click', tryPassword);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPassword(); });
        content.querySelector('.login-back').addEventListener('click', () => showPicker({ canCancel }));
        input.focus();
    }

    // Authenticated: show the Welcome spinner while the profile loads, then
    // hand over to the desktop.
    function doSignIn(account) {
        const screen = ensureScreen();
        const content = screen.querySelector('.login-content');
        content.classList.remove('shake');
        content.innerHTML = `
            <div class="login-avatar">${esc(account.name.charAt(0).toUpperCase())}</div>
            <div class="login-username">${esc(account.name)}</div>
            <div class="login-userrole">${esc(typeLabel(account))}</div>
            <div class="login-welcome">
                <span>Welcome</span>
                <div class="login-spinner"></div>
            </div>
        `;
        if (!signInHandler) return;
        Promise.resolve(signInHandler(account.id))
            .then((ok) => {
                if (ok === false) { showPicker({ canCancel: sessionsAlive() }); return; }
                hide();
            })
            .catch(() => {
                // A failed profile load must not dead-end on the spinner.
                showPicker({ canCancel: sessionsAlive() });
            });
    }

    // Reveal the shell (and fade the login screen away if it is up).
    function hide() {
        const screen = document.getElementById('login-screen');
        if (screen) {
            screen.classList.add('fade-out');
            setTimeout(() => {
                screen.classList.add('hidden');
                screen.classList.remove('fade-out');
                screen.style.opacity = '';
            }, 600);
        }
        const desktop = document.getElementById('desktop');
        const taskbar = document.getElementById('taskbar');
        const wallpaper = document.getElementById('wallpaper');
        if (desktop) { desktop.style.transition = 'opacity 0.5s ease-out'; desktop.style.opacity = '1'; }
        if (taskbar) { taskbar.style.transition = 'opacity 0.5s ease-out'; taskbar.style.opacity = '1'; }
        if (wallpaper) { wallpaper.style.transition = 'opacity 0.5s ease-out'; wallpaper.style.opacity = '1'; }
    }

    // Full boot sequence: boot screen fade → login screen → profile load.
    function bootSequence(opts = {}) {
        signInHandler = opts.onSignIn || null;
        setTimeout(() => {
            const bootScreen = document.getElementById('boot-screen');
            const showIt = () => showPicker();
            if (bootScreen) {
                bootScreen.classList.add('fade-out');
                setTimeout(() => { bootScreen.remove(); showIt(); }, 500);
            } else {
                showIt();
            }
        }, 2000);
    }

    // Re-open the picker (Switch user / Sign out). canCancel shows a button
    // that returns to the still-running foreground session.
    function show(opts = {}) {
        showPicker({ canCancel: !!opts.canCancel });
    }

    return { bootSequence, show, showPicker, hide };
})();

export default LoginScreen;
