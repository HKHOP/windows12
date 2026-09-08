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
    './js/modules/desktopIcons.js',
    './js/modules/userActivity.js',
    './js/modules/windowState.js',
    './js/modules/windowsUpdate.js',
    './js/modules/saveprompt.js',
    './js/modules/appSystem.js',
    './js/modules/appLoader.js',
    './js/apps/appStore/main.js',
    './js/apps/browser/main.js',
    './js/apps/calculator/main.js',
    './js/apps/calendar/main.js',
    './js/apps/cellESheet/main.js',
    './js/apps/clock/main.js',
    './js/apps/export/main.js',
    './js/apps/fileExplorer/main.js',
    './js/apps/musicSpark/main.js',
    './js/apps/notepad/main.js',
    './js/apps/paint/main.js',
    './js/apps/photos/main.js',
    './js/apps/sampleApp/main.js',
    './js/apps/settings/main.js',
    './js/apps/sledgePoint/main.js',
    './js/apps/taskManager/main.js',
    './js/apps/terminal/main.js',
    './js/apps/vscode/main.js',
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
