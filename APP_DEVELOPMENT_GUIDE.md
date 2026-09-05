# Windows 12 — App Development Guide

This document contains everything you need to build a new app for the Windows 12 web OS simulation. Your app will be a single JS file using the IIFE module pattern, importing OS APIs for windows, filesystem, dialogs, and integration with the taskbar/start menu.

---

## Quick Start

1. Create `js/apps/yourApp.js`
2. Add metadata + icon to the OS
3. Register in `main.js`
4. Add to the start menu

That's it. The OS handles windows, taskbar, dragging, resizing, snapping, and persistence for you.

---

## 1. App File Template

Every app is a self-contained IIFE that exports `{ launch }`. Create a file at `js/apps/<appId>.js`:

```js
import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';
import Popup from '../modules/popup.js';
import FileSystem from '../modules/fileSystem.js';

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

After creating your app file, you need to wire it into the OS. There are 4-5 steps:

### Step 1: Add icon to `js/modules/appIcons.js`

```js
const icons = {
    // ...existing entries...
    myReddit: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FF4500"/><circle cx="9" cy="11" r="1.5" fill="white"/><circle cx="15" cy="11" r="1.5" fill="white"/><path d="M8.5 14.5c0 0 1.5 2 3.5 2s3.5-2 3.5-2" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};
```

### Step 2: Add name to AppMetadata in `js/modules/taskbar.js`

```js
const names = {
    // ...existing entries...
    myReddit: 'MyReddit',
};
```

### Step 3: Register in `js/main.js`

```js
import MyReddit from './apps/myReddit.js';

// In the registration block:
AppRegistry.register('myReddit', MyReddit);
```

### Step 4: Add to start menu in `js/modules/startMenu.js`

Add to the `allApps` array (keep alphabetically sorted by name):
```js
const allApps = [
    // ...existing entries...
    { id: 'myReddit', name: 'MyReddit' },
];
```

### Step 5 (optional): Make it installable

If your app should appear in the App Store as installable, add it to `js/modules/appSystem.js`:
```js
import MyReddit from '../apps/myReddit.js';
const appModules = {
    // ...existing entries...
    myReddit: MyReddit,
};
```

And add a listing in `js/apps/appStore.js`'s `getDiscoverApps()`.

---

## 3. Window Manager API

**Import:** `import WindowManager from '../modules/windowManager.js';`

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
Closes and removes a window.

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

**Import:** `import FileSystem from '../modules/fileSystem.js';`

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

**Import:** `import Popup from '../modules/popup.js';`

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

**Import:** `import ContextMenu from '../modules/contextMenu.js';`

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
    icon: string,        // emoji or icon (optional)
    shortcut: string,    // shortcut text (optional)
    action: () => void,  // click handler (optional)
    disabled: boolean    // grayed out (optional)
}
```

**Example:**
```js
el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ContextMenu.show(e.clientX, e.clientY, [
        { label: 'Open', icon: '📂', action: () => open() },
        { label: 'Copy', icon: '📋', shortcut: 'Ctrl+C', action: () => copy() },
        'separator',
        { label: 'Delete', icon: '🗑', action: () => del() }
    ]);
});
```

---

## 7. Taskbar Integration

**Import:** `import { Taskbar, AppRegistry, AppMetadata } from '../modules/taskbar.js';`

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

**Import:** `import StartMenu from '../modules/startMenu.js';`

| Method | Description |
|--------|-------------|
| `StartMenu.refresh()` | Re-renders the recommended section |
| `StartMenu.pinApp(appId)` | Pin an app to Start |
| `StartMenu.unpinApp(appId)` | Unpin from Start |
| `StartMenu.isPinned(appId)` | Check if pinned |

---

## 9. System Config

**Import:** `import SystemConfig from '../modules/systemConfig.js';`

| Method | Description |
|--------|-------------|
| `SystemConfig.get(key)` | Get a config value |
| `SystemConfig.getAll()` | Get all config as object |
| `SystemConfig.set(key, value)` | Set a value and apply |

**Common keys:** `accentColor`, `backgroundStyle`, `taskbarOpacity`, `userName`, `darkMode`, `masterVolume`, `scaling`

---

## 10. User Activity

**Import:** `import UserActivity from '../modules/userActivity.js';`

| Method | Description |
|--------|-------------|
| `UserActivity.trackFileOpen(path, name)` | Record a file open event |
| `UserActivity.trackAppOpen(appId)` | Record an app open event |
| `UserActivity.getRecommended()` | Get recent items (up to 6) |
| `UserActivity.getFileIcon(name)` | Get emoji icon for file extension |

---

## 11. Sounds

**Import:** `import Sounds from '../modules/sounds.js';`

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

**Import:** `import SavePrompt from '../modules/saveprompt.js';`

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

## 13. App Icons

**Import:** `import AppIcons from '../modules/appIcons.js';`

| Method | Description |
|--------|-------------|
| `AppIcons.get(id)` | Returns SVG string for an app |
| `AppIcons.getAll()` | Returns all icon mappings |

Known IDs: `fileExplorer`, `settings`, `notepad`, `calendar`, `taskManager`, `photos`, `calculator`, `clock`, `paint`, `browser`, `appStore`, `terminal`, `sampleApp`, `vscode`, `export`, `windowsUpdate`

---

## 14. CSS Classes Reference

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

## 15. All Available Imports

```js
import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';
import Popup from '../modules/popup.js';
import ContextMenu from '../modules/contextMenu.js';
import { Taskbar, AppRegistry, AppMetadata } from '../modules/taskbar.js';
import StartMenu from '../modules/startMenu.js';
import SystemConfig from '../modules/systemConfig.js';
import UserActivity from '../modules/userActivity.js';
import Sounds from '../modules/sounds.js';
import AppSystem from '../modules/appSystem.js';
import AppIcons from '../modules/appIcons.js';
import SavePrompt from '../modules/saveprompt.js';
```

---

## 16. Complete Example: Reddit-Style App

```js
import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';
import Popup from '../modules/popup.js';
import FileSystem from '../modules/fileSystem.js';
import ContextMenu from '../modules/contextMenu.js';

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
                    { label: 'Upvote', icon: '⬆', action: () => { /* ... */ } },
                    { label: 'Downvote', icon: '⬇', action: () => { /* ... */ } },
                    'separator',
                    { label: 'Delete', icon: '🗑', action: () => { /* ... */ } }
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

## 17. Gotchas & Rules

1. **Never use native `alert()`, `confirm()`, `prompt()`** — use Popup API
2. **Never use `localStorage` directly** — use FileSystem for persistence
3. **Store app data under `/system/programs data/<appId>/`**
4. **All imports use ES modules** (`import`/`export`)
5. **Icons must be inline SVGs** — no external files or emoji in SVGs
6. **The module must return `{ launch }`** — this is the contract
7. **Use `win.element` to query within your window** — not `document.querySelector`
8. **Clean up intervals/listeners when your window closes** — listen for close button or check `win.element.isConnected`
9. **All CSS is scoped to the dark theme** — use light text on dark backgrounds
10. **Window body fills available space** — use `height:100%` and flexbox for layouts
