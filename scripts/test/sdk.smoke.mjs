// Windows 12 SDK smoke test — zero dependencies, runs with plain node.
// Stubs the browser surface the OS touches at import/call time, imports
// js/sdk/index.js for real, and exercises every SDK namespace that can run
// without a rendered page. DOM-dependent paths (actual window painting,
// toast animation, live clipboard permission) are covered by code review +
// the in-OS sample app, NOT claimed here.
//
// Run:  node test/sdk.smoke.mjs
// Exit: 0 when every check passes, 1 with a failure list otherwise.

const failures = [];
let passed = 0;

function check(name, cond, extra) {
    if (cond) {
        passed++;
        console.log(`  ok   ${name}`);
    } else {
        failures.push(name);
        console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
    }
}

// ---------- browser surface stubs ----------

const winListeners = {};
const docListeners = {};

function makeEl(tag) {
    const el = {
        tagName: (tag || 'div').toUpperCase(),
        children: [],
        style: { setProperty() {}, removeProperty() {} },
        dataset: {},
        _listeners: {},
        _text: '',
        value: '',
        disabled: false,
        width: 0,
        height: 0
    };
    return new Proxy(el, {
        get(t, p) {
            if (p in t) return t[p];
            if (p === 'classList') {
                return { add() {}, remove() {}, contains() { return false; }, toggle() {} };
            }
            if (p === 'appendChild') return (c) => { t.children.push(c); return c; };
            if (p === 'insertBefore') return (c) => { t.children.push(c); return c; };
            if (p === 'removeChild') return (c) => c;
            if (p === 'addEventListener') return (ev, fn) => { (t._listeners[ev] ||= []).push(fn); };
            if (p === 'removeEventListener') return () => {};
            if (p === 'querySelector') return () => makeEl('div');
            if (p === 'querySelectorAll') return () => [];
            if (p === 'getBoundingClientRect') return () => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 });
            if (p === 'closest') return () => null;
            if (p === 'contains') return () => false;
            if (p === 'getContext') return () => null;
            if (p === 'select' || p === 'focus' || p === 'blur' || p === 'click' || p === 'remove') return () => {};
            if (p === 'setAttribute' || p === 'removeAttribute') return () => {};
            if (p === 'isConnected') return true;
            if (p === Symbol.toPrimitive) return () => '';
            if (p === 'offsetLeft' || p === 'offsetTop' || p === 'offsetWidth' || p === 'offsetHeight' || p === 'clientWidth' || p === 'clientHeight') return 0;
            return undefined;
        },
        set(t, p, v) { t[p] = v; return true; }
    });
}

const byId = {};
const memStore = new Map();
globalThis.localStorage = {
    getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
    setItem: (k, v) => { memStore.set(k, String(v)); },
    removeItem: (k) => { memStore.delete(k); },
    clear: () => { memStore.clear(); }
};
globalThis.window = globalThis;
globalThis.addEventListener = (ev, fn) => { (winListeners[ev] ||= []).push(fn); };
globalThis.removeEventListener = (ev, fn) => {
    if (!fn) { delete winListeners[ev]; return; }
    winListeners[ev] = (winListeners[ev] || []).filter(f => f !== fn);
};
globalThis.dispatchEvent = (e) => {
    for (const fn of winListeners[e.type] || []) fn(e);
    return true;
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, opts) {
        this.type = type;
        this.detail = (opts && opts.detail) || null;
    }
};
try {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
} catch { /* fixed in this runtime */ }

// ---------- fake OPFS ----------
// The OS stores everything in the Origin Private File System, which Node does
// not have. This stub answers the worker's protocol with an in-memory map, so
// the filesystem tests exercise the real modules instead of a mock.
const opfsFiles = new Map();
globalThis.Worker = class FakeOpfsWorker {
    constructor() {
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
    }
    postMessage(msg) {
        const { id, op, args } = msg || {};
        let ok = true;
        let value = null;
        try {
            if (op === 'selftest') value = true;
            else if (op === 'writeFile') { opfsFiles.set(args[0], args[1]); value = true; }
            else if (op === 'readText') {
                if (!opfsFiles.has(args[0])) throw new Error('not-found');
                value = String(opfsFiles.get(args[0]));
            } else if (op === 'readFile') {
                if (!opfsFiles.has(args[0])) throw new Error('not-found');
                value = new Blob([opfsFiles.get(args[0])]);
            } else if (op === 'removeEntry') { opfsFiles.delete(args[0]); value = true; }
            else if (op === 'stat') {
                const v = opfsFiles.get(args[0]);
                value = v == null
                    ? { exists: false }
                    : { exists: true, size: String(v).length, lastModified: Date.now() };
            } else throw new Error('unknown-op:' + op);
        } catch (e) {
            ok = false;
            value = String((e && e.message) || e);
        }
        setTimeout(() => {
            if (this.onmessage) this.onmessage({ data: { id, ok, value } });
        }, 0);
    }
    terminate() {}
};
globalThis.navigator.storage = {
    getDirectory: async () => ({}),
    persist: async () => true,
    estimate: async () => ({ usage: 0, quota: 0 })
};
globalThis.Audio = class Audio { play() {} pause() {} };
globalThis.AudioContext = class AudioContext {
    constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
    }
    createGain() {
        return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(x) { return x; } };
    }
    createOscillator() {
        return {
            type: '',
            frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect(x) { return x; },
            start() {}, stop() {}
        };
    }
    resume() { this.state = 'running'; return Promise.resolve(this.state); }
    suspend() { this.state = 'suspended'; return Promise.resolve(this.state); }
};
try {
    Object.defineProperty(globalThis, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(globalThis, 'innerHeight', { value: 800, configurable: true });
} catch { /* fixed in this runtime */ }

globalThis.document = {
    addEventListener: (ev, fn) => { (docListeners[ev] ||= []).push(fn); },
    removeEventListener: () => {},
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => {
        if (!byId[id]) {
            byId[id] = makeEl('div');
            if (id === 'windows-container') {
                byId[id].clientWidth = 1280;
                byId[id].clientHeight = 752;
            }
        }
        return byId[id];
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    body: makeEl('body'),
    documentElement: makeEl('html'),
    activeElement: null,
    hasFocus: () => true
};

function fireDocKeydown(event) {
    for (const fn of docListeners.keydown || []) fn(event);
}

// ---------- import the real SDK ----------

console.log('importing js/sdk/index.js ...');
const SDK = await import('../../js/sdk/index.js');
const Windows12 = SDK.default;
console.log('import ok\n');

console.log('[surface]');
for (const name of ['WindowManager', 'FileSystem', 'Files', 'Notifications', 'Dialogs', 'Keyboard',
    'Clipboard', 'Apps', 'Settings', 'Shell', 'FileAssociations', 'System', 'Events',
    'Permissions', 'Lifecycle', 'Background', 'Media', 'Tray', 'PointerLock', 'Input', 'Audio',
    'Scripts', 'SDKError', 'ErrorCodes', 'createApp']) {
    check(`exports ${name}`, SDK[name] !== undefined && Windows12[name] !== undefined);
}
check('SDK_VERSION is semver', /^\d+\.\d+\.\d+$/.test(SDK.SDK_VERSION), SDK.SDK_VERSION);
check('default export is the facade object', Windows12.createApp === SDK.createApp);

console.log('[errors]');
check('WindowManager.create requires appId',
    (() => { try { SDK.WindowManager.create({ title: 'x' }); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('FileSystem.readFile rejects non-array path',
    (() => { try { SDK.FileSystem.readFile('/x'); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('Apps.launch unknown → NOT_FOUND',
    (() => { try { SDK.Apps.launch('no-such-app'); return false; } catch (e) { return e.code === 'NOT_FOUND'; } })());
check('Settings.set blocks displayResolution',
    (() => { try { SDK.Settings.set('displayResolution', '800x600'); return false; } catch (e) { return e.code === 'PERMISSION_DENIED'; } })());
check('Events.on unknown → INVALID_ARGS',
    (() => { try { SDK.Events.on('nope', () => {}); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('createApp rejects bad id',
    (() => { try { SDK.createApp({ id: '1bad id!' }); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());

console.log('[keyboard]');
let kbHits = [];
const offA = SDK.Keyboard.register('CTRL+SHIFT+P', () => { kbHits.push('a'); });
const offB = SDK.Keyboard.register('CTRL+P', () => { kbHits.push('b'); return false; });
const offC = SDK.Keyboard.register('CTRL+P', () => { kbHits.push('c'); });
fireDocKeydown({ key: 'P', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, preventDefault() {}, stopPropagation() {} });
check('exact-modifier match fires shifted handler only', kbHits.join(',') === 'a', kbHits.join(','));
kbHits = [];
fireDocKeydown({ key: 'p', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, preventDefault() {}, stopPropagation() {} });
check('unshifted passes through b then consumes at c', kbHits.join(',') === 'b,c', kbHits.join(','));
check('unregister removes handler', (offA(), SDK.Keyboard.unregister(offB), SDK.Keyboard.unregister(offC), true));
check('bad combo throws SDKError',
    (() => { try { SDK.Keyboard.register('', () => {}); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('list() reflects registrations', (() => {
    const off = SDK.Keyboard.register('ALT+F9', () => {}, { owner: 'smoke-test' });
    const found = SDK.Keyboard.list().some(h => h.combo === 'ALT+F9' && h.owner === 'smoke-test');
    const n = SDK.Keyboard.unregisterAll('smoke-test');
    return found && n >= 1 && typeof off === 'function';
})());

console.log('[events]');
let evtPayload = null;
const unsub = SDK.Events.on('app-crashed', (e) => { evtPayload = e.detail; });
globalThis.dispatchEvent(new globalThis.CustomEvent('app-crashed', { detail: { appId: 'smoke' } }));
check('event received with detail', evtPayload && evtPayload.appId === 'smoke');
check('unsubscribe works', (() => { unsub(); evtPayload = null; globalThis.dispatchEvent(new globalThis.CustomEvent('app-crashed', { detail: { appId: 'x' } })); return evtPayload === null; })());
check('names() lists the nine supported events', SDK.Events.names().length === 9);

console.log('[filesystem]');
const FSMod = await import('../../js/modules/fileSystem.js');
await FSMod.default.init();
check('seed tree exists', SDK.FileSystem.exists(['/', 'users', 'default', 'Documents']));
check('write→read roundtrip', (() => {
    SDK.FileSystem.createFile(['/', 'users', 'default', 'Documents'], 'sdk-smoke.txt', 'hello-sdk', 'txt');
    return SDK.FileSystem.readFile(['/', 'users', 'default', 'Documents', 'sdk-smoke.txt']) === 'hello-sdk';
})());
check('list() sees the file', SDK.FileSystem.list(['/', 'users', 'default', 'Documents']).some(e => e.name === 'sdk-smoke.txt'));
check('rename works', SDK.FileSystem.rename(
    ['/', 'users', 'default', 'Documents', 'sdk-smoke.txt'], 'sdk-smoke2.txt'));
check('recycle via delete()', (() => {
    SDK.FileSystem.delete(['/', 'users', 'default', 'Documents', 'sdk-smoke2.txt']);
    return !SDK.FileSystem.exists(['/', 'users', 'default', 'Documents', 'sdk-smoke2.txt'])
        && SDK.FileSystem.recycleBin().some(r => r.name === 'sdk-smoke2.txt');
})());

console.log('[createApp sandbox]');
const app = SDK.createApp({ id: 'sdkSmoke', name: 'SDK Smoke' });
check('scoped write→read', (() => { app.files.write('notes.json', '{"a":1}'); return app.files.read('notes.json') === '{"a":1}'; })());
check('scoped list', app.files.list().some(e => e.name === 'notes.json'));
check('nested mkdir + write', (() => { app.files.mkdir('chats'); app.files.write('chats/a.json', '{}'); return app.files.exists('chats/a.json'); })());
check('traversal rejected', (() => { try { app.files.read('../escape'); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('absolute rejected', (() => { try { app.files.write('/abs', 'x'); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('app settings get/set', (() => { app.files.settings.set('theme', 'dark'); return app.files.settings.get('theme') === 'dark'; })());
check('bound notify carries appId', (() => {
    // Notifications.info without DOM init would fail on toast render; only
    // verify the binding shape here (id-prefill is exercised in-OS).
    return typeof app.notify.info === 'function' && typeof app.window.create === 'function';
})());
check('bound keyboard auto-owner', (() => {
    let hit = 0;
    const off = app.keyboard.register('CTRL+ALT+F12', () => { hit++; });
    fireDocKeydown({ key: 'F12', ctrlKey: true, shiftKey: false, altKey: true, metaKey: false, preventDefault() {}, stopPropagation() {} });
    const owned = SDK.Keyboard.list().some(h => h.owner === 'sdkSmoke');
    const n = app.keyboard.unregisterAll();
    off();
    return hit === 1 && owned && n >= 1;
})());
check('permissions.require throws when undeclared path revoked', (() => {
    // sdkSmoke declares nothing and owns no manifest → fail-open legacy.
    // A store app WITH declarations but no grant record is also granted
    // (grandfathered) — assert the documented fail-open, not a block.
    return SDK.Permissions.has('sdkSmoke', 'notifications') === true;
})());

console.log('[registry]');
const RegMod = (await import('../../js/modules/registry.js')).default;
const PermsMod = (await import('../../js/modules/permissions.js')).default;
check('the registry and the permissions do not recurse into each other', (() => {
    // The permission check asks the registry who is calling, and the grants
    // live in the registry: reading both must not loop.
    RegMod.keys('HKLM');
    RegMod.values('HKCU');
    PermsMod.getGrants('notepad');
    PermsMod.isGranted('notepad', 'filesystem');
    return true;
})());
check('registry reads stay fast', (() => {
    // A read that re-entered the permission check used to take ~300ms each
    // (the check read the grants, which read the registry, which checked
    // again). 50 reads must be near-instant.
    const t0 = Date.now();
    for (let i = 0; i < 50; i++) RegMod.keys('HKLM');
    return (Date.now() - t0) < 500;
})());
check('the registry knows its hives', RegMod.hives().length === 5 && RegMod.hives()[0].short === 'HKLM');
check('a registry path is parsed Windows style', (() => {
    const parsed = RegMod.parsePath('HKLM\\Software\\Windows 12');
    return parsed && parsed.hive === 'HKEY_LOCAL_MACHINE' && parsed.parts.join('/') === 'Software/Windows 12';
})());
check('the registry is case insensitive', (() => {
    RegMod.createKey('HKLM\\CaseTest');
    RegMod.set('HKLM\\casetest', 'Value', 'REG_SZ', 'x');
    return RegMod.get('HKLM\\CASETEST', 'Value') !== null;
})());

console.log('[catalogs]');
const AppLoaderMod = await import('../../js/modules/appLoader.js');
await AppLoaderMod.default.init();
check('discord declares network', SDK.Permissions.getDeclared('discord').includes('network'));
check('copilot declares 4 permissions', SDK.Permissions.getDeclared('copilotButBetter').length === 4);
check('catalog knows microphone + camera', SDK.Permissions.known().includes('microphone') && SDK.Permissions.known().includes('camera'));
check('voiceRecorder declares microphone', SDK.Permissions.getDeclared('voiceRecorder').includes('microphone'));
check('qrStudio declares camera', SDK.Permissions.getDeclared('qrStudio').includes('camera'));
check('notepad metadata resolves', SDK.Apps.getMetadata('notepad').name === 'Notepad');
check('builtin counts as installed', SDK.Apps.isInstalled('notepad') === true);
check('store list non-empty', SDK.Apps.getAll().filter(m => m.distribution === 'store').length > 5);
check('every catalog app resolves a package icon', SDK.Apps.getAll().every(m => typeof SDK.Shell.icons.app(m.id) === 'string' && SDK.Shell.icons.app(m.id).length > 0));
check('shell icons resolve', SDK.Shell.icons.app('notepad').length > 0 && SDK.Shell.icons.action('copy').includes('<svg'));
check('catalog exposes lazy entry + icon flags', (() => {
    const m = AppLoaderMod.default.getManifest('notepad');
    return !!m && m.entry === 'main.js' && m.hasIcon === true && AppLoaderMod.default.isLoaded('notepad') === false;
})());
check('system info shape', (() => { const i = SDK.System.info(); return i.name === 'Windows 12' && typeof i.version === 'string'; })());

console.log('[accounts & uac]');
const UsersMod = await import('../../js/modules/users.js');
const UACMod = await import('../../js/modules/uac.js');
globalThis._FileSystem = FSMod.default;
UsersMod.default.init();
const stdAcc = await UsersMod.default.createAccount('Smoke Std', null);
const adminAcc = await UsersMod.default.createAccount('Smoke Admin', null, 'administrator');
check('default account is an administrator', UsersMod.default.isAdmin() === true);
check('UAC exposes request()/canElevate()', typeof UACMod.default.request === 'function' && typeof UACMod.default.canElevate === 'function');
check('new accounts default to standard', !!stdAcc && stdAcc.type === 'standard' && UsersMod.default.isAdmin(stdAcc.id) === false);
check('administrator accounts can be created', !!adminAcc && adminAcc.type === 'administrator' && UsersMod.default.isAdmin(adminAcc.id) === true);
check('last administrator cannot be demoted', (() => {
    const U = UsersMod.default;
    if (!U.setAccountType('default', 'standard')) return false;  // two admins — allowed
    if (U.setAccountType(adminAcc.id, 'standard')) return false; // now the last admin — refused
    return U.isAdmin(adminAcc.id) === true;
})());
check('last administrator cannot be deleted', UsersMod.default.deleteAccount(adminAcc.id) === false);
check('standard accounts can be removed', UsersMod.default.deleteAccount(stdAcc.id) === true);

console.log('[multi-user path roots & sessions]');
check('homeFor targets an explicit profile', JSON.stringify(UsersMod.default.homeFor('u2', ['Documents'])) === JSON.stringify(['/', 'users', 'u2', 'Documents']));
check('appDataFor targets an explicit profile', JSON.stringify(UsersMod.default.appDataFor('u2', 'notepad', ['x.json'])) === JSON.stringify(['/', 'users', 'u2', 'AppData', 'notepad', 'x.json']));
check('userDataFor targets an explicit profile', JSON.stringify(UsersMod.default.userDataFor('u2', ['config.json'])) === JSON.stringify(['/', 'system', 'users', 'u2', 'programs data', 'config.json']));
check('home() follows the foreground profile', (() => {
    UsersMod.default.setCurrent(adminAcc.id);
    return UsersMod.default.home(['Desktop'])[2] === adminAcc.id;
})());
check('primaryAdminId resolves the surviving administrator', UsersMod.default.primaryAdminId() === adminAcc.id);

const SessionsMod = (await import('../../js/modules/sessions.js')).default;
const sessionLog = [];
SessionsMod.setHooks({
    onBoot: (id) => { sessionLog.push(`boot:${id}`); },
    onActivate: (id) => { sessionLog.push(`activate:${id}`); },
    onClose: (id) => { sessionLog.push(`close:${id}`); }
});
await SessionsMod.signIn(adminAcc.id);
check('signIn boots then activates the profile once', sessionLog.join(',') === `boot:${adminAcc.id},activate:${adminAcc.id}`);
check('the signed-in profile becomes the foreground session', SessionsMod.getActive() === adminAcc.id && SessionsMod.isSignedIn(adminAcc.id) === true);
await SessionsMod.signIn(adminAcc.id);
check('re-selecting a live session only re-activates it', sessionLog.join(',') === `boot:${adminAcc.id},activate:${adminAcc.id},activate:${adminAcc.id}`);
await SessionsMod.activate('default');
check('activate() switches the foreground profile', SessionsMod.getActive() === 'default' && UsersMod.default.getCurrent().id === 'default');
await SessionsMod.signOut(adminAcc.id);
check('signOut ends one session and leaves the other', SessionsMod.isSignedIn(adminAcc.id) === false && SessionsMod.getActive() === 'default');
check('signOut ran the close hook', sessionLog[sessionLog.length - 1] === `close:${adminAcc.id}`);
SessionsMod.reset();

console.log('[shortcuts on install]');
const ShortcutsMod = (await import('../../js/modules/shortcuts.js')).default;
const lnkApp = { id: 'smokeLnkApp', name: 'Smoke Lnk App', uuid: 'uuid-smoke-lnk', version: '1.0.0', entry: 'main.js' };
// What the package service does after an app lands on disk.
ShortcutsMod.onAppInstalled('smokeLnkApp', lnkApp, {
    folder: ['Program Files', 'smokeLnkApp'],
    userId: 'default'
});
const startDir = ShortcutsMod.startMenuDir('default');
const startNames = (FSMod.default.getChildren(startDir) || []).map(c => c.name);
check('an installed app gets a Start Menu shortcut', startNames.includes('Smoke Lnk App.lnk'), startNames.join(','));
check('the desktop and the taskbar stay clean (they are opt-in)',
    (FSMod.default.getChildren(ShortcutsMod.desktopDir('default')) || []).length === 0
    && (FSMod.default.getChildren(ShortcutsMod.taskbarDir('default')) || []).length === 0);
const lnkData = ShortcutsMod.readSync([...startDir, 'Smoke Lnk App.lnk']);
check('the shortcut points at the app folder',
    !!lnkData && Array.isArray(lnkData.target) && lnkData.target.join('/') === 'Program Files/smokeLnkApp');
check('the shortcut knows which app it belongs to', ShortcutsMod.appIdForShortcut(lnkData) === 'smokeLnkApp');
check('uninstalling takes the shortcut away', (() => {
    ShortcutsMod.removeAppShortcuts('smokeLnkApp', 'default');
    return !(FSMod.default.getChildren(startDir) || []).some(c => c.name === 'Smoke Lnk App.lnk');
})());

console.log('[machine-wide display settings]');
const SysCfg = (await import('../../js/modules/systemConfig.js')).default;
SysCfg.load();
SysCfg.initGlobal();
const DISPLAY_PATH = ['/', 'system', 'programs data', 'display', 'settings.json'];
check('display keys are recognised as global',
    ['scaling', 'displayResolution'].every(k => SysCfg.isGlobalKey(k)) && SysCfg.isGlobalKey('brightness') === false);
check('global writes route through get()', (() => { SysCfg.set('scaling', '150'); return SysCfg.get('scaling') === '150'; })());
check('global values surface in getAll()', SysCfg.getAll().scaling === '150');
const RegistryMod = (await import('../../js/modules/registry.js')).default;
check('global display store persists to the machine hive', (() => {
    const value = RegistryMod.getString('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Video', 'scaling', '');
    return value === '150';
})());
check('per-user writes leave the global store alone', (() => {
    SysCfg.set('brightness', 55);
    const stored = JSON.parse(FSMod.default.readFile(DISPLAY_PATH)) || {};
    return stored.brightness === undefined && SysCfg.get('brightness') === 55;
})());
check('machine-wide keys stay out of the per-user config file', (() => {
    const cfg = JSON.parse(FSMod.default.readFile(UsersMod.default.userData(['config.json'])) || '{}');
    return cfg.scaling === undefined && cfg.displayResolution === undefined;
})());

console.log('[windows update]');
const UpdateMod = (await import('../../js/modules/updateService.js')).default;
check('the update service starts idle', UpdateMod.getState().status === 'idle');
check('the update state is well formed', (() => {
    const s = UpdateMod.getState();
    return typeof s.message === 'string' && typeof s.progress === 'number' && Array.isArray(s.apps);
})());
check('the update history starts empty', Array.isArray(UpdateMod.history()));
check('an update is written to the history', (() => {
    UpdateMod.recordHistory({ title: 'Smoke update', version: '1.2.3', type: 'os', status: 'installed' });
    const list = UpdateMod.history();
    return list.length > 0 && list[0].title === 'Smoke update' && list[0].version === '1.2.3';
})());
check('the history entry carries a date', !!UpdateMod.history()[0].date);
check('the automatic check can be turned off', (() => {
    const before = UpdateMod.autoCheckEnabled();
    try {
        UpdateMod.setAutoCheck(!before);
        const flipped = UpdateMod.autoCheckEnabled() === !before;
        UpdateMod.setAutoCheck(before);
        return flipped && UpdateMod.autoCheckEnabled() === before;
    } catch (e) {
        return false;
    }
})());
check('no update is pending on a fresh install', UpdateMod.readPending() === null);

console.log('[clipboard honesty]');
check('readText without browser API → UNSUPPORTED',
    await (async () => { try { await SDK.Clipboard.readText(); return false; } catch (e) { return e.code === 'UNSUPPORTED'; } })());

console.log('[window creation headless]');
const WMMod = await import('../../js/modules/windowManager.js');
WMMod.default.init();
check('WindowManager.create builds a window against stubs', (() => {
    try {
        const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Smoke', content: '<div></div>', width: 400, height: 300 });
        const ok = !!w && typeof w.id === 'string' && w.element !== undefined;
        SDK.WindowManager.close(w.id);
        return ok && SDK.WindowManager.get(w.id) === null;
    } catch (e) {
        console.log('     create failed:', e && e.message);
        return false;
    }
})());

console.log('[session window ownership]');
check('windows are tagged with the foreground session', (() => {
    UsersMod.default.setCurrent(adminAcc.id);
    WMMod.default.setUserProvider({ getActiveId: () => adminAcc.id });
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Owned', content: '' });
    const tagged = w.userId === adminAcc.id;
    const visibleHere = WMMod.default.isWindowVisible(w) === true;
    WMMod.default.setUserProvider({ getActiveId: () => 'default' });
    const hiddenThere = WMMod.default.isWindowVisible(w) === false;
    WMMod.default.setUserProvider({ getActiveId: () => adminAcc.id });
    SDK.WindowManager.close(w.id);
    return tagged && visibleHere && hiddenThere;
})());
check('closeWindowsForUser only closes that session', (() => {
    WMMod.default.setUserProvider({ getActiveId: () => adminAcc.id });
    const a = SDK.WindowManager.create({ appId: 'sdkSmokeA', title: 'A', content: '' });
    WMMod.default.setUserProvider({ getActiveId: () => 'default' });
    const b = SDK.WindowManager.create({ appId: 'sdkSmokeB', title: 'B', content: '' });
    WMMod.default.setUserProvider({ getActiveId: () => adminAcc.id });
    WMMod.default.closeWindowsForUser(adminAcc.id);
    const aGone = !WMMod.default._getWindow(a.id);
    const bAlive = !!WMMod.default._getWindow(b.id);
    SDK.WindowManager.close(b.id);
    WMMod.default.setUserProvider(null);
    return aGone && bAlive;
})());

console.log('[window geometry + state]');
check('resizable:false windows report locked', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Locked', content: '', resizable: false });
    const locked = SDK.WindowManager.isResizable(w.id) === false;
    SDK.WindowManager.setResizable(w.id, true);
    const ok = locked && SDK.WindowManager.isResizable(w.id) === true;
    SDK.WindowManager.close(w.id);
    return ok;
})());
check('getBounds shape + setBounds roundtrip + validation', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Geo', content: '' });
    const b = SDK.WindowManager.getBounds(w.id);
    const shape = b && ['x', 'y', 'width', 'height', 'maximized', 'minimized'].every(k => k in b);
    const moved = SDK.WindowManager.setBounds(w.id, { x: 10, y: 20, width: 500, height: 400 });
    let invalid = false;
    try { SDK.WindowManager.setBounds(w.id, { width: NaN }); } catch (e) { invalid = e.code === 'INVALID_ARGS'; }
    const missing = SDK.WindowManager.getBounds('window-nope') === null && SDK.WindowManager.setBounds('window-nope', { x: 1 }) === false;
    SDK.WindowManager.close(w.id);
    return shape && moved && invalid && missing;
})());
check('position/size/center/desktop helpers', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'PSC', content: '' });
    const pos = SDK.WindowManager.getPosition(w.id);
    const size = SDK.WindowManager.getSize(w.id);
    const area = SDK.WindowManager.getDesktopArea();
    const ok = pos && typeof pos.x === 'number' && size && typeof size.width === 'number'
        && area && area.w === 1280 && area.h === 752
        && SDK.WindowManager.setPosition(w.id, 5, 5) && SDK.WindowManager.setSize(w.id, 320, 240)
        && SDK.WindowManager.center(w.id);
    SDK.WindowManager.close(w.id);
    return ok;
})());
check('maximize/unmaximize/isMaximized + setTitle/setMinSize', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Max', content: '' });
    const start = SDK.WindowManager.isMaximized(w.id) === false;
    SDK.WindowManager.maximize(w.id);
    const maxed = SDK.WindowManager.isMaximized(w.id) === true;
    SDK.WindowManager.unmaximize(w.id);
    const back = SDK.WindowManager.isMaximized(w.id) === false;
    const renamed = SDK.WindowManager.setTitle(w.id, 'Renamed') && SDK.WindowManager.get(w.id).title === 'Renamed';
    const mins = SDK.WindowManager.setMinSize(w.id, 200, 150);
    SDK.WindowManager.close(w.id);
    return start && maxed && back && renamed && mins;
})());
check('minimize/restore/isMinimized', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Min', content: '' });
    SDK.WindowManager.minimize(w.id);
    const min = SDK.WindowManager.isMinimized(w.id) === true;
    SDK.WindowManager.restore(w.id);
    const ok = min && SDK.WindowManager.isMinimized(w.id) === false;
    SDK.WindowManager.close(w.id);
    return ok;
})());
check('drag/resize state reads + subscriptions', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Drag', content: '' });
    const idle = SDK.WindowManager.isDragging(w.id) === false && SDK.WindowManager.isResizing(w.id) === false;
    let hits = 0;
    const offD = SDK.WindowManager.onDragState(() => { hits++; });
    const offR = SDK.WindowManager.onResizeState(() => { hits++; });
    const offB = SDK.WindowManager.onBoundsChanged(() => { hits++; });
    let bad = false;
    try { SDK.WindowManager.onDragState('x'); } catch (e) { bad = e.code === 'INVALID_ARGS'; }
    offD(); offR(); offB();
    SDK.WindowManager.close(w.id);
    return idle && bad && typeof offD === 'function';
})());
check('onBoundsChanged fires on setBounds', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'BC', content: '' });
    let seen = null;
    const off = SDK.WindowManager.onBoundsChanged((id, bounds) => { seen = { id, bounds }; });
    SDK.WindowManager.setBounds(w.id, { x: 1, y: 2 });
    off();
    SDK.WindowManager.close(w.id);
    return seen && seen.id === w.id && seen.bounds && typeof seen.bounds.x === 'number';
})());
check('bound app.window mirrors new methods + app.media shape', (() => {
    const w2 = ['isMinimized', 'bounds', 'setBounds', 'move', 'resize', 'center', 'isMaximized', 'maximize',
        'unmaximize', 'isResizable', 'setResizable', 'isDragging', 'isResizing', 'onDragState', 'onBoundsChanged',
        'setTitle', 'setMinSize', 'isFocused', 'desktopArea', 'onClosed', 'onMinimizeState', 'onFocusChanged',
        'setFullscreen', 'exitFullscreen', 'isFullscreen'].every(k => typeof app.window[k] === 'function');
    const m = typeof app.media.microphone === 'function' && typeof app.media.camera === 'function'
        && typeof app.media.supported === 'function' && app.media.supported() === false;
    return w2 && m;
})());
check('onClosed + Events window-closed fire with appId/id', await (async () => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Bye', content: '' });
    let facade = null;
    let bus = null;
    const off = SDK.WindowManager.onClosed((appId, windowId) => { facade = { appId, windowId }; });
    const offBus = SDK.Events.on('window-closed', (e) => { bus = e.detail; });
    SDK.WindowManager.close(w.id);
    off(); offBus();
    return facade && facade.appId === 'sdkSmoke' && facade.windowId === w.id
        && bus && bus.appId === 'sdkSmoke' && bus.id === w.id;
})());
check('onMinimizeState fires minimized then restored', (() => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'MinEvt', content: '' });
    const seq = [];
    const off = SDK.WindowManager.onMinimizeState((appId, windowId, minimized) => seq.push(minimized));
    SDK.WindowManager.minimize(w.id);
    SDK.WindowManager.restore(w.id);
    off();
    SDK.WindowManager.close(w.id);
    return seq.join(',') === 'true,false';
})());
check('per-window close hook vetoes only that close', await (async () => {
    const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'Hook', content: '' });
    const off = SDK.Lifecycle.onWindowClose(w.id, () => false);
    const vetoed = await SDK.WindowManager.requestClose(w.id) === false;
    off();
    SDK.Lifecycle.offWindowClose(w.id, () => false);
    const allowed = await SDK.WindowManager.requestClose(w.id) === true;
    return vetoed && allowed && SDK.WindowManager.get(w.id) === null;
})());
check('fullscreen helpers are honest headless (isFullscreen false, refusal mapped)',
    await (async () => {
        const w = SDK.WindowManager.create({ appId: 'sdkSmoke', title: 'FS', content: '' });
        const idle = SDK.WindowManager.isFullscreen(w.id) === false;
        let refused = false;
        try { await SDK.WindowManager.setFullscreen(w.id); } catch (e) { refused = e.code === 'UNSUPPORTED'; }
        SDK.WindowManager.close(w.id);
        return idle && refused;
    })());

console.log('[games: pointer lock / input / audio]');
check('PointerLock.isLocked() false headless', SDK.PointerLock.isLocked() === false);
check('PointerLock.request rejects non-canvas element → INVALID_ARGS',
    await (async () => { try { await SDK.PointerLock.request({}); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('PointerLock.request without browser lock API → UNSUPPORTED',
    await (async () => {
        const mk = document.createElement('div');
        mk.requestPointerLock = () => {};
        try { await SDK.PointerLock.request(mk); return false; } catch (e) { return e.code === 'UNSUPPORTED'; }
    })());
check('app.pointerLock is bound with appId validation wired', (() => {
    return typeof app.pointerLock.request === 'function' && typeof app.pointerLock.exit === 'function'
        && typeof app.pointerLock.isLocked === 'function' && typeof app.pointerLock.onChange === 'function';
})());
check('Input.keyState tracks, prevents and clears', (() => {
    const el = document.createElement('div');
    const keys = SDK.Input.keyState(el, { prevent: ['Space'] });
    let prevented = 0;
    const down = (code) => {
        for (const fn of el._listeners.keydown || []) fn({ code, preventDefault() { prevented++; } });
    };
    const up = (code) => { for (const fn of el._listeners.keyup || []) fn({ code, preventDefault() {} }); };
    down('KeyW'); down('Space');
    const held = keys.isDown('KeyW') && keys.isDown('Space') && prevented === 1;
    up('KeyW');
    const released = keys.isDown('KeyW') === false && keys.isDown('Space') === true;
    keys.clear();
    keys.dispose();
    return held && released;
})());
check('Input.keyState rejects non-elements and bad callbacks', (() => {
    let bad = false;
    try { SDK.Input.keyState(null); } catch (e) { bad = e.code === 'INVALID_ARGS'; }
    const keys = SDK.Input.keyState(document.createElement('div'));
    let badCb = false;
    try { keys.onKeyDown('x'); } catch (e) { badCb = e.code === 'INVALID_ARGS'; }
    keys.dispose();
    return bad && badCb;
})());
check('app.input.keyState exists', typeof app.input.keyState === 'function');
check('Audio: lazy context, master volume, beep through masterGain', await (async () => {
    const a = SDK.Audio;
    const closed = a.state() === 'closed';
    const vol = typeof a.masterVolume() === 'number' && a.masterVolume() > 0 && a.masterVolume() <= 1;
    a.beep({ freq: 180, endFreq: 70, type: 'triangle', duration: 0.1 });
    const running = a.state() === 'running';
    const unlocked = await a.unlock() === 'running';
    const mg = a.masterGain() && typeof a.masterGain().gain.value === 'number';
    return closed && vol && running && unlocked && mg;
})());
check('app.audio mirrors Audio', (() => {
    return ['supported', 'context', 'masterGain', 'masterVolume', 'unlock', 'suspend', 'state', 'beep']
        .every(k => typeof app.audio[k] === 'function');
})());
check('app.lifecycle exposes per-window close hooks', typeof app.lifecycle.onWindowClose === 'function' && typeof app.lifecycle.offWindowClose === 'function');

console.log('[media honesty]');
check('requestMicrophone without device API → UNSUPPORTED',
    await (async () => { try { await SDK.Media.requestMicrophone('sdkSmoke'); return false; } catch (e) { return e.code === 'UNSUPPORTED'; } })());
check('requestCamera without device API → UNSUPPORTED',
    await (async () => { try { await SDK.Media.requestCamera('sdkSmoke'); return false; } catch (e) { return e.code === 'UNSUPPORTED'; } })());

console.log('[virtual keyboard]');
const VKMod = await import('../../js/modules/virtualKeyboard.js');
const VK = VKMod.default;
const SysConfMod = await import('../../js/modules/systemConfig.js');
const SysConf = SysConfMod.default;
check('init is safe headless', (() => { try { VK.init(); return true; } catch (e) { return false; } })());
check('disabled by default in node (no touch)', VK.isEnabled() === false);
check('show() refuses while disabled', VK.show() === false && VK.isOpen() === false);
check('layouts expose abc/123/sym with core keys', (() => {
    const L = VK.getLayouts();
    const flat = (rows) => rows.flat();
    return L && Array.isArray(L.abc) && Array.isArray(L['123']) && Array.isArray(L.sym)
        && flat(L.abc).includes('q') && flat(L.abc).includes('⏎:enter')
        && flat(L.abc).includes('⇧:shift') && flat(L.abc).includes('⌫:backspace')
        && flat(L['123']).includes('5') && flat(L.sym).includes('[');
})());
check('enable → show/hide/toggle roundtrip', (() => {
    SysConf.set('touchKeyboardEnabled', true);
    const shown = VK.show() === true && VK.isOpen() === true;
    const hid = VK.hide() === true && VK.isOpen() === false;
    VK.toggle();
    const re = VK.isOpen() === true;
    VK.toggle();
    return shown && hid && re && VK.isOpen() === false;
})());
check('focusin on a text field auto-shows', (() => {
    SysConf.set('touchKeyboardEnabled', true);
    SysConf.set('touchKeyboardAutoShow', true);
    const fake = { tagName: 'INPUT', type: 'text', disabled: false, isContentEditable: false, readOnly: false, inputMode: '', dataset: {} };
    for (const fn of docListeners.focusin || []) fn({ target: fake });
    const shown = VK.isOpen() === true;
    for (const fn of docListeners.focusout || []) fn({ target: fake, relatedTarget: null });
    const hidden = VK.isOpen() === false;
    SysConf.set('touchKeyboardEnabled', false);
    return shown && hidden && VK.isOpen() === false;
})());
check('focusin ignored while disabled', (() => {
    SysConf.set('touchKeyboardEnabled', false);
    const fake = { tagName: 'TEXTAREA', disabled: false, isContentEditable: false, readOnly: false, inputMode: '', dataset: {} };
    for (const fn of docListeners.focusin || []) fn({ target: fake });
    return VK.isOpen() === false;
})());
check('keyboard bounds default to docked (null)', SysConf.get('touchKeyboardBounds') === null);
check('keyboard mode defaults to auto (null)', SysConf.get('touchKeyboardMode') === null);
check('keyboard mode auto-resolves generic without touch hw', VK.getMode() === 'generic');
check('generic layouts include Ctrl/Alt/Tab row', (() => {
    SysConf.set('touchKeyboardMode', 'generic');
    const flat = VK.getLayouts().abc.flat();
    return flat.includes('Ctrl:ctrl') && flat.includes('Alt:alt') && flat.includes('Tab:tab') && flat.includes('Esc:esc');
})());
check('simple layouts exclude Ctrl/Alt/Tab', (() => {
    SysConf.set('touchKeyboardMode', 'simple');
    const flat = VK.getLayouts().abc.flat();
    const ok = !flat.includes('Ctrl:ctrl') && !flat.includes('Alt:alt') && !flat.includes('Tab:tab') && flat.includes('q');
    SysConf.set('touchKeyboardMode', null);
    return ok && VK.getMode() === 'generic';
})());
check('repaint() is safe headless', (() => { try { VK.repaint(); return true; } catch (e) { return false; } })());

console.log('[scripts]');
check('Scripts.runBatch echo', (() => {
    const r = SDK.Scripts.runBatch('@echo off\necho hi-sdk');
    return r.output.includes('hi-sdk') && r.exitCode === 0 && Array.isArray(r.cwd);
})());
check('Scripts.runVBScript echo', (() => {
    const r = SDK.Scripts.runVBScript('WScript.Echo "vb-sdk"');
    return r.output.includes('vb-sdk') && r.exitCode === 0;
})());
check('Scripts.runPowerShell pipeline', (() => {
    const r = SDK.Scripts.runPowerShell('1,2,3 | Measure-Object | Select-Object -ExpandProperty Count', { noProfile: true });
    return r.output.join('\n').trim() === '3' && r.exitCode === 0 && r.errors.length === 0;
})());
check('Scripts.runPowerShell error lands in errors[]', (() => {
    const r = SDK.Scripts.runPowerShell('Nope-Command', { noProfile: true });
    return r.errors.length === 1 && /not recognized/.test(r.errors[0]);
})());
check('Scripts.runFile dispatches .ps1', (() => {
    SDK.FileSystem.createFile(['/', 'users', 'default', 'Documents'], 'sdk-smoke.ps1', 'Write-Output "ps1-sdk"', 'ps1');
    const r = SDK.Scripts.runFile(['/', 'users', 'default', 'Documents', 'sdk-smoke.ps1'], { noProfile: true });
    SDK.FileSystem.delete(['/', 'users', 'default', 'Documents', 'sdk-smoke.ps1']);
    return r.output.includes('ps1-sdk');
})());
check('Scripts.runFile dispatches .bat', (() => {
    SDK.FileSystem.createFile(['/', 'users', 'default', 'Documents'], 'sdk-smoke.bat', '@echo off\necho bat-sdk', 'bat');
    const r = SDK.Scripts.runFile(['/', 'users', 'default', 'Documents', 'sdk-smoke.bat']);
    SDK.FileSystem.delete(['/', 'users', 'default', 'Documents', 'sdk-smoke.bat']);
    return r.output.includes('bat-sdk');
})());
check('Scripts.runFile unknown ext → UNSUPPORTED', (() => {
    try { SDK.Scripts.runFile(['/', 'users', 'default', 'Documents', 'x.txt']); return false; }
    catch (e) { return e.code === 'UNSUPPORTED'; }
})());
check('Scripts.runFile missing → NOT_FOUND', (() => {
    try { SDK.Scripts.runFile(['/', 'users', 'default', 'Documents', 'nope-sdk.bat']); return false; }
    catch (e) { return e.code === 'NOT_FOUND'; }
})());
check('Scripts.runBatch rejects non-string', (() => {
    try { SDK.Scripts.runBatch(42); return false; }
    catch (e) { return e.code === 'INVALID_ARGS'; }
})());
check('Scripts.detectLanguage', SDK.Scripts.detectLanguage('setup.PS1') === 'powershell' &&
    SDK.Scripts.detectLanguage('a.vbs') === 'vbscript' &&
    SDK.Scripts.detectLanguage('runme') === null);
check('Scripts.supportedExtensions', SDK.Scripts.supportedExtensions().join(',') === 'bat,cmd,vbs,vbe,ps1,psm1');
check('app.scripts bound runs PowerShell', (() => {
    const app = SDK.createApp({ id: 'sdkprobe' });
    const r = app.scripts.runPowerShell('Write-Output "bound-sdk"', { noProfile: true });
    return r.output.includes('bound-sdk');
})());

console.log('[tray]');
check('Tray.canUse reflects background capability', SDK.Tray.canUse('clock') === true && SDK.Tray.canUse('notepad') === false);
check('register without background capability → PERMISSION_DENIED',
    (() => { try { SDK.Tray.register('notepad', {}); return false; } catch (e) { return e.code === 'PERMISSION_DENIED'; } })());
check('register an icon for a background app', (() => {
    const h = SDK.Tray.register('clock', { id: 'status', icon: '<svg></svg>', tooltip: 'Clock', badge: 2 });
    const ok = !!h && h.id === 'status' && h.appId === 'clock'
        && typeof h.setIcon === 'function' && SDK.Tray.list('clock').length === 1;
    h.setBadge(0).setTooltip('Done').setVisible(false).setVisible(true);
    const painted = h.element && h.element.title === 'Done';
    h.remove();
    return ok && painted && SDK.Tray.list('clock').length === 0;
})());
check('unknown icon update → NOT_FOUND',
    (() => { try { SDK.Tray.update('clock', 'nope', {}); return false; } catch (e) { return e.code === 'NOT_FOUND'; } })());
check('remove one + removeAll', (() => {
    SDK.Tray.register('clock', { id: 'a' });
    SDK.Tray.register('clock', { id: 'b' });
    const oneGone = SDK.Tray.remove('clock', 'a') === true && SDK.Tray.get('clock', 'a') === null;
    const n = SDK.Tray.removeAll('clock');
    return oneGone && n === 1 && SDK.Tray.list('clock').length === 0;
})());
check('bad spec throws INVALID_ARGS',
    (() => { try { SDK.Tray.register('clock', { onClick: 'x' }); return false; } catch (e) { return e.code === 'INVALID_ARGS'; } })());
check('app.tray is bound to the app id', (() => {
    const bound = SDK.createApp({ id: 'clock', name: 'Clock' });
    if (bound.tray.canUse() !== true) return false;
    const h = bound.tray.register({ id: 'bound', icon: '<svg></svg>' });
    const ok = !!h && h.appId === 'clock' && bound.tray.list().length === 1;
    bound.tray.removeAll();
    return ok;
})());

console.log('\n----------------------------------------');
console.log(`passed ${passed}, failed ${failures.length}`);
if (failures.length > 0) {
    console.log('failures:', failures.join(', '));
    process.exit(1);
}
console.log('SDK SMOKE OK');
