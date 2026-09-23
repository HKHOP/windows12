// Windows 12 SDK — createApp().
//
// The primary way to build an app: one bound context so you never repeat
// your app id, never build raw paths, and never misattribute a toast.
// File access is scoped by construction to the CURRENT USER's
// /users/<id>/AppData/<id>/ (app.files); app.globalFiles is the opt-in
// shared store at /system/programs data/<id>/. Names outside the sandbox
// are rejected, not silently resolved.
//
//   import { createApp } from '../../sdk/index.js';
//   const app = createApp({ id: 'myApp', name: 'My App' });
//   function launch() {
//       app.window.create({ title: 'My App', content: '...' });
//       app.notify.info('Hi', 'Launched.');
//   }
//   export default { launch };
import { WindowManager } from './windowManager.js';
import { Media } from './media.js';
import { FileSystem as RawFiles } from './filesystem.js';
import { Notifications } from './notifications.js';
import { Dialogs } from './dialogs.js';
import { Keyboard } from './keyboard.js';
import { Clipboard } from './clipboard.js';
import { Apps } from './apps.js';
import { Settings } from './settings.js';
import { Shell } from './shell.js';
import { FileAssociations } from './fileAssociations.js';
import { System } from './system.js';
import { Events } from './events.js';
import { Permissions } from './permissions.js';
import { Lifecycle } from './lifecycle.js';
import { Background } from './background.js';
import { PointerLock } from './pointerLock.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Net } from './net.js';
import { Inject } from './inject.js';
import { bindScripts } from './scripts.js';
import Users from '../modules/users.js';
import InternalFS from '../modules/fileSystem.js';
import { ErrorCodes, SDKError, requireString, requireOptions } from './errors.js';

// Shared (machine-global) app data root — the opt-in store. Per-user data
// lives under the current user's home instead (Users.appData).
const GLOBAL_DATA_ROOT = ['/', 'system', 'programs data'];

/**
 * Validate a sandboxed relative name ('notes.json', 'chats/a.json').
 * Rejects absolute paths, traversal (..), empty segments and backslashes.
 * @param {any} name
 * @returns {string[]} segments
 * @throws {SDKError} INVALID_ARGS
 */
function cleanName(name) {
    requireString(name, 'name');
    const raw = name.replace(/\\/g, '/');
    if (raw.startsWith('/')) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `App files must be relative, not absolute ("${name}").`);
    }
    const segs = raw.split('/').filter(s => s.length > 0);
    if (segs.length === 0 || segs.some(s => s === '.' || s === '..')) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `Invalid app file name "${name}".`);
    }
    return segs;
}

// Full path of an app's data root, including the app id itself.
// Per-user: /users/<currentUser>/AppData/<appId> — shared: the global store.
function sandboxRoot(appId, shared) {
    return shared ? [...GLOBAL_DATA_ROOT, appId] : Users.appData(appId);
}

function ensureChain(appId, dirSegs, shared) {
    // Walk from the sandbox root, creating anything missing.
    let cur = ['/'];
    for (const seg of [...sandboxRoot(appId, shared).slice(1), ...dirSegs]) {
        if (!InternalFS.itemExists([...cur, seg])) {
            if (!InternalFS.createFolder(cur, seg)) return null;
        }
        cur = [...cur, seg];
    }
    return cur;
}

/**
 * Create a bound app context. Validates the id once, up front.
 *
 * IMPORTANT: call this inside launch(), never at module scope — the
 * registry↔app import cycle leaves SDK bindings uninitialized while
 * modules evaluate (same rule as AppLoader/AppRegistry).
 *
 * @param {{id: string, name?: string}} def
 * @returns {object} bound SDK
 * @throws {SDKError} INVALID_ARGS on bad id
 */
function createApp(def) {
    const d = requireOptions(def, 'def');
    requireString(d.id, 'def.id');
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(d.id)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS,
            `App id "${d.id}" must start with a letter and contain only letters/digits (match manifest.json).`);
    }
    const id = d.id;
    const name = d.name || id;

    // The sandboxed file store. Per-user by default; shared=true builds the
    // same API against the machine-global /system/programs data/<id>/ store.
    const makeSandbox = (shared) => {
        const listSandbox = (subfolder) => {
            let dir;
            if (subfolder === undefined || subfolder === null) {
                dir = ensureChain(id, [], shared);
            } else {
                dir = ensureChain(id, cleanName(subfolder), shared);
            }
            if (!dir) {
                throw new SDKError(ErrorCodes.NOT_FOUND, 'App data area is unavailable (filesystem not initialized).');
            }
            return RawFiles.list(dir);
        };
        const resolve = (fileName) => {
            const segs = cleanName(fileName);
            const file = segs.pop();
            const dir = ensureChain(id, segs, shared);
            if (!dir) {
                throw new SDKError(ErrorCodes.NOT_FOUND, 'App data area is unavailable (filesystem not initialized).');
            }
            const dot = file.lastIndexOf('.');
            return { dir, file, ext: dot > 0 ? file.slice(dot + 1) : '' };
        };

        return {
            /**
             * Read a sandboxed text file (null when missing).
             * @param {string} fileName
             * @returns {string|null}
             */
            read(fileName) {
                const { dir, file } = resolve(fileName);
                return RawFiles.readFile([...dir, file]);
            },
            /**
             * Write (create or overwrite) a sandboxed text file.
             * @param {string} fileName
             * @param {string} content
             * @returns {boolean}
             */
            write(fileName, content) {
                if (typeof content !== 'string') {
                    throw new SDKError(ErrorCodes.INVALID_ARGS, 'content must be a string.');
                }
                const { dir, file, ext } = resolve(fileName);
                const full = [...dir, file];
                if (RawFiles.exists(full)) return RawFiles.write(full, content);
                return RawFiles.createFile(dir, file, content, ext);
            },
            /**
             * @param {string} fileName
             * @returns {boolean}
             */
            exists(fileName) {
                const { dir, file } = resolve(fileName);
                return RawFiles.exists([...dir, file]);
            },
            /**
             * List the sandbox root (or a sandboxed subfolder).
             * @param {string} [subfolder]
             * @returns {Array}
             */
            list(subfolder) {
                return listSandbox(subfolder);
            },
            /**
             * Create a sandboxed subfolder.
             * @param {string} folderName
             * @returns {boolean}
             */
            mkdir(folderName) {
                const segs = cleanName(folderName);
                const leaf = segs.pop();
                const dir = ensureChain(id, segs, shared);
                if (RawFiles.exists([...dir, leaf])) return false;
                return RawFiles.createFolder(dir, leaf);
            },
            /**
             * Move a sandboxed file to the Recycle Bin.
             * @param {string} fileName
             * @returns {boolean}
             */
            remove(fileName) {
                const { dir, file } = resolve(fileName);
                return RawFiles.delete([...dir, file]);
            },
            /**
             * Rename within the same sandboxed folder.
             * @param {string} fileName
             * @param {string} newName plain file name, no slashes
             * @returns {boolean}
             */
            rename(fileName, newName) {
                const { dir, file } = resolve(fileName);
                requireString(newName, 'newName');
                if (newName.includes('/') || newName.includes('\\')) {
                    throw new SDKError(ErrorCodes.INVALID_ARGS, 'newName must be a plain file name.');
                }
                return RawFiles.rename([...dir, file], newName);
            },
            /** Tiny persisted key/value prefs (settings.json in your sandbox). */
            settings: {
                _load() {
                    try {
                        const { dir, file } = resolve('settings.json');
                        const raw = RawFiles.read([...dir, file]);
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            if (parsed && typeof parsed === 'object') return parsed;
                        }
                    } catch { /* corrupt -> empty */ }
                    return {};
                },
                _save(obj) {
                    const { dir, file, ext } = resolve('settings.json');
                    const json = JSON.stringify(obj);
                    const full = [...dir, file];
                    if (RawFiles.exists(full)) RawFiles.write(full, json);
                    else RawFiles.createFile(dir, file, json, ext);
                },
                /**
                 * @param {string} key
                 * @param {any} [fallback]
                 */
                get(key, fallback) {
                    requireString(key, 'key');
                    const all = this._load();
                    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : fallback;
                },
                /**
                 * @param {string} key
                 * @param {any} value must be JSON-serializable
                 */
                set(key, value) {
                    requireString(key, 'key');
                    const all = this._load();
                    all[key] = value;
                    this._save(all);
                },
                /** @returns {object} all prefs */
                all() {
                    return this._load();
                }
            }
        };
    };

    const files = makeSandbox(false);       // per-user: /users/<id>/AppData/<id>/
    const globalFiles = makeSandbox(true);  // shared: /system/programs data/<id>/

    const notify = {
        /** @param {string} title @param {string} message @param {object} [options] */
        info(title, message, options) {
            return Notifications.info(title, message, { ...(options || {}), appId: id });
        },
        /** @param {string} title @param {string} message @param {object} [options] */
        action(title, message, options) {
            return Notifications.action(title, message, { ...(options || {}), appId: id });
        },
        /** @param {string} title @param {string} message @param {object} [options] */
        form(title, message, options) {
            return Notifications.form(title, message, { ...(options || {}), appId: id });
        }
    };

    const window = {
        /**
         * Create a window owned by this app (appId prefilled).
         * @param {object} options { title, icon, content, width, height, minWidth, minHeight, resizable, saveState }
         */
        create(options) {
            const opts = requireOptions(options, 'options');
            return WindowManager.create({ ...opts, appId: id });
        },
        byId: (windowId) => WindowManager.get(windowId),
        focus: (windowId) => WindowManager.focus(windowId),
        isFocused: (windowId) => WindowManager.isFocused(windowId),
        focused: () => WindowManager.getFocused(),
        minimize: (windowId) => WindowManager.minimize(windowId),
        restore: (windowId) => WindowManager.restore(windowId),
        isMinimized: (windowId) => WindowManager.isMinimized(windowId),
        toggleMaximize: (windowId) => WindowManager.toggleMaximize(windowId),
        maximize: (windowId) => WindowManager.maximize(windowId),
        unmaximize: (windowId) => WindowManager.unmaximize(windowId),
        isMaximized: (windowId) => WindowManager.isMaximized(windowId),
        bounds: (windowId) => WindowManager.getBounds(windowId),
        getBounds: (windowId) => WindowManager.getBounds(windowId),
        setBounds: (windowId, bounds) => WindowManager.setBounds(windowId, bounds),
        position: (windowId) => WindowManager.getPosition(windowId),
        move: (windowId, x, y) => WindowManager.setPosition(windowId, x, y),
        size: (windowId) => WindowManager.getSize(windowId),
        resize: (windowId, w, h) => WindowManager.setSize(windowId, w, h),
        center: (windowId) => WindowManager.center(windowId),
        desktopArea: () => WindowManager.getDesktopArea(),
        isResizable: (windowId) => WindowManager.isResizable(windowId),
        setResizable: (windowId, resizable) => WindowManager.setResizable(windowId, resizable),
        isDragging: (windowId) => WindowManager.isDragging(windowId),
        isResizing: (windowId) => WindowManager.isResizing(windowId),
        onDragState: (cb) => WindowManager.onDragState(cb),
        onResizeState: (cb) => WindowManager.onResizeState(cb),
        onBoundsChanged: (cb) => WindowManager.onBoundsChanged(cb),
        onClosed: (cb) => WindowManager.onClosed(cb),
        onMinimizeState: (cb) => WindowManager.onMinimizeState(cb),
        onFocusChanged: (cb) => WindowManager.onFocusChanged(cb),
        setFullscreen: (windowId) => WindowManager.setFullscreen(windowId),
        exitFullscreen: (windowId) => WindowManager.exitFullscreen(windowId),
        isFullscreen: (windowId) => WindowManager.isFullscreen(windowId),
        setTitle: (windowId, title) => WindowManager.setTitle(windowId, title),
        setMinSize: (windowId, w, h) => WindowManager.setMinSize(windowId, w, h),
        close: (windowId) => WindowManager.close(windowId),
        requestClose: (windowId) => WindowManager.requestClose(windowId),
        closeAll: () => WindowManager.closeAll(id),
        requestCloseAll: () => WindowManager.requestCloseAll(id),
        open: () => WindowManager.getByApp(id),
        all: () => WindowManager.getByApp(id)
    };

    const keyboard = {
        /**
         * Register a shortcut owned by this app (auto owner tag).
         * @param {string} combo
         * @param {Function} callback
         * @param {object} [options]
         */
        register(combo, callback, options) {
            return Keyboard.register(combo, callback, { ...(options || {}), owner: id });
        },
        unregister: (ref) => Keyboard.unregister(ref),
        unregisterAll: () => Keyboard.unregisterAll(id),
        isDown: (keyName) => Keyboard.isDown(keyName)
    };

    const permissions = {
        /** @param {string} perm */
        has: (perm) => Permissions.has(id, perm),
        /** @param {string} perm @throws {SDKError} PERMISSION_DENIED */
        require: (perm) => Permissions.require(id, perm),
        /** Manifest-declared permission ids. */
        declared: () => Permissions.getDeclared(id)
    };

    const lifecycle = {
        /** @param {Function} handler return false to veto close */
        onClose: (handler) => Lifecycle.onClose(id, handler),
        offClose: () => Lifecycle.offClose(id),
        /** @param {string} windowId @param {Function} handler veto one window's close */
        onWindowClose: (windowId, handler) => Lifecycle.onWindowClose(windowId, handler),
        offWindowClose: (windowId, handler) => Lifecycle.offWindowClose(windowId, handler)
    };

    const pointerLock = {
        /**
         * Pointer-lock an element inside one of this app's windows (must
         * run in a user gesture). Parks the OS virtual cursor while locked.
         * @param {Element} element usually your canvas
         * @returns {Promise<boolean>}
         */
        request: (element) => PointerLock.request(element, id),
        exit: () => PointerLock.exit(),
        isLocked: (element) => PointerLock.isLocked(element),
        onChange: (cb) => PointerLock.onChange(cb)
    };

    const input = {
        /**
         * Raw key-state for games, scoped to an element (give your window
         * body tabindex="0"). Clears on blur and on element removal.
         * @param {HTMLElement} element
         * @param {object} [options] { prevent: string[]|true }
         */
        keyState: (element, options) => Input.keyState(element, options)
    };

    const audio = {
        supported: Audio.supported,
        context: Audio.context,
        masterGain: Audio.masterGain,
        masterVolume: Audio.masterVolume,
        unlock: Audio.unlock,
        suspend: Audio.suspend,
        state: Audio.state,
        /** @param {object} [opts] { freq, endFreq, duration, type, volume, delay } */
        beep: (opts) => Audio.beep(opts)
    };

    const background = {
        canRun: () => Background.canRun(id),
        isBackground: () => Background.isBackground(id),
        goBackground: () => Background.goBackground(id),
        bringToForeground: () => Background.bringToForeground(id)
    };

    const net = {
        /** @param {object} opts { name, transport?: 'local', meta? } */
        createChannel: (opts) => Net.createChannel(opts),
        /** @param {string} name channel name @param {object} [opts] { timeout } */
        discover: (name, opts) => Net.discover(name, opts),
        /** @param {object} [opts] { meta } — returns { code, accept(answerCode) } */
        createInvite: (opts) => Net.createInvite(opts),
        /** @param {string} inviteCode @param {object} [opts] { meta } — returns { code, connected } */
        acceptInvite: (inviteCode, opts) => Net.acceptInvite(inviteCode, opts),
        /** @param {object} [opts] { meta } — returns { code (6 chars), waitForController } */
        createShortInvite: (opts) => Net.createShortInvite(opts),
        /** @param {string} code 6-char code @param {object} [opts] { meta } — returns { connected } */
        acceptShortInvite: (code, opts) => Net.acceptShortInvite(code, opts)
    };

    const inject = {
        /** @param {object} opts { type?, key, code?, modifiers... } */
        key: (opts) => Inject.key(opts),
        /** @param {string} text insert into the focused editable element */
        type: (text) => Inject.type(text),
        /** @param {HTMLElement} element @param {object} opts { x, y, type?, button? } */
        pointer: (element, opts) => Inject.pointer(element, opts)
    };

    const media = {
        /**
         * Open a microphone MediaStream (OS grant checked first).
         * @param {object} [constraints] extra audio constraints
         * @returns {Promise<MediaStream>}
         */
        microphone: (constraints) => Media.requestMicrophone(id, constraints),
        /**
         * Open a camera MediaStream (OS grant checked first).
         * @param {object} [constraints] extra video constraints
         * @returns {Promise<MediaStream>}
         */
        camera: (constraints) => Media.requestCamera(id, constraints),
        /** getUserMedia present on this device? */
        supported: () => Media.supported()
    };

    return {
        id,
        name,
        icon: () => Shell.icons.app(id),
        window,
        files,
        globalFiles,
        notify,
        notifications: notify,
        dialogs: Dialogs,
        keyboard,
        clipboard: Clipboard,
        permissions,
        apps: Apps,
        settings: Settings,
        shell: Shell,
        associations: FileAssociations,
        system: System,
        events: Events,
        lifecycle,
        background,
        media,
        pointerLock,
        input,
        audio,
        net,
        inject,
        scripts: bindScripts(id)
    };
}

export { createApp };
export default { createApp };
