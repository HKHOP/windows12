// Jad AI — thin wrapper around the Jad AI web app.
// The site embeds cleanly, so there is no fallback banner.
// Rule: never call AppLoader/AppRegistry at module scope — only in launch().
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';

const JadAI = (() => {
    const APP_ID = 'jadAi';
    const APP_URL = 'https://jadai.freesrv.com';
    const icon = AppIcons.get(APP_ID);

    function getContent() {
        return `
            <div class="jadai-root" style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#0b0f1a;">
                <iframe class="jadai-frame" title="Jad AI" tabindex="0" src="${APP_URL}"
                    allow="microphone; camera; autoplay; fullscreen; clipboard-write"
                    sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"
                    style="flex:1 1 0%;width:100%;height:100%;min-height:0;min-width:0;border:none;display:block;background:#0b0f1a;"></iframe>
            </div>`;
    }

    function launch() {
        const win = WindowManager.createWindow(APP_ID, 'Jad AI', icon, getContent(), {
            width: 1000, height: 720, minWidth: 480, minHeight: 360
        });
        const el = win.element;
        const frame = el.querySelector('.jadai-frame');
        const capture = () => {
            try { frame.contentWindow.focus(); } catch (e) { /* cross-origin */ }
            try { frame.focus({ preventScroll: true }); } catch (e) { try { frame.focus(); } catch (e2) {} }
        };
        frame.addEventListener('load', () => { capture(); setTimeout(capture, 100); });
        el.querySelector('.jadai-root').addEventListener('pointerdown', () => { capture(); setTimeout(capture, 0); });
    }

    return { launch };
})();

export default JadAI;