# Changelog

All notable changes to Windows 12 will be documented in this file.

Each version may only use the following sections: **Added**, **Removed**, **Changed**, **Fixed**. Never modify older entries.

## [15.1.2] - 2026-10-21

### Fixed
- **The Registry Editor froze for a second on every click.** The registry read the permission grants to know whether an app may touch a key, and the grants live in the registry - so reading them asked the registry, which asked for the grants, and each asked the other until the stack gave out. Every read cost about 300ms. The registry now marks a finished migration before it runs it (so the migration cannot re-enter itself), and only counts an app as the caller when the app is actually on the stack.

## [15.1.1] - 2026-10-21

### Fixed
- **The Registry Editor refused to open.** The permission check asks the registry who is calling, and the permission grants now live in the registry - so reading the grants asked the registry, which asked the grants, and the two called each other in a loop. The registry now reads its own bookkeeping (the app registrations) and the grants through unchecked readers, which breaks the loop.

## [15.1.0] - 2026-10-20

### Changed
- **The registry is now where the OS keeps its settings**, Windows-style, instead of a handful of separate JSON files:
  - `HKCU\Software\Windows 12\Shell` holds the current profile's settings (accent, wallpaper, taskbar, sounds) - so `HKCU` is really per profile, and two people signed in at once have their own.
  - `HKLM\SYSTEM\CurrentControlSet\Control\Video` holds the machine-wide display settings (scaling, resolution).
  - `HKCU\Software\Windows 12\Permissions\<uuid>` holds the per-app permission grants.
  - `HKCR\<ext>` holds the default app for a file type - which is what that hive is for.
- **The old files are migrated into the registry once** (the markers live in the registry itself) and are not written any more: the per-user `config.json`, the device's `display/settings.json`, the `permissions/grants.json` and the `fileAssociations/defaults.json`.

### Added
- **A real home for an app's own options.** An app keeps its settings in `HKCU\Software\<its id>` - the Windows convention - and can read and write them through `app.registry`.

## [15.0.0] - 2026-10-20

### Added
- **The Windows registry.** A Windows-style settings database: five hives (`HKEY_LOCAL_MACHINE`, `HKEY_CURRENT_USER`, `HKEY_CLASSES_ROOT`, `HKEY_USERS`, `HKEY_CURRENT_CONFIG`), keys, and values of every Windows type (`REG_SZ`, `REG_EXPAND_SZ`, `REG_MULTI_SZ`, `REG_DWORD`, `REG_QWORD`, `REG_BINARY`). Paths are Windows style (`HKLM\Software\Windows 12`), the hive may be written short or long, and the registry is case insensitive. It can import and export `.reg` files.
- **The Registry Editor** (`regedit`) - the built-in editor: the hive tree on the left, the values (Name / Type / Data) on the right, the key path in the status bar, and File / Edit / View / Help menus with New key, New value, Rename, Delete, Find, Import and Export.
- **A `registry` SDK namespace** (`Registry`, and `app.registry` inside an app): read and write keys and values, export and import `.reg` files, search the tree, and list the registered apps. An app may always use its own key, `HKCU\Software\<its id>`.
- **A `registry` permission** - reading or writing any other key needs it. It is declared in the manifest, asked for at install time, and revocable in Settings > Apps.
- **Apps are registered in the registry**, which is what makes an app findable **whatever folder it was installed into**. The catalog is now built from the registry instead of a scan of two fixed roots, so an app in a folder of your own choosing is listed like any other.

### Changed
- **The app catalog comes from the registry.** `HKLM\Software\Windows 12\Apps\<id>` holds an app's `Path`, `Version`, `DisplayName` and `Scope`; a per-user install is registered under `HKU\<user>\Software\Windows 12\Apps\<id>`.
- **The registry store is OS-only** (`/system/registry/registry.json`), so apps reach it through the module and the SDK, never through the filesystem.
- **The app attribution follows the new URL scheme.** An app's code is served from `/js/apps/<folder>/…`, so the guard now resolves the app from the folder (through the registry) instead of reading the id out of the stack trace.

### Fixed
- **Registry keys are found whatever case they are written in**, like in Windows.

## [14.0.0] - 2026-10-20

### Added
- **An app is now a folder.** There is no separate "installed app" concept any more: an app is a folder in the filesystem that holds a `manifest.json` plus its code, and the folder path is the app's handle. It is what you launch, what a `.lnk` points at, and what the URL shows (`/js/apps/Program%20Files%2Fnotepad/main.js`). The manifest's id stays the app's identity for windows, taskbar buttons and file associations.
- **One way to install.** The Microsoft Store and a `.w12pkg`/`.msi` package now go through the same install path: the app is unpacked into a folder (`\Program Files\<id>`, `~\AppData\Programs\<id>`, or a path the caller names) and runs from there. Only a store-sourced install is ever downloaded again; a package you brought yourself never phones home.
- **Apps that were never installed now run like any other app.** A folder you dropped into the filesystem, a work in progress, a portable copy: open it and it starts, with the same window, the same taskbar button and the same permissions. Such an app is not listed in the catalog and has no update checks.
- **Builtin apps live in the filesystem.** At boot the OS materializes them under `\Program Files` (pointing at the core bundle, so nothing is copied), which makes them ordinary app folders - they cannot be uninstalled, and the File Explorer shows them like everything else.
- **`?wipe=1`** empties the private file system and starts over, for the times a browser makes it awkward to clear from the devtools.

### Changed
- **The app catalog is no longer part of the OS.** It is served fresh from the network (with a cached copy for offline use), so updating a Microsoft Store app never ships a whole new operating system.
- **Shortcuts lead to the app's folder.** A `.lnk` for an app now stores the folder it points at instead of an id, so a shortcut and the app it starts can never drift apart.
- **The scripts moved into `scripts/`.** The build scripts and the test suites now live in `scripts/` (with the tests in `scripts/test/`), so the repository root stays the operating system itself.
- **File Explorer 1.4.0** - refusing to change a read-only file now explains why instead of silently doing nothing.

### Fixed
- **An app no longer gets its own copy of the shell.** Apps are served from a fixed URL depth, so their relative imports (`'../../modules/x.js'`) land on the very same module URLs the shell uses. Before, an app could end up with a second copy of the window manager or the filesystem, and the two copies did not share any state.
- **The startup prompts appear exactly when they should.** The "downloaded and installed, refresh to start" prompt now only shows right after a real installation, and the "new version is ready" prompt only when the new version really carries a different core.

### Removed
- **`js/modules/appBundles.js`** - the separate "portable bundle" path is gone; portable apps are ordinary app folders now.
- **The `__w12p_` synthetic app ids** - an app's folder is its handle now.

## [13.0.0] - 2026-10-20

### Added
- **The OS now lives on your device.** The entire operating system - stylesheets, modules, the SDK, the builtin apps and the sounds - is packed into one bundle (`w12-core.pkg`), downloaded once and unpacked into the browser's private file system. `index.html` is now just a small black startup screen that installs the core and then boots the desktop.
- **Offline by design.** Once the core is installed, Windows 12 starts and runs with no network at all, even if the host is unreachable. The service worker now serves the operating system out of the private file system instead of caching it.
- **\Windows in File Explorer.** The operating system's own files are visible under `\Windows`. The folder is read-only: editing, renaming or deleting any of it is refused with an "Access denied" message.
- **Core mirror** (`js/modules/coreStore.js`) keeps the tree snapshot small by pointing at the files on disk instead of copying them.
- **Headless boot test** (`node test/boot.smoke.mjs`) drives a real browser through the whole flow: install, restart, boot, launch an app and boot again with the network switched off.
- **Update-flow test** (`node test/update.smoke.mjs`) checks that the startup prompts appear exactly when they should - and never otherwise.

### Changed
- **Startup experience** - the first launch shows the download progress on the black screen and then asks to refresh; every later launch goes straight to the desktop.
- **Updates** - a new release is a new service worker, so the new core is downloaded and the restart that activates it is offered on the next launch.
- **Store app updates no longer touch the operating system.** The app catalog is served fresh from the network instead of being part of the core bundle, so updating a Microsoft Store app never ships a whole new OS.
- **Storage** - the virtual filesystem, the media files and the operating system all live in the private file system. The old browser-storage fallback is gone; a browser without private file system support cannot run the OS.
- **Settings 2.1.0** - the storage page reports the private file system, adds the Windows 12 system folder to the usage breakdown and drops the old browser-storage wording.
- **File Explorer 1.4.0** - refusing to change a read-only file now explains why instead of silently doing nothing.
- **Media Player 1.0.1** - the storage info dialog describes the private file system.
- **MusicSpark 1.0.1** - refreshed the storage comments.

### Fixed
- **The "download complete, refresh to start" prompt no longer comes back.** It could reappear on an ordinary reload when a new version was waiting in the background, because the workers shared one "current core" pointer. Each version now keeps its own marker, so the prompt only shows right after a real installation.
- **A pending update no longer interrupts the session** when it carries the same operating system version - it is applied silently in the background.

### Removed
- **Browser-storage fallback** - the localStorage tree, the IndexedDB blob store and the migration that copied old installs into packages are gone. Installations from the browser-storage era are no longer carried over.
- **Offline precache** - the service worker no longer keeps a second copy of the operating system in the cache; the copy on disk is the only one.

## [12.0.5006] - 2026-10-20

### Removed
- **Built-in sound schemes** - removed the Soft and Classic schemes and the scheme selector. The default palette is always used. Per-event custom files and On/Off controls remain, and each user's custom setup is saved with their profile.

### Changed
- **Recycle Bin sound** - replaced the heavy thud with a realistic paper-crumple synth made from short, irregular crackles and a quiet paper body.
- **Keyboard sound** - replaced the blocky click with a very soft water-tap tick.
- **Settings 2.0.0** - simplified the Sounds page to default presets, On/Off per event, and the custom file picker.

## [12.0.5005] - 2026-10-20

### Changed
- **Sign-in and sign-out sounds** - shortened both cues. Sign-in is now just the warm string-like pad with no foreground ding; sign-out keeps one soft note.

## [12.0.5004] - 2026-10-20

### Added
- **Custom sound files** - every event in Personalization > Sounds now has a Choose / Upload button. Pick an audio file already in the virtual filesystem, or upload one from the device into `Music/System Sounds`. Only the filesystem path is stored in the per-user config.
- **Shared file picker** - a reusable virtual-filesystem open dialog (`js/modules/filePicker.js`) with places, extension filtering and optional device upload.

### Changed
- **Soft tactile sound palette** - replaced the synthesized presets with generated WAV textures designed to be soft and non-piercing: muffled cloth transients, rounded water-bubble glides and warm creamy pads. Notes now use gentle attacks, per-note releases and a low-passed top end instead of bright bell partials.
- **Sound schemes** - Default, Soft and Classic now change level and top-end softness instead of pitch, so custom files keep their original pitch.
- **Settings 1.3.0** - custom sound selection, file status and upload support on the Sounds page.
- **Offline sounds** - the WAV presets are part of the service-worker precache, so system sounds still work without a network.

## [12.0.5003] - 2026-10-20

### Added
- **System sounds** - a new event-driven sound engine with richer sounds for errors, warnings, information, confirmations, notifications, sign-in, sign-out, the Recycle Bin and keyboard clicks. Every sound uses a softer envelope and a subtle harmonic layer.
- **Personalization > Sounds** - choose a sound scheme (Default, Soft or Classic), override any event with its own scheme, turn individual events off, preview each sound, and toggle system sounds. Master volume stays in System > Sound.

### Changed
- **Settings 1.2.0** - added the Sounds page under Personalization.
- **Notifications** - normal toasts now use the new notification chime; critical alerts keep the warning sound.
- **Sounds API** - `Sounds.play(id)` and `Sounds.events()` make adding new system sounds a single registry entry; existing `info` / `warn` / `error` / `confirm` / `click` / `recycleBin` calls keep working.

## [12.0.5002] - 2026-10-20

### Added
- **Open file location** - available on every Start Menu right-click entry and on shortcuts in the desktop, File Explorer and taskbar, falling back to the shortcut's own folder when the target has no path.

### Changed
- **File Explorer 1.3.0** - shortcut context menus always expose Open file location.

## [12.0.5001] - 2026-10-20

### Changed
- **Start Menu icons** - shortcut entries no longer show the shortcut arrow, keeping the All apps list clean.

## [12.0.5000] - 2026-10-20

### Added
- **Folder-backed Start Menu** - All apps now comes from the real per-user Start Menu folder (`AppData/Roaming/Microsoft/Windows/Start Menu/Programs`). Any shortcut, file or folder can live there, subfolders render as nested groups, and built-in app shortcuts are seeded once per profile so later deletions stick.
- **Per-user taskbar pins** - taskbar pins now live as real shortcuts in `AppData/Roaming/Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar`, with automatic migration of the old machine-wide `pins.json`. Apps, files and folders can be pinned and unpinned.
- **Installer shortcuts** - manifests and `installer.json` can declare `shortcuts` options (Start Menu by default, desktop/taskbar opt-in) with custom name, icon, arguments, start-in folder, run state and hotkey. Installer shortcuts are tagged by app, refreshed on update and removed on uninstall; the wizard shows shortcut checkboxes.
- **Portable app folders** - double-clicking any folder with a valid `manifest.json` launches it as an app through a validated service-worker route; right-click Open browses the folder contents instead.

### Changed
- **File Explorer 1.2.0** - app folders run on double-click, while Open browses them; added Run app and Pin to taskbar actions.
- **Package Installer 1.1.0** - setup options include shortcut destinations and pass them through headless, silent and custom installer flows.
- **Shortcuts** - gained shell-folder helpers, source metadata, app shortcut lifecycle and taskbar pinning.

## [12.0.4999] - 2026-10-20

### Added
- **Shortcuts (`.lnk`)** - a Windows-style shortcut system for files, folders, websites and installed apps. Shortcuts can be created from the desktop or File Explorer, open through the desktop, File Explorer and Search, show the target icon with a shortcut arrow, and handle broken targets with Delete / Properties choices.
- **Shortcut wizard and properties** - a shared editor for target type and path (with a virtual file-system browse dialog), app selection, arguments, start-in folder, run state (normal, minimized, maximized), comment, custom icon (target, app or built-in icon picker) and a global shortcut key. Shortcut files are UTF-8 JSON carrying a `w12-lnk` marker, so they remain portable inside the text-based virtual file system.
- **Shortcut hotkeys** - global keys registered through the Keyboard module from shortcuts on the Desktop and Start Menu, refreshed after create, edit or delete and on user switch, and suppressed while the lock screen or UAC secure desktop is active.
- **`Create shortcut` and `Open file location`** - added to the desktop and File Explorer context menus, with the Explorer action selecting the shortcut target's folder.
- **Browser URL launch** - `Browser.launch(url)` and `Browser.openUrl(url)` let a shortcut open a website directly instead of always starting on a blank tab.

### Changed
- **File associations** - `.lnk` paths are intercepted before extension resolution, so the desktop, File Explorer, Search and future callers all resolve shortcuts consistently; the shared icon set gains `.lnk`, shortcut and open-location glyphs.
- **File Explorer 1.1.0** - shortcut-aware icons, preview details and context menus; rename keeps the `.lnk` extension; creating or editing a shortcut refreshes the current view.
- **Browser 1.1.0** - accepts an initial URL when launched by a shortcut.

## [12.0.4998] - 2026-10-19

### Fixed
- **DevScope environment scan** — the toolchain probe no longer fails with `')' is not recognized`. The PowerShell script now uses line-oriented probes compatible with the OS script engine and returns pipe-delimited records, which DevScope parses for tool name, command, path and version. Package version 1.0.1.

## [12.0.4997] - 2026-10-19

### Added
- **DevScope** — new Store app by Impact Studio: a local-first developer diagnostics workbench with read-only toolchain discovery (through the SDK script runner when available), offline log-signature analysis and persisted per-user environment snapshots. The Store listing includes screenshots and declares clipboard/notifications permissions; the package ships at `packages/devScope.w12pkg`.

### Changed
- **Store catalog** — DevScope is registered as a Developer Tools store app. The incoming package was normalized for the catalog (string package size, store screenshots, packaged window icon) and rebuilt with the repository packager.

## [12.0.4996] - 2026-10-19

### Added
- **Package Installer (.msi / .w12pkg)** — a new built-in app that installs sideloaded app packages from File Explorer with a classic Windows Installer-style wizard (welcome → license → options → ready → progress → finish). `.msi` files are app packages: the same ZIP layout as Store packages. Per-user is the default scope; a system-wide install is available when the installer allows it and raises UAC. The wizard detects updates, refuses to overwrite built-in apps or a different app with the same id, and can replace a conflicting local install only after an explicit confirmation.
- **`installer.json`** — optional per-package setup configuration: `mode` (`gui`, `headless`, `silent`), `scope`/`defaultScope`, `publisher`, a custom `ui` module, `eula`, welcome text/image, `theme` accent/banner/logo, feature checkboxes, setup fields (`text`, `password`, `checkbox`, `select`), finish text and `data`. Headless installs show a compact progress window; silent installs report only through notifications. The selected scope/features/fields are written to `install.json` inside the installed app.
- **Custom installer UI** — packages can ship `installer/ui.js` exporting `mount(root, ctx)`. The context exposes the full SDK, parsed package metadata, asset/text/bytes readers, a blob-module importer, the install bridge with progress and cancellation, window control and cleanup hooks.
- **`build-msi.js`** — zero-dependency builder for sideloadable packages (`node build-msi.js <app-id|folder> [--out file.msi]`) that validates identity/entry/installer.json and writes a stored ZIP to `dist/`.
- **Install docs** — `APP_DEVELOPMENT_GUIDE.md` §2.6 covers the `installer.json` schema, the custom UI contract and the programmatic `Packages.inspectArchive` / `Packages.installArchive` pipeline.

### Changed
- **Package service** — added `inspectArchive` (archive validation: identity, entry, permissions, associations, installer config, EULA, unsafe/duplicate paths, flat or single-folder roots) and `installArchive` (staged extraction outside the package roots, backup-and-swap commit, cancellation that never touches an existing install, `install.json` record, `apps-changed` event, one install per id at a time, UAC for system scope).
- **Settings → Apps** — sideloaded packages are labelled "Installed package" instead of "Installed from Store".
- **App catalog refresh** — `AppLoader` rebuilds the catalog from the registry on every `apps-changed`, so a sideloaded app update refreshes its name/version/association and an uninstalled package disappears instead of leaving a stale entry; a reinstalled app drops its cached module.
- **App icons** — `AppIcons` now resolves package icons for sideloaded apps (and their custom manifest `icon` path) instead of falling back to the generic glyph.

## [12.0.4995] - 2026-10-19

### Changed
- **AGENTS.md — app versioning and release rules** — documented the mandatory semver bump for every app-folder change, catalog/package regeneration, ownership of generated files, the pre-commit checklist, and the body-zoom/overlay coordinate rules for mobile-safe positioning.
- **Settings — Personalization page** — reorganized into the same card grid as System: Theme, Accent color, Background, Mouse cursor and Taskbar now each open a dedicated subpage with a back button, instead of one long scrolling page. Deep links (`Settings.openPage('personalization', 'theme' | 'accent' | 'background' | 'cursor' | 'taskbar')`) resolve to the matching subpage.
- **Patched store apps republished** — Apex Drive 3D, Archiver, Cell ESheet, Minesweeper, Password Vault, Riftbound Runner, Subway Surfers, To-Do Tasks, Visual Studio Code and Words bumped to `1.0.1`, with rebuilt `.w12pkg` archives so the fixes from 12.0.4993 are offered as Store updates.
- **Patched builtin apps versioned** — Browser, Calculator, Notepad, Paint, Remote Desktop and Task Manager bumped to `1.0.1` to match the fixes already shipped.

## [12.0.4994] - 2026-10-19

### Fixed
- **Context menus and popups on scaled displays** — context menus, the Wi-Fi/network flyout, the taskbar window switcher and the tray overflow flyout were positioned with visual viewport coordinates inside the zoomed `<body>`, so on phones and other small screens (body zoom below 1) they rendered far away from the pointer or tray icon. Their coordinates are now converted with the effective UI zoom (`Scaling.getUiZoom()`), keeping them anchored correctly at every scale.

## [12.0.4993] - 2026-10-19

### Fixed
- **Window manager** — window IDs no longer collide when two windows are created in the same millisecond; closing the focused window hands focus to the next visible window; Aero peek restores the previous stacking order and moves between switcher items; per-window drag/resize listeners are detached on close; switching session or virtual desktop re-focuses the top visible window.
- **Taskbar** — pinned apps regroup correctly when they gain or lose windows; pinned apps stay visible in ungrouped mode; the "Restore" context action un-minimizes instead of maximizing; switcher/overflow removal timers can no longer delete a newly opened flyout; the outside-click listener is registered once.
- **Start menu** — apps are only reused within the current session and virtual desktop, and minimized windows are restored through the window manager.
- **Notepad** — Open remembers the real file path (Ctrl+S no longer overwrites the previously saved document), the dirty marker keeps the document name, and the status bar refreshes after Open/New.
- **Calculator** — the finished expression (`1 + 1 =`) is no longer cleared immediately after pressing equals.
- **Password Vault** — the password generator no longer produces shortened/invalid passwords.
- **To-Do Tasks** — editing a due date keeps local time instead of shifting it by the timezone.
- **Minesweeper** — changing difficulty from the menu updates the high-score category.
- **Browser** — typed URLs are added to history once instead of twice.
- **Settings** — display resolution can be changed back after the first change; factory reset also clears leftover OPFS blob data.
- **Cell ESheet** — `MIN`/`MAX` on empty ranges return 0; Delete is ignored while typing in a cell editor; the theme timer stops when the window closes.
- **Paint** — Ctrl+Z only triggers while the Paint window is focused.
- **Words** — inserted images mark the document dirty.
- **Archiver** — binary entries are extracted as real bytes instead of corrupted text.
- **Task Manager** — the refresh interval stops on every close route.
- **VS Code** — a second launch focuses the existing window instead of resetting its tabs.
- **Popup / Save As** — closing a dialog from its title bar or the taskbar now resolves the pending promise instead of hanging the caller.
- **Window state** — pending geometry saves are tracked per profile.
- **Notifications** — auto-dismiss timers are cleared when the session changes.
- **Search** — file results open the actual file through the association layer.
- **Background Apps** — disabling autostart no longer shuts down another signed-in profile's instance.
- **Packages / App Loader** — package state is rescanned on session change, updates and uninstalls target the owning profile, legacy installs are removed, and updated code is re-imported.
- **Filesystem** — restoring from the recycle bin no longer loses the item when the original folder is missing or the name is taken; moving a folder into itself is rejected; ZIP extraction validates stored entries.
- **Clipboard** — clicking a history item pastes into the field that was focused before the flyout opened.
- **SDK** — Audio no longer applies master volume twice and preserves an explicit 0 volume; local Net channels send their goodbye before closing.

### Changed
- Removed leftover debug logging and unused imports across the taskbar, window manager, apps and SDK modules.

## [12.0.4992] - 2026-10-18

### Changed
- **Settings > Personalization** — Moved "Config File" reset section to a new "Recovery" category under System; removed "User Name" section (account name is managed in Accounts)

### Added
- **Settings > System > Recovery** — New subpage for recovery, format, and reset options including Config File reset to defaults

## [12.0.4991] - 2026-10-18

### Added
- **App updates in Microsoft Store** — the Store now checks installed app versions against the catalog and shows "Update" buttons when newer versions are available (`js/apps/appStore/main.js`, `js/modules/packages.js`, `js/modules/appLoader.js`, `js/modules/appSystem.js`)
- **Per-app update button** — appears in Library, app detail view, hero banner, and app cards when an update is available; shows version change (e.g., "1.0.0 → 1.1.0")
- **"Update all" button** in Library tab when multiple apps have updates available
- **Version display** in app detail view showing both installed and store versions

### Changed
- **Packages module** — added `update(id, opts)` function that re-downloads and reinstalls a package while preserving its install scope (user/system) (`js/modules/packages.js`)
- **AppLoader** — added `update(idOrUuid, opts)` method delegating to Packages (`js/modules/appLoader.js`)
- **AppSystem** — added `updateApp(idOrUuid, opts)` facade for Store UI (`js/modules/appSystem.js`)

## [12.0.4990] - 2026-10-18

### Changed
- **Store iframe games** updated with new embed URLs:
  - **Moto X3M** → `https://iframe.unblocked-76-games.org/moto-x3m-main`
  - **Slope 2** → `https://games.yoplay.io/slope-2/?v=1`
  - **Slope 3** → `https://games.yoplay.io/slope-3/?v=1`
  - **Tunnel Rush** → `https://iframe.unblocked-76-games.org/tunnel-rush-main`
  - **Stickman Hook** → `https://lnahtml.github.io/a/stickman-hook`
  - **Temple Run 2** → `https://archive777.com/Temple%20Run/Temple%20Run%202%20Game/`
  - **Subway Surfers** → `https://files.gamezhero.com/game/905/1d1/9051d1173be765fb/data/index.html`
  (`js/apps/motoX3M/main.js`, `js/apps/slope2/main.js`, `js/apps/slope3/main.js`, `js/apps/tunnelRush/main.js`, `js/apps/stickmanHook/main.js`, `js/apps/templeRun2/main.js`, `js/apps/subwaySurfers/main.js`)

## [12.0.4989] - 2026-10-18

### Changed
- **Chess app** now uses Chess.com (https://www.chess.com/) instead of Lichess — updated URLs for Live Chess, Daily Puzzle, and Play Online modes; store metadata updated accordingly (`js/apps/chess/main.js`, `js/apps/chess/manifest.json`)

### Fixed
- **Minecraft Classic touch controls** — joystick and jump button now work reliably; fixed pointer capture conflict where canvas would steal pointer from joystick, causing touch to stop working after ~1ms (`js/apps/minecraft/main.js`)

### Added
- **Minecraft Java launcher** — new version entries: **1.14.4** (`https://eymenwsmc.site/114/`), **1.7.10** (`https://eymenwsmc.site/r1710/`) in the Releases group (`js/apps/minecraftJava/main.js`)

### Changed
- **Minecraft Java 26.2** updated to new CDN URL: `https://eaglercraft-26-2-u1-cdn.u2471966200.workers.dev/eaglercraft-26.2-u2.html?v=u2-20261017`
- **Minecraft Java 1.20.6** added at `https://eymenwsmc.site/120/?v=20260824-5430efd6`
- **Native touch controls support** — versions with built-in touch controls (26.2, 1.20.6) now show "✓ Touch controls built-in" instead of a toggle; the Eaglermobile userscript is not injected for these versions (`js/apps/minecraftJava/main.js`)

## [12.0.4988] - 2026-10-18

### Added
- **Taskbar app grouping with switcher popup.** Multiple windows of the same app are now grouped under a single taskbar button (default behavior). When a grouped button has multiple windows, clicking or hovering it shows a slide-out switcher popup listing all windows with their titles and icons. Click a window to focus it; hover a window entry for an Aero-peek effect that temporarily dims all other windows of that app and highlights the hovered one.
- **Customizable grouping modes** in Settings > Personalization: "Always" (default, one button per app), "When taskbar is full" (group only when space runs out), or "Never" (one button per window, classic style).
- **Tray overflow chevron** that appears only when the notification area has more than 5 icons. Clicking it opens a flyout listing the overflowed app tray icons and system icons.

### Changed
- Taskbar rendering now supports both grouped and ungrouped modes, with live switching based on the setting or available space (`js/modules/taskbar.js`, `css/taskbar.css`).
- Added `peekWindow` API to WindowManager for the Aero-peek effect used by the switcher (`js/modules/windowManager.js`).
- New per-user config key `taskbarGrouping` stored in SystemConfig (`js/modules/systemConfig.js`).

## [12.0.4987] - 2026-10-18

### Added
- **Apps can now add icons to the system tray.** A new Tray API (`js/modules/tray.js`, SDK `js/sdk/tray.js`, bound `app.tray` / flat `Tray`) lets a background-capable app register notification-area icons with left-click, double-click and right-click handlers, a right-click context menu, a tooltip, a small badge/count overlay, and a live icon that can be changed at any time. Icons outlive the app's window — that is the point — so the API requires background access (manifest `"background": true`, the `"background"` permission, or `"service": true`); without it the SDK throws `PERMISSION_DENIED`. Icons are scoped to the foreground session (concurrent sessions only see their own) and are removed automatically when the app is uninstalled, its session signs out, or a headless app is stopped; apps can also manage them with the returned handle (`setIcon/setTooltip/setBadge/setVisible/setMenu/onClick/update/remove`) or the `remove/removeAll/get/list/canUse` helpers. Wired into boot in `js/main.js`; SDK contract bumped to **1.5.0** (`js/sdk/index.js`, `js/sdk/types.d.ts`, `APP_DEVELOPMENT_GUIDE.md` §22.5 + §26), with smoke-test coverage (`test/sdk.smoke.mjs`)

### Removed
- **The dead search glyph in the taskbar tray.** It had no handler and did nothing; Search is already the center taskbar button and the Search panel (`index.html`)

### Changed
- A headless app's tray icons are now cleared when it shuts down (`BackgroundApps` shutdown hooks call `Tray.removeAll`), so a stopped background app leaves no stale icons behind (`js/modules/backgroundApps.js`)

## [12.0.4986] - 2026-10-18

### Added
- **The OS now works offline once installed as an app.** The service worker serves every same-origin request network-first with an offline cache fallback (a 3-second cap so a reachable-but-dead server can't hang boot, plus app-shell fallback for navigations), so the shell and every builtin app boot with no network at all — even if the host (GitHub Pages) is down. Store apps already run from the virtual filesystem (`sw.js`, `js/main.js`)
- **Network status module** (`js/modules/networkStatus.js`, also `window._NetworkStatus`): tracks `navigator.onLine`, paints the taskbar Wi-Fi indicator (solid Wi-Fi when connected, Wi-Fi with a red slash when not), opens a small network flyout anchored to the tray on any taskbar edge, and exposes `isOnline()` / `onChange(cb)` / `ensureOnline(feature)` / `showError(feature)` for features to fail cleanly. Wired into boot in `js/main.js`

### Changed
- The service worker precaches each asset independently (instead of the all-or-nothing `addAll`), so a single renamed/missing file can no longer abort the entire offline shell; shell files are stored under a canonical key with just the `?v=` cache-buster stripped so versioned requests hit the offline copy (`sw.js`)
- Being online is no longer assumed by internet features: the Store download step, Windows Update, the Browser and Weather now report a readable connection error instead of hanging or crashing
- The Browser shows a clean, retryable "You're not connected" card (with the target URL and a **Try again** button) instead of a blank frame when offline, and auto-reloads the page once the connection returns (`js/apps/browser/main.js`, `css/browser.css`)

### Fixed
- **The Wi-Fi tray icon now reflects connectivity** — it previously always showed as connected (`index.html`, `css/taskbar.css`)
- Store installs and Windows Update checks now surface "you're offline" style messages rather than a generic failure (`js/modules/packages.js`, `js/modules/windowsUpdate.js`)

## [12.0.4985] - 2026-10-18

### Removed
- **Display orientation.** It never affected anything the resolution/scaling settings didn't already handle, so the `displayOrientation` global key, its Settings > System > Display control, its SDK entry and its smoke test are gone (`js/modules/systemConfig.js`, `js/apps/settings/main.js`, `js/sdk/settings.js`)

### Changed
- The desktop wallpaper is now painted on a full-screen `#wallpaper` layer inside `#resolution-layer` (instead of on `#desktop`), so it extends beneath the taskbar; `#desktop` remains the (now transparent) work area for icons and windows (`index.html`, `css/main.css`, `js/modules/systemConfig.js`, `js/modules/virtualDesktops.js`). The UAC/lock "secure desktop" no longer needs to stretch the wallpaper, and the wallpaper fades in with the desktop on sign-in
- The Start menu is a flex column: the search box and the footer (user + power) stay pinned while only the middle (`Pinned` / `Recommended`, or the All-apps drawer) scrolls, so a short screen no longer clips the footer; it also compacts on short viewports (`index.html`, `css/startmenu.css`, `js/modules/startMenu.js`)
- `AppLoader.launch` forwards an options object only when it has keys and otherwise calls the app's `launch()` with no arguments, so apps that take a path as their first parameter no longer receive a meaningless `{}` (`js/modules/appLoader.js`)

### Fixed
- **Photos, Notepad and the other file-handler apps no longer crash on launch.** The shell was passing `{}` as their file path, which threw (`segments is not iterable` / `name.split` on undefined) and left a crash window
- **The Classic and Hands cursors are filled in.** The Classic arrow and the Denali hand shipped as outline icons whose inner contour cut a hole through the middle, so they read as hollow on both the real mouse and the virtual touch cursor; they now use their solid outer silhouette (`js/modules/cursor.js`, and the Settings previews follow)
- **Taskbar opacity works.** The translucent taskbar used to reveal the black page background through it; with the wallpaper layer behind it, it now shows the blurred desktop wallpaper
- **Mobile File Explorer**: a single tap opens a folder/file (instead of selecting it), long-press opens the item's context menu (instead of starting a drag), native drag is disabled on touch, and the per-item selection checkboxes only appear in selection mode (`js/apps/fileExplorer/main.js`)

## [12.0.4984] - 2026-10-18

### Added
- **Machine-wide display settings.** Resolution, display scaling and orientation are now device settings, not per-profile ones: they live in a single global store (`/system/programs data/display/settings.json`, shell-owned) and are read back by `SystemConfig.initGlobal()` / `setGlobal()` / `setGlobals()` / `loadGlobal()` / `isGlobalKey()` in `js/modules/systemConfig.js`. Because they are loaded before any profile exists, the boot, login and lock screens now render at the device's configuration too
- FSGuard treats the display store as an OS-only zone, so app code can't read or tamper with it

### Changed
- `js/main.js` loads the global display settings (`SystemConfig.initGlobal()`) before starting `Scaling`, and exposes `window._Scaling` so a machine-wide scaling change repaints the shell
- Settings > System > Display now says the settings apply to every user and the lock screen, and **changing resolution, scaling or orientation raises a UAC prompt** (administrator consent, or an administrator credential for standard users)
- The resolution/scaling "keep these changes?" prompt is now a **real Popup window** (`Popup.custom`, via `confirmDisplayChange`) with Revert / Keep changes buttons and the same 15-second auto-revert, replacing the old bottom-right notification-style overlay
- Global display keys are no longer written to the per-user `config.json` (they were per-profile); the SDK `Settings` JSDoc now describes these keys as machine-wide and privileged

### Fixed
- Display scaling and resolution no longer drift per profile: a change made by one user now applies to the lock screen and to every other user

## [12.0.4983] - 2026-10-18

### Added
- **Concurrent user sessions (fast user switching).** Several accounts can be signed in at once: each keeps its own windows, virtual desktops and OS state, and only the foreground one is visible — the rest keep running hidden. New `js/modules/sessions.js` (the session registry, with `onBoot`/`onActivate`/`onClose` hooks injected by `js/main.js`), plus `window._Sessions` and `window._Shell` (sign in / activate / sign out / lock / sleep / restart / shut down) for apps
- **Lock screen and the full power set** (`js/modules/lockScreen.js`). Start > Power now offers **Lock** (secure-desktop overlay, unlock with the account password; also `WIN+L`), **Switch user** (the picker opens over the still-running session, with a Cancel button), **Sign out** (ends the session in-page and reopens the picker), **Sleep** (fades to black; any input wakes into the lock screen), **Restart** (restart screen, then reload) and **Shut down** (shut-down screen, then a powered-off screen with a power button that boots again). The old `window.close()`/forced-reload behaviour is gone
- Per-user path roots for background code: `Users.homeFor` / `appDataFor` / `userDataFor(id, …)` resolve an explicit profile, and `Users.loadAccounts()` / `Users.activate(id)` split reading the account store from activating a profile
- `Users.primaryAdminId()` — the most recently signed-in administrator (source of the login/lock personalization)
- The lock overlay shows a live clock, the account avatar and an unlock prompt; new `sleep` action icon in `js/modules/uiIcons.js`

### Changed
- **The login screen no longer preloads a profile.** Boot now initializes only the filesystem and the account store (`js/main.js`), so the picker appears immediately; the chosen profile's shell is built afterwards behind the Welcome spinner. `js/modules/loginScreen.js` is callback-driven (`bootSequence({ onSignIn })`, `show({ canCancel })`) and doubles as the Switch-user / Sign-out picker, marking already signed-in profiles
- The login and lock screens mirror the **primary administrator's** personalization (wallpaper image or gradient, accent colour, light/dark) read straight from that profile's config — no session is activated to paint them (`SystemConfig.readThemeFor` / `wallpaperGradient`)
- Every window is tagged with the session that created it and window visibility is centralised in `WindowManager.applyVisibility` (foreground session ∧ active desktop ∧ not minimized); `minimizeAll` and `getFocused` follow the foreground session, and the taskbar only lists the foreground session's windows
- `BackgroundApps` tracks autostart per profile and revives a profile's headless apps on switch without stopping the others; signing out runs their shutdown hooks
- The per-user modules (`SystemConfig`, `UserActivity`, `Notifications`, `StartMenu`, `DesktopIcons`, `Taskbar`, `WindowState`, `VirtualDesktops`) gained an `activate(userId)` hook so a switch re-points them at the new profile's data
- Settings > Accounts > Sign out now ends the session in-page via `window._Shell`; `Users.beginSwitch` remains only as a recovery fallback

### Fixed
- **Virtual desktops are now per-user.** They were persisted globally at `/system/programs data/virtualDesktops/`; each account keeps its own desktops, names, order, active desktop and per-desktop wallpapers under its own profile
- Window geometry/history is per-user too (`WindowState`), so concurrent sessions no longer overwrite each other's window layout
- The taskbar and Task View no longer treat another session's windows as belonging to the foreground user

## [12.0.4982] - 2026-10-18

### Changed
- UAC now uses a true **secure desktop**: while the prompt is open every window, desktop icon and the taskbar are hidden and the wallpaper is stretched to fill the screen and dimmed, leaving only the centered User Account Control dialog visible. New `body.uac-active` rules in `css/main.css`, toggled by `js/modules/uac.js`

## [12.0.4981] - 2026-10-18

### Added
- **Administrator accounts.** Accounts now carry a `type` — `administrator` or `standard` (`Users.isAdmin` / `getAccountType` / `setAccountType` / `countAdmins` in `js/modules/users.js`). The seeded and migrated account is an administrator, legacy stores are normalized so a device always has one, and **the last administrator can't be demoted or deleted**. Settings > Accounts shows each account's type, can promote/demote, and offers an account-type selector when adding one; the login tiles and Settings sidebar label administrators
- **User Account Control** (`js/modules/uac.js`, also `window._UAC`). `UAC.request({ name, message })` shows a modal, everything-blocking elevation dialog: a Yes/No *consent* prompt for administrators, or an administrator *credential* prompt for standard users (pick an administrator and type its password; an administrator without a password approves by being selected). Prompts are serialized and elevation is per-action — never persistent
- Write-side filesystem policy: `FileSystem.setWriteChecker` + `FSGuard.checkWrite` — app mutations inside `/Program Files` raise a UAC prompt (granted per app for the session); reads stay allowed so File Explorer can still browse it

### Changed
- Settings account management (add/remove accounts, change type, reset another user's password) now requires administrator approval via UAC; changing your own password stays ungated
- Store installs: "All users" (system scope) and uninstalling a system-wide app now require administrator approval. `js/modules/packages.js` enforces this in the module layer and throws an error flagged `elevationDenied` when declined — the Store and Settings surface a friendly message, while `SDK.Apps` resolves `false`
- `SDK.Apps.install(id, { scope })` gained an optional `scope` (`'user'` | `'system'`); a system install raises a UAC prompt. `SDK.Apps.uninstall` also resolves `false` when administrator approval is declined
- `Popup.forum` fields support `type: 'select'` with an `options` list (used by the Add-account dialog)

## [12.0.4980] - 2026-10-18

### Added
- **App packages.** Apps are now self-contained *packages* (`js/apps/<id>/`) that the shell imports **lazily on first launch** — `js/apps/registry.js` became a metadata-only catalog and `js/modules/appLoader.js` imports an app's `main.js` with a dynamic `import()` the first time it opens (`ensureLoaded`/`launch` are async; `getModule` stays synchronous, returning loaded-or-null). Start, Search, the Store and file associations read the catalog without evaluating any app, so 50+ apps no longer evaluate at boot
- Package icon assets: every app now ships `assets/icon.svg` (extracted from the old inline `appIcons.js` table); the registry records `hasIcon`, and `AppIcons.get(id)` returns an `<img>` for packaged apps (the inline table now carries shell-only glyphs). New `.app-icon-img` sizing, overridden by the taskbar (24px) and window title bar (16px)
- `js/modules/packages.js` — the package service: scans installed package folders, downloads + unpacks `.w12pkg` archives into the virtual filesystem, uninstalls, migrates legacy installs, and publishes the active user to the service worker
- Microsoft Store installs are real: **Download → copy into the vFS → execute from disk**. Install asks permission consent, then asks the install scope (*Just me* → `/users/<uid>/AppData/Programs/<id>/`, *All users* → `/Program Files/<id>/`) and shows an inline progress overlay; the library shows each app's scope. The package folder existing *is* the install record (no separate install list)
- `build-packages.js` — zero-dependency builder that packs each store app into `packages/<id>.w12pkg` (uncompressed ZIP, read back by `js/modules/zip.js`)
- `sw.js` (registered from `js/main.js`) — a service worker that (1) precaches the shell and every builtin app file for offline use and (2) acts as a **virtual package host**: it intercepts the canonical `/js/apps/<id>/…` URL and serves installed packages straight out of the OPFS virtual filesystem, so no import path is ever rewritten. Uninstalled store *code* returns 404; static assets fall through to the shipped bundle so catalogs can render icons before install; with no OPFS tree (legacy backend) the worker defers entirely

### Changed
- `build-registry.js` now emits a metadata-only registry (`entry`, `hasIcon`, `icon`, `permissions`, associations, store block) plus GENERATED `sw.js` blocks — the app distribution map, the core shell precache and the full builtin-app precache (no more hand-maintained lists)
- Installed store apps resolve through the canonical app URL with a `?w12pkg=<version>` cache-buster; builtins (and the no-worker fallback) load from the shipped bundle unchanged
- `Taskbar.openApp`/`launchApp`, `AppLoader.launch` and association `open` handlers are async (lazy import); call sites in Search, the Start menu, Desktop icons and Remote Desktop were updated
- App icons render as `<img src="js/apps/<id>/assets/icon.svg">` everywhere the shell shows an app (Start, Search, Store, taskbar, title bar)

### Removed
- Static app imports from the registry (`APP_MODULES`) — the shell no longer evaluates every app module at boot

### Fixed
- Deleting a folder (or emptying the recycle bin) now frees the blob storage of the files inside it, not just the top-level item — uninstalling a package no longer leaks its unpacked files
- The SDK smoke test now awaits the async `FileSystem.init()` / `AppLoader.init()` (and asserts package icons + lazy-entry catalog flags)

## [12.0.4979] - 2026-10-18

### Added
- OPFS (Origin Private File System) storage backend for the virtual filesystem. `js/modules/fsStorage.js` probes capability at boot and, when supported, stores the file tree (`w12/fs.json`) plus every large/media file as real OPFS files — lifting the old ~5MB localStorage ceiling and moving large files out of IndexedDB. All OPFS I/O runs in a dedicated worker (`js/workers/opfsWorker.js`, driven by `js/modules/opfsClient.js`) using `createSyncAccessHandle()`, the only OPFS write API that works on every OPFS-capable browser — Chrome 102+, Firefox 111+ and Safari 15.2+ including all iOS browsers, which cannot write OPFS from the main thread before Safari 26

### Changed
- Filesystem persistence now falls back automatically to the previous localStorage + IndexedDB backend whenever OPFS is unavailable (older browsers, Firefox/Safari Private Browsing, HTTP, or a blocked worker). The synchronous FileSystem API is unchanged, so no app code had to change
- Existing localStorage/IndexedDB data is copied into OPFS non-destructively on first run; the localStorage copy is kept so the fallback path still has data. Pre-OPFS blobs in IndexedDB are copied forward the first time they are read
- `FileSystem.init()` is now async and must be awaited before any filesystem use; `main.js` boot awaits it first (Users/apps still initialize after it). New `FileSystem.flushAsync()` resolves once a write has actually landed
- Sign-out and user switching await `FileSystem.flushAsync()` before reloading, so pending writes cannot be lost to the reload
- Storage UI is backend-aware (Settings → Storage, File Explorer "This PC", Media Player → Organize → Storage info) and reports the active backend instead of assuming localStorage/IndexedDB; File Explorer usage now reads the real origin estimate
- `js/modules/blobStore.js` is now the legacy/fallback blob store (still used when OPFS is unavailable and as the source for the one-time copy-forward)

## [12.0.4978] - 2026-09-27

### Fixed
- iOS iframe sizing overshoot (embedded content rendered larger than its frame and clipped off right/bottom): removed the root cause on Apple touch devices instead of fighting WebKit's zoom math — the shell now always renders at zoom 1 on iPhone/iPad (UI scale and display-resolution zoom forced off there via `window._isAppleTouch`), so iframe inner viewports size exactly like on desktop. The OS desktop lays out 1:1 on iPad-size screens; `iframeViewportFix` remains as a resize-resync safety net (its zoom compensation self-neutralizes at zoom 1)

## [12.0.4977] - 2026-09-24

### Fixed
- Roblox showed the generic gray letter-tile icon everywhere outside its own window (Microsoft Store cards, store hero, Start menu, taskbar, search): `AppIcons` is a static per-app map and had no `roblox` entry — added the Roblox logo mark so all icon surfaces match the app window

## [12.0.4976] - 2026-09-24

### Changed
- Roblox app icon redrawn as the actual Roblox logo mark — tilted white square with the square hole on the dark rounded tile — replacing the rough hand-drawn approximation

## [12.0.4975] - 2026-09-24

### Added
- Roblox (installable from the Microsoft Store): embedded roblox.com client in an iframe, following the same pattern as the other embedded game clients — toolbar with Reload and Open-in-Browser, keyboard capture on load/click, and sign-in supported inside the frame

## [12.0.4974] - 2026-09-24

### Fixed
- Real root cause of the iOS/iPadOS Safari iframe letterboxing: the shell-wide `body { zoom }` (display scaling) shrinks an iframe's inner document viewport by the zoom factor while the element box keeps its CSS size — the embedded page fills only `zoom` of every frame with white gaps right/bottom, and no width/height CSS or attributes can correct the units. `iframeViewportFix` now compensates on Apple touch devices: each iframe gets `zoom: 1/Z` (canceling the body zoom inside its subtree) plus pixel dimensions derived from its allotted box, so the frame lays out at net zoom 1 where element box, inner viewport and rendered pixels are identical. Resyncs on window resize/maximize, tab switches and rotation via ResizeObserver; Browser app page zoom now drives the fix (transform-only) on iOS instead of resizing the frame itself

## [12.0.4973] - 2026-09-24

### Fixed
- iOS/iPadOS Safari iframe letterboxing (embedded page rendered in the top-left with big white gaps at the right and bottom): new `iframeViewportFix` module (iPhone/iPad only, incl. iPadOS desktop-mode UA) keeps every iframe's pixel `width`/`height` attributes synced to its real CSS box via MutationObserver + ResizeObserver — attribute updates are the one WebKit workaround that forces the inner document viewport to relayout after CSS/flex/zoom resizes. Inert on desktop and Android
- Arcade game and Chess iframes had no definite height (`flex:1` only), the exact pattern that makes WebKit fall back to the iframe's intrinsic 300x150 size — they now use `flex:1 1 0%; width:100%; height:100%` like the Browser app

## [12.0.4972] - 2026-09-23

### Fixed
- Apex Drive 3D reversed steering: A/Left and D/Right signs were flipped relative to the chase camera (D turned the nose toward screen-left). Swapped so A steers screen-left and D screen-right; AI drivers and the reverse-driving behavior are unchanged

## [12.0.4971] - 2026-09-23

### Fixed
- Apex Drive 3D `WebGL: INVALID_ENUM: drawElements: invalid type` crash: index buffers now use 16-bit (`UNSIGNED_SHORT`) instead of 32-bit indices, which require the `OES_element_index_uint` extension that many WebGL1 contexts lack. All game meshes are far below the 65,535-vertex limit

## [12.0.4970] - 2026-09-23

### Added
- Apex Drive 3D (installable from the Microsoft Store): a full 3D driving simulator with zero-dependency WebGL — Circuit Race (3 laps vs 3 AI rivals on a lakeside mountain circuit with checkpoints, positions and countdown) and Free Roam (open 800×800 world with lake, forests, rocks, ramps and 12 collectible boost rings). Detailed sports car (cabin, spoiler, headlights, spinning steered wheels), arcade physics with drift and jumps, chase camera, minimap, procedural engine audio, boost pads, and persistent best lap / top speed. Controls: WASD/arrows + Space boost, R reset, C camera, N sound

## [12.0.4969] - 2026-09-23

### Added
- Custom image wallpaper: Settings → Personalization → Custom image with preview tile, Choose-from-my-files picker (Pictures/Desktop scan), Upload-image (saved to Pictures), picture position (Fill/Fit/Stretch/Tile/Center), and Windows-style right-click “Set as desktop background” on image files in File Explorer, desktop icons, plus a Photos viewer button. The file path is stored per-user and the image URL is rebuilt on every boot (blob/data-URL aware); per-desktop overrides still win when set

## [12.0.4968] - 2026-09-23

### Added
- Icons for the 8 games missing from the central registry (chess, motoX3M, slope2, slope3, slopeGame, stickmanHook, templeRun2, tunnelRush), matching each game's own window icon — taskbar, start menu and desktop no longer show the grey fallback for any app

## [12.0.4967] - 2026-09-23

### Changed
- CopilotButBetter `cmd` tool is now one unified runner for CMD, VBScript and PowerShell: new `language` arg (`cmd` default, `vbs`, `powershell`) dispatches to the real OS engines (same code as Terminal/PowerShell/VBScript, workspace-rooted). The hand-rolled PowerShell emulation is gone and the "PowerShell is not available" notice is removed from the agent prompt

## [12.0.4966] - 2026-09-23

### Added
- Everyday PowerShell cmdlets: `Select-String` (`sls`, `-CaseSensitive`/`-SimpleMatch`/`-Context`/`-Quiet`/`-List`, `MatchInfo` objects), `Out-GridView` (`ogv`, picker dialog in the app with honest passthrough headless), `Write-Progress` (ASCII bar, `-Completed`), `Get-Random` (`-Minimum`/`-Maximum`/`-Count`/`-SetSeed`, pipeline pick), `New-Guid`, `Get-Unique`, `Get-Member` (`gm`, `-Name`/`-MemberType`), `Get-PSProvider`; `Read-Host -AsSecureString` now returns a masked `SecureString` (`***`); blue PowerShell app echoes each executed line with syntax coloring (cmdlets yellow, strings orange, `$vars` blue, comments green, numbers light-green, operators gray)

### Fixed
- `Copy-Item -Recurse` deep-copies folders (folder sources were skipped) with `-Force` overwrite semantics across Copy/Move; Move/Rename onto an existing destination now errors like Windows instead of silently overwriting; `Get-Content -Tail`/`-Wait` (one-shot content plus an honest live-tail notice); `Test-Path -PathType Leaf|Container`/`-IsValid`; `Resolve-Path` wildcards return all matches and require existence; `Split-Path -Qualifier`; `Select-Object -ExpandProperty` on a missing property emits a `$null` blank line instead of dropping the row

## [12.0.4965] - 2026-09-23

### Added
- SDK `Scripts` namespace (v1.4.0, flat + bound `app.scripts`): `runBatch`/`runVBScript`/`runPowerShell` for source strings and `runFile` dispatching `.bat/.cmd/.vbs/.vbe/.ps1/.psm1` through the real OS engines (same code as Terminal/PowerShell, sync, `{output, errors, exitCode, cwd}` + `onOutput` streaming, per-user PS ExecutionPolicy enforced, job toasts tagged to the calling app, network follows the manifest). Bound guide row + example in `APP_DEVELOPMENT_GUIDE.md`, typings in `types.d.ts`, 12 new smoke checks

### Fixed
- PowerShell `.ps1` output silently swallowed when a script runs via file openers: `runScriptFile`/`runScriptContent` return values were never printed by direct callers (PowerShell app `open()`, Terminal `./script.ps1`, SDK `runFile`). New engine `formatValues()` formats them exactly like a final pipeline stage; all three callers now emit them once

## [12.0.4964] - 2026-09-23

### Added
- **PowerShell engine** (`js/modules/powershellEngine.js`, same `create(printFn, getCwd, setCwd, opts)` shape as the CMD/VBS engines): real `PSObject` pipeline (`Get-ChildItem | Where-Object Length -gt 100 | Sort-Object Name`), ~75 cmdlets with Windows aliases (FS provider, `Where/ForEach/Select/Sort/Group/Measure/Compare/Tee`, `Format-Table/List/Wide`, `ConvertTo/From-Json/Csv`, `Get-Process/Start-Process` wired to open windows, `Get-Service`, `Get-ComputerInfo`, `Start-Job` with completion toasts, `Test-Connection`, `Invoke-WebRequest`, `Get/Set-ExecutionPolicy`), language blocks (`if/foreach/for/while/do/switch/try-catch-finally/function/param`), `Env:/Variable:/Alias:` providers, `C:\`-style paths, `> >> 2>` redirection, `&& ||` chains, per-user `$PROFILE` + execution policy + history under `AppData/powershell`
- **PowerShell builtin app** (`js/apps/powershell/`, blue `#012456` theme, red error stream, `PS C:\...> ` prompt, Tab completion for cmdlets + paths, persisted history, `Read-Host` dialogs): runs `.ps1`/`.psm1` via file association (`open`), double-clicking a script opens and executes it
- Terminal integration: `powershell`/`pwsh` prefix runs one command (`powershell Get-Process`, `powershell -File x.ps1`, `-Command`), bare `powershell` nests a PS session until `exit`, and `./script.ps1` + `run script.ps1` execute through the PS engine with ExecutionPolicy enforcement

## [12.0.4963] - 2026-09-22

### Added
- Remote Desktop replica now mirrors the desktop itself on solid black: host desktop icons stream with live grid positions (click to select, double-click to open, same behavior as local), and the replica start menu matches the real one — search with live filtering, host-ordered Pinned grid, All-apps drawer, Recommended files/apps that open on the host, and the host user in the footer

### Fixed
- Remote Desktop session "gone" after visiting Settings/Connect mid-connection: the Session nav button stayed hidden forever, so a live session had no way back. It now appears on connect and hides on disconnect

## [12.0.4962] - 2026-09-22

### Added
- 6-character Remote Desktop short codes as an alternative to full invite codes: host creates one in Settings, controller just types it in (no answer step). Codes are rendezvous keys — devices swap SDP through a public MQTT relay (hand-rolled MQTT 3.1.1 over WebSocket in the SDK, two-broker fallback, rooms tidied after pairing), then the link stays direct WebRTC. New SDK methods `Net.createShortInvite` / `Net.acceptShortInvite` (`app.net`); full-length codes remain the offline fallback

## [12.0.4961] - 2026-09-22

### Added
- Remote Desktop live app interaction: windows now mirror their real content (sanitized HTML with live field values + one-time page CSS, selectors scoped so the controller's own desktop is untouched) instead of placeholders — click, double-click and right-click inside mirrored Store/Notepad/popups/etc. replay on the live host window via element-accurate synthetic pointer events. Text fields focus the host field for typing over the existing keyboard forwarding

## [12.0.4960] - 2026-09-22

### Fixed
- Remote Desktop replica taskbar flooded with the device name: `syncTaskbar` removed stale app buttons but never the device label it re-appends, so every snapshot (practically every interaction) added another label. Stale labels are now cleared with the buttons

## [12.0.4959] - 2026-09-22

### Fixed
- Remote Desktop invite codes always rejected ("That code is not a Windows 12 Net invite"): the SDK encoder never wrote the `app`/`v` envelope fields the decoder requires, so every valid code failed. Both code types now carry the envelope, and pasting tolerates stray whitespace/line breaks picked up from chat apps

## [12.0.4958] - 2026-09-22

### Added
- Remote Desktop shows the controller's mouse on the remote screen: a blue arrow + device-name pill overlay (pointer-events-none, auto-hides after 2.5 s idle, cleared on disconnect), streamed throttled from the replica

### Fixed
- Remote Desktop session view no longer distorts with the controller's window size: the stage now renders 1:1 fixed to the remote screen size by default (scroll to pan), with a 1:1/Fit toolbar toggle; remote screen resizes push immediately to controllers instead of waiting for the poll

## [12.0.4957] - 2026-09-22

### Added
- **Remote Desktop** builtin app (`js/apps/remoteDesktop/`, background-capable): control other Windows 12 devices via scene-replication — Connect pane (local discovery + WebRTC invite/answer codes), interactive Session replica (drag/resize/double-click maximize, taskbar + mini start menu, keyboard capture, clipboard sync, remote file browser with 6 MB upload/download), Settings pane (device name, allow-connections toggle, 6-digit PIN, known-device pairing, invite creation)
- SDK `Net` (`app.net`) peer messaging: `createChannel` with pluggable `local` (BroadcastChannel) and `webrtc` (manual signaling, STUN-only) transports plus `discover` presence pings
- SDK `Inject` (`app.inject`) synthetic input: `key` and `pointer` dispatch for remote control and automation

### Changed
- SDK bumped to v1.3.0 (`Net` + `Inject` namespaces); `APP_DEVELOPMENT_GUIDE.md` documents both

## [12.0.4956] - 2026-09-21

### Added
- 8 new iframe Store games (all `network`-permission wrappers with keyboard-focus capture and a Reload / Open-in-Browser toolbar): **Slope** (GameZipper embed), **Slope 2** + **Slope 3** (`subwayonline.io` embeds), **Tunnel Rush**, **Moto X3M** (unblocked clients), **Stickman Hook**, **Temple Run 2** (`subwayonline.io` embed), and **Chess** (official Lichess Live TV + Daily Puzzle embeds with tab switcher and a Play-on-Lichess button)

## [12.0.4955] - 2026-09-21

### Fixed
- **Minecraft Java**: WASD (and all keyboard input) never reached the embedded Eaglercraft client — key events only arrive at the cross-origin iframe when it holds focus, but the launcher left focus in the parent document after Play/load. The game view now focuses the frame on load and on every click into the game area (with `tabindex` + `keyboard-lock` permission), shows a "Click the game to capture keyboard (WASD)" hint that hides once the frame takes over, and cleans up its focus listeners on exit

## [12.0.4954] - 2026-09-21

### Fixed
- Terminal `whoami` / prompt (and batch `%USERNAME%`) still showed "User": the account record and the legacy `SystemConfig userName` could disagree, with each reader picking a different side. `userName` is now a live alias of the signed-in `Users` account (`get`/`getAll` resolve it, `set`/`setMultiple` rename the account, `reset` preserves it), renames mirror into the per-user `config.json` and emit `user-info-changed`, and boot heals split-brain stores by adopting whichever side holds a real name (account wins ties). Terminal, batch, and Settings readers prefer the non-default name

## [12.0.4953] - 2026-09-21

### Fixed
- Settings sidebar account header showed "User" instead of the signed-in account name: it was overwritten on every config change by the legacy `SystemConfig userName` (which is no longer edited since multi-user). The header now reads `Users.getCurrent().name`, refreshes on `user-info-changed` (rename) and on page navigation, including the avatar initial
- Terminal prompt, `whoami` and `neofetch`, plus batch `%USERNAME%`, now prefer the signed-in `Users` account name with the legacy config value as fallback

## [12.0.4952] - 2026-09-21

### Fixed
- Settings not saving at all after the multi-user system: `window._FSGuard` was never exposed so every OS module's `asShell()` was a no-op and per-user writes under `/system/users/<id>/programs data/` were denied as app access while Settings was focused; `SystemConfig` now creates its parent chain before writing `config.json`; `Users` directory creation fixed (folder paths now ensure the final segment), file moves (legacy `config.json`, `backgroundApps.json`) work again, legacy config migrates to `programs data/config.json`, and all account/metadata FS access runs as shell

## [12.0.4951] - 2026-09-21

### Fixed
- **Minecraft Java**: embedded client was squashed into a ~150px-tall strip at the top of the window — the `.mcj-root` wrapper had no height, so the iframe's percentage-height chain broke and it fell back to its default height (width was unaffected). It now fills the window body at any size

## [12.0.4950] - 2026-09-21

### Changed
- **Minecraft Java** launcher: per-version touch-control support is now three-state (supported / unknown / unsupported) — supported: 1.12.2, 1.5.2 and all legacy builds (toggle defaults on); unknown: 26.2, 26.1, 1.21.11, 1.20.4 (off, but togglable); unsupported: 1.8.8 (toggle disabled). Each version row shows its known support level

### Fixed
- Task View taskbar icon ignored the theme: `.taskbar-btn` now inherits `color: var(--text-primary)` (buttons default to the browser's own text color, so the icon's `currentColor` stroke rendered near-black in dark mode); start/search/tray icons already had explicit overrides, the Task View button was the one miss

## [12.0.4949] - 2026-09-21

### Added
- **Minecraft Java** store app — an Eaglercraft launcher (`js/apps/minecraftJava/`):
  - Curated version list, newest to oldest: 26.2, 26.1, 1.21.11 (WASM), 1.20.4, 1.12.2, 1.8.8, 1.5.2, Beta 1.7.3, Beta 1.3, Alpha 1.2.6 and Indev — grouped into Snapshots / Releases / Legacy
  - One-click play: each version loads in a sandboxed embedded iframe (pointer lock, gamepad and fullscreen allowed inside the frame) — no username, no mods
  - Real browser fullscreen via the SDK's `app.window.setFullscreen` (Fullscreen toolbar button or F11 in the game view), so the game never gets stuck in window mode
  - Optional touch controls via the Eaglermobile userscript (`flameddogo99-eaglermobile.js`), appended to the client URL and toggleable per session; toggling reloads the client
  - Remembers the last played version per user (`AppData/minecraftJava/lastplayed.json`)
  - New `minecraftJava` app icon (flat grass block, distinct from Minecraft Classic's isometric one)

## [12.0.4948] - 2026-09-21

### Removed
- The "User Name" edit box from Settings > Personalization — account names are managed in Settings > Accounts now

## [12.0.4947] - 2026-09-21

### Added
- Multi-user system with login:
  - `js/modules/users.js` — user accounts persisted at `/system/users/accounts.json` (display name, optional salted SHA-256 password, timestamps); account management API (create/rename/delete, set/remove password, verify) and per-user path helpers (`Users.home()`, `Users.appData()`, `Users.userData()`)
  - `js/modules/loginScreen.js` — real boot flow: boot animation → user picker (last user highlighted) → password prompt (shake on error) for protected accounts → Welcome spinner → desktop
  - Power menu gained **Lock**; **Switch user** / **Logout** now end the session (reload-based) into the user picker
  - Settings > Accounts: full user management — your account card, other users list, add account (name + optional password), rename, remove, set/change/remove password, sign out
  - Per-user data separation: home directories, system config (`/system/users/<id>/config.json`), start-menu pins, recent activity, notification history, background-app autostart, desktop icon layout, and installed store apps (`installed_apps_<userId>`)
  - Per-user AppData: app data now lives at `/users/<id>/AppData/<appId>/`; apps may opt into the shared global store `/system/programs data/<appId>/` (new SDK `app.globalFiles`; `app.files` is per-user)
  - Filesystem permission enforcement (`js/modules/fsGuard.js`): apps always access their own AppData folders; anything outside requires the manifest `filesystem` permission, or a one-time runtime consent dialog (Allow once / Always allow / Deny) for apps that don't declare it; OS-only zones (per-user OS data, permission grants, recycle bin internals) are off-limits to apps; paths picked in Save dialogs are granted for the session
  - `Popup.custom()` for system dialogs with arbitrary buttons
- One-time migration on first boot: the existing `/users/default` data and `installed_apps` become the first account (named from the previous `userName` setting); app-owned folders in `/system/programs data/` move into that user's AppData; OS per-user storage moves under `/system/users/<id>/programs data/`

### Changed
- Boot sequence reworked (`js/main.js`): `FileSystem.init()` → `Users.init()` → user-aware `AppSystem.init()` → per-user config/activity → shell → login flow; the static cosmetic `#login-screen` markup was removed from `index.html`
- `filesystem` permission is now enforced (previously consent-only): builtins and store apps behave the same, and revoking it in Settings > Apps actually blocks outside-AppData file access
- Builtins no longer bypass permission grants; declared permissions of builtin apps can be revoked like store apps
- SDK `createApp().files` sandbox root moved from `/system/programs data/<id>/` to the current user's `AppData/<id>/`; `sdk/app.js` docs updated
- ~100 hardcoded `/users/default` and `/system/programs data/<app>` paths across apps and modules replaced with `Users.home()` / `Users.appData()` helpers (module-scope path constants made lazy)
- `APP_DEVELOPMENT_GUIDE.md` storage/permissions/SDK sections and `AGENTS.md` conventions updated for the multi-user AppData model

### Fixed
- `settings` app "Apps & data" storage shortcut pointed at the non-existent `/programs data` root — now points at the user's `AppData`

## [12.0.4946] - 2026-09-20

### Added
- SDK Engine3D — a full 3D rendering engine (`js/sdk/engine3d/`) with:
  - `math.js` — Vec3, Mat4, Quat, AABB, frustum, random, scratch buffers
  - `geometry.js` — BufferGeometry, primitives (box, sphere, plane, cylinder, cone, torus, capsule), computed normals/tangents/UVs, bounding sphere/box, instancing support
  - `materials.js` — Material base + StandardMaterial (PBR metallic-roughness, normal/emissive/occlusion maps), ShaderMaterial (custom GLSL), MaterialLibrary
  - `scene.js` — Node, Group, Mesh, InstancedMesh, Scene, lights (Ambient/Directional/Point/Spot), Raycaster (mesh + instanced picking)
  - `camera.js` — PerspectiveCamera, OrbitControls, FlyControls (pointer-lock + drag fallback)
  - `renderer.js` — WebGL2 forward renderer: clustered lighting (16 directional, 64 point, 64 spot), shadow maps (directional cascades + point cube), SSR, tone mapping (ACES), FXAA, gamma-correct sRGB, HDR render target, resize handling
  - `engine.js` — Engine orchestrator (canvas, renderer, scene, camera, resize, render loop), post-effect pipeline, stats overlay
  - Exported via `js/sdk/index.js` as `Engine3D` namespace; `js/sdk/types.d.ts` updated
  - `js/apps/engine3d/` demo app showcasing the engine

### Fixed
- SDK Engine3D `OrbitControls`: pointer capture was never released on `pointerup`/`pointercancel`, causing right-click pan or any drag to lock pointer capture and freeze camera controls permanently
- SDK Engine3D `OrbitControls`: right-click is now ignored so context menus work normally (panning uses middle-click or shift+left-click), pitch drag direction corrected so moving mouse up/down tilts correctly, and `FlyControls` key events bound to `window` with automatic canvas focus so WASD works reliably in fly mode
- SDK Engine3D `OrbitControls`: up/down mouse drag is now consistent regardless of camera yaw (looking backward no longer inverts vertical drag)

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
