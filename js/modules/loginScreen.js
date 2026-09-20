// LoginScreen — boot sequence, user picker and sign-in.
//
// Flow: boot screen (2s) → user picker (last user highlighted) → password
// (only for accounts that have one) → Welcome spinner → desktop.
//
// The boot target (last user or an explicit switch target from
// Users.beginSwitch) is already loaded when this module runs — signing in
// as that user is free; picking a DIFFERENT user reloads the OS into their
// session (Users.beginSwitch), because per-user modules initialized for
// the previous target during boot.
import Users from './users.js';

const LoginScreen = (() => {
    // Sign-in for an already-loaded account: verify password if needed,
    // mark the session, then hand over to the desktop.
    function signInLoaded(account) {
        return new Promise((resolve, reject) => {
            const screen = document.getElementById('login-screen');
            const content = screen.querySelector('.login-content');

            const showWelcome = () => {
                content.innerHTML = `
                    <div class="login-avatar">${account.name.charAt(0).toUpperCase()}</div>
                    <div class="login-username">${esc(account.name)}</div>
                    <div class="login-welcome">
                        <span>Welcome</span>
                        <div class="login-spinner"></div>
                    </div>
                `;
                setTimeout(resolve, 1400);
            };

            if (!Users.hasPassword(account.id)) {
                showWelcome();
                return;
            }

            content.innerHTML = `
                <div class="login-avatar">${account.name.charAt(0).toUpperCase()}</div>
                <div class="login-username">${esc(account.name)}</div>
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
                        showWelcome();
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
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') tryPassword();
            });
            content.querySelector('.login-back').addEventListener('click', () => {
                showPicker();
            });
            input.focus();
        });
    }

    function showPicker() {
        const screen = ensureScreen();
        const accounts = Users.getAccounts();
        const last = Users.getCurrent();

        const tiles = accounts.map(acc => `
            <button class="login-tile${last && acc.id === last.id ? ' login-tile-last' : ''}" data-user="${acc.id}">
                <div class="login-tile-avatar">${esc(acc.name.charAt(0).toUpperCase())}</div>
                <div class="login-tile-name">${esc(acc.name)}</div>
            </button>
        `).join('');

        screen.querySelector('.login-content').innerHTML = `
            <div class="login-title">Sign in</div>
            <div class="login-picker">${tiles}</div>
        `;

        screen.querySelectorAll('.login-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                const id = tile.dataset.user;
                const acc = Users.getAccount(id);
                if (!acc) return;
                if (last && acc.id === last.id) {
                    // The loaded session's user — sign in directly.
                    showSignInCard(acc);
                } else {
                    // Different account: reload into their session.
                    Users.beginSwitch(acc.id);
                }
            });
        });
    }

    function showSignInCard(account) {
        const screen = ensureScreen();
        screen.classList.remove('hidden');
        screen.style.opacity = '1';
        signInLoaded(account);
    }

    function ensureScreen() {
        let screen = document.getElementById('login-screen');
        if (screen) return screen;
        screen = document.createElement('div');
        screen.id = 'login-screen';
        screen.innerHTML = `<div class="login-content"></div>`;
        document.body.appendChild(screen);
        return screen;
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Full boot sequence: boot screen fade → login screen → desktop reveal
    // (via onReveal callback). Replaces the old hardcoded boot animation.
    function bootSequence(onReveal) {
        const desktop = document.getElementById('desktop');
        const taskbar = document.getElementById('taskbar');

        function reveal() {
            const screen = document.getElementById('login-screen');
            if (screen) {
                screen.classList.add('fade-out');
                setTimeout(() => screen.remove(), 600);
            }
            desktop.style.transition = 'opacity 0.5s ease-out';
            taskbar.style.transition = 'opacity 0.5s ease-out';
            desktop.style.opacity = '1';
            taskbar.style.opacity = '1';
        }

        setTimeout(() => {
            const bootScreen = document.getElementById('boot-screen');
            if (bootScreen) {
                bootScreen.classList.add('fade-out');
                setTimeout(() => {
                    bootScreen.remove();
                    const screen = ensureScreen();
                    screen.classList.remove('hidden');
                    screen.style.opacity = '1';
                    showPicker();
                    // Once the account signs in, hand over to the desktop.
                    const content = screen.querySelector('.login-content');
                    const observer = new MutationObserver(() => {
                        if (!content.querySelector('.login-welcome')) return;
                        observer.disconnect();
                        const u = Users.getCurrent();
                        Users.signIn(u.id);
                        setTimeout(reveal, 1000);
                    });
                    observer.observe(content, { childList: true });
                }, 500);
            }
        }, 2000);
    }

    return { bootSequence, showPicker };
})();

export default LoginScreen;
