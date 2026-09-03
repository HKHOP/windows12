import WindowManager from '../modules/windowManager.js';
import AppSystem from '../modules/appSystem.js';

const AppStore = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3H10V10H3V3Z" fill="#0078D4"/><path d="M14 3H21V10H14V3Z" fill="#0078D4"/><path d="M3 14H10V21H3V14Z" fill="#0078D4"/><path d="M14 14H21V21H14V14Z" fill="#0078D4"/></svg>`;

    function getContent() {
        return `
            <div style="display:flex;height:100%;background:#1e1e1e;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;">
                <!-- Sidebar -->
                <div style="width:240px;background:#252526;display:flex;flex-direction:column;padding:12px 8px;border-right:1px solid #333;">
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:16px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 3H10V10H3V3Z" fill="#0078D4"/><path d="M14 3H21V10H14V3Z" fill="#0078D4"/><path d="M3 14H10V21H3V14Z" fill="#0078D4"/><path d="M14 14H21V21H14V14Z" fill="#0078D4"/></svg>
                        <span style="font-weight:600;font-size:15px;">Microsoft Store</span>
                    </div>
                    <div class="store-nav-item active" data-tab="home" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,0.08);margin-bottom:4px;font-size:13px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        <span>Home</span>
                    </div>
                    <div class="store-nav-item" data-tab="apps" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;color:#aaa;margin-bottom:4px;font-size:13px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        <span>Apps</span>
                    </div>
                    <div class="store-nav-item" data-tab="gaming" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;color:#aaa;margin-bottom:4px;font-size:13px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="12" x2="18" y2="12"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
                        <span>Gaming</span>
                    </div>
                    <div style="flex:1;"></div>
                    <div class="store-nav-item" data-tab="library" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;color:#aaa;font-size:13px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                        <span>Library</span>
                    </div>
                </div>

                <!-- Main Content Area -->
                <div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#181818;">
                    <!-- Top Bar -->
                    <div style="padding:16px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#181818;z-index:10;">
                        <div style="display:flex;align-items:center;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:20px;padding:6px 16px;width:400px;gap:10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" class="store-search" placeholder="Search apps, games, and more" style="background:none;border:none;color:white;outline:none;font-size:13px;width:100%;">
                        </div>
                        <div style="width:32px;height:32px;background:#0078D4;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;">U</div>
                    </div>

                    <!-- Scrollable Body -->
                    <div style="padding:0 24px 32px 24px;display:flex;flex-direction:column;gap:24px;">
                        <!-- Hero Section -->
                        <div style="display:grid;grid-template-columns: 2fr 1fr;gap:16px;height:340px;">
                            <!-- Big Carousel Card -->
                            <div style="background:linear-gradient(135deg, #0f2027, #203a43, #2c5364);border-radius:12px;padding:32px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;border:1px solid #333;">
                                <div style="z-index:2;">
                                    <h1 style="font-size:36px;font-weight:700;margin-bottom:8px;">Microsoft Copilot</h1>
                                    <p style="color:#ccc;font-size:14px;max-width:350px;">Search smarter and unleash creativity with Copilot</p>
                                </div>
                                <div style="display:flex;gap:12px;align-items:center;z-index:2;">
                                    <button class="store-get-btn" data-app="copilot" style="background:#0078D4;border:none;color:white;padding:10px 28px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;transition:background 0.2s;">Get</button>
                                </div>
                                <div style="display:flex;gap:6px;position:absolute;bottom:16px;left:50%;transform:translateX(-50%);z-index:2;">
                                    <div style="width:20px;height:4px;background:white;border-radius:2px;"></div>
                                    <div style="width:6px;height:4px;background:rgba(255,255,255,0.4);border-radius:2px;"></div>
                                    <div style="width:6px;height:4px;background:rgba(255,255,255,0.4);border-radius:2px;"></div>
                                </div>
                            </div>
                            <!-- Side Featured Card: Sample App -->
                            <div style="display:flex;flex-direction:column;gap:16px;">
                                <div style="flex:1;background:linear-gradient(135deg, #6a11cb, #2575fc);border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #333;">
                                    <div>
                                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                            <div style="width:36px;height:36px;background:white;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#6a11cb;font-weight:bold;font-size:18px;">S</div>
                                            <h3 style="font-size:18px;font-weight:600;">Sample App</h3>
                                        </div>
                                        <p style="font-size:12px;color:#eee;margin-bottom:8px;">A fully functional sample app with interactive features.</p>
                                        <div style="display:inline-block;background:rgba(0,0,0,0.3);padding:2px 8px;border-radius:4px;font-size:11px;color:#ddd;">Free • Productivity</div>
                                    </div>
                                    <button class="store-install-btn" data-app="sampleApp" style="background:#0078D4;border:none;color:white;padding:8px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;align-self:flex-start;transition:background 0.2s;">Install</button>
                                </div>
                            </div>
                        </div>

                        <!-- Available Apps Grid -->
                        <div style="background:#222;border-radius:12px;padding:20px;border:1px solid #333;">
                            <h3 style="font-size:16px;font-weight:600;color:white;margin-bottom:16px;">Available Apps & Games</h3>
                            <div style="display:flex;gap:16px;flex-wrap:wrap;">
                                <div style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;">
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <div style="width:48px;height:48px;background:#007ACC;border-radius:10px;display:flex;align-items:center;justify-content:center;">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="white"/></svg>
                                        </div>
                                        <div>
                                            <div style="font-weight:600;font-size:13px;margin-bottom:2px;">Visual Studio Code</div>
                                            <div style="font-size:11px;color:#888;">Developer Tools</div>
                                        </div>
                                    </div>
                                    <p style="font-size:12px;color:#aaa;line-height:1.4;">Code editor with file explorer, syntax highlighting, and integrated terminal.</p>
                                    <button class="store-install-btn" data-app="vscode" style="background:#0078D4;border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;transition:background 0.2s;">Install</button>
                                </div>
                                <div style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;">
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <div style="width:48px;height:48px;background:linear-gradient(135deg, #6a11cb, #2575fc);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:22px;">S</div>
                                        <div>
                                            <div style="font-weight:600;font-size:13px;margin-bottom:2px;">Sample App</div>
                                            <div style="font-size:11px;color:#888;">Productivity</div>
                                        </div>
                                    </div>
                                    <p style="font-size:12px;color:#aaa;line-height:1.4;">Interactive sample app that demonstrates full system installation, uninstallation, and launching.</p>
                                    <button class="store-install-btn" data-app="sampleApp" style="background:#0078D4;border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;transition:background 0.2s;">Install</button>
                                </div>
                                <div style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;">
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <div style="width:48px;height:48px;background:linear-gradient(135deg, #0078D4, #00BCF2);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
                                        </div>
                                        <div>
                                            <div style="font-weight:600;font-size:13px;margin-bottom:2px;">Ex/port</div>
                                            <div style="font-size:11px;color:#888;">Utilities</div>
                                        </div>
                                    </div>
                                    <p style="font-size:12px;color:#aaa;line-height:1.4;">Import files from your device to the filesystem, or export files to download.</p>
                                    <button class="store-install-btn" data-app="export" style="background:#0078D4;border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;transition:background 0.2s;">Install</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function checkInstalledStatus(winElement) {
        const buttons = winElement.querySelectorAll('.store-install-btn, .store-get-btn');
        const installedApps = JSON.parse(localStorage.getItem('installed_apps') || '[]');
        buttons.forEach(btn => {
            const appId = btn.getAttribute('data-app');
            if (appId && installedApps.includes(appId)) {
                btn.textContent = 'Installed';
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#aaa';
            }
        });
    }

    function launch() {
        const win = WindowManager.createWindow('appStore', 'Microsoft Store', icon, getContent(), { width: 1000, height: 680 });
        const el = win.element;
        
        checkInstalledStatus(el);

        const navItems = el.querySelectorAll('.store-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(n => {
                    n.classList.remove('active');
                    n.style.background = 'none';
                    n.style.color = '#aaa';
                });
                item.classList.add('active');
                item.style.background = 'rgba(255,255,255,0.08)';
                item.style.color = 'white';
            });
        });

        const installBtns = el.querySelectorAll('.store-install-btn, .store-get-btn');
        installBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const appId = btn.getAttribute('data-app');
                if (!appId) return;

                AppSystem.installApp(appId);

                btn.textContent = 'Installed';
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#aaa';
            });
        });
    }

    return { launch, icon };
})();

export default AppStore;
