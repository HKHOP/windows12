# Changelog

All notable changes to Windows 12 will be documented in this file.

Each version may only use the following sections: **Added**, **Removed**, **Changed**, **Fixed**. Never modify older entries.

## [0.2.0] - 2026-08-30

### Added
- Virtual filesystem module with full CRUD operations
- Default folders: Desktop, Documents, Downloads, Pictures, Music, Videos
- Sample text files in Desktop, Documents, and Downloads
- File Explorer: create new folder, create new text file
- File Explorer: rename and delete files/folders via right-click
- File Explorer: back/forward/up navigation with history
- File Explorer: file properties window
- File Explorer: open text files with Notepad
- Notepad: Ctrl+S to save, File menu with Save/Save As
- Notepad: asterisk (*) indicator for unsaved changes

## [0.1.2] - 2026-08-30

### Added
- Active/focused indicator on taskbar for the current window
- Running indicator on taskbar buttons for open apps

### Changed
- Taskbar click now toggles minimize/restore instead of maximize
- Refactored window callbacks to avoid circular imports

## [0.1.1] - 2026-08-30

### Fixed
- Start menu pinned apps now launch their respective apps (missing AppRegistry import)

## [0.1.0] - 2026-08-30

### Added
- Project structure with ES modules (no CDNs)
- Main HTML with desktop, taskbar, and start menu shell
- CSS: main theme variables, taskbar, start menu, window chrome
- Window manager module: create, drag, resize (8 handles), maximize, minimize, close
- Taskbar module: clock, start button toggle, app launch/focus
- Start menu module: pinned apps grid, recommended list, search filter
- Settings app: sidebar nav, system cards grid
- Notepad app: text editor with line/col counter, menu bar
- File Explorer app: sidebar, virtual file system, folder navigation
- AGENTS.md documentation
- CHANGELOG.md (this file)
