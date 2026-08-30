# Changelog

All notable changes to Windows 12 will be documented in this file.

Each version may only use the following sections: **Added**, **Removed**, **Changed**, **Fixed**. Never modify older entries.

## [12.0.3920] - 2026-08-30

### Added
- Print Screen key captures a screenshot with a white flash animation
- Screenshot saved to Pictures folder with timestamp filename
- Toast notification shown on capture with save location

### Fixed
- Photos app: clicking thumbnails now opens viewer (was querying wrong CSS class)
- Settings: back button in System sub-pages now works (event delegation)
- Settings: toggle switches now visually reflect on/off state

### Added
- Running apps now show in taskbar even if not pinned (with separator from pinned apps)
- Pin/unpin apps from taskbar: right-click taskbar button to pin or unpin
- Pin/unpin apps from Start menu: right-click pinned app to unpin, right-click All Apps to pin
- Pinned apps persist in localStorage for both taskbar and Start menu
- App metadata registry with icons for all apps
- Paint "Save" now opens a file explorer dialog to choose destination folder and file type (PNG, JPEG, WebP, BMP)
- Notepad: File > Open to browse text files from Documents
- Notepad: Edit > Time/Date (F5) inserts current timestamp
- Notepad: Edit > Cut/Copy/Paste now work properly via Clipboard API
- Notepad: Edit > Delete removes selected text

### Changed
- Taskbar is now fully dynamic (buttons rendered from JS, not hardcoded HTML)
- Start menu pinned apps are stored in localStorage

### Fixed
- Non-pinned running apps now appear in the taskbar with a visual separator
- File Explorer now opens image files in Photos viewer instead of Notepad
- Photos app now renders actual base64 images in thumbnails and full viewer

### Added
- Calculator app with standard operations, chain calculations, and keyboard support
- Photos app with gallery view and image file scanning from Pictures folder
- Calendar app with monthly view, day navigation, and date details sidebar
- Clock app with analog clock, timer, and stopwatch tabs
- Paint app with drawing tools, color palette, brush sizes, undo, and save as PNG
- Snap Assist: drag windows to screen edges to snap to halves/quadrants
- File associations: right-click files to choose "Open With" different apps
- Drag & drop files from File Explorer to Notepad to open them
- Drag & drop files between folders in File Explorer
- Notepad: Edit menu with undo/redo/cut/copy/paste/find/replace
- Notepad: View menu with word wrap toggle and zoom in/out/reset
- Notepad: Find & Replace bar (Ctrl+F) with match case and prev/next
- Notepad: Keyboard shortcuts (Ctrl+S, Ctrl+F, Ctrl+H, Ctrl+A)
- File Explorer: Copy/paste with Ctrl+C/Ctrl+V
- File Explorer: Enhanced file type icons (50+ extensions)
- File Explorer: Progress bar for file operations
- File Explorer: Cut/copy/paste in context menus
- Settings: System page sub-pages (Display, Sound, Notifications, Power, Storage, Multitasking)
- Settings: Display brightness slider and resolution picker
- Settings: Sound volume, output/input device selectors
- Settings: Notification toggles per app
- Settings: Power mode, sleep settings, battery display
- Settings: Storage usage breakdown with color-coded categories
- Settings: Snap layouts preview in Multitasking page
- Task Manager: Kill process confirmation dialog
- Task Manager: Additional system processes shown
- Task Manager: Startup impact column

### Added
- Calendar app with monthly view, day navigation, and date selection
- Sidebar showing selected date details (week number, day of year, leap year info)
- Today highlight and "Go to Today" quick action
- Calendar pinned in Start Menu and available in All Apps

## [12.0.3821] - 2026-08-30

### Added
- Clock app with analog clock face, digital time, and date display
- Timer tab with hours/minutes/seconds input and countdown
- Stopwatch tab with millisecond precision and lap tracking
- Clock available in Start Menu All Apps list

## [12.0.3820] - 2026-08-30

### Added
- Photos app with gallery view for browsing images from the Pictures folder
- Full-size image viewer with close button
- Placeholder colored thumbnails with filename and extension badge
- Empty state when no images are found
- Photos pinned in Start Menu and available in All Apps

## [12.0.3820] - 2026-08-30

### Added
- Calculator app with standard arithmetic operations (+, -, ×, ÷)
- Percentage, plus/minus toggle, backspace, and clear buttons
- Chain calculation support
- Keyboard input support
- Accent-colored equals button

## [12.0.3810] - 2026-08-30

### Fixed
- Task Manager in taskbar right-click context menu is now enabled

## [12.0.3800] - 2026-08-30

### Added
- Task Manager app with Processes, Performance, and Startup tabs
- Processes tab shows all running windows with CPU/Memory/Disk/Network stats
- Performance tab shows CPU/Memory/Disk usage with progress bars
- Startup tab shows startup items
- End task button to close processes
- Added getAllWindows to WindowManager

## [12.0.3790] - 2026-08-30

### Added
- Power options menu with slide-up animation
- Shutdown option (closes tab with fade animation)
- Restart option (refreshes page with fade animation)
- Logout option (shows login screen with Sign in button)
- Switch User option (shows login screen with Sign in button)

## [12.0.3780] - 2026-08-30

### Added
- Desktop icons are freely draggable
- Icon positions saved to /system/desktop-layout.json
- Positions persist across sessions

## [12.0.3770] - 2026-08-30

### Changed
- Path bar is now an editable input field
- Click path bar to select all and copy
- Type a path and press Enter to navigate
- Press Escape to cancel editing

## [12.0.3760] - 2026-08-30

### Added
- This PC in sidebar with expandable Local Disk (C:)

### Changed
- Home button now shows user home directory (/users/default)
- Path bar shows friendly names (Home, Local Disk (C:), etc.)

## [12.0.3750] - 2026-08-30

### Added
- Recycle Bin on desktop with empty/full icon states
- Deleted files move to Recycle Bin instead of permanent deletion
- Recycle Bin viewer with Restore and Empty buttons
- Recycle Bin in File Explorer sidebar
- Right-click context menu: Open, Empty Recycle Bin
- Restore individual files from Recycle Bin to original location
- File Explorer delete now moves to Recycle Bin

## [12.0.3740] - 2026-08-30

### Added
- Login screen with user avatar and name
- Auto-login with "Welcome" text and loading spinner
- Smooth fade transitions between boot → login → desktop

## [12.0.3730] - 2026-08-30

### Added
- Boot screen with Windows logo and loading spinner
- Fade-out transition after 2 seconds

## [12.0.3720] - 2026-08-30

### Changed
- Main view now slides in when returning from All apps drawer

## [12.0.3710] - 2026-08-30

### Fixed
- All apps drawer now works correctly without breaking start menu
- Removed duplicate Pinned/Recommended section headers
- Simplified DOM manipulation for view switching

## [12.0.3700] - 2026-08-30

### Added
- All apps button slides in a full app drawer
- Alphabetical app listing with letter headers
- Back arrow to return to main start menu view
- Slide-in/slide-out CSS animations

## [12.0.3600] - 2026-08-30

### Changed
- Filesystem restructured to Unix-like hierarchy
- Root `/` contains: `system/`, `users/`, `programs data/`
- User files at `/users/default/` (Desktop, Documents, Downloads, etc.)
- System config at `/system/config.json`
- File Explorer sidebar updated with new paths
- Desktop icons point to `/users/default/Desktop`
- All path references updated across codebase

## [12.0.3500] - 2026-08-30

### Added
- Light/dark mode toggle in Personalization settings
- Light theme CSS variables for windows, taskbar, start menu, text
- Light wallpapers for all background styles
- Theme persists in config.json and localStorage

### Changed
- Window header border now uses theme variable
- Start menu border uses theme variable
- Username input uses theme variables

## [12.0.3400] - 2026-08-30

### Added
- Desktop icons render from the Desktop folder in the virtual filesystem
- Desktop right-click: create new folder, create new text file
- Desktop right-click: refresh icons
- Desktop icons: double-click to open files, right-click to rename/delete
- Desktop icons: click to select, click empty space to deselect
- File Explorer changes to Desktop folder auto-refresh desktop icons
- Auto-layout with grid positioning based on screen width

## [12.0.3300] - 2026-08-30

### Added
- SystemConfig module for persistent system settings
- Working Personalization page in Settings
- Accent color picker (12 colors)
- Background wallpaper selector (6 styles)
- Taskbar opacity slider
- User name setting
- Reset to defaults button
- Config file at Documents/System/config.json
- Config file editable from File Explorer
- Editing config.json in Notepad applies changes on Ctrl+S
- Config badge banner when editing system config

## [12.0.3200] - 2026-08-30

### Added
- UserActivity module tracks recently opened files and apps
- Start Menu Recommended section shows recent activity dynamically
- Activity persists in localStorage across sessions
- File opens from File Explorer are tracked
- App opens from Start Menu are tracked
- Clicking Recommended items reopens the file/app
- Time-ago labels (Just now, 5m ago, 2h ago, etc.)

## [12.0.3100] - 2026-08-30

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

## [12.0.3020] - 2026-08-30

### Added
- Active/focused indicator on taskbar for the current window
- Running indicator on taskbar buttons for open apps

### Changed
- Taskbar click now toggles minimize/restore instead of maximize
- Refactored window callbacks to avoid circular imports

## [12.0.3010] - 2026-08-30

### Fixed
- Start menu pinned apps now launch their respective apps (missing AppRegistry import)

## [12.0.3000] - 2026-08-30

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
