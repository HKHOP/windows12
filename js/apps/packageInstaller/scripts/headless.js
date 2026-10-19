// Package Installer — compact progress UI for installers that opt into
// "mode": "headless". No wizard steps, no license/options prompts: the
// installer's defaults are applied and the window just reports progress.
function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {HTMLElement} host
 * @param {object} session installer session (main.js)
 * @param {object} options scope/features/fields defaults
 */
export async function mountHeadless(host, session, options) {
    const man = session.inspection.manifest;
    const conf = session.inspection.installer || { finish: {}, theme: {} };
    const logoUrl = await session.assetUrl(conf.theme.logo || man.icon);

    const root = document.createElement('div');
    root.className = 'pi-headless';
    root.innerHTML = `
        <div class="pi-headless-head">
            ${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ''}
            <div>
                <div class="pi-headless-title">Installing ${esc(man.name)}</div>
                <div class="pi-headless-sub">${esc(session.sourceName || 'Package file')} · ${esc(man.version)}</div>
            </div>
        </div>
        <div class="pi-progress"><div class="pi-progress-fill"></div></div>
        <div class="pi-status">
            <span class="pi-progress-status">Preparing</span>
            <span class="pi-progress-label"></span>
        </div>
        <div class="pi-finish-text" style="margin-top:14px;display:none;"></div>
        <div class="pi-foot">
            <span class="pi-spacer"></span>
            <button type="button" class="pi-btn pi-close" hidden>Close</button>
            <button type="button" class="pi-btn pi-cancel">Cancel</button>
        </div>`;
    host.replaceChildren(root);

    const fill = root.querySelector('.pi-progress-fill');
    const statusText = root.querySelector('.pi-progress-status');
    const label = root.querySelector('.pi-progress-label');
    const text = root.querySelector('.pi-finish-text');
    const closeBtn = root.querySelector('.pi-close');
    const cancelBtn = root.querySelector('.pi-cancel');

    let cancelled = false;
    let finished = false;

    function setProgress(value, status) {
        if (!host.isConnected) return;
        const percent = Math.round(Math.max(0, Math.min(1, value)) * 100) + '%';
        fill.style.width = percent;
        if (status) statusText.textContent = status;
        label.textContent = percent;
    }

    function showError(message) {
        if (!host.isConnected) return;
        finished = true;
        root.querySelector('.pi-headless-title').textContent = 'Setup failed';
        fill.style.width = '100%';
        fill.style.background = '#d13438';
        statusText.textContent = '';
        label.textContent = '';
        text.style.display = '';
        text.textContent = message;
        cancelBtn.hidden = true;
        closeBtn.hidden = false;
    }

    cancelBtn.addEventListener('click', () => {
        if (cancelled || finished) return;
        cancelled = true;
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Cancelling…';
        statusText.textContent = 'Cancelling';
        session.cancel();
    });
    closeBtn.addEventListener('click', () => session.close());

    try {
        const result = await session.install({
            ...options,
            onProgress: (value, status) => {
                if (!cancelled) setProgress(value, status);
            }
        });
        if (!host.isConnected) return;
        finished = true;
        setProgress(1, 'Done');
        root.querySelector('.pi-headless-title').textContent = result.updated ? 'Update complete' : 'Installation complete';
        root.querySelector('.pi-headless-sub').textContent = `${man.name} ${man.version}`;
        label.textContent = '';
        text.style.display = '';
        text.textContent = conf.finish.message
            || `${man.name} is ready. You can launch it from the Start menu.`;
        cancelBtn.hidden = true;
        closeBtn.hidden = false;
        session.notifyComplete(result);
        // Headless installs are unattended: get out of the way once the
        // result is on screen. The notification keeps an Open action.
        setTimeout(() => {
            if (host.isConnected && finished) session.close();
        }, 1400);
    } catch (error) {
        if (!host.isConnected) return;
        if (error && error.cancelled) {
            showError('The installation was cancelled. No changes were made.');
            session.notifyCancelled(man.name);
        } else {
            showError((error && error.message) || 'The installation failed.');
            session.notifyError(man.name, error);
        }
    }
}
