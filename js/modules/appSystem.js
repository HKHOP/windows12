import WindowManager from '../modules/windowManager.js';
import { AppRegistry } from './taskbar.js';
import SampleApp from '../apps/sampleApp.js';
import AppStore from '../apps/appStore.js';

const AppSystem = (() => {
    function init() {
        AppRegistry.register('sampleApp', SampleApp);
        AppRegistry.register('appStore', AppStore);
        loadInstalledApps();
    }

    function loadInstalledApps() {
        const installed = JSON.parse(localStorage.getItem('installed_apps') || '[]');
        installed.forEach(appId => {
            if (appId === 'sampleApp') {
                AppRegistry.register('sampleApp', SampleApp);
            }
        });
    }

    function installApp(appId) {
        let installed = JSON.parse(localStorage.getItem('installed_apps') || '[]');
        if (!installed.includes(appId)) {
            installed.push(appId);
            localStorage.setItem('installed_apps', JSON.stringify(installed));
        }
        if (appId === 'sampleApp') {
            AppRegistry.register('sampleApp', SampleApp);
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
