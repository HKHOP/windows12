import WindowManager from '../modules/windowManager.js';

const SampleApp = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="url(#paint0_linear)"/><text x="12" y="17" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="sans-serif">S</text><defs><linearGradient id="paint0_linear" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#6a11cb"/><stop offset="1" stop-color="#2575fc"/></linearGradient></defs></svg>`;

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;background:#202020;color:white;font-family:'Segoe UI',sans-serif;padding:24px;box-sizing:border-box;">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
                    <div style="width:56px;height:56px;background:linear-gradient(135deg, #6a11cb, #2575fc);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;box-shadow:0 4px 16px rgba(106,17,203,0.4);">S</div>
                    <div>
                        <h1 style="font-size:24px;font-weight:600;margin:0 0 4px 0;">Sample Application</h1>
                        <p style="font-size:13px;color:#aaa;margin:0;">Fully integrated user-installed app running on Windows 12.</p>
                    </div>
                </div>

                <div style="background:#282828;border:1px solid #383838;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:16px;flex:1;">
                    <h3 style="font-size:16px;font-weight:500;margin:0;color:#fff;">Interactive Features</h3>
                    <p style="font-size:13px;color:#ccc;line-height:1.5;margin:0;">
                        This sample application demonstrates the dynamic app installation pipeline. It was installed via the Microsoft Store, registered in the system start menu, and can be uninstalled anytime from system settings or via right-click in the start menu.
                    </p>
                    <div style="display:flex;gap:12px;margin-top:auto;">
                        <button class="sample-action-btn" style="background:#0078D4;border:none;color:white;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Click Me</button>
                        <span class="sample-counter" style="align-self:center;font-size:13px;color:#aaa;">Clicks: 0</span>
                    </div>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('sampleApp', 'Sample App', icon, getContent(), { width: 550, height: 420 });
        const el = win.element;
        const btn = el.querySelector('.sample-action-btn');
        const counter = el.querySelector('.sample-counter');
        let count = 0;

        btn.addEventListener('click', () => {
            count++;
            counter.textContent = `Clicks: ${count}`;
        });
    }

    return { launch, icon };
})();

export default SampleApp;
