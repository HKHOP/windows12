import AppLoader from './appLoader.js';

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
    }

    function getInstalledApps() {
        return AppLoader.getInstalledIds();
    }

    return { init, installApp, uninstallApp, getInstalledApps };
})();

export default AppSystem;
