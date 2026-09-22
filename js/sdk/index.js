// Windows 12 SDK — stable public entry point (v1.2.0, independent of the
// OS version). Facade only: every namespace delegates to the internal
// modules, so behavior, settings and permissions are identical to the OS.
//
// Preferred style — one bound context per app:
//
//   import { createApp } from '../../sdk/index.js';
//   const app = createApp({ id: 'myApp', name: 'My App' });
//
// Flat namespaces stay available for advanced use:
//
//   import { WindowManager, Notifications } from '../../sdk/index.js';
//
// Compatibility: namespaces gain methods over time but never rename or
// remove stable ones within SDK major version 1.
import { WindowManager } from './windowManager.js';
import { FileSystem } from './filesystem.js';
import { Notifications } from './notifications.js';
import { Dialogs } from './dialogs.js';
import { Keyboard } from './keyboard.js';
import { Clipboard } from './clipboard.js';
import { Apps } from './apps.js';
import { Settings } from './settings.js';
import { Shell } from './shell.js';
import { FileAssociations } from './fileAssociations.js';
import { System } from './system.js';
import { Events } from './events.js';
import { Permissions } from './permissions.js';
import { Lifecycle } from './lifecycle.js';
import { Background } from './background.js';
import { Media } from './media.js';
import { createApp } from './app.js';
import { PointerLock } from './pointerLock.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Net } from './net.js';
import { Inject } from './inject.js';
import { SDKError, ErrorCodes } from './errors.js';
import { Engine3D } from './engine3d/engine.js';

/** SDK major contract version (semver, independent of the OS version). */
const SDK_VERSION = '1.3.0';

const Windows12 = {
    SDK_VERSION,
    version: SDK_VERSION,
    createApp,
    WindowManager,
    FileSystem,
    Files: FileSystem,
    Notifications,
    Dialogs,
    Keyboard,
    Clipboard,
    Apps,
    Settings,
    Shell,
    FileAssociations,
    System,
    Events,
    Permissions,
    Lifecycle,
    Background,
    Media,
    PointerLock,
    Input,
    Audio,
    Net,
    Inject,
    Engine3D,
    SDKError,
    ErrorCodes
};

export {
    SDK_VERSION,
    createApp,
    WindowManager,
    FileSystem,
    Notifications,
    Dialogs,
    Keyboard,
    Clipboard,
    Apps,
    Settings,
    Shell,
    FileAssociations,
    System,
    Events,
    Permissions,
    Lifecycle,
    Background,
    Media,
    PointerLock,
    Input,
    Audio,
    Net,
    Inject,
    Engine3D,
    SDKError,
    ErrorCodes
};

export { FileSystem as Files };

export default Windows12;
