import WindowManager from '../../modules/windowManager.js';
import AppSystem from '../../modules/appSystem.js';
import AppIcons from '../../modules/appIcons.js';
import { AppMetadata } from '../../modules/taskbar.js';
import AppLoader from '../../modules/appLoader.js';

const AppStore = (() => {
    const icon = AppIcons.get('appStore');

    // Catalog is built from app manifests (js/apps/*/manifest.json, "store" block).
    // Built lazily on launch: app modules must not call AppLoader at import
    // time (circular import via registry.js leaves it uninitialized).
    let appDetails = {};
    let storeApps = [];

    function refreshCatalog() {
        appDetails = {};
        AppLoader.getStoreApps().forEach(m => {
            appDetails[m.id] = Object.assign({ name: m.name }, m.store);
        });
        storeApps = AppLoader.getStoreApps().map(m => m.id);
    }

    function getInstalled() {
        return AppSystem.getInstalledApps();
    }

    function appIconHtml(appId, size = 48) {
        const svg = AppIcons.get(appId);
        if (svg) {
            const sized = svg.replace(/<svg/, `<svg width="${size}" height="${size}"`);
            return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border-radius:${size > 40 ? 10 : 8}px;overflow:hidden;">${sized}</div>`;
        }
        const meta = AppMetadata.get(appId);
        return `<div style="width:${size}px;height:${size}px;background:#555;border-radius:${size > 40 ? 10 : 8}px;display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:${size * 0.4}px;">${(meta?.name || '?')[0]}</div>`;
    }

    function sidebarHtml(activeTab = 'home') {
        const tab = (id, label, svgPath) => {
            const active = id === activeTab;
            return `<div class="store-nav-item" data-tab="${id}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;${active ? 'background:rgba(255,255,255,0.08);' : 'color:#aaa;'}margin-bottom:4px;font-size:13px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgPath}</svg>
                <span>${label}</span>
            </div>`;
        };
        return `<div style="width:240px;background:#252526;display:flex;flex-direction:column;padding:12px 8px;border-right:1px solid #333;">
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:16px;">
                ${appIconHtml('appStore', 24)}
                <span style="font-weight:600;font-size:15px;">Microsoft Store</span>
            </div>
            ${tab('home', 'Home', '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>')}
            ${tab('apps', 'Apps', '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>')}
            ${tab('gaming', 'Gaming', '<line x1="6" y1="12" x2="18" y2="12"/><line x1="12" y1="6" x2="12" y2="18"/>')}
            <div style="flex:1;"></div>
            ${tab('library', 'Library', '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>')}
        </div>`;
    }

    function topBarHtml(backBtn = false) {
        return `<div style="padding:16px 24px;display:flex;align-items:center;${backBtn ? 'gap:16px;' : 'justify-content:space-between;'}position:sticky;top:0;background:#181818;z-index:10;">
            ${backBtn ? `<button class="store-back-btn" style="background:none;border:none;color:white;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background 0.2s;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>` : ''}
            <div style="display:flex;align-items:center;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:20px;padding:6px 16px;${backBtn ? 'flex:1;' : 'width:400px;'}gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="store-search" placeholder="Search apps, games, and more" style="background:none;border:none;color:white;outline:none;font-size:13px;width:100%;">
            </div>
            ${!backBtn ? `<div style="width:32px;height:32px;background:var(--accent-color,#0078D4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;">U</div>` : ''}
        </div>`;
    }

    function getMainContent() {
        const installed = getInstalled();
        const featured = storeApps[0];
        const featuredDetails = appDetails[featured];
        const featuredMeta = AppMetadata.get(featured);

        const appCards = storeApps.map(id => {
            const d = appDetails[id];
            if (!d) return '';
            const isInstalled = installed.includes(id);
            return `<div class="store-app-card" data-app="${id}" style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;cursor:pointer;transition:background 0.2s;">
                <div style="display:flex;align-items:center;gap:12px;">
                    ${appIconHtml(id, 48)}
                    <div>
                        <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${d.name}</div>
                        <div style="font-size:11px;color:#888;">${d.category}</div>
                    </div>
                </div>
                <p style="font-size:12px;color:#aaa;line-height:1.4;">${d.description.slice(0, 80)}...</p>
                <button class="store-install-btn" data-app="${id}" style="background:${isInstalled ? 'rgba(255,255,255,0.1)' : '#0078D4'};border:none;color:${isInstalled ? '#aaa' : 'white'};padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;transition:background 0.2s;">${isInstalled ? 'Installed' : 'Install'}</button>
            </div>`;
        }).join('');

        return `
            <div style="display:flex;height:100%;background:#1e1e1e;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;">
                ${sidebarHtml('home')}
                <div class="store-main" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#181818;">
                    ${topBarHtml()}
                    <div class="store-content" style="padding:0 24px 32px 24px;display:flex;flex-direction:column;gap:24px;">
                        <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;height:340px;">
                            <div style="background:linear-gradient(135deg, #0f2027, #203a43, #2c5364);border-radius:12px;padding:32px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;border:1px solid #333;">
                                <div style="z-index:2;">
                                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                                        ${appIconHtml(featured, 48)}
                                        <h1 style="font-size:36px;font-weight:700;">${featuredDetails.name}</h1>
                                    </div>
                                    <p style="color:#ccc;font-size:14px;max-width:350px;">${featuredDetails.description.slice(0, 100)}...</p>
                                </div>
                                <div style="display:flex;gap:12px;align-items:center;z-index:2;">
                                    <button class="store-install-btn" data-app="${featured}" style="background:#0078D4;border:none;color:white;padding:10px 28px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;transition:background 0.2s;">${installed.includes(featured) ? 'Installed' : 'Get'}</button>
                                </div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:16px;">
                                ${storeApps.slice(1, 3).map(id => {
                                    const d = appDetails[id];
                                    return `<div style="flex:1;background:linear-gradient(135deg, #252525, #2a2a2a);border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #333;">
                                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                            ${appIconHtml(id, 36)}
                                            <h3 style="font-size:18px;font-weight:600;">${d.name}</h3>
                                        </div>
                                        <p style="font-size:12px;color:#eee;margin-bottom:8px;">${d.description.slice(0, 60)}...</p>
                                        <div style="display:inline-block;background:rgba(0,0,0,0.3);padding:2px 8px;border-radius:4px;font-size:11px;color:#ddd;">Free • ${d.category}</div>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                        <div style="background:#222;border-radius:12px;padding:20px;border:1px solid #333;">
                            <h3 style="font-size:16px;font-weight:600;color:white;margin-bottom:16px;">Available Apps & Games</h3>
                            <div style="display:flex;gap:16px;flex-wrap:wrap;">${appCards}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getDetailContent(appId) {
        const app = appDetails[appId];
        if (!app) return getMainContent();
        const installed = getInstalled();
        const isInstalled = installed.includes(appId);

        const discoverApps = storeApps.filter(id => id !== appId).slice(0, 3);

        return `
            <div style="display:flex;height:100%;background:#1e1e1e;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;">
                ${sidebarHtml('apps')}
                <div class="store-main" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#181818;">
                    ${topBarHtml(true)}
                    <div style="padding:0 24px 32px 24px;display:flex;gap:32px;">
                        <div style="flex:1;">
                            <div style="display:flex;gap:20px;margin-bottom:24px;">
                                <div style="width:100px;height:100px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
                                    ${appIconHtml(appId, 100)}
                                </div>
                                <div style="flex:1;">
                                    <h1 style="font-size:28px;font-weight:600;margin-bottom:4px;">${app.name}</h1>
                                    <div style="font-size:13px;color:#888;margin-bottom:4px;">${app.developer}</div>
                                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                                        <span style="font-size:12px;color:#0078D4;">${app.category}</span>
                                        <span style="font-size:12px;color:#888;">•</span>
                                        <span style="font-size:12px;color:#888;">⭐ ${app.rating}</span>
                                        <span style="font-size:12px;color:#888;">(${app.reviews})</span>
                                    </div>
                                    <button class="store-install-btn" data-app="${appId}" style="background:${isInstalled ? 'rgba(255,255,255,0.1)' : '#0078D4'};border:none;color:${isInstalled ? '#aaa' : 'white'};padding:10px 32px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;transition:background 0.2s;">
                                        ${isInstalled ? 'Installed' : 'Get'}
                                    </button>
                                </div>
                            </div>
                            <div style="margin-bottom:24px;">
                                <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Description</h3>
                                <p style="font-size:13px;color:#aaa;line-height:1.6;">${app.description}</p>
                            </div>
                            <div style="margin-bottom:24px;">
                                <h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">Features</h3>
                                <ul style="list-style:none;padding:0;margin:0;">
                                    ${app.features.map(f => `
                                        <li style="font-size:13px;color:#aaa;padding:6px 0;display:flex;align-items:center;gap:8px;">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                                            ${f}
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                            <div style="margin-bottom:24px;">
                                <h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">Screenshots</h3>
                                <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;">
                                    ${app.screenshots.map(s => `
                                        <div style="min-width:280px;height:160px;background:${s.bg};border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:500;">
                                            ${s.text}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        <div style="width:280px;">
                            <div style="background:#222;border-radius:8px;padding:16px;margin-bottom:20px;">
                                <h3 style="font-size:13px;font-weight:600;margin-bottom:12px;">App Info</h3>
                                <div style="display:flex;flex-direction:column;gap:10px;">
                                    <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#888;">Size</span><span style="color:#ccc;">${app.size}</span></div>
                                    <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#888;">Age Rating</span><span style="color:#ccc;">${app.ageRating}</span></div>
                                    <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#888;">Category</span><span style="color:#ccc;">${app.category}</span></div>
                                </div>
                            </div>
                            <div style="background:#222;border-radius:8px;padding:16px;">
                                <h3 style="font-size:13px;font-weight:600;margin-bottom:12px;">Discover more</h3>
                                <div style="display:flex;flex-direction:column;gap:12px;">
                                    ${discoverApps.map(id => {
                                        const d = appDetails[id];
                                        return `<div class="store-discover-card" data-app="${id}" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px;border-radius:6px;transition:background 0.2s;">
                                            ${appIconHtml(id, 40)}
                                            <div style="flex:1;">
                                                <div style="font-size:12px;font-weight:500;">${d.name}</div>
                                                <div style="font-size:10px;color:#888;">Free</div>
                                            </div>
                                        </div>`;
                                    }).join('')}
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
        const installed = getInstalled();
        buttons.forEach(btn => {
            const appId = btn.getAttribute('data-app');
            if (appId && installed.includes(appId)) {
                btn.textContent = 'Installed';
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#aaa';
            }
        });
    }

    function launch() {
        refreshCatalog();
        const win = WindowManager.createWindow('appStore', 'Microsoft Store', icon, getMainContent(), { width: 1000, height: 680 });
        const el = win.element;

        checkInstalledStatus(el);

        function setupNav(container) {
            container.querySelectorAll('.store-nav-item').forEach(item => {
                item.addEventListener('click', () => {
                    showMainView();
                });
            });
        }

        function setupAppCards(container) {
            container.querySelectorAll('.store-app-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.store-install-btn')) return;
                    const appId = card.getAttribute('data-app');
                    if (appId && appDetails[appId]) showAppDetail(appId);
                });
                card.addEventListener('mouseenter', () => card.style.background = '#333');
                card.addEventListener('mouseleave', () => card.style.background = '#2a2a2a');
            });
        }

        function setupInstallButtons(container) {
            container.querySelectorAll('.store-install-btn, .store-get-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (!appId) return;
                    AppSystem.installApp(appId);
                    btn.textContent = 'Installed';
                    btn.style.background = 'rgba(255,255,255,0.1)';
                    btn.style.color = '#aaa';
                });
            });
        }

        function setupDiscoverCards(container) {
            container.querySelectorAll('.store-discover-card').forEach(card => {
                card.addEventListener('click', () => {
                    const appId = card.getAttribute('data-app');
                    if (appId && appDetails[appId]) showAppDetail(appId);
                });
                card.addEventListener('mouseenter', () => card.style.background = '#333');
                card.addEventListener('mouseleave', () => card.style.background = '');
            });
        }

        function showAppDetail(appId) {
            const content = el.querySelector('.store-main');
            content.innerHTML = getDetailContent(appId).split('<!-- Main Content Area -->')[1] || getDetailContent(appId);
            const backBtn = content.querySelector('.store-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => showMainView());
                backBtn.addEventListener('mouseenter', () => backBtn.style.background = 'rgba(255,255,255,0.1)');
                backBtn.addEventListener('mouseleave', () => backBtn.style.background = 'none');
            }
            checkInstalledStatus(content);
            setupNav(content);
            setupInstallButtons(content);
            setupDiscoverCards(content);
        }

        function showMainView() {
            const content = el.querySelector('.store-main');
            content.innerHTML = getMainContent().split('<!-- Main Content Area -->')[1] || getMainContent();
            checkInstalledStatus(content);
            setupNav(content);
            setupAppCards(content);
            setupInstallButtons(content);
        }

        setupNav(el);
        setupAppCards(el);
        setupInstallButtons(el);
    }

    return { launch, icon };
})();

export default AppStore;
