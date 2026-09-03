import WindowManager from '../modules/windowManager.js';

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
                    <div class="store-nav-item" data-tab="entertainment" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;color:#aaa;margin-bottom:4px;font-size:13px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        <span>Entertainment</span>
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
                                    <div style="width:6px;height:4px;background:rgba(255,255,255,0.4);border-radius:2px;"></div>
                                    <div style="width:6px;height:4px;background:rgba(255,255,255,0.4);border-radius:2px;"></div>
                                </div>
                            </div>
                            <!-- Side Featured Cards -->
                            <div style="display:flex;flex-direction:column;gap:16px;">
                                <div style="flex:1;background:linear-gradient(135deg, #1b4d2e, #2d6a4f);border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #333;">
                                    <div>
                                        <h3 style="font-size:18px;font-weight:600;margin-bottom:4px;">Gardenscapes</h3>
                                        <div style="display:inline-block;background:rgba(0,0,0,0.3);padding:2px 8px;border-radius:4px;font-size:11px;color:#ddd;">3+ • In-Game Purchases</div>
                                    </div>
                                    <button class="store-get-btn" data-app="gardenscapes" style="background:#0078D4;border:none;color:white;padding:6px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;align-self:flex-start;">Get</button>
                                </div>
                                <div style="display:flex;gap:16px;flex:1;">
                                    <div style="flex:1;background:linear-gradient(135deg, #2b1055, #7597de);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #333;">
                                        <h4 style="font-size:14px;font-weight:600;">RAID: Shadow Legends</h4>
                                        <button class="store-get-btn" data-app="raid" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:4px 14px;border-radius:4px;font-size:11px;cursor:pointer;align-self:flex-start;">Free</button>
                                    </div>
                                    <div style="flex:1;background:linear-gradient(135deg, #8a2387, #e94057, #f27121);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #333;">
                                        <h4 style="font-size:14px;font-weight:600;">Cooking Fever</h4>
                                        <button class="store-get-btn" data-app="cookingfever" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:4px 14px;border-radius:4px;font-size:11px;cursor:pointer;align-self:flex-start;">Free</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Trending Games -->
                        <div style="background:#222;border-radius:12px;padding:20px;border:1px solid #333;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                                <h3 style="font-size:16px;font-weight:600;color:white;display:flex;align-items:center;gap:6px;">Trending games <span style="font-size:14px;color:#aaa;">›</span></h3>
                                <div style="display:flex;gap:8px;">
                                    <button style="width:28px;height:28px;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:50%;color:#aaa;cursor:pointer;display:flex;align-items:center;justify-content:center;">‹</button>
                                    <button style="width:28px;height:28px;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:50%;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">›</button>
                                </div>
                            </div>
                            <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:4px;">
                                <div style="background:#2a2a2a;border-radius:8px;padding:16px;width:200px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;flex-shrink:0;">
                                    <div style="width:64px;height:64px;background:#0078D4;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><path d="M2 2h9v9H2V2zm11 0h9v9h-9V2zM2 13h9v9H2v-9zm11 0h9v9h-9v-9z"/></svg>
                                    </div>
                                    <div>
                                        <div style="font-weight:600;font-size:13px;margin-bottom:2px;">Roblox - Windows</div>
                                        <div style="font-size:11px;color:#888;">Free</div>
                                    </div>
                                    <button class="store-get-btn" data-app="roblox" style="background:#0078D4;border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;">Install</button>
                                </div>
                                <div style="background:#2a2a2a;border-radius:8px;padding:16px;width:200px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;flex-shrink:0;position:relative;">
                                    <div style="position:absolute;top:12px;right:12px;background:#107c41;color:white;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;">Game Pass</div>
                                    <div style="width:64px;height:64px;background:linear-gradient(135deg, #388e3c, #1b5e20);border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                                    </div>
                                    <div>
                                        <div style="font-weight:600;font-size:13px;margin-bottom:2px;">Minecraft: Java & Bedrock</div>
                                        <div style="font-size:11px;color:#888;">Owned</div>
                                    </div>
                                    <button style="background:rgba(255,255,255,0.1);border:none;color:#aaa;padding:6px;border-radius:4px;font-weight:600;cursor:default;font-size:12px;width:100%;">Installed</button>
                                </div>
                            </div>
                        </div>

                        <!-- Trending Apps -->
                        <div style="background:#222;border-radius:12px;padding:20px;border:1px solid #333;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                                <h3 style="font-size:16px;font-weight:600;color:white;display:flex;align-items:center;gap:6px;">Trending apps <span style="font-size:14px;color:#aaa;">›</span></h3>
                                <div style="display:flex;gap:8px;">
                                    <button style="width:28px;height:28px;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:50%;color:#aaa;cursor:pointer;display:flex;align-items:center;justify-content:center;">‹</button>
                                    <button style="width:28px;height:28px;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:50%;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">›</button>
                                </div>
                            </div>
                            <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:4px;">
                                <div style="background:#2a2a2a;border-radius:8px;padding:16px;width:200px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;flex-shrink:0;">
                                    <div style="width:64px;height:64px;background:#000;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/></svg>
                                    </div>
                                    <div>
                                        <div style="font-weight:600;font-size:13px;margin-bottom:2px;">TikTok</div>
                                        <div style="font-size:11px;color:#888;">Free</div>
                                    </div>
                                    <button class="store-get-btn" data-app="tiktok" style="background:#0078D4;border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;">Install</button>
                                </div>
                                <div style="background:#2a2a2a;border-radius:8px;padding:16px;width:200px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;flex-shrink:0;">
                                    <div style="width:64px;height:64px;background:#25D366;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
                                    </div>
                                    <div>
                                        <div style="font-weight:600;font-size:13px;margin-bottom:2px;">WhatsApp Beta</div>
                                        <div style="font-size:11px;color:#888;">Free</div>
                                    </div>
                                    <button class="store-get-btn" data-app="whatsapp" style="background:#0078D4;border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;">Install</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('appStore', 'Microsoft Store', icon, getContent(), { width: 1000, height: 680 });
        
        const el = win.element;
        const navItems = el.querySelectorAll('.store-nav-item');
        const getBtns = el.querySelectorAll('.store-get-btn');

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

        getBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const appName = btn.getAttribute('data-app');
                btn.textContent = 'Installed';
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#aaa';
                btn.style.cursor = 'default';
            });
        });
    }

    return { launch, icon };
})();

export default AppStore;
