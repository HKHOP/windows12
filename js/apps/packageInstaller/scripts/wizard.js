// Package Installer — the standard Windows Installer-style wizard.
//
// Everything here is per-window: state lives in this closure, so two .msi
// files opened at once never share a selection or an install.
import { DESTINATIONS, DESTINATION_LABELS, MANIFEST_DEFAULTS, mergeConfig, normalizeConfig, resolveCreate } from '../../../modules/shortcutConfig.js';

const PERMISSION_LABELS = {
    filesystem: 'Access your files',
    notifications: 'Send notifications',
    network: 'Access the internet',
    clipboard: 'Read your clipboard',
    background: 'Run in background',
    microphone: 'Use your microphone',
    camera: 'Use your camera'
};

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function capitalize(word) {
    return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
}

function sameUuid(a, b) {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function iconCheck() {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
}

function iconCross() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
}

/**
 * Mount the default setup wizard.
 * @param {HTMLElement} host   the window's empty content host
 * @param {object} session     installer session (main.js)
 */
export async function mountWizard(host, session) {
    const inspection = session.inspection;
    const man = inspection.manifest;
    const conf = inspection.installer || {
        mode: 'gui', scope: 'either', defaultScope: 'user', publisher: '',
        features: [], fields: [], welcome: {}, theme: {}, finish: {}, eula: null, ui: '', shortcuts: null
    };
    const existing = session.existing || null;
    const replacing = !!(existing && existing.manifest && !sameUuid(existing.manifest.uuid, man.uuid));
    const updating = !!existing && !replacing;

    const logoUrl = await session.assetUrl(conf.theme.logo || man.icon);
    const bannerUrl = conf.theme.banner ? await session.assetUrl(conf.theme.banner) : null;
    const welcomeImage = conf.welcome.image ? await session.assetUrl(conf.welcome.image) : null;

    const publisher = conf.publisher || (man.store && man.store.developer) || 'Unknown publisher';
    const shortcutConfig = mergeConfig(normalizeConfig(man.shortcuts, MANIFEST_DEFAULTS), conf.shortcuts || null);
    const shortcutOptions = DESTINATIONS.filter(dest =>
        shortcutConfig[dest] && shortcutConfig[dest].enabled !== false && shortcutConfig[dest].optional === true);
    const scopeOptions = existing
        ? [existing.scope]
        : (conf.scope === 'either' ? ['user', 'system'] : [conf.scope]);
    const initialScope = existing ? existing.scope : (conf.defaultScope || 'user');

    const state = {
        step: 'welcome',
        scope: initialScope,
        accepted: !inspection.eula || !inspection.eula.required,
        features: new Map(conf.features.map(f => [f.id, f.required || f.default])),
        fields: {},
        shortcuts: resolveCreate(shortcutConfig),
        replaceAccepted: false,
        installing: false,
        cancelled: false,
        result: null,
        error: ''
    };
    for (const field of conf.fields) {
        state.fields[field.id] = field.default !== undefined
            ? field.default
            : (field.type === 'checkbox' ? false : '');
    }

    const steps = ['welcome'];
    if (inspection.eula && inspection.eula.text) steps.push('license');
    const hasOptions = scopeOptions.length > 1 || conf.features.length > 0 || conf.fields.length > 0 || shortcutOptions.length > 0;
    if (hasOptions) steps.push('options');
    steps.push('ready');
    let stepIndex = 0;

    const root = document.createElement('div');
    root.className = 'pi-root';
    root.innerHTML = `
        <aside class="pi-side">
            ${logoUrl
                ? `<img class="pi-logo" src="${esc(logoUrl)}" alt="">`
                : `<div class="pi-logo-fallback">${esc(man.name.charAt(0).toUpperCase())}</div>`}
            <div>
                <div class="pi-brand-name">${esc(man.name)}</div>
                <div class="pi-brand-sub">${esc(publisher)}</div>
            </div>
            <div class="pi-side-foot">
                ${esc(capitalize(conf.mode === 'gui' ? 'setup wizard' : conf.mode))}<br>
                Version ${esc(man.version)}
            </div>
        </aside>
        <section class="pi-main">
            <div class="pi-head">
                <h1 class="pi-title"></h1>
                <p class="pi-sub"></p>
            </div>
            <div class="pi-body"></div>
            <div class="pi-foot">
                <span class="pi-spacer"></span>
                <button type="button" class="pi-btn pi-back">Back</button>
                <button type="button" class="pi-btn primary pi-next">Next</button>
                <button type="button" class="pi-btn pi-cancel">Cancel</button>
            </div>
        </section>`;
    host.replaceChildren(root);

    if (bannerUrl) {
        const side = root.querySelector('.pi-side');
        side.classList.add('has-banner');
        side.style.backgroundImage = `url("${bannerUrl}")`;
    }
    if (conf.theme.accent) root.style.setProperty('--pi-accent', conf.theme.accent);

    const titleEl = root.querySelector('.pi-title');
    const subEl = root.querySelector('.pi-sub');
    const bodyEl = root.querySelector('.pi-body');
    const backBtn = root.querySelector('.pi-back');
    const nextBtn = root.querySelector('.pi-next');
    const cancelBtn = root.querySelector('.pi-cancel');

    const permissions = (man.permissions || []).filter(p => PERMISSION_LABELS[p]);
    const permissionHtml = permissions.length
        ? `<div class="pi-group">
            <div class="pi-group-title">Permissions</div>
            <div class="pi-row" style="flex-direction:column;gap:5px;">
                ${permissions.map(p => `<span>${esc(PERMISSION_LABELS[p])}</span>`).join('')}
            </div>
            <div class="pi-help" style="font-size:11px;color:#8e8e8e;margin-top:6px;">You can change these later in Settings &gt; Apps.</div>
          </div>`
        : '';

    const installPath = (scope) => scope === 'system'
        ? `\\Program Files\\${man.id}`
        : `\\Users\\${session.userId}\\AppData\\Programs\\${man.id}`;

    function fieldsValid() {
        for (const field of conf.fields) {
            const value = state.fields[field.id];
            if (!field.required) continue;
            if (field.type === 'checkbox' ? !value : !String(value || '').trim()) return false;
        }
        return true;
    }

    function show(step) {
        state.step = step;
        const idx = steps.indexOf(step);
        if (idx >= 0) stepIndex = idx;
        render();
    }

    async function beginInstall() {
        if (state.installing) return;
        state.installing = true;
        state.cancelled = false;
        state.step = 'progress';
        render();

        try {
            const result = await session.install({
                scope: state.scope,
                features: conf.features.filter(f => state.features.get(f.id)).map(f => f.id),
                fields: { ...state.fields },
                shortcuts: { ...state.shortcuts },
                allowReplace: replacing ? state.replaceAccepted : false,
                onProgress: (value, status) => {
                    if (!host.isConnected) return;
                    const fill = bodyEl.querySelector('.pi-progress-fill');
                    const label = bodyEl.querySelector('.pi-progress-label');
                    const statusText = bodyEl.querySelector('.pi-progress-status');
                    if (fill) fill.style.width = Math.round(Math.max(0, Math.min(1, value)) * 100) + '%';
                    if (statusText) statusText.textContent = status || 'Installing';
                    if (label) label.textContent = Math.round(Math.max(0, Math.min(1, value)) * 100) + '%';
                }
            });
            state.installing = false;
            state.result = result;
            state.step = 'finish';
            render();
        } catch (error) {
            state.installing = false;
            if (error && error.cancelled) {
                state.cancelled = true;
                state.error = 'The installation was cancelled. No changes were made.';
            } else if (error && error.elevationDenied) {
                state.error = 'Administrator approval was denied, so the app was not installed.';
            } else {
                state.error = (error && error.message) || 'The installation failed.';
            }
            state.step = 'error';
            render();
        }
    }

    function render() {
        if (!host.isConnected) return;
        const step = state.step;
        root.dataset.step = step;
        bodyEl.scrollTop = 0;

        if (step === 'welcome') {
            titleEl.textContent = conf.welcome.title || `Welcome to the ${man.name} Setup Wizard`;
            subEl.textContent = updating
                ? `This wizard will update ${man.name} on your computer.`
                : `This wizard will install ${man.name} on your computer.`;
            bodyEl.innerHTML = `
                ${welcomeImage ? `<img src="${esc(welcomeImage)}" alt="" style="max-width:100%;max-height:110px;object-fit:contain;display:block;margin:0 0 12px;">` : ''}
                <div>${esc(conf.welcome.message || `This wizard will guide you through the installation of ${man.name} version ${man.version}.`)}</div>
                <div class="pi-info">
                    <div class="pi-row"><span style="width:86px;flex-shrink:0;">Publisher</span><b>${esc(publisher)}</b></div>
                    <div class="pi-row"><span style="width:86px;flex-shrink:0;">Version</span><b>${esc(man.version)}</b></div>
                    <div class="pi-row"><span style="width:86px;flex-shrink:0;">Package size</span><b>${esc(formatBytes(inspection.size))}</b></div>
                </div>
                ${replacing ? `<div class="pi-note">A different app with the id "${esc(man.id)}" is already installed. This package will replace it if you continue.</div>` : ''}
                ${updating ? `<div class="pi-note" style="border-color:rgba(76,194,255,0.3);background:rgba(76,194,255,0.07);color:#a9dcf5;">${esc(existing.manifest.name || man.name)} ${esc(existing.manifest.version || '')} is already installed. This package will update it to ${esc(man.version)}.</div>` : ''}
                <p style="margin:16px 0 0;color:#a9a9a9;">To continue, click Next.</p>`;

            backBtn.hidden = true;
            nextBtn.hidden = false;
            nextBtn.textContent = 'Next';
            nextBtn.disabled = false;
            cancelBtn.hidden = false;
            cancelBtn.textContent = 'Cancel';
            cancelBtn.disabled = false;
        }

        if (step === 'license') {
            titleEl.textContent = 'License Agreement';
            subEl.textContent = 'Please review the license terms before installing this app.';
            bodyEl.innerHTML = `
                <pre class="pi-eula">${esc(inspection.eula.text)}</pre>
                ${inspection.eula.required
                    ? `<label class="pi-accept"><input type="checkbox" class="pi-accept-box"${state.accepted ? ' checked' : ''}> I accept the terms in the license agreement</label>`
                    : '<div class="pi-help" style="font-size:11.5px;color:#8e8e8e;">You may review the license terms above.</div>'}`;

            const box = bodyEl.querySelector('.pi-accept-box');
            if (box) box.addEventListener('change', () => {
                state.accepted = box.checked;
                nextBtn.disabled = !state.accepted;
            });
            backBtn.hidden = false;
            nextBtn.hidden = false;
            nextBtn.textContent = 'Next';
            nextBtn.disabled = inspection.eula.required && !state.accepted;
            cancelBtn.hidden = false;
            cancelBtn.textContent = 'Cancel';
        }

        if (step === 'options') {
            titleEl.textContent = 'Installation Options';
            subEl.textContent = 'Choose how and where to install this app.';
            const scopeHtml = scopeOptions.length > 1
                ? `<div class="pi-group">
                    <div class="pi-group-title">Install for</div>
                    <label class="pi-choice">
                        <input type="radio" name="pi-scope" value="user"${state.scope === 'user' ? ' checked' : ''}>
                        <span class="pi-choice-main">
                            <span class="pi-choice-name">Just me</span>
                            <span class="pi-choice-desc">Install into your profile — no administrator approval needed.</span>
                        </span>
                    </label>
                    <label class="pi-choice">
                        <input type="radio" name="pi-scope" value="system"${state.scope === 'system' ? ' checked' : ''}>
                        <span class="pi-choice-main">
                            <span class="pi-choice-name">All users on this device</span>
                            <span class="pi-choice-desc">Install into \\Program Files. Requires administrator approval.</span>
                        </span>
                    </label>
                </div>`
                : `<div class="pi-group">
                    <div class="pi-group-title">Install for</div>
                    <div class="pi-choice locked">
                        <span class="pi-choice-main">
                            <span class="pi-choice-name">${state.scope === 'system' ? 'All users on this device' : 'Just me'}</span>
                            <span class="pi-choice-desc">${existing
                                ? 'Updates keep the original install scope. Uninstall the app to change it.'
                                : `This installer only supports ${state.scope === 'system' ? 'a system-wide install.' : 'a per-user install.'}`}</span>
                        </span>
                    </div>
                </div>`;

            const featuresHtml = conf.features.length
                ? `<div class="pi-group">
                    <div class="pi-group-title">Components</div>
                    ${conf.features.map(f => `
                        <label class="pi-choice">
                            <input type="checkbox" class="pi-feature" data-feature="${esc(f.id)}"${state.features.get(f.id) ? ' checked' : ''}${f.required ? ' disabled' : ''}>
                            <span class="pi-choice-main">
                                <span class="pi-choice-name">${esc(f.name)}</span>
                                ${f.description ? `<span class="pi-choice-desc">${esc(f.description)}</span>` : ''}
                            </span>
                        </label>`).join('')}
                </div>`
                : '';

            const fieldsHtml = conf.fields.length
                ? `<div class="pi-group">
                    <div class="pi-group-title">Setup information</div>
                    ${conf.fields.map(field => {
                        const value = state.fields[field.id];
                        if (field.type === 'checkbox') {
                            return `<label class="pi-checkline">
                                <input type="checkbox" class="pi-field" data-field="${esc(field.id)}"${value ? ' checked' : ''}>
                                ${esc(field.label)}${field.required ? ' *' : ''}
                            </label>${field.help ? `<div class="pi-help" style="font-size:11px;color:#8e8e8e;margin:-6px 0 12px;">${esc(field.help)}</div>` : ''}`;
                        }
                        const control = field.type === 'select'
                            ? `<select class="pi-field" data-field="${esc(field.id)}">
                                ${field.options.map(o => `<option value="${esc(o.value)}"${String(value) === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
                            </select>`
                            : `<input class="pi-field" data-field="${esc(field.id)}" type="${field.type === 'password' ? 'password' : 'text'}" value="${esc(value)}" placeholder="${esc(field.placeholder)}">`;
                        return `<div class="pi-field">
                            <label>${esc(field.label)}${field.required ? ' *' : ''}</label>
                            ${control}
                            ${field.help ? `<span class="pi-help">${esc(field.help)}</span>` : ''}
                        </div>`;
                    }).join('')}
                </div>`
                : '';

            const shortcutsHtml = shortcutOptions.length
                ? `<div class="pi-group">
                    <div class="pi-group-title">Shortcuts</div>
                    ${shortcutOptions.map(dest => `
                        <label class="pi-checkline">
                            <input type="checkbox" class="pi-shortcut" data-destination="${dest}"${state.shortcuts[dest] ? ' checked' : ''}>
                            ${dest === 'startMenu' ? 'Create a Start Menu shortcut'
                                : dest === 'desktop' ? 'Create a desktop shortcut'
                                : 'Pin to the taskbar'}
                        </label>`).join('')}
                </div>`
                : '';

            bodyEl.innerHTML = `${scopeHtml}${featuresHtml}${fieldsHtml}${shortcutsHtml}`;
            bodyEl.querySelectorAll('input[name="pi-scope"]').forEach(input => {
                input.addEventListener('change', () => {
                    if (input.checked) state.scope = input.value;
                });
            });
            bodyEl.querySelectorAll('.pi-feature').forEach(input => {
                input.addEventListener('change', () => {
                    state.features.set(input.dataset.feature, input.checked);
                });
            });
            bodyEl.querySelectorAll('.pi-field').forEach(input => {
                const update = () => {
                    state.fields[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value;
                    nextBtn.disabled = !fieldsValid();
                };
                input.addEventListener('input', update);
                input.addEventListener('change', update);
            });
            bodyEl.querySelectorAll('.pi-shortcut').forEach(input => {
                input.addEventListener('change', () => {
                    state.shortcuts[input.dataset.destination] = input.checked;
                });
            });

            backBtn.hidden = false;
            nextBtn.hidden = false;
            nextBtn.textContent = 'Next';
            nextBtn.disabled = !fieldsValid();
            cancelBtn.hidden = false;
            cancelBtn.textContent = 'Cancel';
        }

        if (step === 'ready') {
            titleEl.textContent = updating ? 'Ready to Update' : 'Ready to Install';
            subEl.textContent = updating
                ? `${man.name} is ready to be updated.`
                : `${man.name} is ready to be installed.`;
            const shortcutSummary = DESTINATIONS.filter(dest => state.shortcuts[dest])
                .map(dest => DESTINATION_LABELS[dest]).join(', ') || 'None';
            bodyEl.innerHTML = `
                <div class="pi-info">
                    <div class="pi-row"><span style="width:104px;flex-shrink:0;">Install for</span><b>${state.scope === 'system' ? 'All users' : 'This user'}</b></div>
                    <div class="pi-row"><span style="width:104px;flex-shrink:0;">Destination</span><b style="word-break:break-all;">${esc(installPath(state.scope))}</b></div>
                    ${conf.features.length ? `<div class="pi-row"><span style="width:104px;flex-shrink:0;">Components</span><span>${esc(conf.features.filter(f => state.features.get(f.id)).map(f => f.name).join(', ') || 'None')}</span></div>` : ''}
                    <div class="pi-row"><span style="width:104px;flex-shrink:0;">Shortcuts</span><span>${esc(shortcutSummary)}</span></div>
                    <div class="pi-row"><span style="width:104px;flex-shrink:0;">Package</span><span>${esc(session.sourceName || 'Package file')} (${esc(formatBytes(inspection.size))})</span></div>
                </div>
                ${replacing ? `<label class="pi-accept" style="margin-top:14px;">
                    <input type="checkbox" class="pi-replace-box"${state.replaceAccepted ? ' checked' : ''}>
                    Replace the existing "${esc(existing.manifest.name || man.id)}" installation
                </label>` : ''}
                ${permissionHtml}
                <p style="margin:16px 0 0;color:#a9a9a9;">Click ${updating ? 'Update' : 'Install'} to begin.</p>`;

            const replaceBox = bodyEl.querySelector('.pi-replace-box');
            if (replaceBox) replaceBox.addEventListener('change', () => {
                state.replaceAccepted = replaceBox.checked;
                nextBtn.disabled = replacing && !state.replaceAccepted;
            });
            backBtn.hidden = false;
            nextBtn.hidden = false;
            nextBtn.textContent = updating ? 'Update' : 'Install';
            nextBtn.disabled = replacing && !state.replaceAccepted;
            cancelBtn.hidden = false;
            cancelBtn.textContent = 'Cancel';
        }

        if (step === 'progress') {
            titleEl.textContent = `Installing ${man.name}`;
            subEl.textContent = 'Please wait while the setup wizard installs the app.';
            bodyEl.innerHTML = `
                <div class="pi-progress"><div class="pi-progress-fill"></div></div>
                <div class="pi-status">
                    <span class="pi-progress-status">Preparing</span>
                    <span class="pi-progress-label"></span>
                </div>
                <p style="margin-top:18px;color:#8e8e8e;font-size:11.5px;">Do not close this window while the installation is in progress.</p>`;
            backBtn.hidden = true;
            nextBtn.hidden = true;
            cancelBtn.hidden = false;
            cancelBtn.textContent = 'Cancel';
            cancelBtn.disabled = false;
        }

        if (step === 'finish' && state.result) {
            const done = state.result;
            titleEl.textContent = 'Setup Completed';
            subEl.textContent = `${man.name} was ${done.updated ? 'updated' : 'installed'} successfully.`;
            const message = conf.finish.message
                || `${man.name} ${man.version} is now available in the Start menu.`;
            bodyEl.innerHTML = `
                <div class="pi-finish-icon">${iconCheck()}</div>
                <div class="pi-finish-title">${done.updated ? 'Update complete' : 'Installation complete'}</div>
                <div class="pi-finish-text">${esc(message)}</div>
                ${conf.finish.launch ? `<label class="pi-accept" style="margin-top:16px;">
                    <input type="checkbox" class="pi-launch-box" checked>
                    Launch ${esc(man.name)}
                </label>` : ''}`;
            backBtn.hidden = true;
            nextBtn.hidden = false;
            nextBtn.textContent = 'Finish';
            nextBtn.disabled = false;
            cancelBtn.hidden = true;
        }

        if (step === 'error') {
            titleEl.textContent = state.cancelled ? 'Installation Cancelled' : 'Setup Failed';
            subEl.textContent = state.cancelled
                ? 'No changes were made to your device.'
                : `${man.name} could not be installed.`;
            bodyEl.innerHTML = `
                <div class="pi-finish-icon bad">${iconCross()}</div>
                <div class="pi-finish-title">${state.cancelled ? 'Setup was cancelled' : 'Setup did not complete'}</div>
                <div class="pi-finish-text">${esc(state.error)}</div>`;
            backBtn.hidden = true;
            nextBtn.hidden = false;
            nextBtn.textContent = 'Close';
            nextBtn.disabled = false;
            cancelBtn.hidden = true;
        }
    }

    function goNext() {
        if (state.installing) return;
        if (state.step === 'finish') {
            const launch = root.querySelector('.pi-launch-box');
            const shouldLaunch = !!(launch && launch.checked);
            session.close();
            if (shouldLaunch && state.result) session.launchInstalled(state.result.id);
            return;
        }
        if (state.step === 'error') {
            session.close();
            return;
        }
        if (state.step === 'ready') {
            beginInstall();
            return;
        }
        const next = steps[stepIndex + 1];
        if (next) show(next);
    }

    function goBack() {
        if (state.installing) return;
        const previous = steps[stepIndex - 1];
        if (previous) show(previous);
    }

    nextBtn.addEventListener('click', goNext);
    backBtn.addEventListener('click', goBack);
    cancelBtn.addEventListener('click', () => {
        if (state.installing) {
            cancelBtn.disabled = true;
            cancelBtn.textContent = 'Cancelling…';
            session.cancel();
            return;
        }
        session.close();
    });

    render();
}
