import AppLoader from './appLoader.js';
import Permissions from './permissions.js';

// Compatibility facade over AppLoader. New code should use AppLoader directly.
// install/uninstall accept an app id or uuid; getInstalledApps() returns ids.
const AppSystem = (() => {
    function init() {
        AppLoader.init();
    }

    function installApp(idOrUuid) {
        AppLoader.install(idOrUuid);
    }

    function uninstallApp(idOrUuid) {
        AppLoader.uninstall(idOrUuid);
        // Grants are per-install: wiping on uninstall means a revoked
        // permission can't silently survive a reinstall.
        try {
            const man = AppLoader.getManifest(idOrUuid) || AppLoader.getByUuid(idOrUuid);
            if (man) Permissions.clearGrants(man.id);
        } catch (e) { /* grants already gone */ }
    }

    function getInstalledApps() {
        return AppLoader.getInstalledIds();
    }

    return { init, installApp, uninstallApp, getInstalledApps };
})();

export default AppSystem;
