// Sessions — concurrent user sessions (Windows-style fast user switching).
//
// Unlike the old reload-based switch, several accounts can be signed in at the
// same time in one page: each session owns its windows (WindowManager tags
// them with `userId`), its virtual desktops and its per-user OS state. Only the
// *foreground* session is visible; the others keep running in the background
// (hidden windows, inactive desktops) and are brought back instantly.
//
// This module is the session registry only. It deliberately knows nothing
// about the shell: main.js injects the hooks that actually re-point the
// per-user modules and refresh the desktop, which avoids import cycles
// (WindowManager, Taskbar, Settings and friends are all part of the shell).
//
// Hooks:
//   onBoot(userId)     first sign-in for this profile in this page: build the
//                      shell once (windows, taskbar, modules) while that user
//                      is current. Await-able.
//   onActivate(userId) a session became the foreground one: reload every
//                      per-user module from its profile and re-apply window
//                      visibility / wallpaper / taskbar. Await-able.
//   onClose(userId)    a session is ending: close its windows, stop its
//                      background execution, persist. Await-able.
//
// `Users.getCurrent()` is the foreground profile, so every per-user module's
// lazy path helper keeps working unchanged across a switch.

import Users from './users.js';

const Sessions = (() => {
    const signedIn = new Set();
    let active = null;
    let hooks = { onBoot: null, onActivate: null, onClose: null };

    function setHooks(next) {
        hooks = { ...hooks, ...(next || {}) };
    }

    function isSignedIn(id) {
        return signedIn.has(id);
    }

    function isActive(id) {
        return !!id && active === id;
    }

    function getActive() {
        return active;
    }

    function list() {
        return [...signedIn];
    }

    function emit() {
        try {
            window.dispatchEvent(new CustomEvent('sessions-changed', {
                detail: { active, signedIn: [...signedIn] }
            }));
        } catch (e) { /* non-DOM context */ }
    }

    // First sign-in for a profile: boot the shell (once) for this user.
    async function boot(id) {
        if (!id || signedIn.has(id)) return false;
        // If nothing is in the foreground yet, this profile already is: the
        // shell built during onBoot tags its windows with the right owner.
        if (active === null) active = id;
        if (hooks.onBoot) await hooks.onBoot(id);
        signedIn.add(id);
        emit();
        return true;
    }

    // Bring an already-signed-in (or freshly selected) profile to the front.
    async function activate(id) {
        if (!Users.getAccount(id)) return false;
        active = id;
        Users.setCurrent(id);
        if (hooks.onActivate) await hooks.onActivate(id);
        emit();
        return true;
    }

    // Sign in + boot + foreground in one step (login picker / lock screen).
    async function signIn(idOrAccount) {
        const id = typeof idOrAccount === 'string'
            ? idOrAccount
            : (idOrAccount && idOrAccount.id);
        if (!id || !Users.getAccount(id)) return false;
        Users.signIn(id);          // records lastLogin (source of truth)
        await boot(id);
        await activate(id);
        return true;
    }

    // End a session: close its windows + stop its background work (hook),
    // then drop it from the registry. The profile's files stay on disk.
    async function signOut(id) {
        if (!signedIn.has(id)) return false;
        if (hooks.onClose) await hooks.onClose(id);
        signedIn.delete(id);
        if (active === id) active = null;
        emit();
        return true;
    }

    // Test helper: forget every session without running hooks.
    function reset() {
        signedIn.clear();
        active = null;
    }

    return { setHooks, isSignedIn, isActive, getActive, list, boot, activate, signIn, signOut, reset };
})();

export default Sessions;
