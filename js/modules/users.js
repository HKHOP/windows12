// Users — multi-user accounts, sessions and per-user data roots.
//
// Accounts live in the virtual filesystem at /system/users/accounts.json.
// Each account owns:
//   /users/<id>/                     home (Desktop, Documents, AppData, ...)
//   /users/<id>/AppData/<appId>/     per-user app data (the SDK sandbox)
//   /system/users/<id>/programs data/  per-user OS data (pins, activity, ...)
//
// Session switching is reload-based: beginSwitch() stashes the target in
// sessionStorage, flushes the filesystem and reloads; boot resolves the
// target before any per-user module initializes.
//
// Callers that can't import this module safely (import cycles) use the
// window._Users global, same pattern as window._FileSystem.
const Users = (() => {
    const ROOT = ['/', 'system', 'users'];
    const ACCOUNTS_PATH = [...ROOT, 'accounts.json'];
    const TARGET_KEY = 'w12-pending-user';
    const LEGACY_CONFIG_PATH = ['/', 'system', 'config.json'];
    const LEGACY_PROGRAMS = ['/', 'system', 'programs data'];
    const LEGACY_USER_HOME = ['/', 'users', 'default'];

    // Top-level entries of /system/programs data owned by the OS rather
    // than by an app — these stay global or move to per-user OS storage
    // instead of becoming an app's AppData.
    const OS_RESERVED = new Set([
        'taskbar', 'startmenu', 'permissions', 'fileAssociations',
        'clipboard', 'userActivity', 'notifications', 'virtualDesktops',
        'windowState', 'desktopIcons'
    ]);
    // OS modules whose storage becomes per-user on migration.
    const PER_USER_OS_DIRS = ['startmenu', 'userActivity', 'notifications'];

    // Home skeleton for a fresh account (mirrors the legacy default home).
    const HOME_DIRS = [
        ['Desktop'], ['Documents'], ['Downloads'],
        ['Pictures'], ['Pictures', 'Wallpapers'], ['Pictures', 'Screenshots'],
        ['Music'], ['Videos'], ['AppData']
    ];

    let users = [];      // account records (accounts.json contents)
    let current = null;  // boot target / signed-in account object

    function fs() { return window._FileSystem; }

    // ---------- low-level FS helpers ----------

    function ensureDirChain(path) {
        const f = fs();
        if (!f) return;
        for (let i = 1; i <= path.length - 1; i++) {
            const partial = path.slice(0, i);
            if (!f.itemExists(partial)) {
                f.createFolder(path.slice(0, i - 1), path[i - 1]);
            }
        }
    }

    function readJson(path, fallback) {
        try {
            const raw = fs().readFile(path);
            if (raw) return JSON.parse(raw);
        } catch { /* corrupt -> fallback */ }
        return fallback;
    }

    function writeJson(path, data) {
        ensureDirChain(path);
        const parent = path.slice(0, -1);
        const name = path[path.length - 1];
        const json = JSON.stringify(data, null, 2);
        if (fs().itemExists(path)) fs().writeFile(path, json);
        else fs().createFile(parent, name, json, 'json');
    }

    // Move a subtree within the same FS without tripping blob cleanup
    // (permanentDelete would drop IndexedDB blobs; we reattach instead).
    function moveNode(srcPath, destParentPath) {
        const f = fs();
        const node = f.getNode(srcPath);
        if (!node || node.type !== 'folder') return false;
        const name = srcPath[srcPath.length - 1];
        ensureDirChain(destParentPath);
        if (f.itemExists([...destParentPath, name])) return false;
        f.getNode(destParentPath).children[name] = JSON.parse(JSON.stringify(node));
        delete f.getNode(srcPath.slice(0, -1)).children[name];
        f.save();
        return true;
    }

    // ---------- accounts store ----------

    function readAccounts() {
        const data = readJson(ACCOUNTS_PATH, null);
        if (data && Array.isArray(data.users) && data.users.length > 0) return data;
        return null;
    }

    function writeAccounts() {
        writeJson(ACCOUNTS_PATH, { version: 1, users });
    }

    function newId() {
        return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    }

    function makeSalt() {
        let s = '';
        for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        return s;
    }

    // Salted SHA-256 when the context allows it (https/localhost), with a
    // clearly-weak fallback for file:// — this is a simulation, not a bank.
    async function hashPassword(password, salt) {
        const text = salt + '::' + password;
        try {
            if (window.crypto && crypto.subtle) {
                const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
                return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch { /* fall through */ }
        let h = 5381;
        for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
        return 'weak_' + h.toString(16);
    }

    // ---------- migration (one-time) ----------

    function migrate() {
        // First account adopts the legacy single-user data in place:
        // /users/default stays as the home folder, id 'default'.
        let name = 'User';
        try {
            const legacy = readJson(LEGACY_CONFIG_PATH, null);
            if (legacy && legacy.userName) name = legacy.userName;
        } catch { /* default name */ }

        users = [{
            id: 'default',
            name,
            salt: null,
            hash: null,
            createdAt: Date.now(),
            lastLogin: Date.now()
        }];
        writeAccounts();

        // Per-user config: legacy /system/config.json moves to the account.
        try {
            if (fs().itemExists(LEGACY_CONFIG_PATH)) {
                ensureDirChain(['/', 'system', 'users', 'default']);
                moveNode(LEGACY_CONFIG_PATH, ['/', 'system', 'users', 'default']);
            }
        } catch { /* keep legacy file */ }

        // OS modules that become per-user: move their storage dirs/files.
        const dest = ['/', 'system', 'users', 'default', 'programs data'];
        PER_USER_OS_DIRS.forEach(name => {
            try { moveNode([...LEGACY_PROGRAMS, name], dest); } catch { /* keep */ }
        });
        try { moveNode([...LEGACY_PROGRAMS, 'backgroundApps.json'], dest); } catch { /* keep */ }

        // App-owned data folders become the first user's AppData; every
        // other top-level entry in /system/programs data stays global.
        ensureDirChain([...LEGACY_USER_HOME, 'AppData']);
        let children = [];
        try { children = fs().getChildren(LEGACY_PROGRAMS); } catch { /* none */ }
        children.forEach(entry => {
            if (OS_RESERVED.has(entry.name) || entry.name === 'backgroundApps.json') return;
            try { moveNode([...LEGACY_PROGRAMS, entry.name], [...LEGACY_USER_HOME, 'AppData']); } catch { /* keep */ }
        });
    }

    // ---------- home layout ----------

    function ensureHome(id) {
        ensureDirChain(['/', 'users', id]);
        HOME_DIRS.forEach(dir => ensureDirChain(['/', 'users', id, ...dir]));
    }

    // ---------- boot / session ----------

    function lastUserId() {
        let best = users[0];
        users.forEach(u => { if ((u.lastLogin || 0) > (best.lastLogin || 0)) best = u; });
        return best ? best.id : null;
    }

    // Explicit switch target from a previous session ('' means "show the
    // picker, default to last user"), otherwise the last user.
    function consumeSwitchTarget() {
        try {
            const v = sessionStorage.getItem(TARGET_KEY);
            sessionStorage.removeItem(TARGET_KEY);
            return v;
        } catch { return null; }
    }

    function init() {
        const f = fs();
        if (!f) return;
        ensureDirChain(ROOT);
        const stored = readAccounts();
        if (stored) {
            users = stored.users;
        } else {
            migrate();
        }

        const target = consumeSwitchTarget();
        let id = (target && target !== '' && getAccount(target)) ? target : lastUserId();
        if (!id || !getAccount(id)) {
            // Defensive: no accounts at all (fresh/corrupted store).
            users = [{ id: 'default', name: 'User', salt: null, hash: null, createdAt: Date.now(), lastLogin: Date.now() }];
            writeAccounts();
            ensureHome('default');
            id = 'default';
        }
        current = getAccount(id);
        ensureHome(current.id);
    }

    function setCurrent(id) {
        const acc = getAccount(id);
        if (acc) current = acc;
        return !!acc;
    }

    // Marks the sign-in complete: remember as last user.
    function signIn(id) {
        const acc = getAccount(id) || current;
        if (!acc) return null;
        acc.lastLogin = Date.now();
        writeAccounts();
        current = acc;
        return { ...acc };
    }

    // Stash the next session's user (or '' for the picker) and reload.
    function beginSwitch(userId) {
        try { sessionStorage.setItem(TARGET_KEY, userId || ''); } catch { /* session-only */ }
        try { fs().flush(); } catch { /* best effort */ }
        window.location.reload();
    }

    // ---------- per-user path roots ----------

    function home(sub) {
        const id = current ? current.id : 'default';
        const base = ['/', 'users', id];
        if (Array.isArray(sub) && sub.length > 0) return [...base, ...sub];
        if (typeof sub === 'string' && sub) return [...base, ...sub.split('/').filter(Boolean)];
        return base;
    }

    function appData(appId, sub) {
        const base = [...home(), 'AppData', appId];
        if (Array.isArray(sub) && sub.length > 0) return [...base, ...sub];
        if (typeof sub === 'string' && sub) return [...base, ...sub.split('/').filter(Boolean)];
        return base;
    }

    // Per-user OS data (pins, activity, notifications, autostart, ...).
    function userData(sub) {
        const base = ['/', 'system', 'users', current ? current.id : 'default', 'programs data'];
        if (Array.isArray(sub) && sub.length > 0) return [...base, ...sub];
        return base;
    }

    // ---------- account management ----------

    function getAccounts() {
        return users.map(u => ({ ...u }));
    }

    function getAccount(id) {
        return users.find(u => u.id === id) || null;
    }

    async function createAccount(name, password) {
        const clean = String(name || '').trim();
        if (!clean) return null;
        const acc = {
            id: newId(),
            name: clean,
            salt: null,
            hash: null,
            createdAt: Date.now(),
            lastLogin: 0
        };
        if (password) {
            acc.salt = makeSalt();
            acc.hash = await hashPassword(password, acc.salt);
        }
        users.push(acc);
        writeAccounts();
        ensureHome(acc.id);
        return { ...acc };
    }

    function deleteAccount(id) {
        if (users.length <= 1) return false;             // never the last one
        if (current && current.id === id) return false;  // never the signed-in one
        const before = users.length;
        users = users.filter(u => u.id !== id);
        if (users.length === before) return false;
        writeAccounts();
        return true;
    }

    function renameAccount(id, name) {
        const acc = getAccount(id);
        const clean = String(name || '').trim();
        if (!acc || !clean) return false;
        acc.name = clean;
        writeAccounts();
        if (current && current.id === id) current = acc;
        return true;
    }

    async function setPassword(id, password) {
        const acc = getAccount(id);
        if (!acc) return false;
        if (password) {
            acc.salt = makeSalt();
            acc.hash = await hashPassword(password, acc.salt);
        } else {
            acc.salt = null;
            acc.hash = null;
        }
        writeAccounts();
        return true;
    }

    async function verifyPassword(id, password) {
        const acc = getAccount(id);
        if (!acc) return false;
        if (!acc.hash) return true; // passwordless account
        return (await hashPassword(password, acc.salt)) === acc.hash;
    }

    function hasPassword(id) {
        const acc = getAccount(id);
        return !!acc && !!acc.hash;
    }

    return {
        init, home, appData, userData,
        getAccounts, getAccount, getCurrent: () => current ? { ...current } : null,
        setCurrent, signIn, beginSwitch,
        createAccount, deleteAccount, renameAccount, setPassword, verifyPassword, hasPassword
    };
})();

window._Users = Users;

export default Users;
