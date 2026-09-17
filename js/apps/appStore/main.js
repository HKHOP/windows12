import WindowManager from '../../modules/windowManager.js';
import AppSystem from '../../modules/appSystem.js';
import AppIcons from '../../modules/appIcons.js';
import { AppMetadata, AppRegistry } from '../../modules/taskbar.js';
import AppLoader from '../../modules/appLoader.js';
import Permissions from '../../modules/permissions.js';

const AppStore = (() => {
    const icon = AppIcons.get('appStore');

    // Catalog is built from app manifests (js/apps/*/manifest.json, "store" block).
    // Built lazily on launch: app modules must not call AppLoader at import
    // time (circular import via registry.js leaves it uninitialized).
    let appDetails = {};
    let storeApps = [];
    let currentTab = 'home';

    const starSvg = (size = 12) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#FFC107"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z"/></svg>`;

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

    // Services are uninstall-only: installable, but never launchable, so no
    // Open button anywhere — Uninstall instead.
    function isService(id) {
        try {
            return AppLoader.isService(id);
        } catch (e) {
            return false;
        }
    }

    function uninstallBtnHtml(id, wide) {
        return `<button class="store-uninstall-btn" data-app="${id}" style="background:transparent;border:1px solid #4d4d4d;color:#ccc;${wide ? 'padding:10px 32px;border-radius:6px;font-size:13px;' : 'padding:6px;border-radius:4px;font-size:12px;width:100%;'}font-weight:600;cursor:pointer;transition:background 0.2s;">Uninstall</button>`;
    }

    function isGame(id) {
        return (appDetails[id]?.category || '') === 'Games';
    }

    function gameIds() {
        return storeApps.filter(isGame);
    }

    function appIds() {
        return storeApps.filter(id => !isGame(id));
    }

    function libraryIds() {
        const installed = new Set(getInstalled());
        return storeApps.filter(id => installed.has(id));
    }

    function ratingOf(id) {
        return parseFloat(appDetails[id]?.rating) || 0;
    }

    function byRating(a, b) {
        return ratingOf(b) - ratingOf(a);
    }

    function nonGameCategories() {
        const cats = [];
        appIds().forEach(id => {
            const c = appDetails[id]?.category || 'Other';
            if (!cats.includes(c)) cats.push(c);
        });
        return cats.sort();
    }

    function featuredId(ids) {
        if (!ids.length) return null;
        return [...ids].sort(byRating)[0];
    }

    function appIconHtml(appId, size = 48) {
        const svg = AppIcons.get(appId);
        if (svg) {
            const sized = svg.replace(/<svg/, `<svg width="${size}" height="${size}"`);
            return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border-radius:${size > 40 ? 10 : 8}px;overflow:hidden;flex-shrink:0;">${sized}</div>`;
        }
        const meta = AppMetadata.get(appId);
        return `<div style="width:${size}px;height:${size}px;background:#555;border-radius:${size > 40 ? 10 : 8}px;display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:${size * 0.4}px;flex-shrink:0;">${(meta?.name || '?')[0]}</div>`;
    }

    function ratingHtml(id) {
        const d = appDetails[id];
        if (!d || d.rating == null) return '';
        return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#ccc;">${starSvg(12)}${d.rating}${d.reviews ? `<span style="color:#888;">(${d.reviews})</span>` : ''}</span>`;
    }

    function installBtnHtml(id) {
        const installed = getInstalled().includes(id);
        if (installed) {
            if (isService(id)) return uninstallBtnHtml(id, false);
            return `<button class="store-open-btn" data-app="${id}" style="background:rgba(255,255,255,0.1);border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;transition:background 0.2s;">Open</button>`;
        }
        return `<button class="store-install-btn" data-app="${id}" style="background:#0078D4;border:none;color:white;padding:6px;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:100%;transition:background 0.2s;">Install</button>`;
    }

    function appCardHtml(id) {
        const d = appDetails[id];
        if (!d) return '';
        return `<div class="store-app-card" data-app="${id}" style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;cursor:pointer;transition:background 0.2s;flex-shrink:0;">
            <div style="display:flex;align-items:center;gap:12px;">
                ${appIconHtml(id, 48)}
                <div style="min-width:0;">
                    <div style="font-weight:600;font-size:13px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.name}</div>
                    <div style="font-size:11px;color:#888;">${d.category || ''}</div>
                </div>
            </div>
            <p style="font-size:12px;color:#aaa;line-height:1.4;margin:0;">${(d.description || '').slice(0, 80)}...</p>
            <div style="font-size:11px;color:#888;">${ratingHtml(id)}</div>
            ${installBtnHtml(id)}
        </div>`;
    }

    function rowHtml(title, ids) {
        if (!ids.length) return '';
        return `<div>
            <h3 style="font-size:16px;font-weight:600;color:white;margin:0 0 12px 0;">${title}</h3>
            <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:8px;">${ids.map(appCardHtml).join('')}</div>
        </div>`;
    }

    function heroHtml(id, eyebrow) {
        const d = appDetails[id];
        if (!d) return '';
        const bg = d.screenshots?.[0]?.bg || 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)';
        const installed = getInstalled().includes(id);
        return `<div style="background:${bg};border-radius:12px;padding:36px;display:flex;align-items:center;gap:28px;position:relative;overflow:hidden;border:1px solid #333;min-height:260px;">
            <div style="position:absolute;right:-30px;top:50%;transform:translateY(-50%);opacity:0.18;pointer-events:none;">${appIconHtml(id, 220)}</div>
            <div style="z-index:2;">${appIconHtml(id, 120)}</div>
            <div style="z-index:2;flex:1;min-width:0;">
                ${eyebrow ? `<div style="font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#9ecfff;margin-bottom:8px;">${eyebrow}</div>` : ''}
                <h1 style="font-size:40px;font-weight:700;margin:0 0 8px 0;">${d.name}</h1>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:12px;color:#ddd;">
                    <span style="color:#9ecfff;">${d.category || ''}</span><span>•</span>${ratingHtml(id)}<span>•</span><span>Free</span>
                </div>
                <p style="color:#eee;font-size:14px;max-width:480px;margin:0 0 20px 0;">${(d.description || '').slice(0, 140)}...</p>
                <div style="display:flex;gap:12px;">
                    ${installed
                        ? (isService(id)
                            ? uninstallBtnHtml(id, true)
                            : `<button class="store-open-btn" data-app="${id}" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:white;padding:10px 36px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Open</button>`)
                        : `<button class="store-install-btn" data-app="${id}" style="background:#0078D4;border:none;color:white;padding:10px 36px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Get</button>`}
                    <button class="store-details-btn" data-app="${id}" style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.2);color:white;padding:10px 24px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Details</button>
                </div>
            </div>
        </div>`;
    }

    function sidebarHtml(activeTab) {
        const tab = (id, label, svgPath) => {
            const active = id === activeTab;
            return `<div class="store-nav-item" data-tab="${id}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;${active ? 'background:rgba(255,255,255,0.08);color:white;' : 'color:#aaa;'}margin-bottom:4px;font-size:13px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgPath}</svg>
                <span>${label}</span>
            </div>`;
        };
        return `<div style="width:240px;background:#252526;display:flex;flex-direction:column;padding:12px 8px;border-right:1px solid #333;flex-shrink:0;">
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

    function topBarHtml(backBtn = false, query = '') {
        return `<div style="padding:16px 24px;display:flex;align-items:center;${backBtn ? 'gap:16px;' : 'justify-content:space-between;'}position:sticky;top:0;background:#181818;z-index:10;">
            ${backBtn ? `<button class="store-back-btn" style="background:none;border:none;color:white;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background 0.2s;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>` : ''}
            <div style="display:flex;align-items:center;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:20px;padding:6px 16px;${backBtn ? 'flex:1;' : 'width:400px;'}gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="store-search" placeholder="Search apps, games, and more" value="${query.replace(/"/g, '&quot;')}" style="background:none;border:none;color:white;outline:none;font-size:13px;width:100%;">
            </div>
            ${!backBtn ? `<div style="width:32px;height:32px;background:var(--accent-color,#0078D4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;">U</div>` : ''}
        </div>`;
    }

    function shellHtml(activeTab, contentHtml, query = '') {
        return `
            <div style="display:flex;height:100%;background:#1e1e1e;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;">
                ${sidebarHtml(activeTab)}
                <div class="store-main" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#181818;">
                    ${topBarHtml(false, query)}
                    <div class="store-content" style="padding:0 24px 32px 24px;display:flex;flex-direction:column;gap:24px;">
                        ${contentHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // ---------- Tab views ----------

    function getHomeContent() {
        const apps = appIds().sort(byRating);
        const games = gameIds().sort(byRating);
        const featured = featuredId(storeApps);
        const cats = nonGameCategories();
        const catColors = ['#0078D4', '#107C10', '#8E24AA', '#E65100', '#00838F', '#5C6BC0', '#C2185B'];

        return `
            ${featured ? heroHtml(featured, 'Featured') : ''}
            ${rowHtml('Popular Apps', apps.slice(0, 8))}
            ${rowHtml('Popular Games', games.slice(0, 8))}
            <div>
                <h3 style="font-size:16px;font-weight:600;color:white;margin:0 0 12px 0;">Browse by category</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
                    <div class="store-cat-tile" data-cat="__games" style="background:linear-gradient(135deg,#3a1c71,#d76d77);border-radius:10px;padding:18px;cursor:pointer;border:1px solid #333;">
                        <div style="font-size:15px;font-weight:600;">Games</div>
                        <div style="font-size:12px;color:#eee;">${games.length} item${games.length !== 1 ? 's' : ''}</div>
                    </div>
                    ${cats.map((c, i) => {
                        const count = apps.filter(id => (appDetails[id]?.category || 'Other') === c).length;
                        return `<div class="store-cat-tile" data-cat="${c.replace(/"/g, '&quot;')}" style="background:linear-gradient(135deg,${catColors[i % catColors.length]},#1e1e1e);border-radius:10px;padding:18px;cursor:pointer;border:1px solid #333;">
                            <div style="font-size:15px;font-weight:600;">${c}</div>
                            <div style="font-size:12px;color:#ccc;">${count} app${count !== 1 ? 's' : ''}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function getAppsContent(filter = 'All') {
        const cats = nonGameCategories();
        let ids = appIds().sort(byRating);
        if (filter !== 'All') ids = ids.filter(id => (appDetails[id]?.category || 'Other') === filter);
        return `
            <div>
                <h2 style="font-size:24px;font-weight:700;margin:0 0 4px 0;">Apps</h2>
                <div style="font-size:13px;color:#888;margin-bottom:16px;">Productivity, utilities, creativity and more</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
                    ${['All', ...cats].map(c => `<button class="store-cat-chip" data-cat="${c.replace(/"/g, '&quot;')}" style="background:${c === filter ? '#0078D4' : 'rgba(255,255,255,0.08)'};border:1px solid ${c === filter ? '#0078D4' : '#3d3d3d'};color:white;padding:6px 16px;border-radius:16px;cursor:pointer;font-size:12px;">${c}</button>`).join('')}
                </div>
                ${ids.length
                    ? `<div style="display:flex;gap:16px;flex-wrap:wrap;">${ids.map(appCardHtml).join('')}</div>`
                    : `<div style="padding:40px;text-align:center;color:#888;font-size:13px;">No apps in this category yet.</div>`}
            </div>
        `;
    }

    function getGamingContent() {
        const games = gameIds().sort(byRating);
        const featuredGame = featuredId(games);
        return `
            ${featuredGame ? heroHtml(featuredGame, 'Featured game') : ''}
            <div>
                <h3 style="font-size:16px;font-weight:600;color:white;margin:0 0 12px 0;">All games</h3>
                ${games.length
                    ? `<div style="display:flex;gap:16px;flex-wrap:wrap;">${games.map(appCardHtml).join('')}</div>`
                    : `<div style="padding:40px;text-align:center;color:#888;font-size:13px;">No games in the Store yet.</div>`}
            </div>
        `;
    }

    function getLibraryContent() {
        const ids = libraryIds().sort((a, b) => (appDetails[a]?.name || '').localeCompare(appDetails[b]?.name || ''));
        if (!ids.length) {
            return `
                <div>
                    <h2 style="font-size:24px;font-weight:700;margin:0 0 4px 0;">Library</h2>
                    <div style="font-size:13px;color:#888;margin-bottom:16px;">Everything you've installed from the Store lives here</div>
                    <div style="padding:60px 20px;text-align:center;color:#888;font-size:13px;background:#222;border-radius:12px;border:1px solid #333;">
                        <div style="font-size:15px;font-weight:600;color:#ccc;margin-bottom:8px;">Your library is empty</div>
                        Find apps and games in the Apps and Gaming tabs to get started.
                    </div>
                </div>
            `;
        }
        return `
            <div>
                <h2 style="font-size:24px;font-weight:700;margin:0 0 4px 0;">Library</h2>
                <div style="font-size:13px;color:#888;margin-bottom:16px;">${ids.length} installed app${ids.length !== 1 ? 's' : ''}</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${ids.map(id => {
                        const d = appDetails[id];
                        return `<div style="display:flex;align-items:center;gap:14px;background:#222;border:1px solid #333;border-radius:10px;padding:12px 16px;">
                            ${appIconHtml(id, 44)}
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:14px;font-weight:600;">${d.name}</div>
                                <div style="font-size:12px;color:#888;">${d.category || ''}${d.size ? ` • ${d.size}` : ''}</div>
                            </div>
                            ${isService(id) ? '' : `<button class="store-open-btn" data-app="${id}" style="background:rgba(255,255,255,0.1);border:none;color:white;padding:8px 24px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">Open</button>`}
                            <button class="store-uninstall-btn" data-app="${id}" style="background:transparent;border:1px solid #4d4d4d;color:#ccc;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:12px;">Uninstall</button>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function getSearchContent(query) {
        const q = query.trim().toLowerCase();
        const ids = storeApps.filter(id => {
            const d = appDetails[id];
            if (!d) return false;
            return (d.name || '').toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q);
        });
        return `
            <div>
                <h2 style="font-size:24px;font-weight:700;margin:0 0 4px 0;">Results for "${query.replace(/</g, '&lt;')}"</h2>
                <div style="font-size:13px;color:#888;margin-bottom:16px;">${ids.length} match${ids.length !== 1 ? 'es' : ''}</div>
                ${ids.length
                    ? `<div style="display:flex;gap:16px;flex-wrap:wrap;">${ids.map(appCardHtml).join('')}</div>`
                    : `<div style="padding:40px;text-align:center;color:#888;font-size:13px;">No apps or games match your search.</div>`}
            </div>
        `;
    }

    function permissionsHtml(appId) {
        const perms = Permissions.getDeclared(appId);
        const rows = perms.length > 0
            ? perms.map(p => {
                const meta = Permissions.getCatalog()[p];
                return `<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;padding:5px 0;">
                    <span style="width:16px;height:16px;display:inline-flex;flex-shrink:0;margin-top:1px;color:#ccc;">${Permissions.iconFor(p)}</span>
                    <span><span style="color:#ccc;">${meta.label}</span><br><span style="font-size:11px;color:#888;">${meta.description}</span></span>
                </div>`;
            }).join('')
            : '<div style="font-size:12px;color:#888;">No special permissions required.</div>';
        return `<div style="background:#222;border-radius:8px;padding:16px;margin-bottom:20px;">
            <h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Permissions</h3>
            ${rows}
        </div>`;
    }

    function getDetailContent(appId) {
        const app = appDetails[appId];
        if (!app) return shellHtml(currentTab, getHomeContent());
        const installed = getInstalled().includes(appId);
        const isInstalled = installed;

        const discoverApps = storeApps.filter(id => id !== appId).slice(0, 3);

        return `
            <div style="display:flex;height:100%;background:#1e1e1e;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;">
                ${sidebarHtml(currentTab)}
                <div class="store-main" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#181818;">
                    ${topBarHtml(true)}
                    <div style="padding:0 24px 32px 24px;display:flex;gap:32px;">
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;gap:20px;margin-bottom:24px;">
                                <div style="width:100px;height:100px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
                                    ${appIconHtml(appId, 100)}
                                </div>
                                <div style="flex:1;min-width:0;">
                                    <h1 style="font-size:28px;font-weight:600;margin:0 0 4px 0;">${app.name}</h1>
                                    <div style="font-size:13px;color:#888;margin-bottom:4px;">${app.developer || ''}</div>
                                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
                                        <span style="font-size:12px;color:#0078D4;">${app.category || ''}</span>
                                        <span style="font-size:12px;color:#888;">•</span>
                                        ${ratingHtml(appId)}
                                    </div>
                                    ${isInstalled
                                        ? (isService(appId)
                                            ? uninstallBtnHtml(appId, true)
                                            : `<button class="store-open-btn" data-app="${appId}" style="background:rgba(255,255,255,0.1);border:none;color:white;padding:10px 32px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;transition:background 0.2s;">Open</button>`)
                                        : `<button class="store-install-btn" data-app="${appId}" style="background:#0078D4;border:none;color:white;padding:10px 32px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;transition:background 0.2s;">Get</button>`}
                                </div>
                            </div>
                            <div style="margin-bottom:24px;">
                                <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Description</h3>
                                <p style="font-size:13px;color:#aaa;line-height:1.6;margin:0;">${app.description || ''}</p>
                            </div>
                            <div style="margin-bottom:24px;">
                                <h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">Features</h3>
                                <ul style="list-style:none;padding:0;margin:0;">
                                    ${(app.features || []).map(f => `
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
                                    ${(app.screenshots || []).map(s => `
                                        <div style="min-width:280px;height:160px;background:${s.bg};border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:500;">
                                            ${s.text}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        <div style="width:280px;flex-shrink:0;">
                            <div style="background:#222;border-radius:8px;padding:16px;margin-bottom:20px;">
                                <h3 style="font-size:13px;font-weight:600;margin-bottom:12px;">App Info</h3>
                                <div style="display:flex;flex-direction:column;gap:10px;">
                                    <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#888;">Size</span><span style="color:#ccc;">${app.size || '—'}</span></div>
                                    <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#888;">Age Rating</span><span style="color:#ccc;">${app.ageRating || '—'}</span></div>
                                    <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#888;">Category</span><span style="color:#ccc;">${app.category || ''}</span></div>
                                </div>
                            </div>
                            ${permissionsHtml(appId)}
                            <div style="background:#222;border-radius:8px;padding:16px;">
                                <h3 style="font-size:13px;font-weight:600;margin-bottom:12px;">Discover more</h3>
                                <div style="display:flex;flex-direction:column;gap:12px;">
                                    ${discoverApps.map(id => {
                                        const d = appDetails[id];
                                        return `<div class="store-discover-card" data-app="${id}" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px;border-radius:6px;transition:background 0.2s;">
                                            ${appIconHtml(id, 40)}
                                            <div style="flex:1;min-width:0;">
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

    function launch() {
        refreshCatalog();
        currentTab = 'home';
        const win = WindowManager.createWindow('appStore', 'Microsoft Store', icon, shellHtml('home', getHomeContent()), { width: 1000, height: 680 });
        const el = win.element;

        function contentFor(tab, opts = {}) {
            switch (tab) {
                case 'apps': return getAppsContent(opts.filter || 'All');
                case 'gaming': return getGamingContent();
                case 'library': return getLibraryContent();
                case 'search': return getSearchContent(opts.query || '');
                default: return getHomeContent();
            }
        }

        function refresh() {
            const body = el.querySelector('.window-body');
            body.innerHTML = shellHtml(currentTab === 'search' ? 'home' : currentTab, contentFor(currentTab, currentOpts));
            wire(body);
        }

        let currentOpts = {};

        function showView(tab, opts = {}) {
            currentTab = tab;
            currentOpts = opts;
            refresh();
        }

        function showAppDetail(appId) {
            const body = el.querySelector('.window-body');
            body.innerHTML = getDetailContent(appId);
            wireDetail(body);
        }

        function openAppById(appId) {
            if (isService(appId)) return;
            const mod = AppRegistry.get(appId);
            if (mod && typeof mod.launch === 'function') mod.launch();
        }

        // Install with permission consent: apps declaring permissions show
        // what they want first; declining aborts the install.
        function doInstall(appId, after) {
            Permissions.requestInstallConsent(appId).then(ok => {
                if (ok) AppSystem.installApp(appId);
                after();
            });
        }

        function wire(container) {
            container.querySelectorAll('.store-nav-item').forEach(item => {
                item.addEventListener('click', () => showView(item.dataset.tab));
            });

            container.querySelectorAll('.store-app-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.store-install-btn') || e.target.closest('.store-open-btn')) return;
                    const appId = card.getAttribute('data-app');
                    if (appId && appDetails[appId]) showAppDetail(appId);
                });
                card.addEventListener('mouseenter', () => card.style.background = '#333');
                card.addEventListener('mouseleave', () => card.style.background = '#2a2a2a');
            });

            container.querySelectorAll('.store-cat-tile').forEach(tile => {
                tile.addEventListener('click', () => {
                    const cat = tile.dataset.cat;
                    if (cat === '__games') showView('gaming');
                    else showView('apps', { filter: cat });
                });
            });

            container.querySelectorAll('.store-cat-chip').forEach(chip => {
                chip.addEventListener('click', () => showView('apps', { filter: chip.dataset.cat }));
            });

            container.querySelectorAll('.store-details-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (appId && appDetails[appId]) showAppDetail(appId);
                });
            });

            container.querySelectorAll('.store-install-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (!appId) return;
                    doInstall(appId, refresh);
                });
            });

            container.querySelectorAll('.store-open-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (appId) openAppById(appId);
                });
            });

            container.querySelectorAll('.store-uninstall-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (!appId) return;
                    AppSystem.uninstallApp(appId);
                    refresh();
                });
            });

            container.querySelectorAll('.store-search').forEach(input => {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && input.value.trim()) {
                        showView('search', { query: input.value.trim() });
                    }
                    e.stopPropagation();
                });
            });
        }

        function wireDetail(container) {
            const backBtn = container.querySelector('.store-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => refresh());
                backBtn.addEventListener('mouseenter', () => backBtn.style.background = 'rgba(255,255,255,0.1)');
                backBtn.addEventListener('mouseleave', () => backBtn.style.background = 'none');
            }
            container.querySelectorAll('.store-nav-item').forEach(item => {
                item.addEventListener('click', () => showView(item.dataset.tab));
            });
            container.querySelectorAll('.store-install-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (!appId) return;
                    doInstall(appId, () => showAppDetail(appId));
                });
            });
            container.querySelectorAll('.store-open-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (appId) openAppById(appId);
                });
            });
            container.querySelectorAll('.store-uninstall-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const appId = btn.getAttribute('data-app');
                    if (!appId) return;
                    AppSystem.uninstallApp(appId);
                    showAppDetail(appId);
                });
            });
            container.querySelectorAll('.store-discover-card').forEach(card => {
                card.addEventListener('click', () => {
                    const appId = card.getAttribute('data-app');
                    if (appId && appDetails[appId]) showAppDetail(appId);
                });
                card.addEventListener('mouseenter', () => card.style.background = '#333');
                card.addEventListener('mouseleave', () => card.style.background = '');
            });
            container.querySelectorAll('.store-search').forEach(input => {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && input.value.trim()) {
                        showView('search', { query: input.value.trim() });
                    }
                    e.stopPropagation();
                });
            });
        }

        wire(el);
    }

    return { launch, icon };
})();

export default AppStore;
