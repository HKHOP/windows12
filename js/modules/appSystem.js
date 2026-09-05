import { AppRegistry } from './taskbar.js';
import SampleApp from '../apps/sampleApp.js';
import VSCode from '../apps/vscode.js';
import AppStore from '../apps/appStore.js';
import ExportImport from '../apps/export.js';
import Words from '../apps/words.js';

const AppSystem = (() => {
    const appModules = {
        sampleApp: SampleApp,
        vscode: VSCode,
        export: ExportImport,
        words: Words
    };

    function init() {
        AppRegistry.register('appStore', AppStore);
        loadInstalledApps();
    }

    function loadInstalledApps() {
        const installed = JSON.parse(localStorage.getItem('installed_apps') || '[]');
        installed.forEach(appId => {
            if (appModules[appId]) {
                AppRegistry.register(appId, appModules[appId]);
            }
        });
    }

    function installApp(appId) {
        let installed = JSON.parse(localStorage.getItem('installed_apps') || '[]');
        if (!installed.includes(appId)) {
            installed.push(appId);
            localStorage.setItem('installed_apps', JSON.stringify(installed));
        }
        if (appModules[appId]) {
            AppRegistry.register(appId, appModules[appId]);
        }
        window.dispatchEvent(new CustomEvent('apps-changed'));
    }

    function uninstallApp(appId) {
        let installed = JSON.parse(localStorage.getItem('installed_apps') || '[]');
        installed = installed.filter(id => id !== appId);
        localStorage.setItem('installed_apps', JSON.stringify(installed));
        window.dispatchEvent(new CustomEvent('apps-changed'));
    }

    function getInstalledApps() {
        return JSON.parse(localStorage.getItem('installed_apps') || '[]');
    }

    return { init, installApp, uninstallApp, getInstalledApps };
})();

export default AppSystem;
