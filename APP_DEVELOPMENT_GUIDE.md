# Windows 12 — App Development Guide

This document contains everything you need to build a new app for the Windows 12 web OS simulation. Each app is a folder using the IIFE module pattern, described by a manifest, and wired into the OS by a generated registry — no manual registration in system files.

---

## Quick Start

1. Create `js/apps/<id>/` with `manifest.json` + `main.js` (copy `js/apps/sampleApp/`)
2. Run `node build-registry.js` to regenerate `js/apps/registry.js` (+ `sw.js` precache)
3. If `distribution` is `"store"`, it appears in the Microsoft Store automatically

That's it. The OS handles windows, taskbar, dragging, resizing, snapping, and persistence for you.

---

## 0. App Folder Layout

```
js/apps/myReddit/
  manifest.json   # id, uuid (v4, frozen), name, version, distribution, associations, store info
  main.js         # wired entry: `export default` an object with at least { launch }
  scripts/        # extra modules (optional, import via ./scripts/x.js)
  assets/         # static files (optional)
```

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
    "associations": [],
    "permissions": ["filesystem", "notifications"]
}
```

Known permissions: `filesystem` (virtual files), `notifications` (toasts + panel), `network` (fetch + remote embeds), `clipboard` (read copies), `background` (headless execution — equals the `"background": true` flag, so declare one or the other). `build-registry.js` rejects unknown names.

Store apps show their permissions on the Store page, install asks for consent, and users can revoke per app in Settings > Apps (a revoked `notifications` permission blocks that app's toasts). Builtins are first-party and always granted. Check at runtime with `Permissions.isGranted(appId, perm)` (see §24).

For a store app use `"distribution": "store"` and add `associations` (file extensions it opens, requires an exported `open(path, content)` function) plus a `store` block (`developer`, `category`, `rating`, `reviews`, `description`, `features[]`, `screenshots[]`, `size`, `ageRating`).

Generate the uuid once with `node -e "console.log(crypto.randomUUID())"` and never change it — installs are tracked by uuid.

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
            icon,                 // SVG icon string
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

### Step 1: Add icon to `js/modules/appIcons.js`

```js
const icons = {
    // ...existing entries...
    myReddit: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FF4500"/><circle cx="9" cy="11" r="1.5" fill="white"/><circle cx="15" cy="11" r="1.5" fill="white"/><path d="M8.5 14.5c0 0 1.5 2 3.5 2s3.5-2 3.5-2" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};
```

### Step 2: Regenerate the registry

```sh
node build-registry.js
```

This validates all manifests, rewrites `js/apps/registry.js` (module + metadata tables the loader reads at boot), and refreshes the `sw.js` precache. Commit the regenerated files.

Everything else is automatic: display name (manifest `name`), taskbar/start menu/search listings, store listing (from the manifest `store` block), install/uninstall by uuid, and file associations (manifest `associations` wired to your exported `open`).

> **Rule:** app modules must not call `AppLoader` / `AppRegistry` / `AppMetadata` at module scope (top-level). The registry ↔ app import cycle leaves those bindings uninitialized during evaluation — only call them inside functions like `launch()`.

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

All data is a virtual JSON tree stored in `localStorage`. Paths are **arrays of strings** starting with `/`.

**Path examples:**
- Root: `['/']`
- Folder: `['/', 'users', 'default', 'Documents']`
- File: `['/', 'users', 'default', 'Documents', 'notes.txt']`

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
const DATA_PATH = ['/', 'system', 'programs data', 'myReddit'];

function ensureDataDir() {
    if (!FileSystem.itemExists(DATA_PATH)) {
        FileSystem.createFolder(['/', 'system', 'programs data'], 'myReddit');
    }
}

function saveData(key, value) {
    ensureDataDir();
    const json = JSON.stringify(value);
    const filePath = [...DATA_PATH, `${key}.json`];
    if (FileSystem.itemExists(filePath)) {
        FileSystem.writeFile(filePath, json);
    } else {
        FileSystem.createFile(DATA_PATH, `${key}.json`, json, 'json');
    }
}

function loadData(key) {
    const raw = FileSystem.readFile([...DATA_PATH, `${key}.json`]);
    return raw ? JSON.parse(raw) : null;
}
```

**Rule:** All app data MUST go under `/system/programs data/<yourAppId>/`. Never write to other locations.

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
| `Sounds.info()` | Two ascending tones |
| `Sounds.warn()` | Two descending tones |
| `Sounds.error()` | Three descending tones |
| `Sounds.confirm()` | Two ascending tones |
| `Sounds.click()` | Short click |
| `Sounds.recycleBin()` | Trash sound |

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

const MyReddit = (() => {
    const icon = AppIcons.get('myReddit');
    const DATA_PATH = ['/', 'system', 'programs data', 'myReddit'];

    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_PATH)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], 'myReddit');
        }
    }

    function loadPosts() {
        ensureDataDir();
        const raw = FileSystem.readFile([...DATA_PATH, 'posts.json']);
        return raw ? JSON.parse(raw) : [
            { id: 1, title: 'Welcome to MyReddit', author: 'admin', votes: 42, comments: [] }
        ];
    }

    function savePosts(posts) {
        ensureDataDir();
        const json = JSON.stringify(posts);
        const path = [...DATA_PATH, 'posts.json'];
        if (FileSystem.itemExists(path)) {
            FileSystem.writeFile(path, json);
        } else {
            FileSystem.createFile(DATA_PATH, 'posts.json', json, 'json');
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
3. **Store app data under `/system/programs data/<appId>/`**
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
