const CACHE_NAME = 'windows12-v1';
const urlsToCache = [
    './',
    './index.html',
    './css/main.css',
    './css/taskbar.css',
    './css/startmenu.css',
    './css/windows.css',
    './css/contextmenu.css',
    './css/browser.css',
    './css/popup.css',
    './css/notifications.css',
    './css/clipboard.css',
    './css/taskview.css',
    './css/virtualKeyboard.css',
    './js/main.js',
    './js/modules/windowManager.js',
    './js/modules/taskbar.js',
    './js/modules/startMenu.js',
    './js/modules/contextMenu.js',
    './js/modules/fileSystem.js',
    './js/modules/popup.js',
    './js/modules/systemConfig.js',
    './js/modules/scaling.js',
    './js/modules/touch.js',
    './js/modules/cursor.js',
    './js/modules/desktopIcons.js',
    './js/modules/userActivity.js',
    './js/modules/windowState.js',
    './js/modules/windowsUpdate.js',
    './js/modules/saveprompt.js',
    './js/modules/appSystem.js',
    './js/modules/appLoader.js',
    './js/modules/backgroundApps.js',
    './js/modules/notifications.js',
    './js/modules/clipboardManager.js',
    './js/modules/keyboard.js',
    './js/modules/virtualKeyboard.js',
    './js/modules/permissions.js',
    './js/modules/crashMonitor.js',
    './js/modules/zip.js',
    './js/sdk/index.js',
    './js/sdk/errors.js',
    './js/sdk/windowManager.js',
    './js/sdk/filesystem.js',
    './js/sdk/notifications.js',
    './js/sdk/dialogs.js',
    './js/sdk/keyboard.js',
    './js/sdk/clipboard.js',
    './js/sdk/apps.js',
    './js/sdk/settings.js',
    './js/sdk/shell.js',
    './js/sdk/fileAssociations.js',
    './js/sdk/system.js',
    './js/sdk/events.js',
    './js/sdk/permissions.js',
    './js/sdk/lifecycle.js',
    './js/sdk/background.js',
    './js/sdk/media.js',
    './js/sdk/app.js',
    './js/sdk/pointerLock.js',
    './js/sdk/input.js',
    './js/sdk/audio.js',
    './js/apps/appStore/main.js',
    './js/apps/archiver/main.js',
    './js/apps/browser/main.js',
    './js/apps/calculator/main.js',
    './js/apps/calendar/main.js',
    './js/apps/cellESheet/main.js',
    './js/apps/clock/main.js',
    './js/apps/copilotButBetter/main.js',
    './js/apps/discord/main.js',
    './js/apps/export/main.js',
    './js/apps/fileExplorer/main.js',
    './js/apps/game2048/main.js',
    './js/apps/markdownStudio/main.js',
    './js/apps/mediaPlayer/main.js',
    './js/apps/minecraft/main.js',
    './js/apps/minesweeper/main.js',
    './js/apps/musicSpark/main.js',
    './js/apps/notepad/main.js',
    './js/apps/paint/main.js',
    './js/apps/passwordVault/main.js',
    './js/apps/photos/main.js',
    './js/apps/pomodoro/main.js',
    './js/apps/qrStudio/main.js',
    './js/apps/riftboundRunner/main.js',
    './js/apps/sampleApp/main.js',
    './js/apps/settings/main.js',
    './js/apps/sledgePoint/main.js',
    './js/apps/solarSpacer/main.js',
    './js/apps/stickyNotes/main.js',
    './js/apps/subwaySurfers/main.js',
    './js/apps/taskManager/main.js',
    './js/apps/terminal/main.js',
    './js/apps/todoTasks/main.js',
    './js/apps/unitConverter/main.js',
    './js/apps/voiceRecorder/main.js',
    './js/apps/vscode/main.js',
    './js/apps/weather/main.js',
    './js/apps/words/main.js',
    './favicon.svg',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
