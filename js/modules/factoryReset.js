// Factory reset — one implementation, two callers: Settings > System >
// Recovery (the user asked for it) and the storage-loss recovery in
// js/main.js (the browser storage disappeared under a running OS).
//
// A reset has to take BOTH stores with it. The virtual filesystem is one of
// them, but several OS modules keep their own copy in memory on top of it:
//
//   * the registry holds the whole machine in memory and writes the store
//     back on its next change (so dropping registry.json is not enough),
//   * SystemConfig keeps this profile's settings and mirrors them into the
//     registry on every save,
//   * Users keeps the account list,
//   * Packages keeps the set of installed apps.
//
// So the order matters: clear the packages and the registry first (while the
// tree is still coherent), reset the tree, then let Users and SystemConfig
// write the defaults a fresh machine has. The caller restarts afterwards,
// which re-registers the builtin apps and re-seeds everything else.
import FileSystem from './fileSystem.js';
import Registry from './registry.js';
import Users from './users.js';
import SystemConfig from './systemConfig.js';
import Packages from './packages.js';

async function wipe(options) {
    const opts = options || {};

    // Installed apps: uninstall bookkeeping happens against the tree that is
    // about to be replaced, so it runs first.
    try { Packages.clearAll(); } catch (e) { /* the tree reset covers it */ }

    // The registry is its own store (in memory + on disk). It must be
    // cleared explicitly or it writes itself back over the fresh tree.
    Registry.factoryReset();

    // Fresh filesystem: default tree, no user data, no registry file.
    FileSystem.resetToDefault();

    // Recreate what a factory machine has: one passwordless administrator
    // and the default shell settings.
    await Users.factoryReset();
    SystemConfig.factoryReset();

    // Pre-OPFS leftovers, if any survived.
    if (opts.clearLocalStorage !== false) {
        try { localStorage.clear(); } catch (e) { /* noop */ }
    }

    // The fresh tree references no blob bytes; the old ones would otherwise
    // survive the reset in the blob area.
    try {
        const OpfsClient = (await import('./opfsClient.js')).default;
        await OpfsClient.removeEntry('w12/blobs', true);
    } catch (e) { /* legacy backend or no blobs */ }

    await FileSystem.flushAsync();
    return true;
}

export default { wipe };
