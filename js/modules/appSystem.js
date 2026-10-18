import AppLoader from './appLoader.js';
import Permissions from './permissions.js';

// Compatibility facade over AppLoader. New code should use AppLoader directly.
// install/uninstall accept an app id or uuid (and are async: they download and
// unpack a package); getInstalledApps() returns ids.
const AppSystem = (() => {
    function init() {
        return AppLoader.init();
    }

    // Returns Promise<boolean>.
    function installApp(idOrUuid, opts) {
        return AppLoader.install(idOrUuid, opts);
    }

    // Returns Promise<boolean>. Grants are per-install: wiping on uninstall
    // means a revoked permission can't silently survive a reinstall.
    async function uninstallApp(idOrUuid) {
        const man = AppLoader.getManifest(idOrUuid) || AppLoader.getByUuid(idOrUuid);
        const ok = await AppLoader.uninstall(idOrUuid);
        try {
            if (man) Permissions.clearGrants(man.id);
        } catch (e) { /* grants already gone */ }
        return ok;
    }

    function getInstalledApps() {
        return AppLoader.getInstalledIds();
    }

    return { init, installApp, uninstallApp, getInstalledApps };
})();

export default AppSystem;
