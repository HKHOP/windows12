// Miro — thin iframe wrapper around the real Miro web app.
// Rule: never call AppLoader/AppRegistry at module scope — only in launch().
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import Users from '../../modules/users.js';

const Miro = (() => {
    const icon = AppIcons.get('miro');
    const APP_URL = 'https://miro.com';
    const DATA_PATH = () => Users.appData('miro');
    const NOTICE_PATH = [...DATA_PATH(), 'notice.json'];

    function ensureDataDir() {
        try {
            if (!FileSystem.itemExists(DATA_PATH())) {
                FileSystem.createFolder(Users.home(['AppData']), 'miro');
            }
        } catch (e) { /* storage unavailable — notice just won't persist */ }
    }

    function isNoticeDismissed() {
        try {
            const raw = FileSystem.readFile(NOTICE_PATH);
            if (raw) return !!JSON.parse(raw).dismissed;
        } catch (e) { /* fall through */ }
        return false;
    }

    function setNoticeDismissed(v) {
        try {
            ensureDataDir();
            const json = JSON.stringify({ dismissed: !!v });
            if (FileSystem.itemExists(NOTICE_PATH)) {
                FileSystem.writeFile(NOTICE_PATH, json);
            } else {
                FileSystem.createFile(DATA_PATH(), 'notice.json', json, 'json');
            }
        } catch (e) { /* noop */ }
    }

    function platformMessage() {
        const ua = (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '');
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/i.test(ua);
        if (isIOS) {
            return 'iOS devices cannot display embedded sites that send X-Frame-Options or CSP headers blocking embedding, so this view may stay blank. Use a desktop browser with the extension helper instead.';
        }
        if (isAndroid) {
            return 'Android browsers that do not support extensions cannot unblock embedded sites. Install a browser that supports extensions, then reopen its extension popup to enable embedding.';
        }
        return 'Some sites block embedding with X-Frame-Options or CSP headers. On desktop, install the helper extension from the Browser app (menu -> Recommended Extension) and those sites will load.';
    }

    function getContent() {
        return `
            <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#1e1e1e;">
                <iframe title="Miro" allow="autoplay; fullscreen; clipboard-write" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" style="flex:1 1 0%;width:100%;height:100%;min-height:0;min-width:0;display:block;border:none;background:#1e1e1e;" src="${APP_URL}"></iframe>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('miro', 'Miro', icon, getContent(), {
            width: 1000, height: 650, minWidth: 480, minHeight: 360
        });
        if (!isNoticeDismissed()) {
            setNoticeDismissed(true);
            try { Popup.info('Embedded site notice', platformMessage()); } catch (e) { /* noop */ }
        }
    }

    return { launch };
})();

export default Miro;
