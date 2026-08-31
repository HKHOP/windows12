import WindowManager from './windowManager.js';

const Popup = (() => {
    const popups = new Map();

    const typeIcons = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        confirm: '❓',
        pick: '📋',
        textbox: '✏️',
        forum: '📝'
    };

    function createPopup(type, title, body, opts = {}) {
        const icon = typeIcons[type] || '💬';
        const width = opts.width || 400;
        const height = opts.height || 220;

        const html = `
            <div class="popup-body">${body}</div>
            <div class="popup-actions"></div>
        `;

        const win = WindowManager.createWindow('popup', title, icon, html, {
            width,
            height,
            minWidth: 300,
            minHeight: 180
        });

        const el = win.element;
        el.classList.add('app-popup', `popup-${type}`);

        const maxBtn = el.querySelector('.maximize-btn');
        if (maxBtn) maxBtn.remove();

        if (!opts.minimize) {
            const minBtn = el.querySelector('.minimize-btn');
            if (minBtn) minBtn.remove();
        }

        const actionsEl = el.querySelector('.popup-actions');

        let promiseResolve = null;
        const promise = new Promise(resolve => { promiseResolve = resolve; });

        const cleanup = (value) => {
            popups.delete(win.id);
            promiseResolve(value);
        };

        popups.set(win.id, { cleanup, win });

        const closeBtn = el.querySelector('.close-btn');
        if (!opts.closable && closeBtn) {
            closeBtn.style.visibility = 'hidden';
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup(opts.closeValue !== undefined ? opts.closeValue : null);
                WindowManager.closeWindow(win.id);
            });
        }

        promise._actionsEl = actionsEl;
        promise._winId = win.id;
        promise._cleanup = cleanup;

        return promise;
    }

    function addButtons(popupPromise, buttons) {
        const actionsEl = popupPromise._actionsEl;
        if (!actionsEl) return;
        actionsEl.innerHTML = '';
        buttons.forEach(btn => {
            const el = document.createElement('button');
            el.className = 'popup-btn' + (btn.primary ? ' popup-btn-primary' : '') + (btn.danger ? ' popup-btn-danger' : '');
            el.textContent = btn.label;
            el.addEventListener('click', () => {
                popupPromise._cleanup(btn.value);
                WindowManager.closeWindow(popupPromise._winId);
            });
            actionsEl.appendChild(el);
        });
    }

    function info(title, message) {
        const p = createPopup('info', title, `<div class="popup-message">${message}</div>`);
        addButtons(p, [
            { label: 'OK', value: 'ok', primary: true }
        ]);
        return p;
    }

    function warn(title, message) {
        const p = createPopup('warn', title, `<div class="popup-message">${message}</div>`);
        addButtons(p, [
            { label: 'OK', value: 'ok', primary: true }
        ]);
        return p;
    }

    function error(title, message) {
        const p = createPopup('error', title, `<div class="popup-message">${message}</div>`, { width: 420 });
        addButtons(p, [
            { label: 'OK', value: 'ok', primary: true }
        ]);
        return p;
    }

    function confirm(title, message) {
        const p = createPopup('confirm', title, `<div class="popup-message">${message}</div>`);
        addButtons(p, [
            { label: 'Cancel', value: false },
            { label: 'OK', value: true, primary: true, danger: true }
        ]);
        return p;
    }

    function pick(title, message, options) {
        const items = options.map((opt, i) => {
            const label = typeof opt === 'string' ? opt : opt.label;
            return `<div class="popup-pick-item" data-index="${i}">${label}</div>`;
        }).join('');

        const p = createPopup('pick', title, `
            <div class="popup-message">${message}</div>
            <div class="popup-pick-list">${items}</div>
        `, { width: 420, height: 300 });

        addButtons(p, [
            { label: 'Cancel', value: null }
        ]);

        const el = WindowManager.getWindowsByApp('popup').find(w => w.id === p._winId)?.element;
        if (el) {
            el.querySelectorAll('.popup-pick-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.index);
                    p._cleanup(options[idx]);
                    WindowManager.closeWindow(p._winId);
                });
            });
        }

        return p;
    }

    function textbox(title, message, opts = {}) {
        const id = 'popup-input-' + Date.now();
        const p = createPopup('textbox', title, `
            <div class="popup-message">${message}</div>
            <div class="popup-input-wrap">
                <input type="text" class="popup-input" id="${id}" value="${opts.value || ''}" placeholder="${opts.placeholder || ''}">
            </div>
        `);

        addButtons(p, [
            { label: 'Cancel', value: null },
            { label: 'OK', value: 'ok', primary: true }
        ]);

        const el = WindowManager.getWindowsByApp('popup').find(w => w.id === p._winId)?.element;
        if (el) {
            const input = el.querySelector(`#${id}`);
            if (input) {
                input.focus();
                input.select();
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        p._cleanup(input.value);
                        WindowManager.closeWindow(p._winId);
                    }
                    if (e.key === 'Escape') {
                        p._cleanup(null);
                        WindowManager.closeWindow(p._winId);
                    }
                });

                const okBtn = p._actionsEl.querySelector('.popup-btn-primary');
                if (okBtn) {
                    okBtn.addEventListener('click', (e) => {
                        e.stopImmediatePropagation();
                        p._cleanup(input.value);
                        WindowManager.closeWindow(p._winId);
                    }, true);
                }
            }
        }

        return p;
    }

    function forum(title, fields) {
        const inputs = fields.map((f, i) => `
            <div class="popup-field">
                <label class="popup-field-label" for="popup-f-${i}">${f.label}</label>
                <input type="${f.type || 'text'}" class="popup-input" id="popup-f-${i}" value="${f.value || ''}" placeholder="${f.placeholder || ''}">
            </div>
        `).join('');

        const p = createPopup('forum', title, `
            <div class="popup-forum">${inputs}</div>
        `, { width: 420, height: 280 });

        addButtons(p, [
            { label: 'Cancel', value: null },
            { label: 'OK', value: 'ok', primary: true }
        ]);

        const el = WindowManager.getWindowsByApp('popup').find(w => w.id === p._winId)?.element;
        if (el) {
            const firstInput = el.querySelector('.popup-input');
            if (firstInput) {
                firstInput.focus();
                firstInput.select();
            }

            el.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    p._cleanup(null);
                    WindowManager.closeWindow(p._winId);
                }
            });

            const okBtn = p._actionsEl.querySelector('.popup-btn-primary');
            if (okBtn) {
                okBtn.addEventListener('click', (e) => {
                    e.stopImmediatePropagation();
                    const values = {};
                    fields.forEach((f, i) => {
                        values[f.key || f.label] = el.querySelector(`#popup-f-${i}`).value;
                    });
                    p._cleanup(values);
                    WindowManager.closeWindow(p._winId);
                }, true);
            }
        }

        return p;
    }

    return { info, warn, error, confirm, pick, textbox, forum };
})();

export default Popup;
