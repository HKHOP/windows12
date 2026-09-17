// Sample App — the Windows 12 SDK reference template.
// Builds exclusively through the public SDK (js/sdk/index.js): one bound
// app context, no ../../modules/* imports. Copy this folder to start a new
// app, then run `node build-registry.js`. See APP_DEVELOPMENT_GUIDE.md.
//
// Rule (same reason as the AppLoader rule): never call createApp() at
// module scope — the registry↔app import cycle leaves SDK bindings
// uninitialized during evaluation. Create the context inside launch().
import { createApp, SDK_VERSION } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

function getContent(app, clicks, userName) {
    return `
        <div style="display:flex;flex-direction:column;height:100%;background:#202020;color:white;font-family:'Segoe UI',sans-serif;padding:24px;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
                <div style="width:56px;height:56px;background:linear-gradient(135deg, #6a11cb, #2575fc);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;box-shadow:0 4px 16px rgba(106,17,203,0.4);">S</div>
                <div>
                    <h1 style="font-size:24px;font-weight:600;margin:0 0 4px 0;">Sample Application</h1>
                    <p class="sample-sub" style="font-size:13px;color:#aaa;margin:0;">Built with Windows 12 SDK v${SDK_VERSION} — hello, ${userName}!</p>
                </div>
            </div>

            <div style="background:#282828;border:1px solid #383838;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:12px;flex:1;">
                <h3 style="font-size:16px;font-weight:500;margin:0;color:#fff;">SDK showcase</h3>
                <p style="font-size:13px;color:#ccc;line-height:1.5;margin:0;">
                    Counter persists in the app sandbox (<span style="font-family:Consolas,monospace;">/system/programs data/sampleApp/clicks.json</span>),
                    toasts go through Notifications, and the shortcut is registered centrally.
                </p>
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <button class="sample-action-btn" style="background:#0078D4;border:none;color:white;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Click Me</button>
                    <button class="sample-notify-btn" style="background:rgba(255,255,255,0.08);border:1px solid #4d4d4d;color:white;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Notify me</button>
                    <button class="sample-ask-btn" style="background:rgba(255,255,255,0.08);border:1px solid #4d4d4d;color:white;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Ask me</button>
                    <span class="sample-counter" style="align-self:center;font-size:13px;color:#aaa;">Clicks: ${clicks}</span>
                </div>
                <div class="sample-shortcut-hint" style="font-size:11px;color:#777;">Tip: press Ctrl+Shift+H anywhere in this window for a toast.</div>
            </div>
        </div>
    `;
}

function readClicks(app) {
    try {
        const raw = app.files.read('clicks.json');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Number.isFinite(parsed.clicks)) return parsed.clicks;
        }
    } catch { /* corrupt -> restart at zero */ }
    return 0;
}

function launch() {
    const app = createApp({ id: 'sampleApp', name: 'Sample App' });
    const win = app.window.create({
        title: 'Sample App',
        icon: app.icon(),
        content: getContent(app, readClicks(app), app.settings.get('userName', 'User')),
        width: 560,
        height: 460
    });
    const el = win.element;
    const counter = el.querySelector('.sample-counter');

    const paint = () => {
        counter.textContent = `Clicks: ${readClicks(app)}`;
    };

    el.querySelector('.sample-action-btn').addEventListener('click', () => {
        app.files.write('clicks.json', JSON.stringify({ clicks: readClicks(app) + 1 }));
        paint();
    });

    el.querySelector('.sample-notify-btn').addEventListener('click', () => {
        app.notify.info('Sample App', `Counter is at ${readClicks(app)} clicks.`);
    });

    el.querySelector('.sample-ask-btn').addEventListener('click', async () => {
        const ok = await app.dialogs.confirm('Sample App', 'Reset the click counter?');
        if (ok) {
            app.files.write('clicks.json', JSON.stringify({ clicks: 0 }));
            paint();
        }
    });

    // Central shortcut, scoped to this window and auto-owned by the app.
    app.keyboard.register('CTRL+SHIFT+H', () => {
        app.notify.info('Sample App', 'Hello from a centrally registered shortcut!');
    }, { scope: el, description: 'Sample toast' });

    app.shell.activity.trackAppOpen('sampleApp');
}

export default { launch, icon: AppIcons.get('sampleApp') };
