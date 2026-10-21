// Windows Update — the shell's view on the update service.
//
// The service (js/modules/updateService.js) does the work: it checks in the
// background, downloads what it finds and asks for a restart. The window
// belongs to Settings (Settings > Windows Update); this module is the small
// piece both of them use: the version that is running, whether an update is
// waiting, and the history of what was installed.
import UpdateService from './updateService.js';
import Popup from './popup.js';

const WindowsUpdate = (() => {
    function getCurrentVersion() {
        const state = UpdateService.getState();
        return state.osCurrent || null;
    }

    function getLatestVersion() {
        const state = UpdateService.getState();
        return state.osVersion || null;
    }

    function isUpdateAvailable() {
        const state = UpdateService.getState();
        return !!state.osPending || !!state.osVersion || state.apps.length > 0 || state.status === 'ready';
    }

    // Checks for updates and starts downloading what it finds. Returns true
    // when something was found.
    async function checkForUpdates(silent = false) {
        const state = await UpdateService.check({ manual: !silent });
        if (!silent && state.status === 'error') {
            Popup.warn('Windows Update', state.message || 'Unable to check for updates.');
        }
        return state.status !== 'error' && (!!state.osVersion || state.apps.length > 0);
    }

    function history() {
        return UpdateService.history();
    }

    function init() {
        // The service reports every change; the Settings page follows along.
        window.addEventListener('w12:update-state', () => { /* the page re-reads the state */ });
        return Promise.resolve();
    }

    function destroy() { /* nothing to release */ }

    return { init, destroy, getCurrentVersion, getLatestVersion, isUpdateAvailable, checkForUpdates, history };
})();

export default WindowsUpdate;
