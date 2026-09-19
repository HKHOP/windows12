# Changelog

All notable changes to Windows 12 will be documented in this file.

Each version may only use the following sections: **Added**, **Removed**, **Changed**, **Fixed**. Never modify older entries.

## [12.0.4945] - 2026-09-19

### Added
- SDK v1.2.0 — game & real-time support, grown out of building Minecraft Classic:
  - `PointerLock` (`app.pointerLock`): `request(element, appId?)` with app-window containment validation, honest `PERMISSION_DENIED` mapping for the browser's re-lock cooldown (Esc → too-fast re-request), `exit/isLocked/onChange` — and the OS integration apps can't do themselves: the virtual touchpad cursor is parked while a pointer is locked and restored on unlock
  - `Input` (`app.input`): `keyState(element, {prevent})` raw game key-state controller — `isDown/onKeyDown/onKeyUp/clear/dispose`, scoped to your element, auto-clears on blur and self-disposes when the element is removed from the DOM
  - `Audio` (`app.audio`): shared lazy `AudioContext` with a master gain tracking the Settings master volume, gesture `unlock()`, `beep()` one-shot synth helper, `suspend/state`, and auto-suspend when the browser tab is hidden
  - Window lifecycle subscriptions: `WindowManager.onClosed/onMinimizeState/onFocusChanged` (backed by new additive DOM events `window-closed`, `window-minimized`, `window-restored`, `window-focus-changed` fired by the internal window manager — the shell's single-slot `setOn*` handlers are untouched), also exposed on the `Events` bus
  - True fullscreen: `WindowManager.setFullscreen/exitFullscreen/isFullscreen` (browser fullscreen of the window element, refusal mapped to `UNSUPPORTED`)
  - Per-window close hooks: `Lifecycle.onWindowClose/offWindowClose` — veto one window's close independently of the app-level `onClose` handler
  - `createApp()` contexts gain `window.onClosed/onMinimizeState/onFocusChanged/setFullscreen/...`, `pointerLock`, `input`, `audio`, `lifecycle.onWindowClose`; `js/sdk/types.d.ts` and the guide (§26 + new §28 "Games & real-time input") updated; smoke test extended to 102 checks; `sw.js` precache now includes `media.js` (previously missed) and the three new SDK files

## [12.0.4944] - 2026-09-19

### Added
- Minecraft Classic store app: real-time 3D voxel sandbox built on a handcrafted WebGL engine — procedurally generated terrain (hills, lakes, beaches, trees), chunk-based meshing with face culling, fog and a procedural texture atlas (no external assets)
- Minecraft Classic gameplay: mine and place 10 block types via raycast picking with wireframe highlight, classic hotbar (1-0 keys, mouse wheel or click), isometric block icons, full physics (gravity, jumping, sneaking, swimming), dig/place sound effects
- Minecraft Classic persistence: worlds (seed + block edits + player position) auto-save to `/system/programs data/minecraft/` every 20 s, on pause and on window close; "New World" regenerates from a fresh seed
- Minecraft Classic touch controls: virtual joystick, drag-to-look, tap to mine, long-press to place, jump button

## [12.0.4943] - 2026-09-18

### Added
- Virtual keyboard Generic mode: full-keyboard utility row (Esc, Ctrl, Alt, Tab, arrows) on every view; Ctrl/Alt are one-shot modifiers (tap Ctrl, then C) that ride along as real `ctrlKey`/`altKey` flags on the next key event, Tab inserts `\t` in text fields
- Settings > System > Touch keyboard now has a Keyboard mode selector: Generic (full keyboard) vs Simple (phone-style without Ctrl/Alt/Tab), backed by the `touchKeyboardMode` config (auto: Simple on touch hardware, Generic on desktops)

### Changed
- Virtual keyboard renders above the virtual touchpad cursor (z-index `1000002`) instead of underneath it

### Fixed
- Virtual keyboard keys, drag bar and resize grip are finger-only on touch hardware: the virtual touchpad cursor's synthesized mouse events no longer press keys, and finger taps on the keyboard pass through natively even while touchpad mode is on (touch.js exemption)

## [12.0.4942] - 2026-09-18

### Added
- CopilotBB agent `zip` tool: `{"files": ["notes.txt", "pics/"], "out": "backup.zip"}` compresses workspace files/folders (folders recurse, text + binary) into a `.zip` via the OS zip engine — documented in the agent system prompt and settings tool list
- Ex/port export tree is now rooted at Local Disk (C:) with the `users/default` chain auto-expanded, so the whole drive is browsable instead of just home

### Fixed
- Ex/port downloads of blob-backed files (e.g. `.zip` archives, imported media) failed with "Downloaded 0 file(s)" because `readFile()` returns null for them; downloads now read blob data via object URLs, wrap raw text correctly, and report per-file failures instead of silently skipping

## [12.0.4941] - 2026-09-18

### Added
- File Explorer touch multi-select: new toolbar Select button toggles a selection mode where tapping items toggles them instead of single-selecting; every item shows a selection checkbox (always visible on touch devices, mode-only on desktop); active Select button opens a menu with Select all / Clear selection / Invert selection / Exit selection mode
- File Explorer long-press to select on touch: holding an item enters selection mode and toggles it (with haptic feedback); long-pressing an already-selected item still opens its full context menu so Cut/Copy/Delete stay reachable without a keyboard

### Fixed
- Long-pressing File Explorer items/background on touch no longer shows the generic disabled-action touch menu; the real File Explorer context menus (Cut/Copy/Paste/Delete/New folder) appear instead

## [12.0.4940] - 2026-09-18

### Added
- CopilotBB user messages now feature Copy and Revert buttons under them (Revert truncates chat history back to that message and restores its content into the composer textarea)
- CopilotBB settings panel now includes a toggle to turn off turn limits (allowing unlimited agent tool execution loops)

### Removed
- Removed the `powershell` tool from CopilotBB agent environment

### Changed
- Updated CopilotBB system prompt (`TOOLS_DOC`) instructing the model that PowerShell is unavailable and mandating standard CMD batch alternatives (`dir`, `type`, `echo`, etc.) instead of PowerShell cmdlets

### Fixed
- Fixed a syntax error (`Unexpected identifier 'toolcall'`) in CopilotBB caused by unescaped backticks in template literal `TOOLS_DOC`

## [12.0.4939] - 2026-09-17

### Added
- Global input and textarea focus styling (`css/main.css`): distinct accent-colored border ring (`var(--accent-color)`) and subtle glow when text fields are selected/focused or active via the virtual keyboard (`.vk-focused`)

### Fixed
- Textboxes failing to show active selection/focus state when typing due to read-only suppression by the virtual keyboard; `.vk-focused` class and global focus rules ensure text fields always glow when selected and active

## [12.0.4938] - 2026-09-17

### Added
- Touch keyboard is draggable (top bar, double-click re-docks) and resizable (corner grip scales width + key height), geometry persisted in `touchKeyboardBounds`; hold-to-repeat now covers letters with physical semantics (repeated `keydown` + edits, single `keyup` on release), and key events fall back to the focused element/body when no text field is attached — so the on-screen keyboard fully drives games like Riftbound Runner
- `touchKeyboardBounds: null` config default; Settings tip and §27 document dragging, resizing, and game input

### Fixed
- Riftbound Runner's global `keydown`/`keyup` listeners leaked after close and `preventDefault`ed W/A/S/D everywhere (killing WASD in every other app); handlers are now scoped to a connected + focused game window, held keys clear on `blur` and level reset

## [12.0.4937] - 2026-09-17

### Added
- Custom touch keyboard (`js/modules/virtualKeyboard.js` + `css/virtualKeyboard.css`): on-screen QWERTY replacing the native iOS/Android keyboard — `abc`/`123`/`#+=` layouts, one-shot Shift + double-tap Caps Lock, hold-to-repeat Backspace/Space/arrows, Esc key, light/dark themes, compact phone sizing
- Honest input pipeline: every press dispatches real bubbling `keydown`/`keyup` (central shortcut registry and games see touch input; `preventDefault()` vetoes insertion) then edits via `setRangeText` + `InputEvent`; Enter submits forms / newlines in textareas; `touch-keyboard-visibility` window event for apps
- Native suppression (`readonly` + `inputmode="none"`, restored on blur), tray summon button any time, Settings > System > Touch keyboard page (master enable, auto-show on textbox focus, tray toggle, live Try-it field) backed by `touchKeyboardEnabled`/`touchKeyboardAutoShow`/`touchKeyboardTrayButton` config (auto-on for touch devices, opt-in for desktops); documented as §27
- Smoke tests grow 72 → 79 checks (init, gating, layouts, show/hide/toggle, focusin auto-show)

## [12.0.4936] - 2026-09-17

### Added
- Windows 12 SDK v1.1.0: full window geometry/state surface — `getBounds`/`setBounds` (+`getPosition`/`setPosition`, `getSize`/`setSize`, `center`, `getDesktopArea`), `isMaximized`/`maximize`/`unmaximize`, `isFocused`/`getFocused`, `isResizable`/`setResizable` (with `resizable` create option and `.locked` handle-hiding CSS), `isDragging`/`isResizing` plus `onDragState`/`onResizeState`/`onBoundsChanged` subscriptions, `setTitle`/`setMinSize`; every method mirrored on the bound `app.window` context (which also gains the previously missing `isMinimized`)
- New `microphone` + `camera` permissions (catalog, consent, revocation, `build-registry.js` validation) and new `Media` namespace (`app.media.microphone()/camera()/supported()` — OS grant checked before the browser prompt, honest `PERMISSION_DENIED`/`UNSUPPORTED` errors); Voice Recorder and QR Studio declare and use them
- `test/sdk.smoke.mjs` grows 58 → 72 checks covering the new surface (all passing); `types.d.ts` and §26 updated for v1.1.0

## [12.0.4935] - 2026-09-17

### Added
- Eleven new Microsoft Store apps (all SDK-built, vanilla, offline-first): To-Do Tasks (lists, priorities, due dates, background reminders, `.todo` association), Sticky Notes (one window per note, colors, autosave hub, `.note`), Markdown Studio (live split preview, toolbar, Ctrl+S, HTML export, `.md`/`.markdown`), Voice Recorder (mic memos with level meter, rename/playback), Archiver (real `.zip` compress/extract on the virtual FS via the OS zip engine, downloads, `.zip` association), Weather (Open-Meteo current + 24h forecast, city search, background severe-weather alerts), Pomodoro Focus (timestamp-based phases that survive backgrounding, focus stats), Unit Converter (7 categories incl. offline currency, history, clipboard copy), Password Vault (AES-GCM + PBKDF2 offline encryption, auto-lock, generator), QR Studio (generate via QR API, camera/upload scan via BarcodeDetector, history), 2048 (keyboard/touch, best-score persistence, win/lose dialogs)

## [12.0.4934] - 2026-09-17

### Added
- Windows 12 SDK v1.0.0 (`js/sdk/`, 18 modules + `types.d.ts`): stable facade over all internal systems — `createApp()` bound context (scoped files, attributed notifications, owned shortcuts), WindowManager/FileSystem/Notifications/Dialogs/Keyboard/Clipboard/Apps/Settings/Shell/FileAssociations/System/Events/Permissions/Lifecycle/Background namespaces, `SDKError` codes, `SDK_VERSION`; sampleApp rewritten SDK-only with filesystem+notifications permissions; §26 SDK chapter in APP_DEVELOPMENT_GUIDE.md; `test/sdk.smoke.mjs` (58 checks, all passing)

## [12.0.4933] - 2026-09-17

### Added
- File Explorer navigation batch: multi-tab windows (strip, +/×, Ctrl+T, per-tab history + selection, desktop-icon opens land in a new tab), clickable breadcrumb bar with edit-mode address field (click empty space or Ctrl+L), recursive search-within-folders with location subtitles and full action support, preview pane toggle (image thumbnails, text head, folder counts, details), Quick Access pins (persisted, sidebar section, pin/unpin menus)

## [12.0.4932] - 2026-09-17

### Added
- File Explorer file-ops batch, part 1: real transfer dialog (per-file progress + Cancel) driving chunked copy/move paste with folder merge and blob-aware copies; drag-and-drop now really moves (multi-selection, self-drop guards, background drop); inline rename (F2, extension-aware selection, Escape cancels); sort by Name/Date/Size/Type with direction + Group-by-Type headers, persisted; ZIP support via new `js/modules/zip.js` (hand-rolled container, deflate through platform streams, CRC-verified) — Compress to ZIP from any selection, Extract All on double-click or menu with traversal-safe paths; Ctrl+Shift+N new folder

### Fixed
- Drag-and-drop onto folders silently no-opping (it called rename instead of move); copying blob-backed media producing empty files; drag payload documented for legacy Notepad text-drop consumers

## [12.0.4931] - 2026-09-17

### Added
- Real Open With UX in `fileAssociations.js`: two-tier candidates (manifest handlers authoritative, built-in Notepad/Photos/Terminal/Browser viewers as fallbacks), persisted per-extension defaults ("Always use this app" under `/system/programs data/fileAssociations/`), and the full dialog — recommended/default badges, More-apps expander, single/double-click, OK/Cancel; `openDefault`/`openWith`/`getCandidates`/`setDefault` API documented in §13
- File Explorer registers its viewers at boot, double-click/Open route through the resolved default, and Open With… opens the dialog (recents tracked on success)

### Fixed
- Open With… no longer relies on the fragile `window.event` hack or a hardcoded app list — candidates, names, and icons resolve live from registrations and app metadata

## [12.0.4930] - 2026-09-17

### Added
- App crash recovery (`js/modules/crashMonitor.js`): uncaught exceptions and launch failures attributed per app via script filename/stack, classic *"<App> stopped responding"* dialog (Microsoft Windows title, Restart / Close / View-details with message + stack, one dialog per app per 5s), Task Manager Processes gains a Status column (Running / Not responding in red) plus a Restart action for crashed apps, documented as §25 in APP_DEVELOPMENT_GUIDE.md

### Changed
- Taskbar and Store launch paths wrap `launch()` so a throwing app opens recovery instead of dying silently; recovery Restart force-closes (bypassing close handlers a wedged app can't answer) and relaunches

## [12.0.4929] - 2026-09-17

### Added
- App permissions system (`js/modules/permissions.js`): manifests declare `"permissions"` (`filesystem`, `notifications`, `network`, `clipboard`, `background` — validated by `build-registry.js`, published to the registry; `background` equals the legacy flag); Store detail pages show a Permissions section, installs with declarations ask consent first, Settings > Apps has per-app revoke toggles, grants persist per uuid and wipe on uninstall, builtins always granted
- `Permissions` runtime API (`getCatalog`, `iconFor`, `getDeclared`, `isGranted`, `setGranted`, `requestInstallConsent`, `clearGrants`), documented as §24 in APP_DEVELOPMENT_GUIDE.md
- Declared permission manifests for nine store apps (Discord/Subway Surfers: network; CopilotButBetter: network/filesystem/notifications/clipboard; Office apps, Music Spark, VS Code, Ex/port: filesystem)

### Changed
- Notifications are now permission-gated: a store app that declares `notifications` and has it revoked is dropped at the send choke point (undeclared senders fail open for back-compat)

## [12.0.4928] - 2026-09-17

### Added
- Real virtual desktops (`js/modules/virtualDesktops.js` + `css/taskview.css`): Desktop 1/2/…, per-desktop open windows, add (capped at 10) / rename (dialog + double-click) / remove (windows merge into a neighbor), Task View panel (WIN+TAB, taskbar button) with per-desktop window chips, click-to-jump, and ‹ › window movers
- Virtual-desktop shortcuts: WIN+CTRL+LEFT/RIGHT switch, WIN+CTRL+D new desktop, WIN+SHIFT+LEFT/RIGHT throw the focused window across desktops (follows it)
- Per-desktop wallpapers: each desktop can override the global style (Settings > System > Multitasking), applied on switch and restored on leave
- Window title-bar and taskbar minimize paths now go through `WindowManager.setMinimized/isMinimized` so minimize state stays distinct from off-desktop hiding

### Changed
- Taskbar only reflects the active desktop: running indicators, unpinned buttons, click-to-focus/restore, and Close-window all scope to current-desktop windows; clicking an app that runs solely elsewhere opens a fresh window here

## [12.0.4927] - 2026-09-17

### Added
- Central keyboard-shortcut registry (`js/modules/keyboard.js`): `Keyboard.register('CTRL+SHIFT+P' | 'WIN+V' | 'ALT+F4', callback)` with exact-modifier matching, global vs window-`scope`, `owner` bulk cleanup (`unregisterAll`), `allowInInputs` guard, pass-through by returning `false` (layered Escape), and `list()` introspection; documented as §23 in APP_DEVELOPMENT_GUIDE.md
- Built-in `ALT+F4` closes the focused window through close handlers (apps can veto on unsaved changes)

### Changed
- System shortcuts now run through the registry: PrintScreen screenshot, Win+V / Ctrl+Shift+V clipboard, layered Escape cascade (context menu → notification center → clipboard flyout); `ContextMenu` gains an `isOpen()` export
- Notepad (Ctrl+S/F/H/A/Z/Y) and File Explorer (Ctrl+C/X/V/A, Delete) migrated to scoped `Keyboard.register` calls — window-close cleanup is automatic, matching is CapsLock-safe

## [12.0.4926] - 2026-09-17

### Added
- Clipboard Manager system module (`js/modules/clipboardManager.js` + `css/clipboard.css`): Win+V (Meta+V, Ctrl+Shift+V fallback) flyout with clipboard history, pin/unpin, per-item delete, clear-unpinned (pinned survive), search filter, and click-to-paste (writes back to the system clipboard and inserts into the focused field); tray paste icon opens it too
- Clipboard capture: copy/cut events inside the OS are recorded automatically; Sync button imports the live system clipboard (text + images); polling while the `clipboard-read` permission is granted
- Clipboard persistence under `/system/programs data/clipboard/history.json` (50 items, images downscaled to fit 2MB each, storage guard evicts oldest unpinned items first)

## [12.0.4925] - 2026-09-17

### Fixed
- iPad Safari white letterboxing in Browser, local HTML preview, and Discord: column-flex iframes with `height:auto` fell back to the 300x150 intrinsic ratio on WebKit so pages rendered at iPad aspect with white strips — frames now fill with `flex:1 1 0%` + explicit `100%` width/height, and the Browser's 100% zoom state restores `100%` instead of clearing to the broken fallback
- Local HTML previews now inject `shrink-to-fit=no` in the viewport meta so iPad Safari doesn't auto-shrink framed pages to the device aspect

## [12.0.4924] - 2026-09-16

### Added
- Clock and Calendar can now run in the background (`background` manifest flag): Clock keeps timers/stopwatch running windowless and fires a finish toast, both offer a Background button, and both resume headless at boot
- Task Manager Startup tab now lists real boot entries for every background-capable app with working Enable/Disable toggles (disabling stops a running headless app at once and excludes it from boot)
- BackgroundApps autostart API: `isAutostartEnabled`, `setAutostartEnabled`, `getStartupEntries`; boot honors per-app disables

## [12.0.4923] - 2026-09-16

### Added
- Background apps API (`js/modules/backgroundApps.js`): manifest-declared (`background`/`service`) headless execution with `requestBackground`, `bringToForeground`, `startService`, `stopService`, optional `onBackground`/`onForeground`/`onShutdown` app hooks, persisted auto-start at boot (builtin services always start), and a `background-apps-changed` event; Task Manager lists headless apps as `<Name> (Background)` with working End task
- Services: manifest `"service": true` apps are hidden from Start, Search and taskbar (no launch or pin) and can only be installed/uninstalled via the Store or Settings > Apps; Store shows Uninstall instead of Open for them

### Changed
- `build-registry.js` validates and publishes the new `background`/`service` manifest flags (`service` implies `background`)

## [12.0.4922] - 2026-09-16

### Removed
- Discord app toolbar and status footer: the window is now just the client view with the embed-block notice (which keeps its own Open in Browser action)

## [12.0.4921] - 2026-09-16

### Changed
- Discord and Subway Surfers app icons replaced with the official artwork

## [12.0.4920] - 2026-09-16

### Added
- Discord Store app: real-account Discord web client (chat, DMs, voice) embedded via discord.com with Reload and Open in Browser actions plus a dismissible notice explaining the embed block and its fallbacks

## [12.0.4919] - 2026-09-16

### Added
- Browser touchpad cover pane: on touch devices with virtual touchpad mode on, a transparent pane sits over same-origin pages (local HTML, same-origin sites) so every finger touch becomes a trackpad gesture for the virtual cursor and no native taps reach the page; cross-origin sites stay uncovered so direct finger taps keep working where the virtual cursor cannot click

### Fixed
- Virtual-cursor dispatch and hover-shape detection now pierce the Browser touchpad pane and land on the page beneath it instead of the pane itself

## [12.0.4918] - 2026-09-16

### Fixed
- Cursor size setting now resizes the virtual touchpad cursor too: the virtual renderer fell back to 22px for custom slider values (16–64px) instead of resolving them like the real mouse
- Hover hand cursor now appears over the whole button, not just its edges: the cursor theme stylesheet only matched interactive elements themselves, so icons/labels inside them showed an arrow — it now covers descendants as well
- Browser and local HTML previews no longer show big white gaps around pages on iPad Safari (WebKit): the page frame fills via flex layout instead of nested percentage heights, the 100% zoom state clears its compositing transform, and the window-body clipping no longer depends on `:has()` support
- Maximized and snapped windows now sit flush against the taskbar on every taskbar edge: window geometry is computed in desktop-container space (origin 0,0) with pointer coordinates mapped through the live desktop rect and body zoom, instead of mixing viewport offsets into style positions; drag/resize deltas are zoom-corrected and saved bounds use container coordinates

## [12.0.4917] - 2026-09-15

### Fixed
- Subway Surfers store game: updated embed URL to a working version and ensured the game icon appears correctly in the Start menu, taskbar, and Microsoft Store

## [12.0.4916] - 2026-09-15

### Added
- File Explorer address bar edit mode: focusing it swaps the friendly breadcrumbs for the raw Windows-style path (`C:\users\...`) so it can be copied or edited; Enter navigates (accepting `C:\`, `C:/`, `/` forms and `This PC`), Escape/blur reverts, and address-bar keys no longer leak into global shortcuts

### Fixed
- Opening a folder from the desktop now navigates File Explorer to that folder (reusing the latest window or launching one at the path) instead of just bringing up whatever it last showed

## [12.0.4915] - 2026-09-15

### Added
- Animated close for the Start menu and Search panel (0.15s fade-and-slide matching each panel's open direction, including all taskbar positions) via a new dependency-free Flyout helper (`js/modules/flyout.js`); StartMenu also gains a public show/hide/toggle/isOpen API

### Changed
- Start menu and Search are now mutually exclusive: opening Search closes the Start menu and opening the Start menu closes Search; clicking the Start button mid-close reopens instead of swallowing the click

## [12.0.4914] - 2026-09-15

### Added
- Microsoft Store Library tab: lists every installed Store app with Open and Uninstall actions plus an empty state; detail pages and cards now show Open for installed apps
- Microsoft Store search: typing in the search box and pressing Enter shows a results view across names, categories, and descriptions

### Changed
- Microsoft Store Apps tab now lists only non-game apps with All/Category filter chips; Gaming tab lists only games behind its own featured-game banner
- Microsoft Store Home rebuilt around a big featured-app hero banner (top-rated, with Get/Open and Details actions), Popular Apps and Popular Games rows sorted by rating, and a Browse-by-category tile grid that deep-links into filtered listings; sidebar tabs now actually switch views instead of always resetting to Home
- Store detail back button returns to the tab you came from, ratings use an SVG star instead of an emoji, and installing re-renders the current view so states stay in sync

## [12.0.4913] - 2026-09-15

### Added
- ShellIcons system icon library (`js/modules/uiIcons.js`, the OS's shell32.dll): centralized custom SVG set with `action`, `folder`, `file`, `sidebar`, `setting`, and `get` helpers, usable by any app via `import UIIcons from '../../modules/uiIcons.js'` or the `window.ShellIcons` / `window.UIIcons` globals; documented in APP_DEVELOPMENT_GUIDE §15 (later sections renumbered)

### Changed
- Replaced every emoji icon across Settings (sidebar nav, System cards, Display/Sound/Power/Touchpad/Theme/Update pages, toasts), Desktop (context menus, icon grid, Recycle Bin), and File Explorer (sidebar, file/folder grid, context menus, Properties, photo viewer) with custom ShellIcons SVGs, including shared surfaces (taskbar/Start/touch context menus, Start power menu, search results, Save dialog, recommended items)

## [12.0.4912] - 2026-09-15

### Changed
- Personalization settings > Mouse Cursor: replaced the 3 preset size buttons with a precise range slider (16px to 64px) with live preview and smooth persistent sizing for both the real mouse and virtual touchpad cursor

## [12.0.4911] - 2026-09-15

### Fixed
- Wired up RiftboundRunner icon in AppIcons module so the game icon renders correctly across the Microsoft Store, taskbar, start menu, and search

## [12.0.4910] - 2026-09-15

### Added
- RiftboundRunner game wired up to be downloadable from the Microsoft Store (store metadata, screenshots, registry integration, and service worker precache)

## [12.0.4909] - 2026-09-15

### Fixed
- Desktop right-click Personalize and Display settings now deep-link into Settings (Personalization page and System > Display subpage, including retargeting an already-open window) instead of always opening the Settings home page; taskbar Taskbar settings entry also opens Personalization

## [12.0.4908] - 2026-09-15

### Changed
- Minesweeper UI redesign: removed the inner window card wrapper so the game layout fills the app window natively and cleanly; redesigned the app icon to a classic textured tile with a mine and red indicator

## [12.0.4907] - 2026-09-15

### Added
- Minesweeper game app available for download in the Microsoft Store: Windows 11 style UI, Beginner/Intermediate/Expert difficulties, first-click safety guarantee, flag counter, timer, animated smiley face status button, WebAudio sound effects, and persistent high scores via FileSystem

## [12.0.4906] - 2026-09-15

### Added
- Desktop multi-select: drag a blue rubber-band box over empty desktop to select icons by intersection, Ctrl+click to toggle, Shift+click for range select, Ctrl+A to select all, Delete to delete the selection, Esc to clear; dragging one icon of a multi-selection moves the whole group, double-clicking or right-clicking a multi-selection opens/deletes all of them

## [12.0.4905] - 2026-09-15

### Fixed
- Hands and Classic styles ignoring the chosen cursor color: the Settings style and size preview cards were hardcoded to the default white theme, so picking a color seemingly did nothing for them. Style previews now render in the active theme color and size dots follow it too (verified live in headless Edge: ocean theme flows into all three style previews, the virtual cursor, and the real-mouse stylesheet). The underlying fills were already correct — this was purely the previews not reflecting them

## [12.0.4904] - 2026-09-15

### Changed
- Pointer packs rebuilt from the requested cursor set (credits kept in code per license: Radhika Paghdal CC-BY arrow, halfmage/majesticons MIT hand, UXAspects Apache arrow, Denali MIT hand filled in): Default gets the outline arrow (filled for dark-background visibility) and proper link hand, Classic gets the notched arrow and gloved hand with hourglass busy, Hands uses the hand pointer everywhere; new Working state (arrow/hand plus a small spinning ring, wired to the `progress` cursor) and themed hotspots throughout, all verified in screenshots at 200px and real 22px. Note: the SVGRepo illustration pick was tested but renders as an unreadable blob at cursor size, so Hands uses the Denali hand instead

## [12.0.4903] - 2026-09-15

### Changed
- Cursor set restyled toward the Windows 11 concept look (white/black with blue accents): new side-profile pointing hand with real finger separation (tall index, curled-finger mass, branching thumb), blue segmented tail busy ring that spins on the virtual cursor, and a red ring-and-slash unavailable cursor; applied across all pointer packs, both mice, and the Settings previews, with hotspots on the true fingertip — all artwork hand-drawn originals, verified in headless screenshots

## [12.0.4902] - 2026-09-15

### Fixed
- Pointer hand still looking off: replaced the single-path glove with a Windows 10/11-style hand composited from separate finger shapes — tall index finger, middle finger peeking behind it with a real gap, angled thumb, rounded palm whose top edge forms the knuckle line — shared by all packs, both mice, and the Settings preview, with the hotspot on the true fingertip; iterated in headless Edge screenshots until clean

## [12.0.4901] - 2026-09-15

### Fixed
- Pointer hand looking wrong, especially the fingers: the old glove was stitched from mismatched arc segments that rendered as rectangular notches. Redrew it as one clean silhouette — straight index finger, two knuckle scallops, rounded thumb stub, tapered wrist — shared by all packs (plain, cuffed, real-mouse, and settings preview) with the click hotspot moved to the true fingertip, and verified by rendering old vs new side-by-side in headless Edge before shipping

## [12.0.4900] - 2026-09-15

### Added
- Pointer style packs in Settings > Personalization > Mouse Cursor: Modern Arrow (the current default), Classic (Windows-authentic arrow with notched tail, gloved link hand with cuff, classic hourglass busy cursor), and Hands (a pointing hand as the pointer, cuffed glove for links, open palm for move). Applies to both the real mouse and the virtual touchpad cursor with per-style click hotspots, persisted via the new `cursorStyle` SystemConfig key and applied at boot

## [12.0.4899] - 2026-09-15

### Added
- Repositionable taskbar: Bottom (default), Top, Left, or Right via Settings > Personalization > Taskbar Position, persisted in SystemConfig and applied at boot. Side taskbars stack buttons vertically with a scrollable app column, tray and clock docked at the far end, and running/active indicators moved to the desktop-facing edge; desktop area, Start menu, search panel, new-window centering, and window snap zones all follow the taskbar edge

## [12.0.4898] - 2026-09-15

### Fixed
- Virtual cursor pointer-finger (and clicks) landing offset from the arrow tip, most visible on icons: hit-testing and click dispatch used the cursor box's top-left while the tip renders several pixels away, and the cursor lived inside the zoomed `body` so page zoom displaced the visual from the logic point on iPad. The cursor, touch indicator, and hint now live directly under `<html>` (outside body zoom, 1:1 client pixels, no scale division) and each shape carries an exact hotspot (arrow tip, fingertip, I-beam center) that JS anchors precisely on the cursor point — hand shapes and taps now fire exactly where the tip points, at any cursor size, with instant re-anchor on theme/size change

## [12.0.4897] - 2026-09-15

### Fixed
- Local HTML files still showing a big white strip on the right and below on iPad: iPad Safari lays framed pages without a viewport meta out at a 980px default width, so the page canvas overflowed the frame — the preview now injects `<meta name="viewport" content="width=device-width, initial-scale=1">` when the file has none, and Words exports include the viewport meta at the source
- Virtual touchpad cursor could not click, tap, or scroll inside websites in iframes or local HTML previews: synthesized events dispatched on the `<iframe>` element never reached the inner page. Added an `iframePointer` bridge that re-dispatches pointer/mouse/wheel/click/dblclick/contextmenu events inside same-origin frames with translated coordinates (nested frames included), mirrors inner cursor styles (hand over links, I-beam over text), focuses fields inside pages, and for sealed cross-origin sites focuses the frame plus shows a one-time hint; a finger landing directly on a page now passes through natively (cursor jumps to the finger, no double-firing) so even isolated sites stay fully usable by direct tap

## [12.0.4896] - 2026-09-15

### Fixed
- Browser / local HTML preview showing a big white area to the right and below the page on iPad Safari: iframes are now block-level, flex-shrink-proof (`min-width/min-height: 0`, `max-width/max-height: 100%`) so page content can no longer stretch them past the window, the browser layout clips instead of scrolling outer blank gutters, background tabs' iframes are hidden on tab switch instead of stacking up as white overflow, and the local-HTML preview header/footer no longer squeeze the page frame

## [12.0.4895] - 2026-09-15

### Added
- Mouse cursor personalization (Settings > Personalization > Mouse Cursor): 9 color themes (Arctic White, Midnight Black, Ocean Blue, Forest Green, Sunset Orange, Royal Purple, Crimson Red, Bubblegum Pink, Golden) and 3 sizes (Normal, Large, Extra large) applied to both the real mouse (themed SVG data-URL cursors preserving arrow/hand/I-beam per context, resize handles untouched) and the virtual touchpad cursor (themed shapes), with a hover-to-preview test area; persisted via new `cursorTheme` / `cursorSize` SystemConfig keys and applied at boot

## [12.0.4894] - 2026-09-15

### Fixed
- Desktop icon grid alignment and Recycle Bin spawning: unified placement and drag-snap grid math, added an automatic self-healing `normalizeLayout()` pass on every render that clamps positions into visible bounds, resolves overlaps/duplicates, and correctly assigns the Recycle Bin its slot on first boot (no more manual re-adjustments)

## [12.0.4893] - 2026-09-15

### Changed
- Settings Storage tab now calculates real usage from the virtual filesystem: per-folder sizes and file counts for Documents, Downloads, Pictures, Music, Videos, Desktop, Apps & data and System, used-vs-budget bar from the actual localStorage footprint, IndexedDB media bytes, plus the live browser on-disk estimate (replaces the hardcoded 45% demo numbers); `FileSystem.STORAGE_BUDGET` is now exported for UI use

## [12.0.4892] - 2026-09-15

### Fixed
- Settings touchpad toggle not applying until leaving and re-entering the page: the toggle handler re-invoked the section renderer which appends via `innerHTML +=`, duplicating the block and killing the live toggle listeners; it now does a clean page re-render instead

## [12.0.4891] - 2026-09-15

### Fixed
- Virtual touchpad mode no longer lets apps use the finger's touch point: native touch and touch-pointer events are swallowed in the capture phase while touchpad mode is on, Paint ignores raw canvas touches in touchpad mode, and the virtual cursor now synthesizes pointer events (pointermove/pointerdown/pointerup) alongside mouse events so pointer-based apps follow the virtual mouse instead of the finger

## [12.0.4890] - 2026-09-15

### Fixed
- Virtual touchpad double-tap-hold to hold click and drag: the second tap now presses the left button down immediately (time + cursor based, so the finger can land anywhere), movement drags with the button held for moving windows / selecting text, quick release completes a double-click, and long hold without moving releases with a click; long-press right-click no longer fires during a hold-drag

## [12.0.4889] - 2026-09-15

### Added
- Cursor API (`js/modules/cursor.js`): `Cursor.set()` / `reset()` / `get()` changes the pointer for both the real and virtual mouse at once; virtual touchpad cursor now auto-mirrors the native cursor (pointing hand on links, buttons and File Explorer items, I-beam on text fields)

## [12.0.4888] - 2026-09-15

### Added
- Virtual touchpad mode for touch devices (Settings > System > Touchpad): swipe to move a virtual mouse, single tap for click, double tap for double-click, tap-hold-drag for dragging, two-finger tap or touch-and-hold for right-click, two-finger swipe for scroll, plus adjustable cursor speed

## [12.0.4887] - 2026-09-14

### Added
- Solar Spacer: Unique procedural textures for every celestial body type — Spiral Galaxies with rotating arms, Stars/Suns with pulsing plasma coronae, Gas Giants with horizontal atmospheric bands, Jagged Asteroids, and Rocky Planets

## [12.0.4886] - 2026-09-14

### Added
- Solar Spacer: Collision explosion particle bursts when planets swallow each other, gravitational tidal plasma stream particles between massive objects/galaxies, audio sound effects on collisions, and Galaxy Collision preset

## [12.0.4885] - 2026-09-14

### Added
- Solar Spacer: Grab & Throw tool now flings bodies with calculated release velocity vectors, and spawning preview features a real-time future trajectory bending ray that visualizes orbit curves around gravitational fields

## [12.0.4884] - 2026-09-14

### Fixed
- Solar Spacer canvas sizing when resizing the app window now uses ResizeObserver to smoothly adapt without distorting or breaking the simulation viewport

## [12.0.4883] - 2026-09-14

### Changed
- Solar Spacer completely redesigned with 3D-shaded spherical planets, atmospheric glows, radial lighting, dynamic starfield parallax background, live FPS counter, and a sleek glassmorphic acrylic UI

## [12.0.4882] - 2026-09-14

### Added
- Solar Spacer Sandbox: interactive drag-to-launch velocity vectors, custom planet mass/color picker, interactive "Swing / Gravity Well" attractor tool, planet merging/collision physics, and sound effects using Web Audio API

## [12.0.4881] - 2026-09-14

### Added
- Solar Spacer app — an interactive orbital gravity and planet simulation sandbox to learn how gravity, velocity, mass, and orbital mechanics keep planets and moons in motion (installable from the Microsoft Store)

## [12.0.4880] - 2026-09-14

### Fixed
- Microsoft Store app detail view no longer doubles the sidebar when clicking an app page

## [12.0.4879] - 2026-09-13

### Changed
- CopilotBB 📎 button now opens a virtual filesystem browser (sidebar places, folder navigation, multi-select up to 5 files) and copies the chosen files into the chat workspace instead of the native OS file picker

## [12.0.4878] - 2026-09-13

### Added
- CopilotBB model dropdown with live per-provider lists — Zen catalog fetched from opencode.ai/zen/v1/models (grouped by family), Gemini models fetched with your key (generate-capable only), with refresh button, loading/error status, and a Custom id fallback when a saved id isn't listed or fetching fails

### Changed
- CopilotBB manual model textbox replaced by the live dropdown (Default option = per-provider default, Custom id preserved)

## [12.0.4877] - 2026-09-13

### Added
- CopilotBB OpenCode Zen provider — paste a Zen API key in Settings and pick the Zen provider; `gemini-*` ids use Zen's Gemini endpoint, everything else uses OpenAI-compatible chat (with vision image parts)

### Changed
- CopilotBB model picker replaced with a provider dropdown (Google Gemini direct / OpenCode Zen) plus a free-typed model id field — empty defaults to gemini-3.5-flash-lite on Zen, gemini-2.0-flash on direct (old dropdown/custom settings migrate automatically)

## [12.0.4876] - 2026-09-13

### Added
- CMD engine: `&`, `&&`, `||` chaining, `|` pipes (plus `<` stdin and `2>` merge redirections) with `sort`/`more`/`find` reading pipe input
- CMD engine new commands: pushd/popd, path, prompt, vol, date, time, tree (/f), find (/v /c /n /i), sort (/r), more, fc, where, chcp, systeminfo, ipconfig, ping (loopback), help with per-command topics
- CMD engine: `*`/`?` wildcards for dir/del/type/copy/move/where/if-exist, `dir /b /s /w`, `del /s`, multi-file `type`, `copy`/`move` of file sets and `a+b` concatenation, `md` with multiple dirs
- CMD engine: `for /f` options (tokens/delims/skip/eol/usebackq) with real file input, `if /i`, `shift /n`, `exit [/b] [code]`, hex literals in `set /a`
- Terminal: unknown commands fall through to the real CMD engine (copy/del/type/set/operators work interactively), Tab completion, `exit` closes the window, `help <topic>` shows CMD help, `cd..`/`cd\`, `rm -r`, multi-file cat/touch/mkdir

### Fixed
- CMD engine resolved every relative path against `/` instead of the current directory — files created by scripts landed in root; now relative paths honor `cd`/`pushd`
- CMD engine wiped single-`%A` FOR loops during `%...%` expansion (`for %A in ... do ... %A` did nothing); lone `%X` is now treated as a loop variable
- CMD engine executed `:label` definition lines as commands ("not recognized" errors); labels are now no-ops when reached sequentially
- CMD engine `choice` always set errorlevel to NaN (Popup.pick resolves an option object); now uses the option value
- CMD engine `%CD%` and echo prompt printed a malformed path (`\/\users...`); path formatting fixed
- Terminal `ls`/`neofetch` printed raw `<span>` tags (HTML passed through a text-only printer); output is now line-based with proper HTML rendering and filename escaping
- Terminal lowercased `.bat`/`.vbs` paths before lookup (broke mixed-case names), ignored `\` drive-letter and quoted paths, `mkdir`/`touch`/`write` failed on nested paths, `rm` could not remove folders

## [12.0.4875] - 2026-09-13

### Fixed
- CopilotBB no longer executes chat text as a shell command on empty `{}` tool calls — powershell/cmd/write/read/edit/grep/websearch/webfetch/analyze now fail loudly with retry instructions instead of substituting the assistant's explanation, and the agent prompt explicitly bans empty args and chat-text-in-script

## [12.0.4874] - 2026-09-13

### Fixed
- CopilotBB agent loop fix — tool results are now pushed as user-role messages so the Gemini API always sees a conversation ending with a user turn (fixes "Requests ending with a model turn are not supported")

## [12.0.4873] - 2026-09-13

### Changed
- CopilotBB toolcalls now collapse by default — click the ▶ arrow to expand/collapse tool args and results
- CopilotBB tool results are merged into the same assistant message bubble instead of separate standalone tool messages

## [12.0.4872] - 2026-09-13

### Fixed
- CopilotBB agent tools now auto-repair missing args — empty `{}` write calls default path to `output.txt` and use the assistant's explanation text as content; read/edit default to workspace root; cmd/powershell default to the assistant text as script

## [12.0.4871] - 2026-09-13

### Changed
- CopilotBB composer slimmed down — smaller send/stop/attach buttons, tighter padding, smaller input text, short placeholder

## [12.0.4870] - 2026-09-13

### Added
- CopilotBB hybrid agent mode — the model can end a message with one inline ```toolcall JSON block, the tool runs locally, and its success/failed result is fed back for another model turn (up to 8 turns)
- CopilotBB agent tools: datetime, powershell (built-in cmdlet emulation with CMD-engine fallback), cmd (built-in CMD-compatible engine), write/read/edit/grep over a per-conversation workspace temp folder, websearch via DuckDuckGo, webfetch with script/style stripping and markdown links, analyze for workspace files and attachments (images forwarded as vision input when the model supports it)
- CopilotBB attachments (paperclip button) saved into the active chat workspace, workspace file lister in Settings, agent-mode toggle, and tool-call/result cards in the chat UI

## [12.0.4860] - 2026-09-13

### Changed
- CopilotButBetter brand header in top left corner updated from "CopilotButBetter / Gemini · glass edition" to "CopilotBB"

## [12.0.4850] - 2026-09-13

### Changed
- CopilotButBetter settings panel redesigned with liquid glass styling, glassmorphism cards, glowing focus states, interactive range sliders, and polished micro-interactions matching the main app interface

### Fixed
- CopilotButBetter sidebar toggle button (`☰`) now works on desktop (collapsing/expanding smoothly) as well as mobile

## [12.0.4840] - 2026-09-13

### Fixed
- CopilotButBetter chat requests failing with `GenerateContentRequest.contents: contents is not specified` error caused by message history slicing with `-0` and incorrect `systemInstruction` field property name

## [12.0.4830] - 2026-09-11

### Changed
- CopilotButBetter theme goes monochrome glass — removed the green/blue/purple gradients from logo, avatar, hero, and send button; accent color now only highlights small states (focus rings, model dot, toggles)

### Added
- CopilotButBetter mouse-reactive UI — ambient glow follows the cursor, message bubbles/cards/composer light up with a cursor-tracked spotlight, hero logo and suggestion cards tilt in 3D, plus message entrance animations and press effects

## [12.0.4820] - 2026-09-11

### Added
- Browser recommended-extension notice — first-run window explaining iframe X-Frame-Options blocks, with Chrome ("Ignore X-Frame Headers") and Firefox ("Ignore X-Frame-Options Header") store links, open/copy buttons, "Don't show again" option, and a ⋮ menu entry to reopen it anytime

### Fixed
- CopilotButBetter crashing on launch (`modelNameEl` used before initialization) — theme is now applied after all window elements are queried

## [12.0.4810] - 2026-09-11

### Added
- CopilotButBetter app (installable from Microsoft Store) — ChatGPT-style AI chat with liquid glass effects, powered by your own Gemini API key
- Conversation saving with search, rename, delete, auto-titles, and JSON export
- Long-term memory facts injected into every Gemini request, manageable from Settings or via "Remember" under any reply
- Settings page: API key, model picker + custom model id, system prompt, temperature, max tokens, accent color, glass intensity

## [12.0.4800] - 2026-09-08

### Fixed
- Context menus now follow the light theme instead of staying dark
- Taskbar notification bell now adapts its icon color to the active theme, with an active state while the panel is open

## [12.0.4790] - 2026-09-08

### Added
- Notification API (`js/modules/notifications.js`) — `info`, `action` (buttons + `onAction`), and `forum` (fields + `onSubmit`) toasts with `sticky`, `critical`, `silent`, and `tag` flags
- Windows 11-style Action Center — bell + unread badge in the tray, clock opens a panel with pinned critical notifications and quick settings (dark mode, focus assist, notifications toggle, brightness/volume sliders)
- Per-outcome dismissal reasons (`action`, `submit`, `dismiss`, `timeout`, `clear`, `replace`) with Focus-assist suppression and Settings toggle integration

### Fixed
- Light mode readability — theme-aware taskbar background, chrome icon recoloring (start, search, tray, power), notification panel light theme, and themed text in Notepad, File Explorer, Clock, and Ex/port

## [12.0.4780] - 2026-09-08

### Added
- Storage info readout in Media Player's Organize menu (localStorage footprint plus real IndexedDB usage/quota)

### Fixed
- Blob-backed files failing to play from the library or queue with "corrupt file" errors — path keys split from strings no longer miss in lookups
- Unplayable queues advancing forever and hanging the tab — failure handling now stops after one full pass with bounded popups
- Blob writes are read back and verified, so a success message guarantees bytes on disk

## [12.0.4770] - 2026-09-08

### Added
- IndexedDB blob store (`js/modules/blobStore.js`) for large files — raw bytes under the real origin quota instead of the ~5MB localStorage cap, no chunking needed
- FileSystem blob API — `writeFileBlob` / `readFileBlob` / `isBlobFile` with tiny pointer records; recycle, restore, and permanent delete handle blob bytes without duplication

### Changed
- Music Spark WAV exports, Media Player sample tracks, and screenshots now store raw bytes in the blob store
- File Explorer opens blob-backed audio/video/images (double-click and Photos viewer included)

### Fixed
- Recycle Bin restore, which never worked — it stored the file's own path instead of the parent folder, so every restore silently discarded the file

## [12.0.4760] - 2026-09-08

### Added
- FileSystem quota guards — `flush()`, `wouldFit()`, `serializedSize()` so large writes can be verified instead of silently lost
- Music Spark offers a direct device download when a WAV export exceeds the virtual disk budget

### Fixed
- Large WAV exports (e.g. full songs) reporting success but vanishing on refresh — writes are now pre-checked, flush-verified, and rolled back on failure
- Pending filesystem saves lost when refreshing within the debounce window — state now flushes on page unload

## [12.0.4750] - 2026-09-08

### Fixed
- Media Player audio resurrecting after the window was closed (teardown now detaches media handlers first and runs instantly on close)
- Media Player looping forever on unplayable files — auto-advance stops after one full failed pass instead of overriding Stop

## [12.0.4740] - 2026-09-08

### Added
- Media Player builtin app in the style of Windows 7 Windows Media Player — library and Now Playing modes, glossy control bar
- Audio/video playback from Music and Videos folders, streams via Play URL, and File Explorer double-click (mp3, wav, ogg, m4a, mp4, webm)
- Queue with shuffle and repeat (off/all/one), playlists with create/rename/delete, library search, resume positions
- Live visualizations (bars, wave, orbs) via Web Audio analyser, playback speed, mini-player mode, full keyboard shortcuts
- Generative sample tracks seeded into the Music folder on first run when the library is empty

## [12.0.4730] - 2026-09-08

### Added
- Folder-based app system — each app lives in `js/apps/<id>/` with `manifest.json`, `main.js`, `scripts/`, and `assets/`
- `build-registry.js` generator — validates manifests and emits `js/apps/registry.js`, refreshes `sw.js` precache
- `js/modules/appLoader.js` — manifest-driven boot registration, uuid-keyed installs with legacy id migration
- Per-app `manifest.json` files with frozen uuids, distribution flags, file associations, and store listings

### Changed
- Migrated all 19 apps to the folder layout (history-preserving moves, no behavior changes)
- Taskbar metadata, Start Menu, Microsoft Store, and Settings Apps page now read from manifests instead of hardcoded lists
- File associations wire from manifests at boot; Music Spark exposes `open()` for `.mspark` files
- App modules must not call `AppLoader`/`AppRegistry` at module scope (documented in AGENTS.md and dev guide)

### Fixed
- Service worker precache now includes all apps (words, sledgePoint, cellESheet, musicSpark were missing)
- Recent-apps names now resolve for every app instead of showing raw ids

## [12.0.4720] - 2026-09-08

### Added
- Music Spark v2: Song arranger view with bar timeline, pattern/song transport modes, loop toggle, and full-song WAV export
- Music Spark v2: 4 drum kits (Studio, TR-808, Lo-Fi, Acoustic) with per-kit synth tuning
- Music Spark v2: 808 Bass piano-roll layer with glide and saturation (sounds 2 octaves down)
- Music Spark v2: FX rack — tempo-synced echo, convolution reverb, and per-track low-pass filters, baked into export
- Music Spark v2: per-step velocity (right-click pads: soft/normal/accent), piano note lengths via drag, pattern copy/paste/clone
- Music Spark v2: Drill and Lo-Fi presets, basslines in all presets, v1 project migration

## [12.0.4710] - 2026-09-07

### Added
- Music Spark beat-making app (FL Studio-style DAW) — installable from Microsoft Store
- 8-track step sequencer with synthesized drums (kick, snare, clap, hats, tom, perc, shaker)
- Piano roll lead synth (C4–C6, 4 waveforms) with click-to-add notes and scale preview
- Mixer with per-track volume, mute, and solo plus master volume
- 4 loopable patterns with live switching, BPM (50–220), swing, and metronome
- Genre presets (Hip-Hop, Trap, House, Techno, Boom Bap + Keys), randomizer, and clear
- .mspark project files (save/open via Documents, autosave, File Explorer association)
- WAV loop export (4 loops) to the Music folder via offline rendering

## [12.0.4700] - 2026-09-06

### Added
- Cell ESheet spreadsheet app — installable from Microsoft Store with formulas, multi-sheet support, and ribbon UI
- File associations for .xlsx and .csv files

## [12.0.4690] - 2026-09-06

### Fixed
- localStorage QuotaExceededError by debouncing FileSystem saves (500ms delay)
- Cut+paste (Ctrl+X/V) now works correctly across folders using new FileSystem.moveItem

### Added
- FileSystem.moveItem(srcPath, destPath) for cross-folder moves

## [12.0.4680] - 2026-09-06

### Added
- File Explorer selection system: click to select, Ctrl+click to toggle, Shift+click for range select, Ctrl+A to select all
- Multi-select clipboard: copy, cut, and paste multiple files/folders at once
- Visual feedback for cut items (opacity + dashed border)
- Status bar shows selection count ("3 of 12 selected")
- Click empty space to deselect all

### Fixed
- Ctrl+C/X/V keyboard shortcuts now work properly in File Explorer
- Delete key removes all selected items

## [12.0.4670] - 2026-09-06

### Fixed
- HTML export now scales elements to fit viewport, matching the presentation fix
- SVG export uses correct canvas dimensions instead of doc size
- Fixed SVG export content variable shadowing bug

## [12.0.4660] - 2026-09-06

### Fixed
- Presentation mode now scales elements to fit the viewport, matching the edit canvas layout

## [12.0.4650] - 2026-09-06

### Fixed
- Search panel avatar now shows the user's initial instead of hardcoded "U"
- Login screen avatar now shows the user's initial instead of hardcoded "U"
- Login screen avatar uses accent color instead of hardcoded blue gradient
- Settings sidebar and accounts page avatars use accent color and show user's initial

## [12.0.4640] - 2026-09-06

### Fixed
- Image insertion now uses the virtual filesystem file picker instead of native browser picker
- Export now saves to the virtual filesystem via SavePrompt instead of triggering native download
- Text editing works properly — double-click enters edit mode without DOM rebuild interference
- Clicking the canvas background deselects the current element

## [12.0.4630] - 2026-09-06

### Changed
- Replaced all emoji/unicode ribbon and context menu icons in Sledge Point with inline SVGs

## [12.0.4620] - 2026-09-06

### Changed
- Redesigned all app icons to use consistent filled backgrounds with clean white stroke symbols

## [12.0.4610] - 2026-09-06

### Added
- Added Sledge Point — presentation app with ribbon UI, slide transitions, drawing tools, and export (installable from Microsoft Store)
- Added proper store detail pages for Words and Sledge Point

## [12.0.4600] - 2026-09-05

### Added
- Added close handler API — apps can intercept window close to show unsaved-changes prompts (`setCloseHandler` / `removeCloseHandler` / `requestClose`)
- Added `closeAllWindows` and `requestCloseAllWindows` to close all windows for an app programmatically
- Added File Associations API — register apps to handle file extensions, auto-dispatch from File Explorer
- Added Search interface — click search icon in taskbar to search apps and files

### Changed
- File Explorer now checks registered file associations before falling back to built-in handlers

## [12.0.4590] - 2026-09-05

### Added
- Added "Pin to taskbar" / "Unpin from taskbar" options to start menu app context menus
- Added Words — rich text word processor app (installable from Microsoft Store)

### Changed
- Consolidated all app icons into single AppIcons module (one SVG per app, no more duplicates)
- Redesigned Microsoft Store icon (shopping bag with window grid)
- Taskbar and start menu now use the same canonical icon source

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
