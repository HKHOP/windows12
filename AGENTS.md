# Agents

## Project: Windows 12

A web-based OS simulation built with vanilla HTML, CSS, and JavaScript modules. No external CDNs or libraries.

## Critical rules (read first)

1. **Bump the app version on every app change.** Whenever you modify anything under `js/apps/<id>/` (code, styles, assets, manifest), increment `version` in that app's `manifest.json` using semver (`1.0.0` → `1.0.1` for fixes, `1.1.0` for features, `2.0.0` for breaking changes). The version is both the lazy-module cache key (`?w12pkg=`, `js/modules/appLoader.js`) and the Store's update signal (`js/apps/appStore/main.js`); without a bump, installed packages can keep running stale code and the Store will not offer the update.
2. **After an app change, regenerate the catalog, the core bundle and the package.** Run `node scripts/build-registry.js` (required after any `manifest.json` change), then `node scripts/build-core.js` (**required after every change to the OS core** — see *The OS core lives in OPFS* below), then `node scripts/build-packages.js` for changed **store** apps. Only rebuild the packages you changed: the builder rewrites every archive, producing timestamp-only diffs that must not be committed.
3. **Never hand-edit generated files.** `js/apps/registry.js`, the `>>> w12:*` blocks in `sw.js`, `w12-core.pkg` and `packages/*.w12pkg` are generated. Edit sources, then rerun the builder.
4. **Freeze app identity.** Never change an existing app's `id`, `uuid`, or manifest `entry` path; install records, file associations and settings are keyed by them. Adding/removing an app folder also requires `node scripts/build-registry.js`.
5. **Release every change.** Every commit gets a new CHANGELOG.md version entry (never modify older entries), using only **Added**, **Removed**, **Changed**, **Fixed**. Bump `version.json`, run `node scripts/update-version.js` to refresh the `?v=` cache-busters in `index.html`, and commit code first, then the changelog/version sync, then push.
6. **Verify before committing.** Run `node scripts/test/sdk.smoke.mjs` (no browser needed) and `node --check` on modified JS. Run `node scripts/build-registry.js` and confirm it produces no unexpected diff. **Do not run the browser smoke tests** (`scripts/test/boot.smoke.mjs`, `scripts/test/update.smoke.mjs`) or any other headless-browser script — the user tests the OS by hand and reports back, and browser runs are slow and unwanted. Say plainly in the handover what still needs a manual check (a narrow/mobile viewport, see *Scaling & overlay positioning* below), instead of testing it yourself.
7. **No dead code or debug output.** Remove unused imports/files, `console.log`/`debugger`, commented-out experiments and temporary artifacts before finishing. No native `alert()`/`confirm()`/`prompt()` — not even in the bootstrap, which updates the core and reloads without asking.
8. **Use the OS APIs, not raw DOM hacks.** Restore/focus/minimize through `WindowManager` (`focusWindow`, `setMinimized`, `closeWindow`, `isMinimized`, `isFocused`) — never reveal a window by writing `element.style.display` (it bypasses session and virtual-desktop visibility). Use `ContextMenu.show(clientX, clientY, items)` for menus; do not build your own coordinate-positioned menus.
9. **Clean up what you bind.** Register global/document listeners once, not inside render loops. Per-window timers and listeners must be released when `window-closed` fires. Any Promise-based dialog must settle when its window is closed externally (`window-closed`), or callers hang.
10. **Respect multi-user and persistence rules.** Never assume a single profile; use `Users.homeFor/appDataFor/userDataFor(id, …)` in code that can outlive a session switch. Persistent data goes through `FileSystem`/the SDK, never `localStorage`.
11. **No external dependencies.** No CDNs, npm packages, external fonts or remote assets. Everything ships in the repo and must work offline.
12. **The OS core is a build artifact — rebuild it.** `w12-core.pkg` is the bundle the browser downloads and unpacks into OPFS. If you change anything under `js/modules/`, `js/sdk/`, `js/workers/`, `css/`, `assets/`, `shell.html`, `js/main.js`, `js/apps/registry.js` or a **builtin** app, run `node scripts/build-core.js` before testing or committing. A stale bundle silently ships the old code: the browser serves the package, not your working tree.

## Architecture

### Scripts (`scripts/`)

Every script an agent runs lives in `scripts/`, so the repository root stays
the operating system itself. Run them from the repository root:

| Script | What it does |
|--------|--------------|
| `node scripts/build-registry.js` | validates the app manifests, writes `js/apps/registry.js` and the `sw.js` distribution map |
| `node scripts/build-core.js` | writes `w12-core.pkg` — the OS core bundle the browser downloads |
| `node scripts/build-packages.js` | writes `packages/<id>.w12pkg` — the store apps' archives |
| `node scripts/update-version.js` | syncs the `?v=` cache-busters in `index.html` with `CHANGELOG.md` |
| `node scripts/test/sdk.smoke.mjs` | the SDK suite (no browser needed) — **run this** |
| `node scripts/test/boot.smoke.mjs` | a real browser: install → restart → boot → launch an app → boot again offline — **not run automatically** |
| `node scripts/test/update.smoke.mjs` | a real browser: a refresh installs a new core silently, with no dialogs — **not run automatically** |

### The registry

The registry (`js/modules/registry.js`) is the machine's settings database,
Windows style: **HIVES** → **KEYS** → **VALUES**.

| Hive | Short | Holds |
|------|-------|-------|
| `HKEY_LOCAL_MACHINE` | HKLM | machine-wide settings and the app registrations |
| `HKEY_CURRENT_USER` | HKCU | the current profile's settings |
| `HKEY_CLASSES_ROOT` | HKCR | file types and their handlers |
| `HKEY_USERS` | HKU | every profile's hive |
| `HKEY_CURRENT_CONFIG` | HKCC | the display/hardware configuration |

Paths are Windows style (`'HKLM\\Software\\Windows 12'`), the hive may be
written short or long, and **the registry is case insensitive** - a key is
found whatever case it is written in.

- The store is `/system/registry/registry.json`, which is **OS-only**
  (`fsGuard`'s `OS_ONLY_PREFIXES`): apps reach it through the module and the
  SDK, never through the filesystem.
- **The registry is the OS's settings store.** Each of these used to be its
  own little JSON file; they now live in the registry, Windows-style:

  | Key | Holds | Was |
  |------|-------|------|
  | `HKLM\Software\Windows 12\Apps\<id>` | the app registrations (Path, Version, DisplayName, Scope) | the catalog was a scan of two fixed roots |
  | `HKLM\SYSTEM\CurrentControlSet\Control\Video` | the machine-wide display settings (scaling, resolution) | `programs data/display/settings.json` |
  | `HKCU\Software\Windows 12\Shell` | **this profile's** settings (accent, wallpaper, taskbar, sounds…) | the per-user `config.json` |
  | `HKCU\Software\Windows 12\Permissions\<uuid>` | the per-app permission grants | `programs data/permissions/grants.json` |
  | `HKCU\Software\<appId>` | an app's own settings | (new - the app sandbox) |
  | `HKCR\<ext>` | the default app per file type | `programs data/fileAssociations/defaults.json` |
  | `HKLM\SOFTWARE\Windows 12\Migrations` | the one-time migration markers | (new) |

  The old files are **migrated into the registry once** (the markers live in
  the registry itself) and are not written any more.
- **The app registrations live here**: `HKLM\Software\Windows 12\Apps\<id>`
  (and `HKU\<user>\Software\Windows 12\Apps\<id>` for a per-user install).
  That is what makes an app findable **whatever folder it was installed
  into** - the catalog is built from the registry, not from a scan of two
  fixed roots.
- The **Registry Editor** (`js/apps/regedit/`) is the built-in editor: the
  hive tree on the left, the values (Name / Type / Data) on the right, the
  key path in the status bar, and File / Edit / View / Help menus.
- An app may always use **its own key**, `HKCU\Software\<its id>`. Any other
  key needs the **`registry` permission** (a new permission id, revocable in
  Settings > Apps).

### An app IS a folder

There is no separate "installed app" concept. **An app is a folder** in the
virtual filesystem that holds a `manifest.json` plus its code, and the folder
path is the app's handle:

- the folder is what you launch (`AppLoader.launch(folderPath)`),
- the folder is what a `.lnk` points at,
- the folder is what the URL shows (`/js/apps/Program%20Files%2Fnotepad/main.js`),
- the manifest's `id` is the app's identity (windows, taskbar, associations).

So all of these behave identically:

| Where the app sits | What it is |
|--------------------|------------|
| `\Program Files\<id>` | a builtin app, materialized from the core bundle at boot |
| `\Program Files\<id>` | a store app the user installed |
| `~\AppData\Programs\<id>` | a store app installed for one user |
| anywhere else | an app folder nobody installed - a work in progress, a portable copy |

An app folder that nobody installed is **not** in the catalog and has no
update checks; you start it from its folder or from a shortcut that points
at it. Everything else is the same app, running from its own folder.

**One way to install.** `Packages.install(source, options)` takes either a
store app (`{ type: 'store', id }`) or a package you already have
(`{ type: 'package', bytes }`); both unpack the app into the target folder
(`/Program Files\<id>` or `~\AppData\Programs\<id>` by default, or an
explicit `options.path`) and the app then runs from there. Only a
store-sourced install is ever re-downloaded.

**The URL scheme matters.** An app reaches the shell with relative imports
(`'../../modules/x.js'`), so an app's folder is **one** URL segment
(`/js/apps/<encoded folder>/…`) and the shell's own modules keep their
canonical URLs (`/js/modules/…`). If the app were served from a different
depth, it would get a *second* copy of the shell modules and the two copies
would not share any state.

### The OS core lives in OPFS (read this first)

The operating system is **not served as static files**. The site serves a tiny
`index.html` bootstrap, `sw.js`, the core bundle `w12-core.pkg` (plus
`manifest.json`, `favicon.svg` and the `packages/*.w12pkg` archives for the
Store). Everything the OS runs — stylesheets, ES modules, the SDK, the builtin
apps, the sounds — is bundled into `w12-core.pkg` by `node scripts/build-core.js`,
downloaded once by the service worker, unpacked into the Origin Private File
System and served from there.

```
w12-core.pkg  ──download──▶  sw.js (install)  ──unzip──▶  w12/core/<version>/…
                                                                    │
browser  ──import /js/main.js──▶ sw.js (fetch)  ──read──▶─────────┘
```

- **OPFS layout**
  - `w12/core/<version>/core-info.json` — `{ version, hash, files, bytes, installedAt }`, the marker of *this* version
  - `w12/core/<version>/…` — the unpacked core bundle (one file per bundle entry)
  - `w12/fs.json` — the virtual filesystem tree snapshot
  - `w12/blobs/<ref>` — raw bytes for large user files
  - `w12/session.json` — the foreground profile id
  - There is **no shared "current core" pointer**. Each worker owns its own
    version directory and asks only about itself: a shared pointer made a
    waiting worker look like it had replaced the running core.
- **`index.html` is the bootstrap, not the shell.** It paints a black screen
  with a white status line, registers the service worker, installs the core
  on a first start, applies a waiting worker on every refresh and reloads
  into it, then fetches `shell.html` from OPFS, injects it, loads the
  stylesheets and `import()`s `js/main.js`, which exports `boot()`.
- **`shell.html`** holds the desktop markup that used to live in `index.html`.
- **The service worker is an OPFS file server, not a cache.** It answers
  `/js/…`, `/css/…`, `/assets/…`, `/shell.html` and `/core-manifest.json`
  from `w12/core/<version>/…` with `Cache-Control: no-store`, serves
  installed store apps from the vFS, and keeps only `index.html`,
  `manifest.json` and `favicon.svg` in the Cache API so an offline reload
  still reaches the bootstrap.
- **URLs never change.** Apps still live at `/js/apps/<id>/…` and the shell
  still imports `./modules/x.js`, so every relative import keeps resolving —
  the worker simply answers from disk.
- **The app catalog is not part of the core.** `js/apps/registry.js` holds the
  store apps and their versions, so it changes whenever an app is updated. It
  is served by the worker from the network (with a cached copy for offline
  use) and is deliberately **excluded** from `w12-core.pkg`: an app update
  must never ship a new operating system.
- **Updates** work like this: a changed `sw.js` is a changed service worker
  script. The browser installs it and it downloads the new core by itself,
  then **waits** — a running session is never swapped out from under the
  user. **Refreshing the page is the update check**: the bootstrap calls
  `registration.update()`, finds the waiting worker, tells it to skip waiting
  and reloads into its core. Nothing prompts, nothing asks. Core versions are
  per-directory (`w12/core/<version>/`), so an old worker never serves a
  half-updated OS.
- **There is no Windows Update service.** Windows Update is a status page in
  Settings that always says *You're up to date*; the bootstrapper is the only
  updater. Store apps are updated by hand from the Store.
- **The OS core is mirrored into the virtual filesystem** under `\Windows`
  (`js/modules/coreStore.js`): the entries hold no bytes, only pointers to
  the files on disk, so File Explorer shows the operating system's own files
  without bloating the tree snapshot.
- **`\Windows` is read-only.** `FileSystem.isReadOnly()` marks the root and
  `fsGuard.checkWrite()` refuses every write to it — apps, shell code and
  scripts alike, no elevation and no consent dialog. Only the core mirror
  itself may write there, and it does so as shell-owned work
  (`FSGuard.asShell`).
- **OPFS is mandatory.** The localStorage + IndexedDB fallback is gone: a
  browser without OPFS cannot run the OS, and the bootstrap says so.

### Modules
- `js/modules/windowManager.js` - Core window management (create, drag, resize, maximize, minimize, close)
- `js/modules/taskbar.js` - Taskbar logic, clock, start menu toggle, app launching
- `js/modules/startMenu.js` - Start menu with pinned apps, search, recommended items
- `js/modules/popup.js` - Popup/dialog API (info, warn, error, confirm, pick, textbox, forum)
- `js/modules/backgroundApps.js` - Headless execution: background apps + launchable-nowhere services (manifest `background`/`service`), autostart, `background-apps-changed` event
- `js/modules/fsStorage.js` - Filesystem persistence: OPFS only (tree snapshot + blob files); the capability probe throws when OPFS is missing
- `js/modules/coreStore.js` - Mirrors the installed OS core from OPFS into the read-only `\Windows` tree, and materializes the builtin apps as app folders under `\Program Files`
- `js/modules/registry.js` - The registry (HKLM/HKCU/HKCR/HKU/HKCC, keys, values, .reg import/export) and the app registrations the catalog is built from
- `js/modules/siteBase.js` - The site base URL and the app URL scheme (`/js/apps/<encoded folder>/…`)
- `js/modules/treeNotify.js` - Tells the service worker that the filesystem changed, so it never serves a stale tree
- `js/workers/opfsWorker.js` + `js/modules/opfsClient.js` - OPFS I/O through a dedicated worker (`createSyncAccessHandle`); required because Safari before 26 only exposes OPFS writes in workers

- `js/modules/users.js` - Multi-user accounts at `/system/users/accounts.json`: `administrator` / `standard` types, per-user home + AppData roots, password hashing; `loadAccounts()` (read the store) is separate from `activate(id)` (make a profile current); `homeFor`/`appDataFor`/`userDataFor(id, …)` target an explicit profile
- `js/modules/sessions.js` - **Concurrent sessions** (fast user switching): which profiles are signed in and which is in the foreground. Registry + `onBoot`/`onActivate`/`onClose` hooks injected by `js/main.js`; also `window._Sessions`
- `js/modules/lockScreen.js` - Lock / Switch user / Sign out / Sleep / Restart / Shut down (Start > Power, `WIN+L`); reuses the UAC secure-desktop idea via `body.locked`
- `js/modules/uac.js` - User Account Control: modal elevation prompt for privileged actions (admin consent, or an administrator credential prompt for standard users); entry point `UAC.request({ name, message })`, also on `window._UAC`
- `js/modules/fsGuard.js` - Filesystem access policy (`check`) + write policy (`checkWrite`: `/Program Files` writes require a session elevation; the `\Windows` OS core is refused outright)
- `js/modules/packages.js` - Package service: scans installed package folders, downloads/unpacks `.w12pkg` archives into the vFS (system `/Program Files/<id>/` or per-user `~/AppData/Programs/<id>/`), uninstall, session pointer for the service worker; system-scope install/uninstall require UAC elevation
- `js/modules/appLoader.js` - App catalog + **lazy** module loader: metadata from the registry + installed package manifests; `ensureLoaded`/`launch` are async (`import()` on first launch), `getModule` is sync (loaded-or-null)
- `js/modules/networkStatus.js` - Device connectivity (`navigator.onLine` + `online`/`offline` events): paints the tray Wi-Fi indicator, opens the network flyout, and exposes `isOnline()` / `onChange(cb)` / `ensureOnline(feature)` / `showError(feature)` (also `window._NetworkStatus`) so online-only features fail with a clean connection error
- `js/modules/tray.js` - App system-tray icons: notification-area icons registered by background-capable apps (click / double-click / right-click, context menu, tooltip, live icon + badge), scoped per session; public surface is the SDK `Tray` namespace (`app.tray`, see `js/sdk/tray.js`); also `window._Tray`
- `sw.js` - Service worker (registered by the `index.html` bootstrap, never by `js/main.js`): downloads and unpacks the core bundle into OPFS, serves the OS core and installed packages out of OPFS, keeps the tiny shell cached for offline reloads

### Windows Update (retired)

The update service is gone (`updateService.js`, `windowsUpdate.js` and the
`w12:update-state` event are removed). Updating is the bootstrap's job and it
happens on a page refresh:

- **The check is the refresh.** `index.html` calls `registration.update()` on
  every start, so a changed `sw.js` is found immediately instead of on a
  30-minute timer.
- **The new worker installs its core and waits.** The bootstrap activates it
  by posting `skip-waiting`, waits for `controllerchange` and reloads into
  the new core. There is no prompt and no notification; the black boot screen
  is all the user sees.
- **A first start needs no prompt either.** The bootstrap installs the core,
  reloads once and boots.
- **Settings > Windows Update is a static page** that always says *You're up
  to date* and shows the running version (`CoreStore.version()`). Do not add
  checks, downloads, restart buttons or history there. Store apps update
  from the Store by hand.

### Apps (folder-based — see APP_DEVELOPMENT_GUIDE.md)
- Each app lives in `js/apps/<id>/` with `manifest.json` (id, uuid, name, version, distribution, associations, store info), `main.js` (wired entry), `scripts/` (extra modules), `assets/` (static files incl. `icon.svg`)
- **Any change inside an app folder requires a semver `version` bump in its `manifest.json`** (see Critical rules). Never reuse a version for changed app code.
- `js/apps/registry.js` is GENERATED by `node scripts/build-registry.js` (validates all manifests, emits **metadata only**, rewrites the `sw.js` distribution map) — never hand-edit; run the script after any manifest change and after adding/removing an app folder
- `w12-core.pkg` is GENERATED by `node scripts/build-core.js` (the OS core bundle: shell, stylesheets, modules, SDK, builtin apps, sounds) — run it after **any** change to the core; a stale bundle ships old code
- `packages/<id>.w12pkg` archives (store apps) are GENERATED by `node scripts/build-packages.js` — run it after changing any store app; commit the archives, but only rebuild/commit the packages whose app actually changed (the builder rewrites all of them with fresh timestamps)
- **Packages** are the app unit: builtins ship inside the core bundle (always installed, not removable) and store apps are downloaded into the vFS and executed from disk; the package folder existing *is* the install record
- Examples: `js/apps/settings/` (system cards), `js/apps/notepad/` (text editing), `js/apps/fileExplorer/` (virtual file system), `js/apps/sampleApp/` (reference template)

### Styling
- `css/main.css` - Root variables, desktop background, base reset
- `css/taskbar.css` - Taskbar layout and tray
- `css/startmenu.css` - Start menu dropdown
- `css/windows.css` - Window chrome, resize handles
- `css/popup.css` - Popup/dialog styles

## Conventions
- All JS uses ES modules (`import`/`export`)
- Windows are draggable from header, resizable from all 8 edges/corners
- Icons are inline SVGs, except app icons which ship as `assets/icon.svg` inside each package (still no external/CDN assets)
- Dark theme throughout (Windows 11 acrylic style)
- **Multi-user OS with CONCURRENT sessions.** Accounts live in `/system/users/accounts.json` (`js/modules/users.js`, also `window._Users`). Use `Users.home(sub)` for the foreground user's home and `Users.userData(sub)` for per-user OS data (pins, activity, notifications, autostart, virtual desktops, window layout). Several profiles can be signed in at once (`js/modules/sessions.js`): each window is tagged with the session that created it (`windowData.userId`), the taskbar/desktops only reflect the foreground one, and switching is in-page (no reload). Never assume a single user; background code that must keep targeting its own profile uses `Users.homeFor/appDataFor/userDataFor(id, …)`.
- **Boot is two-phase (no profile preload).** `js/main.js` first does only `FileSystem.init()` + `Users.loadAccounts()`, shows the login picker, and builds the shell + per-user state for the CHOSEN profile afterwards (`bootShell()` on first sign-in, then `activateSession(userId)` per switch). The per-user modules (`SystemConfig`, `UserActivity`, `Notifications`, `StartMenu`, `DesktopIcons`, `Taskbar`, `WindowState`, `VirtualDesktops`, `BackgroundApps`) expose an `activate(userId)` hook that `main.js` calls on a switch; window visibility is centralised in `WindowManager.applyVisibility` (foreground session ∧ active desktop ∧ not minimized). Session transitions (`window._Shell`: sign in / activate / sign out / lock / sleep / restart / shut down, or `LockScreen`) are the supported way to change sessions — `Users.beginSwitch` is a recovery-only reload fallback. **Known limitation:** apps are ES-module singletons in one realm, so the same app open in two sessions shares module state, and an async callback in a *background* session resolves `Users.home()`/`appData()` against the foreground user — pass explicit ids (`*For`) when it matters.
- **Account types + UAC.** Every account is an `administrator` or a `standard` user (`Users.isAdmin()`, `Users.getAccountType()`, `Users.setAccountType()`); at least one administrator always exists — the last one can't be demoted or deleted, and legacy stores are normalized to an administrator. Privileged actions raise a **User Account Control** prompt (`js/modules/uac.js`, also `window._UAC`): `await UAC.request({ name, message })` → `Promise<boolean>`. Administrators get a Yes/No consent dialog; standard users get a credential prompt (pick an administrator, type its password — a passwordless administrator approves by selection). Elevation is per-action and never persistent. Gate privileged actions with it: system-wide package install/uninstall (`js/modules/packages.js` throws an error with `err.elevationDenied = true` when declined), account management (Settings), and app writes inside `/Program Files`. The prompt renders on a modal *secure desktop* (`body.uac-active` hides every window/icon/taskbar and dims the stretched wallpaper — see `css/main.css`), so never hard-code a z-index that competes with it.
- **Persistent data must use the FileSystem module** (`js/modules/fileSystem.js`), not `localStorage`. Per-user app data goes under `/users/<id>/AppData/<app>/` — via the SDK (`app.files`) or `Users.appData('<app>', sub)`. The opt-in shared store is `/system/programs data/<app>/` (SDK `app.globalFiles`). The storage backend is OPFS, always: the tree snapshot is `w12/fs.json` and large files are real files under `w12/blobs/` (writes go through `js/workers/opfsWorker.js`). There is no fallback — `FileSystem.init()` is **async**, must be awaited before any FS call (`main.js` does; keep it first in boot order), and throws a clear error when the browser has no OPFS. The only direct localStorage use left is the legacy install keys from the pre-OPFS era, which are simply ignored now.
- **The OS core is read-only.** `\Windows` is the mirror of the core bundle on disk (`js/modules/coreStore.js`). `FileSystem.isReadOnly(path)` reports it and `fsGuard.checkWrite()` refuses every write to it — apps, shell code and scripts alike, with no elevation and no consent prompt. Only the mirror itself writes there, as shell-owned work. Never add a path under `\Windows` to a writable list.
- **Display resolution and scaling are machine-wide**, not per-profile. They live in one global, shell-owned/OS-only store (`/system/programs data/display/settings.json`, written through `SystemConfig.setGlobal`/`setGlobals`) and are read back with `SystemConfig.initGlobal()`/`loadGlobal()`; `isGlobalKey()` reports the global keys. `js/main.js` calls `SystemConfig.initGlobal()` before `Scaling.init()`, so the boot/login/lock screens (which render before any profile) share the device's configuration. Changing them is **privileged**: Settings > System > Display raises UAC, then sets them via `SystemConfig.set('scaling'|'displayResolution', …)`, which routes to the global store. Keep those keys out of the per-user `config.json` (the SDK `Settings.set` rejects them).
- **Filesystem permission is enforced** (`js/modules/fsGuard.js`): apps freely access their own AppData folders; anything outside requires the manifest `filesystem` permission, or a runtime consent dialog for apps that don't declare it. Reads use `FSGuard.check` (injected via `FileSystem.setAccessChecker`); **mutations** additionally use `FSGuard.checkWrite` (injected via `FileSystem.setWriteChecker`), which is identical except that writes inside `/Program Files` require a per-app session elevation (a UAC prompt; reads stay allowed so File Explorer can browse) and writes inside `\Windows` are always refused. OS modules must wrap their FS access in `window._FSGuard.asShell(fn)` so shell writes aren't attributed to the focused app (the guard is a synchronous inc/dec, so wrap each *synchronous* FS call individually, not a whole async function); shell-context writes skip the elevation gate. Accessing `/system/users/**`, `system/programs data/permissions/**`, `system/programs data/display/**` or the recycle bin from app code is denied.
- **App modules must not call `AppLoader`/`AppRegistry`/`AppMetadata`/`Packages`/`Users` user-dependent paths at module scope** (top-level). The registry <-> app import cycle leaves those bindings uninitialized during evaluation — only call them inside functions like `launch()`. This includes `Users.home()`/`Users.appData()` (current user isn't resolved until boot): store them as lazy functions (`const DATA_PATH = () => Users.appData(APP_ID)`).
- **After changing an app**, bump its version, then run `node scripts/build-registry.js` and `node scripts/build-core.js`; for a changed store app also run `node scripts/build-packages.js` (rebuild only that package). Run `node scripts/build-registry.js` after adding/removing any app folder, and `node scripts/build-core.js` after **any** change to the core (`js/modules/`, `js/sdk/`, `js/workers/`, `css/`, `assets/`, `shell.html`, `js/main.js`, `js/apps/registry.js`, a builtin app) — otherwise the browser keeps running the code in the previous bundle.
- **Never use native `alert()`, `confirm()`, or `prompt()`** — not even in `index.html`, which updates and reloads without asking. Inside the OS, always use the Popup API (`js/modules/popup.js`). All methods return Promises — use `.then()` or `await`. Available methods: `Popup.info()`, `Popup.warn()`, `Popup.error()`, `Popup.confirm()`, `Popup.pick()`, `Popup.textbox()`, `Popup.forum()`, `Popup.custom()`. Import it with `import Popup from '../modules/popup.js';`
- **For non-modal toasts use the Notifications API** (`js/modules/notifications.js`): `Notifications.info()`, `Notifications.action()` (buttons + `onAction`), `Notifications.forum()` (fields + `onSubmit`). Flags: `sticky`, `critical`, `silent`, `tag`. Methods return the id immediately; outcomes arrive via `onAction`/`onSubmit`/`onDismiss(reason)`. Import it with `import Notifications from '../modules/notifications.js';`
- **The OS must work offline.** The whole OS is on disk in OPFS: the service worker serves the core and the installed packages from there, so the OS boots and runs with no network at all — even if the host is down. Only genuinely-online features are affected: the Store's package downloads, `CHANGELOG.md` (Settings > About), cross-origin `fetch`es (Weather, Copilot, peer pairing) and remote iframes (Browser). A refresh while offline keeps the installed core (the update check fails silently). Check connectivity with `import NetworkStatus from '../modules/networkStatus.js'` (`isOnline()`, `onChange(cb)`, `ensureOnline(feature)` → clean Popup + `false`, or `showError(feature)`) and fail with a readable connection error instead of hanging or crashing. The tray Wi-Fi indicator reflects `navigator.onLine` automatically.

## Scaling & overlay positioning (mobile-critical)

The shell is laid out at `1920x1080` and scaled with `body { zoom: calc(--scale * --res-scale) }` (`css/main.css`, `js/modules/scaling.js`). On phones and narrow windows that zoom is well below `1`; desktop-sized viewports usually sit at `1`, which is why positioning bugs often appear only on mobile.

Two coordinate spaces must never be mixed:

- **Visual viewport px** — `e.clientX/clientY`, `getBoundingClientRect()`, `window.innerWidth/innerHeight`, `document.elementFromPoint()`. These are real screen pixels and already include zoom.
- **Zoomed layout px inside `<body>`** — CSS `px` written to `style.left/top/right/bottom`, `offsetWidth/offsetHeight`, `offsetLeft/offsetTop`. These are multiplied by the body zoom when rendered, so `visual = layout × zoom`.

Rules:

- JS-positioned overlays that are children of `<body>` (context menus, network/Wi-Fi flyout, taskbar switcher, tray overflow) must convert: `styleLeft = visualLeft / Scaling.getUiZoom()` (same for top/right/bottom). Clamp in one space only; never combine a visual rect with a layout `offsetWidth`.
- Always call `Scaling.getUiZoom()` instead of reading `Scaling.getScale()` — the display-resolution factor is part of the effective zoom.
- Elements appended to `document.documentElement` are **outside** the body zoom and map 1:1 to viewport pixels. `#snap-indicator`, the touch cursor and the virtual keyboard rely on this — keep them on `documentElement` and position them in visual px.
- Flyouts anchored purely in CSS (`bottom`/`right` on the Start menu, Search, clipboard, calendar) scale automatically; only JS-computed positions need the conversion.
- Every context menu must go through `ContextMenu.show(e.clientX, e.clientY, items)` so this conversion and the edge clamping apply.
- Verify any overlay change at a narrow viewport (DevTools device mode, e.g. `390x844`, body zoom < 1) as well as at desktop size, and test top/bottom/left/right taskbar edges when touching anchoring.

## Window & overlay lifecycle

- Window ids are generated by `WindowManager`; always use `win.id` instead of building your own counter/DOM id.
- Visibility (`WindowManager.applyVisibility`) is the intersection of foreground session, active virtual desktop and not-minimized. Restore/focus/minimize through `WindowManager` APIs only; raw `style.display` bypasses this and can reveal another profile's window.
- Bind document/global listeners once at module init, never inside a render loop. Per-window work must be released on the `window-closed` event (or `Lifecycle.onWindowClose`), including intervals and document listeners.
- Apps are ES-module singletons per realm. Module-scoped editor/game state is shared by every window: either guard against a second instance (focus the existing window) or keep state per-window.
- Any Promise-returning dialog must handle external close (`window-closed`) and settle exactly once, otherwise `await Popup.confirm(...)` / `SavePrompt.show(...)` hangs forever.

## Workflow

**Definition of done (run through before every commit):**

1. Any change under `js/apps/<id>/` has a semver bump in that app's `manifest.json`.
2. `node scripts/build-registry.js` **and** `node scripts/build-core.js` were run (the core bundle is what the browser actually runs); changed store apps had `node scripts/build-packages.js` run (only those packages committed).
3. No dead code, unused imports, `console.log`/`debugger` or temporary files remain.
4. `node scripts/test/sdk.smoke.mjs` passes, and `node --check` is clean on modified JS. The browser smoke tests are **not** run (the user tests by hand).
5. UI/overlay changes are **handed over** for a manual check at desktop size **and** a narrow/mobile viewport, not tested with a headless browser.

**Releasing:**

- Always commit and push changes after completing a task.
- Use descriptive commit messages with conventional commits format (e.g. `feat:`, `fix:`, `chore:`).
- **Before every commit**, add a new CHANGELOG.md version entry (never modify older entries). Only use these sections: **Added**, **Removed**, **Changed**, **Fixed**.
- As part of the release, bump `version.json` (`version` + `date`) and run `node scripts/update-version.js` so every `?v=` cache-buster in `index.html` matches the new version, then `node scripts/build-core.js` again (the core manifest carries the version).
- Commit order: 1) code changes 2) CHANGELOG.md + `version.json` + `index.html` 3) push.

## Running
Serve `index.html` statically via any web server (e.g. GitHub Pages). The site only needs to serve `index.html`, `sw.js`, `w12-core.pkg`, `manifest.json`, `favicon.svg` and `packages/*.w12pkg` — everything else the OS needs is downloaded into OPFS on the first run.

Requirements: a secure context (HTTPS or `localhost`), a browser with the Origin Private File System and `DecompressionStream` (Chrome 80+, Edge 80+, Firefox 113+, Safari 16.4+). `node scripts/test/boot.smoke.mjs` drives a headless browser through exactly this flow.
