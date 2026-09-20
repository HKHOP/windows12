// Discord — thin wrapper around the real Discord web app with your real account.
// Discord serves X-Frame-Options: DENY, so the embed only renders when the
// browser allows it (e.g. with the "Ignore X-Frame Headers" helper extension
// recommended in the Browser's menu). When the frame stays blank, the notice
// bar + "Open in Browser" fallback keep the app useful instead of dead.
// Rule: never call AppLoader/AppRegistry at module scope — only in launch().
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import FileSystem from '../../modules/fileSystem.js';
import Users from '../../modules/users.js';

const Discord = (() => {
    const icon = AppIcons.get('discord');
    const APP_URL = 'https://discord.com/app';
    const DATA_PATH = () => Users.appData('discord');
    const NOTICE_PATH = [...DATA_PATH(), 'notice.json'];

    function ensureDataDir() {
        try {
            if (!FileSystem.itemExists(DATA_PATH())) {
                FileSystem.createFolder(Users.home(['AppData']), 'discord');
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

    function getContent(showNotice) {
        return `
            <div class="discord-root" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#313338;color:#fff;">
                <div class="discord-notice" style="display:${showNotice ? 'flex' : 'none'};align-items:center;gap:8px;padding:6px 12px;background:rgba(88,101,242,0.16);border-bottom:1px solid rgba(88,101,242,0.45);font-size:12px;color:#c7cdfb;flex-shrink:0;">
                    <span style="flex:1;min-width:0;">Discord blocks embedded logins in some browsers. If this view stays blank, use Open in Browser — or install the unblocking extension from the Browser's ⋮ menu.</span>
                    <button class="discord-notice-open" style="background:#5865F2;border:none;color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;flex-shrink:0;">Open in Browser</button>
                    <button class="discord-notice-hide" title="Dismiss" style="background:none;border:none;color:#c7cdfb;cursor:pointer;font-size:14px;padding:2px 6px;flex-shrink:0;">×</button>
                </div>
                <iframe class="discord-frame" title="Discord" allow="microphone; camera; display-capture; autoplay; fullscreen; clipboard-write" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" style="flex:1 1 0%;width:100%;height:100%;min-height:0;min-width:0;display:block;border:none;background:#313338;" src="${APP_URL}"></iframe>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('discord', 'Discord', icon, getContent(!isNoticeDismissed()), {
            width: 1000, height: 650, minWidth: 480, minHeight: 360
        });
        const el = win.element;
        const notice = el.querySelector('.discord-notice');

        const openExternal = () => {
            try {
                window.open(APP_URL, '_blank', 'noopener');
            } catch (e) { /* popup blocked — user can copy the URL */ }
        };

        el.querySelector('.discord-notice-open').addEventListener('click', openExternal);
        el.querySelector('.discord-notice-hide').addEventListener('click', () => {
            notice.style.display = 'none';
            setNoticeDismissed(true);
        });
    }

    return { launch };
})();

export default Discord;
