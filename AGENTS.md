# Agents

## Project: Windows 12

A web-based OS simulation built with vanilla HTML, CSS, and JavaScript modules. No external CDNs or libraries.

## Architecture

### Modules
- `js/modules/windowManager.js` - Core window management (create, drag, resize, maximize, minimize, close)
- `js/modules/taskbar.js` - Taskbar logic, clock, start menu toggle, app launching
- `js/modules/startMenu.js` - Start menu with pinned apps, search, recommended items

### Apps
- `js/apps/settings.js` - Settings app with sidebar navigation and system cards
- `js/apps/notepad.js` - Notepad with text editing and line/col status
- `js/apps/fileExplorer.js` - File Explorer with sidebar, virtual file system, navigation

### Styling
- `css/main.css` - Root variables, desktop background, base reset
- `css/taskbar.css` - Taskbar layout and tray
- `css/startmenu.css` - Start menu dropdown
- `css/windows.css` - Window chrome, resize handles

## Conventions
- All JS uses ES modules (`import`/`export`)
- Windows are draggable from header, resizable from all 8 edges/corners
- Icons are inline SVGs (no external assets)
- Dark theme throughout (Windows 11 acrylic style)

## Workflow
- Always commit and push changes after completing a task.
- Use descriptive commit messages with conventional commits format (e.g. `feat:`, `fix:`, `chore:`).
- Update CHANGELOG.md with a new entry before committing (never modify older entries).

## Running
Serve `index.html` statically via any web server (e.g. GitHub Pages).
