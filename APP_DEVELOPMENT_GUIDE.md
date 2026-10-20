# Windows 12 — App Development Guide

This document contains everything you need to build a new app for the Windows 12 web OS simulation. Each app is a folder using the IIFE module pattern, described by a manifest, and wired into the OS by a generated registry — no manual registration in system files.

Apps are **packages**: a self-contained folder that the OS imports lazily on first launch. Builtin packages ship with the OS; store packages are downloaded by the Microsoft Store and installed into the virtual filesystem, then executed from there (see §2.5).

---

## Quick Start

1. Create `js/apps/<id>/` with `manifest.json` + `main.js` + `assets/icon.svg` (copy `js/apps/sampleApp/`)
2. Run `node build-registry.js` to regenerate `js/apps/registry.js` (+ `sw.js` precache)
3. If `distribution` is `"store"`, also run `node build-packages.js` to build its downloadable archive — it then appears in the Microsoft Store automatically

That's it. The OS handles windows, taskbar, dragging, resizing, snapping, and persistence for you.

> **New apps should build on the Windows 12 SDK (§26)** — one stable import instead of deep `../../modules/*` paths. Direct module imports keep working forever, but the SDK is the documented contract.

---

## 0. App Folder Layout

```
js/apps/myReddit/
  manifest.json   # id, uuid (v4, frozen), name, version, distribution, associations, store info
  main.js         # wired entry: `export default` an object with at least { launch }
  scripts/        # extra modules (optional, import via ./scripts/x.js)
  assets/         # static files — icon.svg is the app icon (optional but recommended)
```

The app icon lives in the package as `assets/icon.svg`; the build records `hasIcon` in the registry and every list surface (Start, Search, Store, taskbar, title bar) renders it as an `<img>`. Apps without one fall back to the inline glyph table in `js/modules/appIcons.js` (which now only carries shell-only glyphs).

Minimal `manifest.json` for a builtin app:

```json
{
    "manifestVersion": 1,
    "id": "myReddit",
    "uuid": "3f6d8c2a-1b4e-4f7a-9c1d-2e5f6a7b8c9d",
    "name": "MyReddit",
    "version": "1.0.0",
    "distribution": "builtin",
    "entry": "main.js",
    "icon": "assets/icon.svg",
    "associations": [],
    "permissions": ["filesystem", "notifications"]
}
```

Known permissions: `filesystem` (virtual files), `notifications` (toasts + panel), `network` (fetch + remote embeds), `clipboard` (read copies), `background` (headless execution — equals the `"background": true` flag, so declare one or the other), `microphone` (audio capture via `app.media`), `camera` (video capture via `app.media`). `build-registry.js` rejects unknown names.

Store apps show their permissions on the Store page, install asks for consent, and users can revoke per app in Settings > Apps (a revoked `notifications` permission blocks that app's toasts). Builtins are first-party and always granted. Check at runtime with `Permissions.isGranted(appId, perm)` (see §24).

For a store app use `"distribution": "store"` and add `associations` (file extensions it opens, requires an exported `open(path, content)` function) plus a `store` block (`developer`, `category`, `rating`, `reviews`, `description`, `features[]`, `screenshots[]`, `size`, `ageRating`). Then run `node build-packages.js` so its `.w12pkg` archive exists for the Store to download.

Generate the uuid once with `node -e "console.log(crypto.randomUUID())"` and never change it — installs are recorded by package folder, keyed by uuid during legacy migration.

---

## 1. App File Template

Every app is a self-contained IIFE that exports `{ launch }` (plus `open(path, content)` if the manifest declares `associations`). Create `js/apps/<appId>/main.js`:

```js
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';

const MyReddit = (() => {
    const icon = AppIcons.get('myReddit');

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;background:#1a1a1b;color:white;">
                <div style="flex:1;overflow:auto;padding:16px;">
                    <h2>Welcome to MyReddit</h2>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow(
            'myReddit',           // app ID
            'MyReddit',           // window title
            icon,                 // icon string (<img> for packaged apps)
            getContent(),         // HTML content
            { width: 800, height: 600, minWidth: 400, minHeight: 300 }
        );

        // Wire up event listeners using win.element
        win.element.querySelector('.some-btn').addEventListener('click', () => {
            Popup.info('Hello', 'MyReddit is working!');
        });
    }

    return { launch };
})();

export default MyReddit;
```

---

## 2. Registration Checklist

After creating your app folder, there are only 2 steps:

### Step 1: Add the app icon

Drop an SVG at `js/apps/myReddit/assets/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF4500"/><circle cx="9" cy="11" r="1.5" fill="white"/><circle cx="15" cy="11" r="1.5" fill="white"/></svg>
```

Use it in the app via `AppIcons.get('myReddit')` (returns an `<img>` for packaged apps). Only shell glyphs that are not apps belong in the inline table in `js/modules/appIcons.js`. The optional manifest field `"icon": "assets/icon.svg"` overrides the default path.

### Step 2: Regenerate the registry

```sh
node build-registry.js
```

This validates all manifests, rewrites `js/apps/registry.js` (metadata only — module imports are lazy, see §2.5), and refreshes the `sw.js` precache (core shell assets + every builtin app file). Commit the regenerated files.

If the app is a store app, also build its download archive:

```sh
node build-packages.js
```

This writes `packages/<id>.w12pkg` (an uncompressed ZIP of the whole app folder) that the Store downloads on install. Commit those too.

Everything else is automatic: display name (manifest `name`), taskbar/start menu/search listings, store listing (from the manifest `store` block), install/uninstall by uuid, and file associations (manifest `associations` wired to your exported `open`).

> **Rule:** app modules must not call `AppLoader` / `AppRegistry` / `AppMetadata` / `Packages` at module scope (top-level). The registry ↔ app import cycle leaves those bindings uninitialized during evaluation — only call them inside functions like `launch()`.

### 2.5 Packages, lazy loading and the Store

**Catalog vs. code.** `js/apps/registry.js` now carries *metadata only* (`APP_MANIFESTS`: id, uuid, name, version, distribution, entry, `hasIcon`, icon path, permissions, associations, store block). The shell reads the catalog for Start/Search/Store/permissions without ever importing an app. A package's `main.js` is `import()`-ed the first time it launches (`AppLoader.ensureLoaded(id)`), so 50+ apps no longer evaluate at boot.

**Where packages live.**
- Builtins ship with the OS (served from the network) and are always installed; they cannot be uninstalled.
- Store apps install as real package folders in the virtual filesystem:
  - system-wide (`Install for all users`): `/Program Files/<id>/`
  - per-user: `/users/<uid>/AppData/Programs/<id>/`
- The *presence of the folder* is the install record — there is no separate install list.

**How they run from disk.** Installing downloads `packages/<id>.w12pkg`, unpacks it with `js/modules/zip.js` and writes each file into the vFS (code/assets as blob-backed nodes so the tree snapshot stays small; `manifest.json` inline so the catalog stays synchronous). A service worker (`sw.js`, registered in `js/main.js`) intercepts the canonical app URL `/js/apps/<id>/…` and serves the **installed copy from the vFS** — so no import path is ever rewritten, and store code genuinely executes from "disk". When the worker is not controlling, or the storage backend is the non-OPFS fallback, the same URL falls through to the shipped bundle (so store apps still run, just not from disk).

**Key modules.** `js/modules/packages.js` (scan/install/uninstall, legacy migration, session user pointer), `build-packages.js` (archive builder), `build-registry.js` (registry + `sw.js` blocks), `sw.js` (virtual host + offline precache).

**An app id is resolvable but not loaded** until its first launch — `AppLoader.getModule(id)` returns `null` before that, so always go through `AppLoader.ensureLoaded(id)` / `Taskbar.openApp(id)` (both async) rather than reading modules directly.

**Store installs ask for a scope** (Just me / All users) and stream progress; uninstall deletes the package folder and wipes that app's permission grants. Legacy installs recorded in the old `installed_apps_*` localStorage keys are honored immediately and migrated to per-user packages in the background.

### 2.6 Package Installer (.msi) and `installer.json`

`.msi` files are app packages: the same ZIP layout as `.w12pkg` (flat root with `manifest.json` + the app). The built-in **Package Installer** opens `.msi` and `.w12pkg` from File Explorer and runs a classic setup wizard. Double-clicking a package is enough — no Store listing or registry entry is needed.

**Build a package.** Put the app folder anywhere and run:

```bash
node build-msi.js myApp                 # js/apps/myApp -> dist/myApp.msi
node build-msi.js ./staging/myApp --out ./myApp.msi
```

The builder validates the identity fields and the entry file, includes everything except dotfiles, and writes a stored (method 0) ZIP. A ZIP with a single wrapping folder is also accepted at install time, so zipping an app folder from Explorer works too.

**Identity rules.** `id` / `uuid` / `entry` are the package identity: `id` must be letters+digits starting with a letter, `uuid` must be a UUID, and `entry` must exist. Built-in ids, and shipped catalog ids with a different uuid, are rejected. Reusing a shipped store app's id **and** uuid installs it locally as an update of that app. An existing local install with the same id and a *different* uuid can only be replaced after an explicit confirmation (the wizard shows it; programmatic callers pass `allowReplace`). Package installs never silently replace a different app.

**`installer.json`** is optional and sits at the package root (next to `manifest.json`):

```json
{
  "schema": 1,
  "mode": "gui",
  "scope": "either",
  "defaultScope": "user",
  "publisher": "Contoso",
  "ui": "installer/ui.js",
  "eula": "installer/license.txt",
  "welcome": {
    "title": "Welcome to Contoso Studio Setup",
    "message": "This wizard will install Contoso Studio.",
    "image": "installer/welcome.svg"
  },
  "theme": {
    "accent": "#0078d4",
    "banner": "installer/banner.svg",
    "logo": "installer/logo.svg"
  },
  "features": [
    { "id": "samples", "name": "Sample projects", "description": "Copy starter projects into your workspace.", "default": true },
    { "id": "cli", "name": "Command-line tools", "required": true }
  ],
  "fields": [
    { "id": "server", "label": "Server URL", "type": "text", "default": "https://", "required": true },
    { "id": "telemetry", "label": "Send anonymous usage data", "type": "checkbox", "default": false },
    { "id": "edition", "label": "Edition", "type": "select", "options": ["Community", "Pro"], "default": "Community" }
  ],
  "finish": { "message": "Contoso Studio is ready.", "launch": true },
  "shortcuts": { "desktop": true },
  "data": { "anything": "passed through to install.json" }
}
```

| Field | Meaning |
|-------|---------|
| `mode` | `gui` (default), `headless` (compact progress window, defaults only) or `silent` (no window, notifications only). |
| `scope` | `either` (default), `user` or `system`. A locked scope hides the choice and is enforced at install time. |
| `defaultScope` | `user` (default) or `system`; ignored when `scope` is locked. |
| `ui` | Module path for a custom UI (relative to the package root, must end in `.js`/`.mjs`). |
| `eula` | License file path, `false` to disable, or `{ "path": "...", "required": false }`. When omitted, `license.txt` / `eula.txt` is picked up automatically. |
| `welcome.image`, `theme.*` | Package-relative assets. Accent must be a hex color. |
| `features` | Checkboxes; required features are always installed. |
| `fields` | Setup inputs. Types: `text`, `password`, `checkbox`, `select`. Required fields must have a default for headless/silent installs. Password values are not written to `install.json` unless the field sets `"persist": true`. |
| `finish` | Completion text and whether the wizard offers to launch the app (default `true`). |
| `shortcuts` | Shortcut defaults/overrides for `startMenu`, `desktop` and `taskbar` (see below). |
| `data` | Arbitrary object copied into the install record. |

**Installer shortcuts.** Every app gets a Start Menu shortcut by default. Desktop and taskbar shortcuts are opt-in. A manifest or `installer.json` may set `shortcuts` to `false`/`true` (all destinations) or to an object:

```json
{
  "shortcuts": {
    "startMenu": false,
    "desktop": { "create": true, "name": "Contoso Studio", "arguments": "--profile work" },
    "taskbar": { "create": true, "run": "minimized" }
  }
}
```

Each destination accepts `enabled`/`create`, `optional`, `default`, `name`, `icon`, `arguments`, `startIn`, `comment`, `run` (`normal`/`minimized`/`maximized`) and `hotkey`. Destinations marked `optional: true` appear as checkboxes in the wizard; `enabled: false` makes a destination impossible. Installer-created shortcuts are tagged with the app id, so updates refresh them and uninstalling the app removes them without touching the user's own shortcuts. Shortcuts live in the real per-user shell folders (`AppData/Roaming/Microsoft/Windows/Start Menu/Programs` and `.../Quick Launch/User Pinned/TaskBar`). Any folder that contains a valid `manifest.json` can also be launched as a portable app by double-clicking it.

`installer.json` and the top-level `installer/` folder are **not** copied into the installed app. Everything else in the archive is. After a successful install the installer writes `install.json` at the app root so the app can read the selected options:

```js
const info = await (await fetch(new URL('./install.json', import.meta.url))).json();
// { format: 'msi', id, name, version, scope: 'user'|'system', installedAt,
//   features: ['samples'], fields: { server: '...', telemetry: false }, data, source }
```

**Custom UI.** Ship `installer/ui.js` and reference it from `ui`. It is imported as a blob module and must export `mount(root, ctx)` (a default export also works). It owns the content area of the installer window:

```js
export async function mount(root, ctx) {
    root.innerHTML = `
        <div style="padding:24px;font-family:'Segoe UI',sans-serif;color:#fff;">
            <h2 style="margin:0 0 8px;">Install ${ctx.manifest.name}</h2>
            <p style="color:#aaa;">Custom setup for ${ctx.installer.publisher || 'this app'}.</p>
            <button id="go" style="padding:8px 16px;">Install</button>
            <p id="status" style="color:#9e9e9e;"></p>
        </div>`;

    root.querySelector('#go').addEventListener('click', async () => {
        const status = root.querySelector('#status');
        try {
            const result = await ctx.install({
                scope: 'user',
                onProgress: (value, label) => { status.textContent = `${label} ${Math.round(value * 100)}%`; }
            });
            status.textContent = result.updated ? 'Updated.' : 'Installed.';
            ctx.close();
        } catch (error) {
            status.textContent = error.message;
        }
    });

    return () => { /* optional cleanup on window close */ };
}
```

`ctx` surface:

| Member | Description |
|--------|-------------|
| `sdk` | The full Windows 12 SDK namespace (`createApp`, dialogs, notifications, files, …). |
| `app` | The installer's bound SDK app context (`ctx.app.window`, `ctx.app.notify`, …). |
| `manifest`, `installer`, `inspection`, `existing` | Parsed package metadata, normalized installer config, archive inspection, and the current install record (or `null`). |
| `defaults` | `{ scope, features, fields }` used by headless/silent installs. |
| `asset(path)` / `text(path)` / `bytes(path)` | Read package files. `asset` returns a blob URL (images, CSS, JSON). |
| `importModule(path)` | Import another JS file from the package as a blob module (single-file modules only; relative imports inside it do not resolve). |
| `install(options)` | Run the install: `{ scope, features, fields, allowReplace, onProgress }`. Missing values fall back to `defaults`. Returns `{ id, scope, manifest, updated, path, … }`. |
| `cancelInstall()`, `isCancelled()` | Cancel the running install. Staging is discarded; an existing install is never modified. |
| `close()`, `setTitle(title)`, `onClose(fn)` | Window control and cleanup hook. |
| `paths` | Display paths for `user` / `system` scope. |
| `permissions` | Declared manifest permissions (the wizard displays them as consent). |

The custom UI is trusted code: it runs in the page realm with SDK access, just like an installed app. It cannot bypass UAC (system installs still prompt), scope locks, identity checks or required fields — those are enforced in `Packages.installArchive`.

**Headless and silent.** `mode: "headless"` shows a compact progress window and applies `defaultScope`, default features and field defaults. `mode: "silent"` does the same with no window at all and reports only through notifications. Both still show UAC for system scope. If a required field has no default, the install fails with a readable error instead of prompting.

**Programmatic install.** The same pipeline is available outside the app: `await Packages.inspectArchive(bytes)` validates and returns `{ manifest, installer, eula, files, size }`, and `await Packages.installArchive(bytes, { inspection, scope, features, fields, allowReplace, onProgress, isCancelled, sourceName })` stages every file outside the package roots, swaps the finished tree into place, writes `install.json`, and dispatches `apps-changed`. A cancelled or failed install leaves the previous version untouched.

---

## 3. Window Manager API

**Import:** `import WindowManager from '../../modules/windowManager.js';`

### `createWindow(appId, title, icon, content, options?)` → `WindowData`

Creates a draggable, resizable window with title bar controls.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `appId` | `string` | — | App identifier |
| `title` | `string` | — | Window title |
| `icon` | `string` | — | SVG string for title bar |
| `content` | `string` | — | HTML string for window body |
| `options.width` | `number` | `700` | Initial width (px) |
| `options.height` | `number` | `500` | Initial height (px) |
| `options.minWidth` | `number` | `400` | Minimum width |
| `options.minHeight` | `number` | `300` | Minimum height |
| `options.saveState` | `boolean` | `true` | Persist position/size |

**Returns:**
```js
{
    id: string,            // e.g. "window-myReddit-1694000000000"
    appId: string,
    title: string,
    icon: string,
    element: HTMLElement,  // the .app-window DOM element
    isMaximized: boolean,
    prevBounds: object|null,
    saveState: boolean
}
```

**What you get for free:**
- Draggable title bar (double-click to maximize)
- 8 resize handles (all edges + corners)
- Minimize / maximize / close buttons
- Snap to left/right half, top maximize, corner quarters
- Focus management (click to bring to front)
- Z-index stacking
- Position persistence across sessions

**Example:**
```js
const win = WindowManager.createWindow('myApp', 'My App', icon, '<div id="root"></div>', {
    width: 900, height: 600, minWidth: 500, minHeight: 350
});

// Access DOM
const root = win.element.querySelector('#root');
root.innerHTML = '<p>Loaded!</p>';
```

### `closeWindow(id)`
Closes and removes a window immediately (no close handler check).

### `requestClose(id)` → `Promise<boolean>`
Attempts to close a window. Runs the app's close handler (if registered) first. Returns `true` if the window was closed, `false` if the handler blocked it.

### `setCloseHandler(appId, handler)`
Registers an async handler that runs before a window closes. Return `false` to cancel the close (e.g. to show an "unsaved changes" popup). Return `true` or nothing to allow it.

```js
WindowManager.setCloseHandler('myApp', async (windowData) => {
    const ok = await Popup.confirm('Unsaved Changes', 'Save before closing?');
    if (ok) saveDocument();
    return true; // allow close
});
```

### `removeCloseHandler(appId)`
Removes the close handler for an app.

### `closeAllWindows(appId)`
Closes all windows for an app immediately (no close handler check).

### `requestCloseAllWindows(appId)` → `Promise<void>`
Attempts to close all windows for an app, running each through its close handler.

### `focusWindow(id)`
Brings a window to front.

### `getWindowsByApp(appId)` → `WindowData[]`
Returns all open windows for an app.

### `getAllWindows()` → `WindowData[]`
Returns all open windows.

### `_getWindow(id)` → `WindowData | undefined`
Retrieves window data by ID.

---

## 4. File System API

**Import:** `import FileSystem from '../../modules/fileSystem.js';`

All data is a virtual JSON tree. The persistence backend is chosen automatically at boot (`js/modules/fsStorage.js`): OPFS (Origin Private File System) when the browser supports it, otherwise the legacy `localStorage` tree + IndexedDB blob store — your app never has to know which is active. Paths are **arrays of strings** starting with `/`. The OS is **multi-user** — always derive user-relative paths from the `Users` module, never hardcode a user id.

> The FileSystem API is **synchronous**, but persistence is asynchronous. Call `await FileSystem.flushAsync()` before any deliberate reload if you just wrote data.

**Path examples:**
- Root: `['/']`
- Current user's home: `Users.home()` → `['/', 'users', '<currentUserId>']`
- Home folder: `Users.home(['Documents'])`
- Your app's per-user data: `Users.appData('myApp')` → `['/', 'users', '<currentUserId>', 'AppData', 'myApp']`

**Import:** `import Users from '../../modules/users.js';`

### Core Methods

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `readFile(path)` | `string[]` | `string \| null` | Read file content |
| `writeFile(path, content)` | `string[], string` | `boolean` | Write to existing file |
| `createFile(path, name, content?, ext?)` | `string[], string, string?, string?` | `boolean` | Create new file |
| `createFolder(path, name)` | `string[], string` | `boolean` | Create new folder |
| `deleteItem(path)` | `string[]` | `boolean` | Move to Recycle Bin |
| `renameItem(path, newName)` | `string[], string` | `boolean` | Rename file/folder |
| `itemExists(path)` | `string[]` | `boolean` | Check if path exists |
| `isFolder(path)` | `string[]` | `boolean` | Check if path is a folder |
| `getChildren(path)` | `string[]` | `Array<{name, type, ext, modified, size}>` | List folder contents |

### Example: Persistent App Data

```js
// Lazy on purpose: the current user isn't resolved at module-eval time.
const DATA_PATH = () => Users.appData('myReddit');

function ensureDataDir() {
    if (!FileSystem.itemExists(DATA_PATH())) {
        FileSystem.createFolder(Users.home(['AppData']), 'myReddit');
    }
}

function saveData(key, value) {
    ensureDataDir();
    const json = JSON.stringify(value);
    const filePath = [...DATA_PATH(), `${key}.json`];
    if (FileSystem.itemExists(filePath)) {
        FileSystem.writeFile(filePath, json);
    } else {
        FileSystem.createFile(DATA_PATH(), `${key}.json`, json, 'json');
    }
}

function loadData(key) {
    const raw = FileSystem.readFile([...DATA_PATH(), `${key}.json`]);
    return raw ? JSON.parse(raw) : null;
}
```

**Rule:** All per-user app data MUST go under the current user's `AppData/<yourAppId>/` (`Users.appData(APP_ID, sub)` — or just use the SDK's `app.files`, which does this for you). Apps that need machine-shared data may opt into the global store at `/system/programs data/<yourAppId>/` (SDK `app.globalFiles`, or `['/', 'system', 'programs data', appId]` with raw paths).

**Permissions:** your own AppData folders (per-user **and** the global one) are always accessible. Touching anything ELSE outside them — the user's Documents, other apps' data, anything under `/system` — requires the `filesystem` permission in `manifest.json`. Apps without the declaration get a one-time runtime consent dialog instead. See §24.

### Recycle Bin Methods

| Method | Description |
|--------|-------------|
| `getRecycleBinContent()` | Returns items in Recycle Bin |
| `emptyRecycleBin()` | Permanently deletes all recycled items |
| `restoreFromRecycleBin(recycleKey)` | Restores an item to original path |

---

## 5. Popup API

**Import:** `import Popup from '../../modules/popup.js';`

**CRITICAL:** Never use native `alert()`, `confirm()`, or `prompt()`. Always use the Popup API. All methods return Promises.

### `Popup.info(title, message)` → `Promise<'ok'>`
Informational dialog with OK button.

### `Popup.warn(title, message)` → `Promise<'ok'>`
Warning dialog.

### `Popup.error(title, message)` → `Promise<'ok'>`
Error dialog (slightly wider).

### `Popup.confirm(title, message)` → `Promise<boolean>`
Confirmation with Cancel/OK. Resolves `true` for OK, `false` for Cancel.

### `Popup.pick(title, message, options)` → `Promise<any>`
Selection list. `options` is an array of strings or `{label: string}` objects. Resolves to the selected item or `null` on cancel.

### `Popup.textbox(title, message, opts?)` → `Promise<string | null>`
Text input dialog.
- `opts.value` — pre-filled text
- `opts.placeholder` — placeholder text
- Enter submits, Escape cancels

### `Popup.forum(title, fields)` → `Promise<Object | null>`
Multi-field form dialog.
- `fields`: `Array<{ key, label, type?, value?, placeholder? }>`
- Resolves to `{ key: value }` object or `null` on cancel

**Examples:**
```js
// Simple confirmation
Popup.confirm('Delete', 'Delete this file?').then(ok => {
    if (ok) FileSystem.deleteItem(path);
});

// Text input
Popup.textbox('Rename', 'New name:', { value: 'file.txt' }).then(name => {
    if (name) FileSystem.renameItem(path, name);
});

// Multiple choice
Popup.pick('Export', 'Format:', ['PNG', 'JPEG', 'SVG']).then(fmt => {
    if (fmt) exportAs(fmt);
});

// Multi-field form
Popup.forum('Settings', [
    { key: 'username', label: 'Username', value: 'User' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' }
]).then(data => {
    if (data) saveSettings(data);
});
```

---

## 6. Context Menu API

**Import:** `import ContextMenu from '../../modules/contextMenu.js';`

### `ContextMenu.show(x, y, items)`

| Param | Type | Description |
|-------|------|-------------|
| `x` | `number` | X position (use `e.clientX`) |
| `y` | `number` | Y position (use `e.clientY`) |
| `items` | `Array<MenuItem \| 'separator'>` | Menu items |

**MenuItem:**
```js
{
    label: string,       // display text
    icon: string,        // SVG string — use ShellIcons (§15), never emoji (optional)
    shortcut: string,    // shortcut text (optional)
    action: () => void,  // click handler (optional)
    disabled: boolean    // grayed out (optional)
}
```

**Example:**
```js
import UIIcons from '../../modules/uiIcons.js';

el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ContextMenu.show(e.clientX, e.clientY, [
        { label: 'Open', icon: UIIcons.action('open'), action: () => open() },
        { label: 'Copy', icon: UIIcons.action('copy'), shortcut: 'Ctrl+C', action: () => copy() },
        'separator',
        { label: 'Delete', icon: UIIcons.action('delete'), action: () => del() }
    ]);
});
```

---

## 7. Taskbar Integration

**Import:** `import { Taskbar, AppRegistry, AppMetadata } from '../../modules/taskbar.js';`

### AppRegistry
| Method | Description |
|--------|-------------|
| `register(id, app)` | Register an app module |
| `get(id)` | Get registered module by ID |
| `getAll()` | Get all registered modules |

### AppMetadata
| Method | Description |
|--------|-------------|
| `get(id)` | Returns `{ name, icon }` for an app |
| `getAll()` | Returns all metadata |

### Taskbar
| Method | Description |
|--------|-------------|
| `openApp(appId)` | Open or focus an app |
| `pinApp(appId)` | Pin an app to the taskbar |
| `unpinApp(appId)` | Unpin an app |
| `isPinned(appId)` | Check if pinned (returns `boolean`) |

---

## 8. Start Menu Integration

**Import:** `import StartMenu from '../../modules/startMenu.js';`

| Method | Description |
|--------|-------------|
| `StartMenu.refresh()` | Re-renders the recommended section |
| `StartMenu.pinApp(appId)` | Pin an app to Start |
| `StartMenu.unpinApp(appId)` | Unpin from Start |
| `StartMenu.isPinned(appId)` | Check if pinned |

---

## 9. System Config

**Import:** `import SystemConfig from '../../modules/systemConfig.js';`

| Method | Description |
|--------|-------------|
| `SystemConfig.get(key)` | Get a config value |
| `SystemConfig.getAll()` | Get all config as object |
| `SystemConfig.set(key, value)` | Set a value and apply |

**Common keys:** `accentColor`, `backgroundStyle`, `taskbarOpacity`, `userName`, `darkMode`, `masterVolume`, `scaling`

---

## 10. User Activity

**Import:** `import UserActivity from '../../modules/userActivity.js';`

| Method | Description |
|--------|-------------|
| `UserActivity.trackFileOpen(path, name)` | Record a file open event |
| `UserActivity.trackAppOpen(appId)` | Record an app open event |
| `UserActivity.getRecommended()` | Get recent items (up to 6) |
| `UserActivity.getFileIcon(name)` | Get ShellIcons SVG string for a file name |

---

## 11. Sounds

**Import:** `import Sounds from '../../modules/sounds.js';`

| Method | Sound |
|--------|-------|
| `Sounds.info()` | Soft two-note information chime |
| `Sounds.warn()` | Descending warning tones |
| `Sounds.error()` | Three-note error motif with a low tail |
| `Sounds.confirm()` | Bright confirmation chime |
| `Sounds.notification()` | Short notification bell |
| `Sounds.login()` | Rising sign-in chord |
| `Sounds.logout()` | Falling sign-out chord |
| `Sounds.click()` | Short UI click |
| `Sounds.recycleBin()` | Trash sweep |

`Sounds.play(id, force?)` plays any event by id; `Sounds.events()` lists the customizable events. Users choose a scheme, override individual events, or turn them off in **Personalization > Sounds**. Adding a new event is one entry in `js/modules/sounds.js`.

---

## 12. Save Prompt

**Import:** `import SavePrompt from '../../modules/saveprompt.js';`

### `SavePrompt.show(opts?)` → `Promise<{ path, name, fullName, ext } | null>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultName` | `string` | `'Untitled.txt'` | Pre-filled filename |
| `defaultPath` | `string[]` | `['/', 'users', 'default', 'Documents']` | Starting directory |
| `extensions` | `Array<{value, label}>` | `null` | File type filter |
| `parentApp` | `string` | `'save-dialog'` | App ID for the window |

**Example:**
```js
SavePrompt.show({
    defaultName: 'document.txt',
    extensions: [{ value: 'txt', label: 'Text' }, { value: 'md', label: 'Markdown' }],
    parentApp: 'myApp'
}).then(result => {
    if (result) {
        FileSystem.createFile(result.path, result.fullName, content, result.ext);
    }
});
```

---

## 13. File Associations API

**Import:** `import FileAssociations from '../../modules/fileAssociations.js';`

Register your app to handle specific file extensions. When a user double-clicks a file in File Explorer, it checks registered handlers first.

### `register(appId, extensions, openFn)`
Register an app to handle one or more file extensions.

| Param | Type | Description |
|-------|------|-------------|
| `appId` | `string` | Your app's ID |
| `extensions` | `string[]` | Extensions to handle (without dots), e.g. `['md', 'txt']` |
| `openFn` | `(path, content) => void` | Called with the file path array and content string |

### `unregister(appId)`
Remove all handlers for an app.

### `getHandler(extension)` → `{ appId, openFn } | null`
Get the handler for an extension.

### `openFile(path)` → `boolean`
Open a file by reading it from the filesystem and dispatching to the registered handler. Returns `true` if a handler was found, `false` otherwise.

### Viewers, defaults, and the Open With dialog

Manifest handlers are authoritative, but built-in fallbacks (Notepad, Photos, Terminal, Browser preview — registered by File Explorer) fill the gaps. Resolution order everywhere is **user default → manifest handler → matching viewer**.

| Method | Description |
|--------|-------------|
| `registerViewer(appId, extensions, openFn)` | Register a built-in fallback viewer. `openFn(path, content)` matches the handler signature (viewers that read the file themselves may ignore `content`). |
| `getCandidates(ext)` | Ordered `[{ appId, kind: 'handler' \| 'viewer', openFn }]` for an extension. |
| `getAllCapable()` | Every app id that can open anything (dialog "More apps" list). |
| `getDefault(ext)` / `setDefault(ext, appId)` / `clearDefault(ext)` | The persisted "Always use this app" choice (`/system/programs data/fileAssociations/defaults.json`). `setDefault` rejects unknown app ids; stale defaults (uninstalled apps) read back as absent. |
| `openDefault(path, onOpened?)` | Open via the resolved default (blob-aware: object URLs for media). `onOpened(appId)` fires on success for recents tracking. Returns `true` when something was (or is being) opened. |
| `openWith(path, appId, onOpened?)` | Open via one specific capable app (falls back to any of its registrations when it doesn't match this extension). |
| `openWithDialog(path, onOpened?)` | The full UX: recommended apps (handler badged Recommended, current choice badged Default), More-apps expander, single/double-click, OK/Cancel, and the Always checkbox that persists the default. |

### `getSupportedExtensions()` → `string[]`
Returns all registered extensions.

**Example:**
```js
import FileAssociations from '../../modules/fileAssociations.js';

const MyMarkdown = (() => {
    function open(path, content) {
        const win = WindowManager.createWindow('myMarkdown', 'Markdown Viewer', icon,
            `<div style="padding:16px;color:white;">${renderMarkdown(content)}</div>`);
    }

    function launch() {
        FileAssociations.register('myMarkdown', ['md', 'markdown'], open);
        // ... create your main window
    }

    return { launch, open };
})();
```

---

## 14. App Icons

**Import:** `import AppIcons from '../../modules/appIcons.js';`

| Method | Description |
|--------|-------------|
| `AppIcons.get(id)` | Returns SVG string for an app |
| `AppIcons.getAll()` | Returns all icon mappings |

Known IDs: `fileExplorer`, `settings`, `notepad`, `calendar`, `taskManager`, `photos`, `calculator`, `clock`, `paint`, `browser`, `appStore`, `terminal`, `sampleApp`, `vscode`, `export`, `windowsUpdate`, `words`

---

## 15. Shell Icons (System Icon Library)

**Import:** `import UIIcons from '../../modules/uiIcons.js';`
**Global:** `window.ShellIcons` (the same object — handy in the console or dynamic code)

Think of this module as the OS's `shell32.dll` / `imageres.dll`: one centralized library of custom SVG icons for everything that *isn't* an app tile — folders, files, context-menu actions, Settings glyphs, and sidebar places. Every method returns an **SVG string** you can drop into `innerHTML` or pass as a ContextMenu `icon` / `createWindow` icon. Never use emojis for UI chrome — pull a glyph from here instead.

### `UIIcons.action(name, size?)` → `string`
Outline glyphs (they inherit `currentColor`) for menus, buttons, and dialogs. `size` defaults to `16` (context-menu size).

Names: `open`, `openWith`, `cut`, `copy`, `paste`, `rename`, `delete`, `properties`, `newFolder`, `newFile`, `refresh`, `view`, `sort`, `display`, `personalize`, `taskManager`, `taskbarSettings`, `close`, `pin`, `unpin`, `restore`, `move`, `size`, `minimize`, `maximize`, `empty`, `check`, `selectAll`, `camera`, `arrowUp`, `arrowDown`, `power`, `logout`, `restart`, `shutdown`, `switchUser`, `uninstall`, `save`, `info`, `search`.

### `UIIcons.folder(name, size?)` → `string`
Colored Fluent-style folder for a known special-folder name (`'Desktop'`, `'Documents'`, `'Downloads'`, `'Pictures'`, `'Music'`, `'Videos'`, `'Projects'`, `'New Folder'`, `'Home'`, `'This PC'`, `'C:'`, `'$Recycle.Bin'`, `'system'`, `'users'`, `'programs data'`, `'Wallpapers'`, `'Screenshots'`, …). Unknown names fall back to the generic yellow folder. `size` defaults to `32`.

### `UIIcons.file(ext, name?, size?)` → `string`
Colored document icon resolved from the file extension (`txt`, `md`, `json`, `js`, `html`, `css`, images, audio, video, `pdf`, Office docs, archives, executables, scripts, …). Pass the file name too — `config.json` gets the gear variant. Unknown extensions fall back to a generic page. `size` defaults to `32`.

### `UIIcons.sidebar(name, size?)` → `string`
Compact place icons for navigation sidebars (`'Home'`, `'Desktop'`, `'Documents'`, `'Downloads'`, `'Pictures'`, `'Music'`, `'Videos'`, `'Recycle Bin'`, `'This PC'`). `size` defaults to `16`.

### `UIIcons.setting(name, size?)` → `string`
Outline glyphs for Settings-style navigation and cards (`system`, `personalization`, `apps`, `accounts`, `time`, `privacy`, `update`, `about`, `display`, `sound`, `soundMute`, `notifications`, `power`, `storage`, `multitasking`, `touchpad`, `moon`, `sun`, `battery`, `brightnessLow`, `brightnessHigh`, gestures: `swipe`, `tap`, `doubleTap`, `drag`, `twoFingerTap`, `twoFingerSwipe`, `hold`, `slow`, `fast`). `size` defaults to `20`.

### `UIIcons.get(name, size?)` → `string`
Lookup across all groups by bare name. The raw per-icon functions are also exposed as `UIIcons.actions`, `UIIcons.settings`, `UIIcons.places`, and `UIIcons.files`.

**Examples:**
```js
import UIIcons from '../../modules/uiIcons.js';

// Context menu (16px outline glyphs)
ContextMenu.show(e.clientX, e.clientY, [
    { label: 'Open', icon: UIIcons.action('open'), action: () => open() },
    { label: 'Rename', icon: UIIcons.action('rename'), action: () => rename() },
    'separator',
    { label: 'Delete', icon: UIIcons.action('delete'), action: () => del() }
]);

// File grid (colored 36px icons)
el.innerHTML = isDir
    ? UIIcons.folder(entry.name, 36)
    : UIIcons.file(entry.ext, entry.name, 36);

// Sidebar row
row.innerHTML = `<span style="width:16px;height:16px;display:inline-flex;">${UIIcons.sidebar('Documents', 16)}</span>Documents`;
```

> **Rule:** UI chrome must use ShellIcons SVGs — never emojis. (App tile icons still come from `AppIcons`, §14.)

---

## 16. CSS Classes Reference

### Window
```
.app-window              — window container
.app-window.focused      — currently focused
.app-window.maximized    — maximized state
.window-header           — title bar
.window-body             — content area
.window-icon             — title bar icon (16x16)
.window-title            — title text
.minimize-btn / .maximize-btn / .close-btn — title bar buttons
.resize-handle           — resize handles (top, bottom, left, right, corners)
```

### Taskbar
```
.taskbar-btn.app-btn     — app button (has data-app="appId")
.running                 — has open windows
.active                  — app is focused
```

### Start Menu
```
#start-menu              — container (.hidden to hide)
.app-item                — app tile
.app-icon                — icon container
.app-name                — label
```

### Popups
```
.app-popup               — popup window
.popup-body              — content area
.popup-actions           — button area
.popup-btn / .popup-btn-primary — action buttons
```

---

## 17. All Available Imports

```js
import WindowManager from '../../modules/windowManager.js';
import FileSystem from '../../modules/fileSystem.js';
import Popup from '../../modules/popup.js';
import ContextMenu from '../../modules/contextMenu.js';
import { Taskbar, AppRegistry, AppMetadata } from '../../modules/taskbar.js';
import StartMenu from '../../modules/startMenu.js';
import SystemConfig from '../../modules/systemConfig.js';
import UserActivity from '../../modules/userActivity.js';
import Sounds from '../../modules/sounds.js';
import AppSystem from '../../modules/appSystem.js';
import AppIcons from '../../modules/appIcons.js';
import UIIcons from '../../modules/uiIcons.js';
import SavePrompt from '../../modules/saveprompt.js';
import FileAssociations from '../../modules/fileAssociations.js';
import Notifications from '../../modules/notifications.js';
import Cursor from '../../modules/cursor.js';
import Keyboard from '../../modules/keyboard.js';
```

---

## 18. Cursor API

**Import:** `import Cursor from '../../modules/cursor.js';`

Controls the mouse pointer for **both** the real (hardware) mouse and the virtual touchpad cursor at once.

By default (auto mode) nothing needs to be done: the real mouse shows each element's native CSS cursor, and the virtual cursor mirrors it — arrow on plain areas, pointing hand on links/buttons/File Explorer items, I-beam on text fields. Tip for app authors: give clickable elements `cursor: pointer` (e.g. `style="cursor:pointer"`) so both mice show the hand.

| Method | Description |
|--------|-------------|
| `Cursor.set(cursor)` | Force one cursor everywhere for both mice. Returns `true` on success, `false` if rejected. Accepts a CSS cursor keyword (`'pointer'`, `'wait'`, `'text'`, `'crosshair'`, `'move'`, `'not-allowed'`, `'grab'`, `'none'`, `'default'`) or a full CSS cursor value such as `'url("...") 4 4, pointer'`. `'auto'`/`'default'` resets to auto mode. |
| `Cursor.reset()` | Back to auto mode (native cursors + mirroring). |
| `Cursor.get()` | Current override value, or `'auto'` when in auto mode. |
| `Cursor.isCustom()` | `true` when an override is active. |
| `Cursor.getShape()` | Current virtual-cursor shape (`'arrow'`, `'hand'`, `'text'`, `'wait'`, `'cross'`, `'move'`, `'ban'`, `'none'`). |
| `Cursor.setTheme(id)` | Apply a cursor color theme for both mice (keeps arrow/hand/I-beam per context). Ids: `'default'`, `'midnight'`, `'ocean'`, `'forest'`, `'sunset'`, `'royal'`, `'crimson'`, `'pink'`, `'gold'`. Returns `true` on success. Persist with `SystemConfig.set('cursorTheme', id)`. |
| `Cursor.getTheme()` | Current theme id. |
| `Cursor.setSize(id)` | Apply a cursor size for both mice (`'normal'`, `'large'`, `'extra-large'`). Returns `true` on success. Persist with `SystemConfig.set('cursorSize', id)`. |
| `Cursor.getSize()` | Current size id. |
| `Cursor.getThemes()` | Array of `{ id, name, desc, fill, stroke, accent }` for building theme pickers. |
| `Cursor.getSizes()` | Array of `{ id, name, scale, px }`. |

**Example:**
```js
Cursor.set('wait');      // hourglass/spinner on both mice during a long task
doHeavyWork().finally(() => Cursor.reset());

Cursor.set('pointer');   // pointing hand everywhere (e.g. drag-and-drop mode)
Cursor.set('none');      // hide both cursors (e.g. kiosk / presentation mode)
```

---

## 19. Complete Example: Reddit-Style App

```js
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import UIIcons from '../../modules/uiIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import ContextMenu from '../../modules/contextMenu.js';
import Users from '../../modules/users.js';

const MyReddit = (() => {
    const icon = AppIcons.get('myReddit');
    // Lazy on purpose: the current user isn't resolved at module-eval time.
    const DATA_PATH = () => Users.appData('myReddit');

    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_PATH())) {
            FileSystem.createFolder(Users.home(['AppData']), 'myReddit');
        }
    }

    function loadPosts() {
        ensureDataDir();
        const raw = FileSystem.readFile([...DATA_PATH(), 'posts.json']);
        return raw ? JSON.parse(raw) : [
            { id: 1, title: 'Welcome to MyReddit', author: 'admin', votes: 42, comments: [] }
        ];
    }

    function savePosts(posts) {
        ensureDataDir();
        const json = JSON.stringify(posts);
        const path = [...DATA_PATH(), 'posts.json'];
        if (FileSystem.itemExists(path)) {
            FileSystem.writeFile(path, json);
        } else {
            FileSystem.createFile(DATA_PATH(), 'posts.json', json, 'json');
        }
    }

    function renderFeed(win) {
        const posts = loadPosts();
        const feed = win.element.querySelector('#feed');
        feed.innerHTML = posts.map(p => `
            <div class="post" data-id="${p.id}" style="padding:12px;border-bottom:1px solid #333;cursor:pointer;">
                <div style="display:flex;gap:8px;align-items:center;">
                    <span style="color:#ff4500;font-size:20px;">&#9650;</span>
                    <span>${p.votes}</span>
                    <span style="color:#ff4500;font-size:20px;">&#9660;</span>
                </div>
                <div style="margin-left:36px;">
                    <div style="font-weight:bold;">${p.title}</div>
                    <div style="color:#888;font-size:12px;">posted by ${p.author}</div>
                </div>
            </div>
        `).join('');

        feed.querySelectorAll('.post').forEach(el => {
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const id = parseInt(el.dataset.id);
                ContextMenu.show(e.clientX, e.clientY, [
                    { label: 'Upvote', icon: UIIcons.action('arrowUp'), action: () => { /* ... */ } },
                    { label: 'Downvote', icon: UIIcons.action('arrowDown'), action: () => { /* ... */ } },
                    'separator',
                    { label: 'Delete', icon: UIIcons.action('delete'), action: () => { /* ... */ } }
                ]);
            });
        });
    }

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;background:#1a1a1b;color:white;">
                <div style="padding:12px 16px;background:#222;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;">MyReddit</h3>
                    <button class="new-post-btn" style="padding:6px 16px;background:#ff4500;color:white;border:none;border-radius:20px;cursor:pointer;">+ New Post</button>
                </div>
                <div id="feed" style="flex:1;overflow:auto;"></div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('myReddit', 'MyReddit', icon, getContent(), {
            width: 800, height: 600
        });

        renderFeed(win);

        win.element.querySelector('.new-post-btn').addEventListener('click', () => {
            Popup.textbox('New Post', 'Title:').then(title => {
                if (title) {
                    const posts = loadPosts();
                    posts.unshift({
                        id: Date.now(),
                        title,
                        author: SystemConfig.get('userName') || 'User',
                        votes: 1,
                        comments: []
                    });
                    savePosts(posts);
                    renderFeed(win);
                }
            });
        });
    }

    return { launch };
})();

export default MyReddit;
```

---

## 20. Gotchas & Rules

1. **Never use native `alert()`, `confirm()`, `prompt()`** — use Popup API
2. **Never use `localStorage` directly** — use FileSystem for persistence
3. **Store per-user app data under the current user's `AppData/<appId>/`** (via `Users.appData` or the SDK's `app.files`); opt into the shared `/system/programs data/<appId>/` only when data is genuinely machine-wide
4. **All imports use ES modules** (`import`/`export`)
5. **Icons must be inline SVGs** — no external files or emojis. App tiles use `AppIcons` (§14); all other UI chrome uses ShellIcons `UIIcons` (§15)
6. **The module must return `{ launch }`** — this is the contract
7. **Use `win.element` to query within your window** — not `document.querySelector`
8. **Clean up intervals/listeners when your window closes** — listen for close button or check `win.element.isConnected`
9. **All CSS is scoped to the dark theme** — use light text on dark backgrounds
10. **Window body fills available space** — use `height:100%` and flexbox for layouts

---

## 21. Notifications API

**Import:** `import Notifications from '../../modules/notifications.js';`

Non-modal Windows 11-style toasts + Action Center panel. All methods return the notification id immediately; results arrive via callbacks (unlike Popup, nothing blocks).

### `Notifications.info(title, message, opts?)` → `string` (id)
Plain notification.

### `Notifications.action(title, message, opts?)` → `string` (id)
Notification with buttons. `opts.actions` is `[{ label, value?, primary? }]` (defaults to a single OK). `opts.onAction(value, id)` fires on press.

### `Notifications.forum(title, message, opts?)` → `string` (id)
Notification with input fields plus Submit/Cancel. `opts.fields` uses the Popup.forum schema (`{ key, label, type?, value?, placeholder?, options? }`, types: text/number/password/textarea/select/checkbox). `opts.onSubmit(data, id)` fires with `{ key: value }`.

### Common `opts` (all three types)
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appId` | `string` | `'system'` | Sender id (name/icon resolved automatically) |
| `sticky` | `boolean` | `false` | Keep on screen until manually dismissed |
| `critical` | `boolean` | `false` | Pinned to panel top, bypasses Focus assist |
| `silent` | `boolean` | `false` | Panel only — no toast, no sound |
| `tag` | `string` | — | Replaces your previous notification with the same tag |
| `timeout` | `number` | `6000` | Auto-dismiss ms (`0` with `sticky`, `15000` for critical) |
| `onDismiss` | `(reason, id?) => void` | — | Reasons: `'action'`, `'submit'`, `'dismiss'` (X), `'timeout'` (ignored), `'clear'`, `'replace'` |

### Management
`Notifications.dismiss(id)`, `Notifications.clearAll()`, `Notifications.getAll()`, `Notifications.open()/close()/toggle()`, `Notifications.setDoNotDisturb(bool)` (Focus assist — toasts suppressed except critical).

**Example:**
```js
// Progress-style update via tag (one notification, keeps updating)
const id = Notifications.info('Copying', 'Starting…', { tag: 'copy', appId: 'fileExplorer' });
// ...later:
Notifications.dismiss(id);
Notifications.info('Copying', 'Done!', { tag: 'copy', appId: 'fileExplorer' });

// Action with per-outcome handling
Notifications.action('Restart needed', 'Apply the update now?', {
    appId: 'settings',
    actions: [
        { label: 'Restart', value: 'yes', primary: true },
        { label: 'Later', value: 'no' }
    ],
    onAction: (v) => { if (v === 'yes') location.reload(); },
    onDismiss: (reason) => { if (reason === 'timeout') console.log('ignored'); }
});
```

Respects Settings > Notifications (master toggle + per-app toggles) automatically.

---

## 22. Background Apps & Services

Apps can run **headless** (no window) via the BackgroundApps module. Two flavors, declared in `manifest.json`:

```json
{
    "id": "myApp",
    "background": true,
    "service": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `background` | `boolean` | `false` | App may run headless via the BackgroundApps API |
| `service` | `boolean` | `false` | Background-**only**: hidden from Start, Search and taskbar (no launch, no pin); install/uninstall via Store or Settings; implies `background` |

**Import:** `import BackgroundApps from '../../modules/backgroundApps.js';`

| Method | Description |
|--------|-------------|
| `requestBackground(appId)` → `Promise<boolean>` | Close the app's windows (through close handlers — a veto aborts) and run headless. `false` when the manifest doesn't declare it. |
| `bringToForeground(appId, opts?)` → `boolean` | Stop headless mode and open a window. Always `false` for services. |
| `startService(appId)` → `Promise<boolean>` | Start headless without ever opening a window. `false` when windows are open. |
| `stopService(appId)` → `Promise<boolean>` | Stop headless execution. |
| `isBackground(appId)` → `boolean` | Currently headless? |
| `getBackgroundApps()` → `string[]` | All headless app ids. |
| `canRunBackground(appId)` / `isService(appId)` | Manifest capability checks. |
| `isAutostartEnabled(appId)` → `boolean` | Boot-start allowed (Task Manager > Startup toggle state)? |
| `setAutostartEnabled(appId, enabled)` → `Promise<boolean>` | Disabling stops a running headless app at once and excludes it from boot; enabling starts it now when possible. |
| `getStartupEntries()` → `Array<{id, name, service, running, enabled}>` | Every background-capable installed/builtin app for Startup UIs. |

**App lifecycle hooks** (export any of these from `main.js`, sync or async):

```js
return {
    launch,
    onBackground,  // entered headless mode: start timers/listeners, open NO windows
    onForeground,  // about to return to a window
    onShutdown     // headless execution stopping: clear timers/listeners
};
```

**Rules:**
- Headless state persists: backgrounded apps resume at boot, and builtin services always auto-start. Listen for `window` event `background-apps-changed` (`{ detail: { running: [...] } }`) to track it.
- `onBackground` must never create windows or dialogs — there is no visible context.
- End users stop headless apps from Task Manager (listed as `<Name> (Background)`); services are uninstalled from Settings > Apps or the Store library.

---

## 22.5 System Tray (app icons)

Apps that can run in the background can put an icon in the taskbar notification area (next to the Wi-Fi indicator). The icon outlives the app's window, so a headless app stays reachable: click handlers, a right-click menu, a tooltip, and a live icon + badge.

**Requirement:** the app must be background-capable — `"background": true` (or the `"background"` permission, or `"service": true`) in `manifest.json`. Otherwise an icon could not outlive the window it belongs to, and the SDK throws `PERMISSION_DENIED`.

**Import (SDK):**

```js
import { createApp } from '../../sdk/index.js';
// inside launch() and/or onBackground():
const app = createApp({ id: 'myApp', name: 'My App' });

const icon = app.tray.register({
    id: 'status',                              // unique per app; default 'default'
    icon: '<svg viewBox="0 0 24 24">…</svg>',  // inline SVG, a URL, or a descriptor
    tooltip: 'My App — idle',
    badge: 3,                                  // small count/dot overlay (null clears)
    onClick: () => app.background.bringToForeground(),
    menu: [
        { label: 'Open', action: () => app.background.bringToForeground() },
        'separator',
        { label: 'Hide icon', action: () => app.tray.remove('status') }
    ]
});

// Live updates (all chainable):
icon.setIcon(nextSvg).setTooltip('Working…').setBadge(0);
icon.remove();
```

**Icon forms:** inline SVG markup (`'<svg…>'`), an image URL (build app-relative URLs with `new URL('assets/tray.svg', import.meta.url)`), or a descriptor `{ svg }`, `{ app: 'notepad' }`, `{ action: 'refresh' }`, `{ setting: 'power' }`, `{ url, size }`. Leave it out to use the app's own package icon. Unlike the shell system icons, app tray icons are **not** recolored — your authored colors are kept.

**`register(spec)` returns a handle:**

| Handle method | Description |
|---|---|
| `setIcon(icon)` / `setTooltip(text)` / `setBadge(value)` / `setVisible(bool)` | Live-update one property (chainable). |
| `setMenu(items)` | Replace the right-click menu (same item shape as `Shell.contextMenu`). |
| `onClick(fn)` / `onDoubleClick(fn)` / `onContextMenu(fn)` | Replace handlers: `fn({ appId, id })` (context menu: `{ appId, id, x, y }`). |
| `update(patch)` | Apply several fields at once: `{ icon, tooltip, badge, visible, menu, onClick, … }`. |
| `remove()` | Remove this icon. |

**Namespace (`app.tray` / SDK `Tray`):**

| Method | Description |
|---|---|
| `canUse(appId)` → `boolean` | Background-capability check. |
| `register(spec)` / `registerMany(specs)` | Add one / many icons (idempotent per `spec.id`). |
| `update(iconId, patch)` | Update an icon by id (throws `NOT_FOUND`). |
| `remove(iconId)` / `removeAll()` | Remove one / every icon of the app. |
| `get(iconId)` / `list()` | Inspect registered handles. |

**Behaviour & lifecycle:**
- **Default left click** (no `onClick`): opens/focuses the app if it is launchable. Right-click shows the `menu` you supply, or calls `onContextMenu` for a custom surface; with neither it does nothing.
- Icons are **per session**: only the foreground profile's icons are shown (see concurrent sessions).
- Icons are removed automatically when the app is uninstalled, its session signs out, or a headless app is stopped (`BackgroundApps`) — but a well-behaved app clears its own icons in `onShutdown()`.
- Register icons from `launch()` and/or `onBackground()`. `register` is idempotent per `id`, so re-registering on a session switch just refreshes the icon.

---

## 23. Keyboard Shortcuts

**Import:** `import Keyboard from '../../modules/keyboard.js';`

Never wire your own `document.addEventListener('keydown', ...)` for shortcuts — declare them through the central registry so focus guards, exact-modifier matching, and conflicts are handled once, OS-wide.

### `Keyboard.register(combo, callback, opts?)` → `unregisterFn` (with `.id`)

| Param | Example | Description |
|-------|---------|-------------|
| `combo` | `'CTRL+S'`, `'CTRL+SHIFT+V'`, `'WIN+V'`, `'ALT+F4'`, `'ESCAPE'` | `MOD+...+KEY`. Modifiers: `CTRL`, `SHIFT`, `ALT`, `WIN` (aliases: `CONTROL`, `META`, `SUPER`, `CMD`, `COMMAND`). Keys match `event.key` case-insensitively; aliases: `ESC`, `DEL`, `INS`, `PGUP`, `PGDN`, `UP/DOWN/LEFT/RIGHT`, `SPACE`, `RETURN`, `PRTSC`. `F1`–`F12` work verbatim. |
| `callback` | `(e) => {...}` | Runs on keydown. **Return `false` to pass through** to the next matching handler (layered Escape-to-close); anything else consumes the combo. |

**Opts (all optional):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `HTMLElement` | global | Fire only when the event target is inside this element (pass your `win.element`). Detached elements auto-unregister — no manual cleanup on close. |
| `owner` | `string` | — | Tag (usually your appId) for `unregisterAll(owner)` bulk cleanup. |
| `allowInInputs` | `boolean` | `true` | Set `false` to ignore the combo while typing in inputs/textareas/contenteditables. |
| `preventDefault` | `boolean` | `true` | Call `preventDefault()` when consumed. |
| `stopPropagation` | `boolean` | `false` | Also stop propagation when consumed. |
| `system` | `boolean` | `false` | System handlers dispatch before app handlers. Leave `false` in apps. |
| `description` | `string` | — | Human label (future Settings > Shortcuts page). |

Modifier matching is **exact**: `'CTRL+S'` does not fire on Ctrl+Shift+S. System shortcuts (`WIN+V`, `ALT+F4`, `PRINTSCREEN`, layered `ESCAPE` for menu/panel/flyout) always win over app shortcuts.

### `Keyboard.unregister(idOrFn)` → `boolean` / `Keyboard.unregisterAll(owner)` → `number` / `Keyboard.list()` → `[{ combo, system, owner, description, scoped }]`

**Example (scoped to one window, self-cleaning on close):**
```js
import Keyboard from '../../modules/keyboard.js';

function launch() {
    const win = WindowManager.createWindow('myApp', 'My App', icon, getContent());
    const kb = { scope: win.element, owner: 'myApp' };
    Keyboard.register('CTRL+S', () => save(), { ...kb, description: 'Save' });
    Keyboard.register('CTRL+F', () => openFind(), { ...kb, description: 'Find' });
    // No removeEventListener needed — entries die with win.element.
}
```

**Which shortcuts already exist (don't re-register these):** `PRINTSCREEN` (screenshot), `WIN+V` / `CTRL+SHIFT+V` (clipboard history), `ALT+F4` (close focused window), layered `ESCAPE` (context menu → notification center → clipboard flyout).

---

## 24. Permissions API

**Import:** `import Permissions from '../../modules/permissions.js';`

| Method | Description |
|--------|-------------|
| `Permissions.getCatalog()` | `{ id: { label, description } }` for all five permissions. |
| `Permissions.iconFor(perm)` | 16px SVG string for Store/Settings rows. |
| `Permissions.getDeclared(appId)` | Manifest-declared permissions (unknown names filtered). |
| `Permissions.isGranted(appId, perm)` | Grant check: builtins and undeclared capabilities always `true`; declared ones are `true` unless the user revoked them. Use before sensitive calls. |
| `Permissions.setGranted(appId, perm, bool)` | Revoke/restore (Settings > Apps uses this). |
| `Permissions.requestInstallConsent(appId)` → `Promise<boolean>` | Consent dialog listing declared permissions; resolves `false` when declined. No prompt when nothing is declared. |
| `Permissions.clearGrants(appId)` | Wipe stored choices (uninstall does this automatically). |

---

## 25. Crash Recovery

You don't need to do anything — and that's the point. Uncaught exceptions (or a `launch()` that throws) in `js/apps/<yourId>/` are attributed to your app automatically: Task Manager shows it as **Not responding** and the user gets a *"<App> stopped responding"* dialog with **Restart** (force-closes your windows and calls `launch()` again), **Close**, and **View details** (message + stack).

Rules of the road:

- Throwing inside `launch()` no longer dies silently — it opens the recovery dialog. Validate early and throw with a clear message rather than half-opening a broken window.
- The dialog's Restart bypasses your `WindowManager` close handler (a wedged app can't veto its own restart). Keep close handlers quick and total.
- `CrashMonitor.isCrashed(appId)` / `getCrash(appId)` let you probe health; `restartApp(appId)` / `closeApp(appId)` are the dialog's actions, exposed for Task Manager-style UIs.
- One dialog per app per 5s (bursts don't stack). System code (`js/modules/`, inline page scripts) is never attributed to an app.

---

## 26. Windows 12 SDK

**Why it exists.** Apps used to import OS internals directly (`../../modules/windowManager.js`, ...), coupling every app to file paths that may move. The SDK (`js/sdk/`) is the stable public contract: one entry point, validated arguments, coherent errors, and a bound per-app context. Internals keep evolving underneath; SDK apps keep working.

**Status: stable/public** (contract v1.5.0, `SDK_VERSION`). Experimental: nothing in v1 -- every namespace below is stable. Internal: everything under `js/modules/` remains internal; use it only when the SDK genuinely lacks something, and expect it to move.

### Import (primary style: one bound context)

```js
import { createApp } from '../../sdk/index.js';

const app = createApp({ id: 'myApp', name: 'My App' });

function launch() {
    const win = app.window.create({ title: 'My App', content: '<div id="app"></div>' });
    win.element.querySelector('#app').textContent = 'Hello Windows 12!';
    app.notify.info('Example', 'Application started successfully.');
}

export default { launch };
```

Flat namespaces stay available for advanced use:

```js
import { WindowManager, FileSystem, Notifications, Dialogs } from '../../sdk/index.js';
// or: import Windows12 from '../../sdk/index.js'; const { Dialogs } = Windows12;
```

**Rule:** call `createApp()` inside `launch()`, never at module scope -- the registry/app import cycle leaves SDK bindings uninitialized during evaluation (same reason `AppLoader` is launch-only). Leaf imports (`AppIcons` for your tile icon) are safe at top level.

### Architecture

Each `js/sdk/*.js` file is a thin facade over one internal module -- no logic is duplicated, so behavior, settings and permissions are identical to the OS. `js/sdk/types.d.ts` mirrors the surface for editors (reference only, no runtime, no TypeScript toolchain).

### Quick reference

| Namespace | What | Key methods |
|-----------|------|-------------|
| `app.window` / `WindowManager` | windows | `create({appId,title,icon,content,width,height,resizable})`, `get/focus/isFocused/getFocused/minimize/restore/isMinimized/maximize/unmaximize/isMaximized/toggleMaximize`, `getBounds/setBounds/getPosition/setPosition/getSize/setSize/center/getDesktopArea`, `isResizable/setResizable/setMinSize`, `isDragging/isResizing/onDragState/onResizeState/onBoundsChanged`, `onClosed/onMinimizeState/onFocusChanged` (lifecycle subscriptions), `setFullscreen/exitFullscreen/isFullscreen`, `setTitle/close/requestClose/closeAll/getByApp/getAllWindows`, `Lifecycle.onClose` vetoes |
| `app.files` / `app.globalFiles` / `FileSystem` | virtual FS | `app.files`: per-user sandbox `/users/<id>/AppData/<id>/`; `app.globalFiles`: shared `/system/programs data/<id>/`; both expose scoped `read/write/exists/list/mkdir/remove/rename` + `settings.get/set/all`. Raw `FileSystem`: `readFile/writeFile/createFile/createFolder/delete (remove recycles)/destroy/rename/move/exists/isFolder/list/blobs/pickSave`, permission-gated outside the app's own data |

| `app.notify` / `Notifications` | toasts + panel | `info/action/form`, `dismiss/clearAll/getAll/open/close/toggle`, Focus Assist; sends are permission-gated automatically |
| `app.dialogs` / `Dialogs` | modal dialogs | `alert/confirm/text/select/form` (all Promises; never native `alert()`) |
| `app.keyboard` / `Keyboard` | shortcuts | `register('CTRL+SHIFT+P', cb, {scope, owner(auto), allowInInputs, description})`, `unregister/unregisterAll/list/isDown`; exact-modifier matching; return `false` to pass through; reserved: PRINTSCREEN, WIN+V, ALT+F4, layered ESCAPE |
| `app.pointerLock` / `PointerLock` | mouse capture | `request(element, appId?)` (user gesture; parks the virtual touchpad cursor while locked, restores on unlock), `exit`, `isLocked(element?)`, `onChange({element,locked,error?})` — pause when the lock is lost (Esc); re-locking too fast after Esc rejects with `PERMISSION_DENIED` |
| `app.input` / `Input` | game key state | `keyState(element, {prevent})` → `{ isDown(code), clear, onKeyDown, onKeyUp, dispose }` — scoped raw key tracking for games (give the element `tabindex="0"`), auto-clears on blur and self-disposes when the element is removed from the DOM |
| `app.audio` / `Audio` | sound | shared lazy `AudioContext`: `context/masterGain/masterVolume/unlock/suspend/state`, `beep({freq,endFreq,duration,type,volume,delay})` — everything routes through the OS master volume; the tab auto-suspends when hidden |
| `app.clipboard` / `Clipboard` | clipboard | `writeText/readText` (reject cleanly without browser permission), `sync/show/hide/toggle/getHistory/clearHistory` |
| `app.media` / `Media` | mic + camera | `microphone()/camera()` (OS grant checked first: revoked → `PERMISSION_DENIED` before any browser prompt; missing device → `UNSUPPORTED`), `supported()`; declare `microphone`/`camera` in manifest.json |
| `Apps` | app management | `get/getMetadata/getAll/isInstalled/launch`, `install` (permission consent), `uninstall` (always confirms), `getPermissions/hasPermission` |
| `Settings` | user settings | `get/getAll/set` (privileged display keys throw `PERMISSION_DENIED`), `open/openPage('personalization')` |
| `app.shell` / `Shell` | chrome | `icons.app/action/file/folder/sidebar/setting`, `contextMenu(x,y,items)`, `files.open/openWith/openWithApp`, `activity.trackFileOpen/trackAppOpen/recommended` |
| `FileAssociations` | file types | `register/unregister/getCandidates/getAllCapable/getDefault/setDefault/clearDefault` (manifest `"associations"` still preferred) |
| `System` | OS facts | `info()/theme()/setTheme()/accent()/setAccent()` (appearance writes are user-action only) |
| `Events` | shared bus | `on/off/names` for `app-installed/uninstalled`, `background-apps-changed`, `app-crashed`, `virtual-desktop-changed`, `window-closed`, `window-minimized`, `window-restored`, `window-focus-changed` (window-created and settings/theme stay single-slot internals -- intentionally absent) |
| `app.permissions` / `Permissions` | capabilities | `has/require(throws)/getDeclared/catalog/iconFor/request` (grants stay user-owned); known ids: `filesystem`, `notifications`, `network`, `clipboard`, `background`, `microphone`, `camera` |
| `app.lifecycle` / `Lifecycle` | close veto | `onClose/offClose` (per app), `onWindowClose/offWindowClose` (per window — runs before the app handler, any `false` vetoes just that window); background hooks (`onBackground/onForeground/onShutdown` exports) are manifest-declared |
| `app.background` / `Background` | headless | `canRun/isService/isBackground/running/goBackground/bringToForeground/startService/stopService` |
| `app.tray` / `Tray` | system tray | `register(spec)` → handle (`setIcon/setTooltip/setBadge/setVisible/setMenu/onClick/onDoubleClick/onContextMenu/update/remove`), `registerMany/update/remove/removeAll/get/list/canUse` — app icons in the notification area (click/right-click/badge, live icon), requires background capability (§22.5) |
| `app.net` / `Net` | peer messaging | `createChannel({name, transport})` → `{ send/sendTo/close, on('message/peer-open/peer-close') }`; transports `local` (BroadcastChannel `w12-net/<name>`) + `webrtc` (manual invite/answer codes, STUN-only); `discover(name)` presence pings; 6-char rendezvous pairing `createShortInvite` → `{ code, waitForController }` / `acceptShortInvite` → `{ connected }` (needs internet for the relay; full codes stay the offline fallback) |
| `app.inject` / `Inject` | synthetic input | `key({type, code, key})` (dispatches to focused element/document), `pointer(element, {x,y,type,button})` |
| `app.scripts` / `Scripts` | script engines | `runBatch/runVBScript/runPowerShell(source, {cwd,args,onOutput,noProfile,allowNetwork})` → `{output,errors,exitCode,cwd}`; `runFile(path, opts)` dispatches `.bat/.cmd/.vbs/.vbe/.ps1/.psm1` (PS policy enforced); `detectLanguage/supportedExtensions`. Bound `app.scripts` tags job toasts to your app and follows your `network` permission; scripts run with your app's filesystem access |

```js
// Run a user script file with the engine matching its extension
// (.bat/.cmd/.vbs/.vbe/.ps1/.psm1); output streams live via onOutput:
const res = app.scripts.runFile(['/', 'users', 'default', 'Documents', 'setup.ps1'], {
    args: ['/quiet'],
    onOutput: (line) => log(line),
    noProfile: true
});
if (res.errors.length) showErrors(res.errors);
```

### Errors

One type: `SDKError` with `code` (`INVALID_ARGS`, `NOT_FOUND`, `NOT_INSTALLED`, `PERMISSION_DENIED`, `UNSUPPORTED`) -- catch by code, never by message text:

```js
import { Apps, SDKError } from '../../sdk/index.js';
try {
    await Apps.uninstall(id);
} catch (e) {
    if (e instanceof SDKError && e.code === 'NOT_FOUND') { /* -- */ }
    throw e;
}
```

### Security model (read carefully)

The SDK is a **stability facade, not a sandbox** -- apps share one JS context, so a hostile app importing internals directly has the same power as the SDK gives it. What the SDK does instead is make the safe path the easy path:

- `createApp().files` is scoped to the current user's `/users/<id>/AppData/<id>/` and `app.globalFiles` to the shared `/system/programs data/<id>/` (traversal rejected); raw `FileSystem` paths stay available but are explicit and now permission-gated by `fsGuard.js` — anything outside the app's own data folders requires the `filesystem` permission or a runtime consent dialog.
- `Apps.install` forces permission consent — `{ scope: 'system' }` (install for all users, into `/Program Files`) additionally needs administrator approval — and `Apps.uninstall` forces a user confirm, wipes grants, and asks for administrator approval when removing a system-wide install.
- **Account types + UAC** (`js/modules/users.js`, `js/modules/uac.js`): every account is an `administrator` or a `standard` user, and at least one administrator always exists (the last one can't be demoted or deleted). Privileged actions — installing/uninstalling store apps system-wide, account management, and app writes inside `/Program Files` — raise a **UAC** prompt: a Yes/No consent for administrators, or a credential prompt (choose an administrator, type its password) for standard users. Elevation is per-action, never persistent.
- `Settings.set` refuses privileged display keys; notification sends respect revocations; `Permissions.require` fails loud instead of bypassing.
- Deliberately ungated (same as direct imports, documented): closing other apps' windows, reading other apps' files, starting/stopping background execution. A real cross-app sandbox would need process isolation -- out of scope for this architecture.

### Migration (new vs existing apps)

- **New apps:** scaffold from `js/apps/sampleApp/` (already SDK-only), declare `permissions` honestly, run `node build-registry.js`.
- **Existing apps:** do nothing -- `../../modules/*` imports keep working. Migrate opportunistically: replace one import block at a time (`WindowManager` -> `app.window` usually needs only the `appId` prefilled), then delete the manual guards the SDK now owns (focus checks, path building, toast attribution).

### Versioning

`SDK_VERSION` (`'1.5.0'`) is independent of the OS version. Within major 1, namespaces only gain methods; renames/removals wait for a major bump and a migration note here. v1.1.0 added: window geometry/state (`getBounds/setBounds`, `isMaximized/maximize/unmaximize`, `isResizable/setResizable`, `isDragging/isResizing` + `onDragState/onResizeState/onBoundsChanged`, `setTitle/setMinSize/center/getDesktopArea/getFocused`), the `microphone` + `camera` permissions, and the `Media` namespace (`app.media`). v1.2.0 added: game/real-time support — `PointerLock` (`app.pointerLock`), `Input.keyState` (`app.input`), `Audio` (`app.audio`), window lifecycle subscriptions (`WindowManager.onClosed/onMinimizeState/onFocusChanged` + matching `Events` names), true fullscreen (`setFullscreen/exitFullscreen/isFullscreen`), and per-window close hooks (`Lifecycle.onWindowClose`). v1.3.0 added: peer messaging — `Net` (`app.net`, `local` + manual-signaling `webrtc` transports, `discover`) and synthetic input — `Inject` (`app.inject`, `key` + `pointer`); `Apps.install(id, { scope })` gained the optional `scope` ('user' | 'system') argument. v1.4.0 added: script engines — `Scripts` (`app.scripts`, `runBatch/runVBScript/runPowerShell/runFile`, `.bat/.cmd/.vbs/.vbe/.ps1/.psm1`). v1.5.0 added: the system tray — `Tray` (`app.tray`): background-capable apps can register notification-area icons with click/double-click/right-click handlers, a context menu, a tooltip and a live icon + badge (§22.5).

### Test coverage

`node test/sdk.smoke.mjs` (zero dependencies) stubs the browser surface and imports the real SDK, filesystem, catalog and lazy loader, asserting 151 checks: surface, error codes, shortcut dispatch/passthrough/unregister, events (incl. window lifecycle), filesystem roundtrip + recycle, sandbox scoping + traversal rejection, catalogs (incl. microphone/camera grants and package icons / lazy-entry flags), accounts + UAC (default administrator, standard-by-default new accounts, last-administrator demote/delete guardrails, UAC API), clipboard denial honesty, headless window create/close, window geometry + state (bounds, resizable lock, maximize, minimize, drag/resize subscriptions, lifecycle subscriptions, per-window close veto, fullscreen refusal mapping), pointer lock validation, Input keyState tracking/clearing, Audio lazy context + master volume + beep, media denial honesty, tray icon registration/capability/updates/handles, virtual-keyboard init/gating/layouts/auto-show. DOM-painted paths (toast animation, live permission prompts, the UAC dialog itself) are exercised in-OS via the sample app. Package *installation* (network download → vFS) runs in the browser, not in this headless suite.

---

## 27. Touch keyboard (on-screen keyboard)

`js/modules/virtualKeyboard.js` + `css/virtualKeyboard.css` implement the OS on-screen keyboard that replaces the native iOS/Android keyboard inside Windows 12. It is **not** an app — it is shell chrome, like the taskbar.

**User-facing behavior:**

- Settings > System > Touch keyboard: master enable (*"Use touch keyboard instead of the native OS keyboard"*), *"Show automatically when a text field is focused"*, and *"Taskbar button"* (tray icon summons it at any time). Auto-on for touch devices, off for desktops (both can change it).
- When enabled, focusing an `input`/`textarea`/`contenteditable` suppresses the native keyboard (`readonly` + `inputmode="none"`, restored on blur) and docks the OSK above the taskbar. Disabling restores native behavior everywhere.
- Layouts: `abc` (QWERTY, one-shot Shift, double-tap Caps Lock), `123` (numbers, arrows), `#+=` (symbols, Esc). Backspace/Space/arrows/letters repeat on hold. The `⌄` key, the tray button, or focus loss dismisses it.
- Draggable by the top bar, resizable by the corner grip (geometry persists in `touchKeyboardBounds`; double-click the bar to re-dock).

**What app authors need to know:**

- Key presses are honest input, not DOM hacks: pointer-down dispatches `keydown` (+ one edit), pointer-up dispatches a single `keyup` — a held letter looks exactly like a held physical key, so games see sustained movement. With no text field attached, events fall back to the focused element / body, so the keyboard drives games too. If your `keydown` handler calls `preventDefault()`, the insertion is vetoed.
- `Enter` in a single-line field inside a `<form>` submits the form (unless the keydown was vetoed); in a `textarea` it inserts a newline.
- `window` event `touch-keyboard-visibility` (`{ detail: { open } }`) fires on show/hide — use it to shrink scroll regions above the keyboard.
- Programmatic control (console, system UI): `window._modules.VirtualKeyboard.show()/hide()/toggle()/isOpen()`.

---

## 28. Games & real-time input

Everything a canvas/WebGL game needs lives in the SDK v1.2.0 namespaces — no raw `document` wiring required.

### Pointer lock (`app.pointerLock`)

```js
const app = createApp({ id: 'myGame' });

canvas.addEventListener('mousedown', () => app.pointerLock.request(canvas));   // user gesture
app.pointerLock.onChange(({ locked }) => {
    if (locked) resume();
    else pause();          // losing the lock (Esc) always means "user wants the pause screen"
});
```

- While locked, the OS parks the virtual touchpad cursor and restores it on unlock — no double-cursor.
- Browsers enforce a short re-lock cooldown after Esc. `request()` rejects with `PERMISSION_DENIED` (`details.name === 'SecurityError'`) if the user clicks too fast — show the pause screen and let them click again; never spin-retry.
- When `appId` is bound (via `app.pointerLock`), the element must live inside one of your windows — locking over foreign UI fails with `PERMISSION_DENIED`.

### Raw key state (`app.input`)

`Keyboard.register` is for shortcuts (combos, exact modifiers). Games want held keys:

```js
// root: your window body — give it tabindex="0" and root.focus() on click
const keys = app.input.keyState(root, { prevent: ['Space', 'ArrowUp'] });

// per frame:
if (keys.isDown('KeyW')) moveForward(dt);
keys.onKeyDown(({ code }) => { if (code.startsWith('Digit')) selectSlot(+code.slice(5) || 10 - 1); });

// on window close (or automatically when root leaves the DOM):
keys.dispose();
```

State clears on browser blur, so an unfocused window never leaves keys stuck. `prevent` lists `event.code` values to `preventDefault()` (Space/arrows scroll the page otherwise).

### Sound (`app.audio`)

```js
app.audio.unlock();                                   // from a user gesture (Play button)
app.audio.beep({ freq: 180, endFreq: 70, type: 'triangle', duration: 0.1 });   // dig!
```

Every sound routes through a master gain tracking the Settings master volume; the context auto-suspends when the tab is hidden. For richer graphs take `app.audio.context()` and connect into `app.audio.masterGain()`.

### Window lifecycle for games

```js
app.window.onMinimizeState((appId, id, minimized) => { if (minimized) pauseLoop(); });
app.window.onClosed((appId, id) => shutdownEngine());
app.window.setFullscreen(id);       // true browser fullscreen, user gesture required
```

`onClosed` fires after the window is gone — cancel your `requestAnimationFrame` loop there. Use `app.lifecycle.onClose` (vetoable) to save first.

### Touch

Detect touch hardware (`'ontouchstart' in window || navigator.maxTouchPoints > 0`) and offer on-screen controls: a virtual joystick for movement, drag-to-look, tap to act. Pointer events (`pointerdown/move/up`) cover mouse and touch uniformly.
