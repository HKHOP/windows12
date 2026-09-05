# Changelog

All notable changes to Windows 12 will be documented in this file.

Each version may only use the following sections: **Added**, **Removed**, **Changed**, **Fixed**. Never modify older entries.

## [12.0.4590] - 2026-09-05

### Fixed
- Fixed FileSystem save crashing on localStorage quota exceeded
- Fixed FileExplorer shared state causing multi-window navigation corruption
- Fixed TaskManager shared interval causing multi-window timer leaks
- Fixed Browser shared state causing multi-window tab corruption
- Fixed FileExplorer event listener leaks on repeated navigate calls
- Fixed DesktopIcons document-level drag listeners accumulating on each icon
- Fixed Paint keydown listener leaking after window close
- Fixed FileExplorer allowing drag-drop onto self or into own subfolder
- Fixed SavePrompt creating empty files before caller writes actual content
- Fixed WindowManager minimize button referencing undefined Taskbar variable

## [12.0.4580] - 2026-09-04

### Added
- Added autocomplete for VS Code with color-coded suggestions (keywords, builtins, methods, properties, values, tags, attributes)
- Autocomplete for JavaScript: keywords, built-in objects, and common methods
- Autocomplete for CSS: properties and values
- Autocomplete for HTML: tags and attributes
- Keyboard navigation for autocomplete (Arrow Up/Down, Enter/Tab to insert, Escape to dismiss)
- Autocomplete popup repositions near cursor and adjusts to stay visible

## [12.0.4570] - 2026-09-04

### Fixed
- Fixed VS Code modified-file dot indicator not being circular (missing % in border-radius)
- Fixed VS Code textarea not escaping & characters, causing files with & to display incorrectly
- Fixed VS Code document click listener leak when opening the app multiple times
- Fixed VS Code Save As and Open Folder dialogs not escaping quotes in input values

## [12.0.4560] - 2026-09-03

### Fixed
- Fixed VS Code syntax highlighting showing broken HTML tags
- Fixed VS Code file save not persisting content (path filtering fix)
- Fixed VS Code terminal rm command using non-existent removeItem method
- Fixed VS Code save to sync textarea content before writing

## [12.0.4550] - 2026-09-03

### Added
- Added app detail pages in Microsoft Store
- Added back button to return to main store view
- Added app description, features, and screenshots sections
- Added "Discover more" sidebar with related apps
- Added app info panel with size, age rating, and category
- Added hover effects on app cards

## [12.0.4540] - 2026-09-03

### Added
- Added Ex/port app for importing/exporting files between device and filesystem
- Ex/port supports drag-and-drop file import with multiple destination folders
- Ex/port allows browsing and selecting virtual files to download to device
- Added Ex/port to Microsoft Store for installation
- Added Ex/port to AppMetadata for Start Menu visibility
- Added Ex/port to all userApps lists for proper installation tracking
- Fixed Ex/port not appearing in Start Menu after installation

## [12.0.4530] - 2026-09-03

### Added
- Added service worker (sw.js) for PWA support
- Added manifest.json for installability on mobile devices
- Added Apple-specific meta tags for iOS home screen support
- Website can now be installed as an app on Android and iPhone

## [12.0.4520] - 2026-09-03

### Fixed
- Fixed VS Code HTML syntax highlighting showing random CSS strings
- Simplified HTML highlighting to avoid span interference

## [12.0.4510] - 2026-09-03

### Added
- Added "New Folder" option to VS Code File menu (Ctrl+Shift+N)

### Fixed
- Fixed VS Code explorer not refreshing after file/folder operations
- Fixed module-level functions not having access to refreshTree

## [12.0.4500] - 2026-09-03

### Fixed
- Added aggressive cache busting for mobile browsers that can't hard refresh
- Version check script forces reload when update is detected
- Updated all resource query strings to latest version

## [12.0.4490] - 2026-09-03

### Added
- Added paint bucket (flood fill) tool to Paint
- Added triangle shape tool to Paint
- Added tabbed toolbar (Home/View) similar to Windows Paint
- Added status bar showing canvas size and cursor position

### Changed
- Redesigned Paint toolbar with vertical tool buttons and section separators
- Improved tool button styling with active state highlighting

## [12.0.4480] - 2026-09-03

### Fixed
- Fixed Paint touch coordinate calculation by using canvas scale ratio instead of body zoom

## [12.0.4470] - 2026-09-03

### Added
- Added WindowState module to save and restore window positions and sizes
- Apps now remember their last position, size, and maximized state across sessions
- Apps can opt-out by passing `saveState: false` in options

## [12.0.4460] - 2026-09-03

### Fixed
- Fixed Paint touch coordinate calculation by using correct zoom source (body instead of resolution-layer)

## [12.0.4450] - 2026-09-03

### Added
- Added Windows Update module that checks for version updates
- Added automatic update check every 30 minutes
- Added update notification popup when new version is available
- Added Windows Update section in Settings with check for updates button
- Added version.json file for remote version checking

## [12.0.4440] - 2026-09-03

### Fixed
- Fixed Paint touch handling by attaching events directly to canvas element

## [12.0.4430] - 2026-09-03

### Fixed
- Optimized Paint to prevent browser crashes during long drawing sessions

### Changed
- Undo stack now uses ImageData instead of base64 data URLs (3-5x less memory)
- Brush tools now draw incremental segments instead of redrawing entire stroke
- Shape tools cache preview state once instead of reloading on every mouse move
- Reduced max undo states from 30 to 20 for better memory usage

## [12.0.4420] - 2026-09-03

### Fixed
- Fixed Paint touch drawing position by accounting for CSS zoom scaling
- Fixed touch event handling by moving touchmove/touchend to document level so drawing continues when finger moves off canvas

## [12.0.4410] - 2026-09-03

### Added
- Added `update-version.js` script to auto-update cache busting version from CHANGELOG.md

### Changed
- Added cache busting with version query strings on all CSS/JS files
- Added no-cache meta tags to prevent browser caching of old versions

### Improved
- Paint line smoothing using quadratic bezier curves for smoother strokes

## [12.0.4400] - 2026-09-03

### Fixed
- Fixed Paint app touch drawing on mobile - coordinates were offset due to missing touch event handlers
- Fixed global touch handler interfering with canvas-based apps by excluding canvas elements

## [12.0.4390] - 2026-09-03

### Fixed
- Fixed VS Code folder picker not updating the file explorer tree after selecting a new root folder
- Fixed activity bar buttons (Explorer/Search) not toggling sidebar content

## [12.0.4380] - 2026-09-03

### Added
- Added functional top menu bar (File, Edit, Selection, View, Run, Help) to VS Code with dropdown menus and keyboard shortcuts
- Added project root folder selection with quick-access shortcuts (~/default, ~/Desktop, ~/Documents, ~/Projects)
- Added New File, Save As, Save All, Close Editor/All, Word Wrap, Zoom controls, and About dialog

## [12.0.4370] - 2026-09-03

### Added
- Added Visual Studio Code app installable from Microsoft Store with file explorer sidebar, code editor with syntax highlighting, and integrated terminal

## [12.0.4360] - 2026-09-03

### Fixed
- Fixed duplicate AppSystem import syntax error in settings.js

## [12.0.4350] - 2026-09-03

### Added
- Added automatic fullscreen request on touch events for mobile touch devices

## [12.0.4340] - 2026-09-03

### Added
- Implemented real application system (`AppSystem`) supporting install/uninstall pipeline via Microsoft Store, Settings app, and Start Menu right-click context menu
- Added functional Sample App with interactive features and full system registration

## [12.0.4330] - 2026-09-03

### Fixed
- Fixed touch indicator circle appearing in the wrong position under scaled/zoomed viewports by adjusting touch coordinates relative to the zoom scale factor

## [12.0.4320] - 2026-09-03

### Fixed
- Fixed touch interaction breaking mobile scrolling and form inputs by avoiding unconditional `preventDefault()` on touch events except when interacting with window headers, resize handles, desktop icons, and taskbar
- Fixed mobile layout sizing issues on resolution layer and scaled viewports

## [12.0.4310] - 2026-09-03

### Added
- Added Microsoft Store application (`AppStore`) matching the native Windows design with hero banners, trending sections, and app installation capabilities

## [12.0.4300] - 2026-09-03

### Fixed
- Fixed mobile and small screen layout issue where the desktop appeared small in the corner due to mismatched resolution-layer sizing under scaled viewports

## [12.0.4290] - 2026-09-01

### Fixed
- VBScript engine `stripComment` now also recognizes smart quotes (U+2018, U+2019) and BOM (U+FEFF) as comment markers, and strips leading BOM from the script input
- Main run loop now skips blank/comment-only lines so they cannot fall through to the tokenizer

## [12.0.4280] - 2026-09-01

### Fixed
- VBScript top-level lines now strip comments before execution (was only done inside loops/if blocks)

## [12.0.4270] - 2026-09-01

### Fixed
- Batch `choice` command now correctly calls `Popup.pick()` with title parameter, allowing the selection popup to appear

## [12.0.4260] - 2026-09-01

### Changed
- Complete rewrite of VBScript engine with new parser architecture (range-based execution, procedure pre-scan, improved error handling)
- Complete rewrite of Batch engine with improved command parsing and execution

## [12.0.4250] - 2026-09-01

### Fixed
- Terminal text selection now works by stopping mousedown/selectstart propagation on the output area and only focusing input when no text is selected
- Script execution terminal (BAT/VBS) now also supports text selection with same user-select and event listener fixes

## [12.0.4240] - 2026-09-01

### Added
- Text highlighting (selection) support in Terminal output and Browser (content, new tab page, history, downloads)

### Fixed
- VBScript multi-line block skipping (`skipToElseOrEndIf`, `skipToNext`, `skipToLoopEnd`, `skipToWend`) and `pc` synchronization in `executeBlock` and top-level execution loop
- VBScript logical `Not` operator precedence relative to `Is` (allows `Not fso Is Nothing` to correctly evaluate `Is` first)

## [12.0.4230] - 2026-09-01

### Fixed
- VBScript unary `Not`, `-`, `+` operator support at expression start
- VBScript `executeLine` try/catch block now wraps entire statement execution for robust `On Error Resume Next` error handling
- VBScript comment stripping function integrated correctly into execution pipeline

### Fixed
- File Explorer now uses VBScript engine for .vbs/.vbe files (was always using batch engine)
- VBScript function return values (AddNumbers = a+b now returns the value)
- VBScript If/Else/ElseIf multi-line blocks (skipToElseOrEndIf pc increment bug)
- VBScript For/Next, Do/Loop, While/Wend skip functions had same pc increment bug
- VBScript operator word boundary detection (Not, Is, And, Or, Xor, Mod now work at start of expressions)

### Added
- VBScript Err global object (Number, Description, Source, Clear, Raise)
- VBScript Is operator (object identity comparison, Is Nothing)
- VBScript & string concatenation operator
- Division by zero now throws error (caught by On Error Resume Next)
- Nothing and Null as global constants

## [12.0.4210] - 2026-09-01

### Fixed
- `@echo off` no longer outputs "off" (echo off/on checks now run before echo text handler)
- `if/else` with parenthesized blocks now works correctly (findElseIndex tracks parentheses depth)
- Multi-line `if (...) else (...)` blocks are properly accumulated and parsed
- Closing `)` in if/else blocks no longer treated as unknown command

### Added
- `choice` command with /C, /M, /T, /D flags (shows popup for user selection, sets %errorlevel%)

## [12.0.4200] - 2026-09-01

### Added
- VBScript engine (.vbs/.vbe) with parser and interpreter
- VBScript syntax: Dim, Set, Const, If/Then/ElseIf/Else/End If, For/Next, For Each/Next, Do/Loop, While/Wend, Select Case, Sub/Function
- VBScript built-in functions: MsgBox, WScript.Echo, String functions (Len, Left, Right, Mid, InStr, Replace, Trim, LCase, UCase), Math functions (Abs, Int, Round, Rnd), Date/Time functions, Type conversion (CStr, CInt, CLng, CBool, CDbl), Array functions (Split, Join, UBound, LBound)
- VBScript COM objects: WScript.Shell, Scripting.FileSystemObject, Shell.Application
- .vbs/.vbe files can be run directly in terminal or via `run` command
- .vbs/.vbe files open in Terminal from File Explorer (double-click, Open With)

## [12.0.4190] - 2026-09-01

### Added
- .bat/.cmd files can be opened from File Explorer via double-click or context menu "Open"
- "Open With > Terminal" option for batch files in File Explorer context menu
- Batch file icon (⬛) in File Explorer

## [12.0.4180] - 2026-09-01

### Added
- Batch script engine supporting Windows .bat/.cmd file execution
- Commands: echo, set, if/else, for, goto/labels, call, dir, cd, type, copy, move, del, ren, mkdir, rmdir, cls, pause, title, color, find/findstr, rem, shift, exit
- Variable expansion with %VAR% syntax, including builtins (%DATE%, %TIME%, %RANDOM%, %ERRORLEVEL%, %CD%, %USERNAME%)
- Argument support (%1-%9) with %~f0 modifier syntax
- Output redirection (>) and append (>>)
- `run <file.bat>` command in terminal to execute scripts
- Direct .bat/.cmd file execution when typing the filename
- Infinite loop protection (100k iteration limit)

## [12.0.4170] - 2026-09-01

### Added
- Terminal app with filesystem browsing and command execution
- Commands: ls/dir, cd, pwd, cat, echo, mkdir, touch, write, rm, rename, clear, history, whoami, date, neofetch, help
- Command history with up/down arrow navigation
- Ctrl+L to clear, Ctrl+C to cancel input
- Path resolution supporting absolute (/), relative (./../), and home (~) paths

## [12.0.4160] - 2026-09-01

### Added
- System sounds via Web Audio API — no external audio files needed
- Info popup sound (pleasant two-tone chime)
- Warn popup sound (mid-pitched alert)
- Error popup sound (descending three-tone alert)
- Confirm popup sound (rising two-tone)
- Recycle bin empty sound (noise sweep with low tone)

### Changed
- Volume respects the master volume slider in Settings > Sound

## [12.0.4150] - 2026-09-01

### Added
- Touch screen support — tap to click, long-press (500ms) for right-click context menu
- Visual touch indicator circle appears at touch point with pulse animation on tap
- Touch-to-mouse event synthesis so all existing interactions work on touch devices
- Larger hit targets for window headers, resize handles, taskbar buttons, and popup buttons on touch screens

## [12.0.4140] - 2026-09-01

### Added
- Display resolution setting detects native viewport and offers progressive lower options down to 800x600
- Resolution changes render at target resolution then scale up with pixelated rendering for authentic low-res look
- Resolution change confirmation popup with 15s revert countdown

### Changed
- Resolution layer wraps desktop and taskbar for resolution scaling via CSS zoom

## [12.0.4130] - 2026-09-01

### Added
- Display scaling setting in Settings > System > Display — choose between Auto (adaptive) or fixed percentages (50%–200%)
- Scaling change confirmation popup with 15s revert countdown — must click "Keep changes" to persist

### Changed
- Scaling module now supports fixed scale overrides persisted via SystemConfig
- WindowManager scale factor updates live when scaling changes

### Fixed
- All Display settings now persist (brightness, night light, resolution, orientation)
- All Sound settings now persist (volume, output device, input device)
- All Notification settings now persist (alerts toggle, per-app toggles)
- All Power settings now persist (power mode, screen timeout, sleep timeout)
- All Multitasking settings now persist (snap layout toggles)
- Brightness now applies on load from saved config

## [12.0.4120] - 2026-08-31

### Added
- Adaptive viewport scaling via CSS `zoom` — UI automatically scales to fit small screens
- `js/modules/scaling.js` computes scale factor from viewport size (min dimension / 1080), clamped between 0.45 and 1.0

### Changed
- Window positioning, snap zones, and desktop icon grid calculations account for zoom factor
- Desktop icon drag bounds respect zoomed viewport dimensions

## [12.0.4110] - 2026-08-31

### Changed
- SavePrompt dialog now shows files filtered by selected extension in the folder view
- Clicking a file populates the filename input (for overwrite)
- Extension dropdown changes update the visible files
- File icons shown by type (images, text, code, audio, video, etc.)

## [12.0.4100] - 2026-08-31

### Added
- SavePrompt API (`js/modules/saveprompt.js`) - shared file save dialog with sidebar navigation, filename input, optional extension dropdown, overwrite checking, Enter/Escape support, and success toasts

### Changed
- Notepad Save As now uses SavePrompt API (~180 lines removed)
- Paint Save As now uses SavePrompt API (~200 lines removed)

## [12.0.4090] - 2026-08-31

### Changed
- Calendar grid cells now show dual dates: primary date + secondary Hijri (in Gregorian mode) or Gregorian (in other modes)
- Grid cells are taller (44px) with two-line layout instead of square

## [12.0.4080] - 2026-08-31

### Changed
- Global select/dropdown styling added to main.css with custom dropdown arrow
- Removed redundant inline styles from all 9 select elements across calendar, paint, and settings

## [12.0.4070] - 2026-08-31

### Added
- Calendar app now supports 4 calendar systems: Gregorian, Hijri (Islamic), Hebrew (Jewish), Persian (Solar Hijri)
- Calendar system selector dropdown in the header
- Sidebar shows selected date in all 3 alternative calendar systems
- Full month/day navigation works for each calendar system

### Changed
- Calendar grid renders according to selected calendar system
- Sidebar expanded to show cross-calendar date equivalents

## [12.0.4060] - 2026-08-31

### Fixed
- Notepad Save (Ctrl+S) now saves to the existing file when one is open
- Save As creates/overwrites a file and subsequent saves go to that file
- File path tracking updated correctly after Save As

## [12.0.4050] - 2026-08-31

### Changed
- Notepad "Save As" now opens a File Explorer-style save dialog (matching Paint's layout)
- Save dialog includes sidebar with quick access folders, grid folder view, back/forward/up navigation, and path bar
- Fixed `FileSystem.list` → `FileSystem.getChildren` in Notepad file open

## [12.0.4040] - 2026-08-31

### Changed
- Popups are now real windows (via WindowManager) instead of overlay dialogs
- Popups no longer dim/darken the screen
- Popups can be minimized, dragged, and resized like normal windows
- Maximize button removed from all popups
- Close button can be hidden via `closable` option
- Minimize button optional via `minimize` option
- `confirm()` now returns boolean instead of string
- Removed overlay/popup-overlay CSS, added window-body content styles

## [12.0.4030] - 2026-08-31

### Added
- Popup API (`js/modules/popup.js`) with 7 methods: `info`, `warn`, `error`, `confirm`, `pick`, `textbox`, `forum`
- All popup methods return Promises for async usage
- Popup overlay and box styles (`css/popup.css`)
- Convention added to AGENTS.md: never use native `alert()`, `confirm()`, or `prompt()`

### Changed
- Replaced all 9 native dialogs across 4 files with Popup API calls
- `fileExplorer.js`: rename prompt, delete confirm, invalid JSON alert, path-not-found alert
- `desktopIcons.js`: empty recycle bin confirm, rename prompt, delete confirm
- `paint.js`: replace file confirm
- `notepad.js`: save-as prompt

## [12.0.4020] - 2026-08-31

### Changed
- All persistent data now uses FileSystem module instead of localStorage
- Browser history and downloads stored at `/system/programs data/browser/`
- Taskbar pinned apps stored at `/system/programs data/taskbar/pins.json`
- Start menu pinned apps stored at `/system/programs data/startmenu/pins.json`
- User activity (recent files/apps) stored at `/system/programs data/userActivity/activity.json`
- System config uses FileSystem as primary source, removed localStorage fallback
- Added persistence convention to AGENTS.md

## [12.0.4010] - 2026-08-31

### Added
- Settings "About" page showing OS version, build, release date, and system info
- Version dynamically fetched from CHANGELOG.md

## [12.0.4000] - 2026-08-31

### Fixed
- Context menu can now be reopened immediately after selecting an option
- Stale `once: true` document click listener is cleaned up when menu hides

## [12.0.3990] - 2026-08-31

### Fixed
- Browser tab title now shows the website's actual title instead of the URL
- Injected script posts `document.title` changes back to parent via `postMessage`

## [12.0.3980] - 2026-08-31

### Fixed
- URL bar now updates when clicking links inside same-origin iframes (click interceptor + load event polling)
- Fixed duplicate history entries when opening a new tab with a URL
- Removed unused `navigatingInternally` property

### Changed
- Injected iframe script now captures `<a>` clicks via event capturing and posts URL via `postMessage`
- `addTab()` no longer calls `navigateTo()` redundantly when URL is already set by `createTab()`

## [12.0.3970] - 2026-08-31

### Fixed
- Home page now displays correctly — `showNewTab()` populates existing DOM element instead of appending duplicate
- URL bar updates when navigating within same-origin iframes via injected script
- Removed unused `navigatingInternally` property from tab objects

### Changed
- Removed redundant `getNewTabHtml()` wrapper; content generated inline via `getNewTabContentHtml()`
- `hideNewTab()` clears innerHTML to prevent stale content on next show

## [12.0.3960] - 2026-08-31

### Fixed
- Navigation back/forward now works correctly — iframe element is reused instead of destroyed/recreated
- URL bar updates when possible (same-origin pages, or when browser allows reading iframe location)
- In-iframe navigation (clicking links) is tracked in browser history when URL is readable
- Switching tabs no longer reloads the page
- New tab page overlays iframe instead of destroying it

### Changed
- Browser navigation refactored: `loadUrlInTab()` reuses existing iframe, `showIframe()` manages visibility
- `goBack()`/`goForward()` properly update state and load correct URL from history stack

## [12.0.3950] - 2026-08-31

### Added
- HTML files open in Notepad by default (as source code)
- "Open with Browser" option in context menu for HTML files
- Browser displays local file path in URL bar when opening local files
- Security restrictions for local HTML: ES modules, import(), export, and module-type scripts are stripped
- Ctrl+F find on page with find bar (next/prev navigation)
- Homepage button (⌂) in navigation bar
- Tab context menu (right-click): Close, Close Others, Close to Right, Duplicate, Reload
- Ctrl+Shift+T to reopen closed tabs (up to 20 remembered)
- History panel (Ctrl+H) with timestamps, grouped by date, clear button
- Zoom controls (Ctrl+/-, Ctrl+0 to reset) with zoom percentage in status bar
- Downloads panel (Ctrl+J or ⬇ button) tracking downloaded files
- ⬇ downloads button in navigation bar

### Changed
- Browser shortcuts switched to Alt+ prefix to avoid Chrome conflicts (Alt+T, Alt+W, Alt+R, Alt+F, Alt+H, Alt+J, Alt+Q, Alt+/-, Alt+0)

## [12.0.3940] - 2026-08-31

### Removed
- Sandbox and Direct rendering modes from Browser (CORS limitations made them non-functional)
- CORS proxy code, API key storage, and 🔑 button from Browser
- `FileSystem` import from Browser (no longer needed)

### Fixed
- Iframe links no longer navigate the entire OS (added `sandbox` attribute to prevent top-level navigation)

### Changed
- Browser simplified to iframe-only mode
- Removed mode toggle button from status bar

## [12.0.3930] - 2026-08-30

### Added
- Browser app with tabbed interface, address bar, and navigation controls
- Three rendering modes: Iframe (safe), Sandboxed (isolated), Direct (host context)
- New tab page with clock, search bar, and quick links
- CORS proxy fallback for fetching external websites
- Keyboard shortcuts: Ctrl+T (new tab), Ctrl+W (close tab), Ctrl+L (focus URL), Ctrl+R (refresh)
- Mode toggle button with security warnings for Direct mode

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
