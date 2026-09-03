import WindowManager from '../modules/windowManager.js';
import AppSystem from '../modules/appSystem.js';

const AppStore = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3H10V10H3V3Z" fill="#0078D4"/><path d="M14 3H21V10H14V3Z" fill="#0078D4"/><path d="M3 14H10V21H3V14Z" fill="#0078D4"/><path d="M14 14H21V21H14V14Z" fill="#0078D4"/></svg>`;

    const appDetails = {
        vscode: {
            name: 'Visual Studio Code',
            developer: 'Microsoft Corporation',
            category: 'Developer Tools',
            rating: '4.8',
            reviews: '12,543',
            description: 'Code editing. Redefined. Visual Studio Code is a lightweight but powerful source code editor which runs on your desktop and is available for Windows, macOS and Linux.',
            features: [
                'Integrated terminal',
                'Syntax highlighting',
                'File explorer',
                'Extensions marketplace',
                'Git integration'
            ],
            screenshots: [
                { bg: 'linear-gradient(135deg, #1e1e1e, #2d2d2d)', text: 'Code Editor' },
                { bg: 'linear-gradient(135deg, #007ACC, #1e90ff)', text: 'Integrated Terminal' }
            ],
            size: '95 MB',
            ageRating: '3+'
        },
        sampleApp: {
            name: 'Sample App',
            developer: 'Windows 12',
            category: 'Productivity',
            rating: '4.5',
            reviews: '1,234',
            description: 'Interactive sample app that demonstrates full system installation, uninstallation, and launching. Perfect for testing the app ecosystem.',
            features: [
                'Easy installation',
                'Full system integration',
                'Interactive UI',
                'Settings persistence'
            ],
            screenshots: [
                { bg: 'linear-gradient(135deg, #6a11cb, #2575fc)', text: 'Sample Interface' },
                { bg: 'linear-gradient(135deg, #2575fc, #6a11cb)', text: 'Features' }
            ],
            size: '2 MB',
            ageRating: '3+'
        },
        export: {
            name: 'Ex/port',
            developer: 'Windows 12',
            category: 'Utilities',
            rating: '4.7',
            reviews: '892',
            description: 'Import files from your device to the filesystem, or export files to download. Supports all file types with drag-and-drop functionality.',
            features: [
                'Drag-and-drop import',
                'File browser export',
                'Multiple destination folders',
                'File type detection',
                'Batch operations'
            ],
            screenshots: [
                { bg: 'linear-gradient(135deg, #0078D4, #00BCF2)', text: 'Import Files' },
                { bg: 'linear-gradient(135deg, #00BCF2, #0078D4)', text: 'Export Files' }
            ],
            size: '1 MB',
            ageRating: '3+'
        }
    };

    function getMainContent() {
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
                <div class="store-main" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#181818;">
                    <!-- Top Bar -->
                    <div style="padding:16px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#181818;z-index:10;">
                        <div style="display:flex;align-items:center;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:20px;padding:6px 16px;width:400px;gap:10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" class="store-search" placeholder="Search apps, games, and more" style="background:none;border:none;color:white;outline:none;font-size:13px;width:100%;">
                        </div>
                        <div style="width:32px;height:32px;background:#0078D4;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;">U</div>
                    </div>

                    <!-- Scrollable Body -->
                    <div class="store-content" style="padding:0 24px 32px 24px;display:flex;flex-direction:column;gap:24px;">
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
                                <div class="store-app-card" data-app="vscode" style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;cursor:pointer;transition:background 0.2s;">
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
                                <div class="store-app-card" data-app="sampleApp" style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;cursor:pointer;transition:background 0.2s;">
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
                                <div class="store-app-card" data-app="export" style="background:#2a2a2a;border-radius:8px;padding:16px;width:220px;display:flex;flex-direction:column;gap:12px;border:1px solid #333;cursor:pointer;transition:background 0.2s;">
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

    function getDetailContent(appId) {
        const app = appDetails[appId];
        if (!app) return getMainContent();

        const installed = JSON.parse(localStorage.getItem('installed_apps') || '[]');
        const isInstalled = installed.includes(appId);

        return `
            <div style="display:flex;height:100%;background:#1e1e1e;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;">
                <!-- Sidebar -->
                <div style="width:240px;background:#252526;display:flex;flex-direction:column;padding:12px 8px;border-right:1px solid #333;">
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:16px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 3H10V10H3V3Z" fill="#0078D4"/><path d="M14 3H21V10H14V3Z" fill="#0078D4"/><path d="M3 14H10V21H3V14Z" fill="#0078D4"/><path d="M14 14H21V21H14V14Z" fill="#0078D4"/></svg>
                        <span style="font-weight:600;font-size:15px;">Microsoft Store</span>
                    </div>
                    <div class="store-nav-item" data-tab="home" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;color:#aaa;margin-bottom:4px;font-size:13px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        <span>Home</span>
                    </div>
                    <div class="store-nav-item active" data-tab="apps" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,0.08);margin-bottom:4px;font-size:13px;">
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
                <div class="store-main" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#181818;">
                    <!-- Top Bar -->
                    <div style="padding:16px 24px;display:flex;align-items:center;gap:16px;position:sticky;top:0;background:#181818;z-index:10;">
                        <button class="store-back-btn" style="background:none;border:none;color:white;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background 0.2s;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <div style="display:flex;align-items:center;background:#2d2d2d;border:1px solid #3d3d3d;border-radius:20px;padding:6px 16px;flex:1;gap:10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" class="store-search" placeholder="Search apps, games, and more" style="background:none;border:none;color:white;outline:none;font-size:13px;width:100%;">
                        </div>
                        <div style="width:32px;height:32px;background:#0078D4;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;">U</div>
                    </div>

                    <!-- App Detail Content -->
                    <div style="padding:0 24px 32px 24px;display:flex;gap:32px;">
                        <!-- Main App Info -->
                        <div style="flex:1;">
                            <!-- App Header -->
                            <div style="display:flex;gap:20px;margin-bottom:24px;">
                                <div style="width:100px;height:100px;background:linear-gradient(135deg, #0078D4, #00BCF2);border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
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
                                    <button class="store-install-btn" data-app="${appId}" style="background:#0078D4;border:none;color:white;padding:10px 32px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;transition:background 0.2s;">
                                        ${isInstalled ? 'Installed' : 'Get'}
                                    </button>
                                </div>
                            </div>

                            <!-- Description -->
                            <div style="margin-bottom:24px;">
                                <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Description</h3>
                                <p style="font-size:13px;color:#aaa;line-height:1.6;">${app.description}</p>
                            </div>

                            <!-- Features -->
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

                            <!-- Screenshots -->
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

                        <!-- Right Sidebar -->
                        <div style="width:280px;">
                            <!-- App Info -->
                            <div style="background:#222;border-radius:8px;padding:16px;margin-bottom:20px;">
                                <h3 style="font-size:13px;font-weight:600;margin-bottom:12px;">App Info</h3>
                                <div style="display:flex;flex-direction:column;gap:10px;">
                                    <div style="display:flex;justify-content:space-between;font-size:12px;">
                                        <span style="color:#888;">Size</span>
                                        <span style="color:#ccc;">${app.size}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;font-size:12px;">
                                        <span style="color:#888;">Age Rating</span>
                                        <span style="color:#ccc;">${app.ageRating}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;font-size:12px;">
                                        <span style="color:#888;">Category</span>
                                        <span style="color:#ccc;">${app.category}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Discover More -->
                            <div style="background:#222;border-radius:8px;padding:16px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                    <h3 style="font-size:13px;font-weight:600;">Discover more</h3>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:12px;">
                                    ${getDiscoverApps(appId).map(a => `
                                        <div class="store-discover-card" data-app="${a.id}" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px;border-radius:6px;transition:background 0.2s;">
                                            <div style="width:40px;height:40px;background:${a.bg};border-radius:8px;display:flex;align-items:center;justify-content:center;">
                                                ${a.icon}
                                            </div>
                                            <div style="flex:1;">
                                                <div style="font-size:12px;font-weight:500;">${a.name}</div>
                                                <div style="font-size:10px;color:#888;">Free</div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getDiscoverApps(currentAppId) {
        const allApps = [
            { id: 'vscode', name: 'Visual Studio Code', bg: '#007ACC', icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="white"/></svg>` },
            { id: 'sampleApp', name: 'Sample App', bg: 'linear-gradient(135deg, #6a11cb, #2575fc)', icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="white" fill-opacity="0.3"/><text x="12" y="17" text-anchor="middle" fill="white" font-size="14" font-weight="bold">S</text></svg>` },
            { id: 'export', name: 'Ex/port', bg: 'linear-gradient(135deg, #0078D4, #00BCF2)', icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>` }
        ];
        return allApps.filter(a => a.id !== currentAppId).slice(0, 3);
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
        const win = WindowManager.createWindow('appStore', 'Microsoft Store', icon, getMainContent(), { width: 1000, height: 680 });
        const el = win.element;
        
        checkInstalledStatus(el);

        function setupNav(el) {
            const navItems = el.querySelectorAll('.store-nav-item');
            navItems.forEach(item => {
                item.addEventListener('click', () => {
                    const mainContent = el.querySelector('.store-content') || el.querySelector('.store-main');
                    if (mainContent) {
                        mainContent.innerHTML = getMainContent().split('<!-- Scrollable Body -->')[1].split('</div></div></div>')[0] + '</div></div></div>';
                    }
                    navItems.forEach(n => {
                        n.classList.remove('active');
                        n.style.background = 'none';
                        n.style.color = '#aaa';
                    });
                    item.classList.add('active');
                    item.style.background = 'rgba(255,255,255,0.08)';
                    item.style.color = 'white';
                    checkInstalledStatus(el);
                    setupAppCards(el);
                    setupInstallButtons(el);
                });
            });
        }

        function setupAppCards(container) {
            const cards = container.querySelectorAll('.store-app-card');
            cards.forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.store-install-btn')) return;
                    const appId = card.getAttribute('data-app');
                    if (appId && appDetails[appId]) {
                        showAppDetail(appId);
                    }
                });
                card.addEventListener('mouseenter', () => {
                    card.style.background = '#333';
                });
                card.addEventListener('mouseleave', () => {
                    card.style.background = '#2a2a2a';
                });
            });
        }

        function setupInstallButtons(container) {
            const installBtns = container.querySelectorAll('.store-install-btn, .store-get-btn');
            installBtns.forEach(btn => {
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
            const cards = container.querySelectorAll('.store-discover-card');
            cards.forEach(card => {
                card.addEventListener('click', () => {
                    const appId = card.getAttribute('data-app');
                    if (appId && appDetails[appId]) {
                        showAppDetail(appId);
                    }
                });
                card.addEventListener('mouseenter', () => {
                    card.style.background = '#333';
                });
                card.addEventListener('mouseleave', () => {
                    card.style.background = '';
                });
            });
        }

        function showAppDetail(appId) {
            const content = el.querySelector('.store-main');
            content.innerHTML = getDetailContent(appId).split('<!-- Main Content Area -->')[1];

            const backBtn = content.querySelector('.store-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    showMainView();
                });
                backBtn.addEventListener('mouseenter', () => {
                    backBtn.style.background = 'rgba(255,255,255,0.1)';
                });
                backBtn.addEventListener('mouseleave', () => {
                    backBtn.style.background = 'none';
                });
            }

            checkInstalledStatus(content);
            setupNav(content);
            setupInstallButtons(content);
            setupDiscoverCards(content);
        }

        function showMainView() {
            const content = el.querySelector('.store-main');
            content.innerHTML = getMainContent().split('<!-- Main Content Area -->')[1];

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
