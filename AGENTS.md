# Agents

## Project: Windows 12

A web-based OS simulation built with vanilla HTML, CSS, and JavaScript modules. No external CDNs or libraries.

## Architecture

### Modules
- `js/modules/windowManager.js` - Core window management (create, drag, resize, maximize, minimize, close)
- `js/modules/taskbar.js` - Taskbar logic, clock, start menu toggle, app launching
- `js/modules/startMenu.js` - Start menu with pinned apps, search, recommended items
- `js/modules/popup.js` - Popup/dialog API (info, warn, error, confirm, pick, textbox, forum)

### Apps
- `js/apps/settings.js` - Settings app with sidebar navigation and system cards
- `js/apps/notepad.js` - Notepad with text editing and line/col status
- `js/apps/fileExplorer.js` - File Explorer with sidebar, virtual file system, navigation

### Styling
- `css/main.css` - Root variables, desktop background, base reset
- `css/taskbar.css` - Taskbar layout and tray
- `css/startmenu.css` - Start menu dropdown
- `css/windows.css` - Window chrome, resize handles
- `css/popup.css` - Popup/dialog styles

## Conventions
- All JS uses ES modules (`import`/`export`)
- Windows are draggable from header, resizable from all 8 edges/corners
- Icons are inline SVGs (no external assets)
- Dark theme throughout (Windows 11 acrylic style)
- **Persistent data must use the FileSystem module** (`js/modules/fileSystem.js`), not `localStorage`. Store data under `/system/programs data/<app>/`. The only exception is `FileSystem.init()` itself, which uses `localStorage` as its backing store.
- **Never use native `alert()`, `confirm()`, or `prompt()`**. Always use the Popup API (`js/modules/popup.js`). All methods return Promises — use `.then()` or `await`. Available methods: `Popup.info()`, `Popup.warn()`, `Popup.error()`, `Popup.confirm()`, `Popup.pick()`, `Popup.textbox()`, `Popup.forum()`. Import it with `import Popup from '../modules/popup.js';`

## Workflow
- Always commit and push changes after completing a task.
- Use descriptive commit messages with conventional commits format (e.g. `feat:`, `fix:`, `chore:`).
- **Before every commit**, update CHANGELOG.md with a new version entry (never modify older entries). Only use these sections: **Added**, **Removed**, **Changed**, **Fixed**.
- Commit order: 1) code changes 2) CHANGELOG.md update 3) push

## Running
Serve `index.html` statically via any web server (e.g. GitHub Pages).
