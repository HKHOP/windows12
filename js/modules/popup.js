import ContextMenu from './contextMenu.js';

const Popup = (() => {
    let overlay = null;

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'popup-overlay hidden';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
        return overlay;
    }

    function show(html) {
        const ol = ensureOverlay();
        ol.innerHTML = `<div class="popup-box">${html}</div>`;
        ol.classList.remove('hidden');
        return ol;
    }

    function hide() {
        if (overlay) overlay.classList.add('hidden');
    }

    function waitForButton(ol, resolve) {
        const btns = ol.querySelectorAll('.popup-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.value ?? btn.textContent;
                hide();
                resolve(val);
            });
        });
    }

    function info(title, message) {
        return new Promise(resolve => {
            const ol = show(`
                <div class="popup-title">${title}</div>
                <div class="popup-message">${message}</div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-primary" data-value="ok">OK</button>
                </div>
            `);
            waitForButton(ol, resolve);
            ol.querySelector('.popup-btn').focus();
        });
    }

    function warn(title, message) {
        return new Promise(resolve => {
            const ol = show(`
                <div class="popup-title popup-title-warn">${title}</div>
                <div class="popup-message">${message}</div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-primary popup-btn-warn" data-value="ok">OK</button>
                </div>
            `);
            waitForButton(ol, resolve);
            ol.querySelector('.popup-btn').focus();
        });
    }

    function error(title, message) {
        return new Promise(resolve => {
            const ol = show(`
                <div class="popup-title popup-title-error">${title}</div>
                <div class="popup-message">${message}</div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-primary popup-btn-error" data-value="ok">OK</button>
                </div>
            `);
            waitForButton(ol, resolve);
            ol.querySelector('.popup-btn').focus();
        });
    }

    function confirm(title, message) {
        return new Promise(resolve => {
            const ol = show(`
                <div class="popup-title">${title}</div>
                <div class="popup-message">${message}</div>
                <div class="popup-actions">
                    <button class="popup-btn" data-value="false">Cancel</button>
                    <button class="popup-btn popup-btn-primary popup-btn-danger" data-value="true">OK</button>
                </div>
            `);
            waitForButton(ol, resolve);
            ol.querySelector('.popup-btn-primary').focus();
        });
    }

    function pick(title, message, options) {
        return new Promise(resolve => {
            const items = options.map((opt, i) => {
                const label = typeof opt === 'string' ? opt : opt.label;
                const value = typeof opt === 'string' ? opt : (opt.value ?? opt.label);
                return `<div class="popup-pick-item" data-value="${i}">${label}</div>`;
            }).join('');

            const ol = show(`
                <div class="popup-title">${title}</div>
                <div class="popup-message">${message}</div>
                <div class="popup-pick-list">${items}</div>
                <div class="popup-actions">
                    <button class="popup-btn" data-value="-1">Cancel</button>
                </div>
            `);

            ol.querySelectorAll('.popup-pick-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.value);
                    hide();
                    resolve(options[idx]);
                });
            });

            ol.querySelectorAll('.popup-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    hide();
                    resolve(null);
                });
            });
        });
    }

    function textbox(title, message, opts = {}) {
        return new Promise(resolve => {
            const id = 'popup-input-' + Date.now();
            const ol = show(`
                <div class="popup-title">${title}</div>
                <div class="popup-message">${message}</div>
                <div class="popup-input-wrap">
                    <input type="text" class="popup-input" id="${id}" value="${opts.value || ''}" placeholder="${opts.placeholder || ''}">
                </div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-cancel" data-value="null">Cancel</button>
                    <button class="popup-btn popup-btn-primary" data-value="ok">OK</button>
                </div>
            `);

            const input = ol.querySelector(`#${id}`);
            input.focus();
            input.select();

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    hide();
                    resolve(input.value);
                }
                if (e.key === 'Escape') {
                    hide();
                    resolve(null);
                }
            });

            ol.querySelectorAll('.popup-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.dataset.value === 'null') {
                        hide();
                        resolve(null);
                    } else {
                        hide();
                        resolve(input.value);
                    }
                });
            });
        });
    }

    function forum(title, fields) {
        return new Promise(resolve => {
            const inputs = fields.map((f, i) => {
                const id = `popup-field-${i}`;
                const val = f.value || '';
                return `
                    <div class="popup-field">
                        <label class="popup-field-label" for="${id}">${f.label}</label>
                        <input type="${f.type || 'text'}" class="popup-input" id="${id}" value="${val}" placeholder="${f.placeholder || ''}">
                    </div>
                `;
            }).join('');

            const ol = show(`
                <div class="popup-title">${title}</div>
                <div class="popup-forum">${inputs}</div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-cancel" data-value="null">Cancel</button>
                    <button class="popup-btn popup-btn-primary" data-value="ok">OK</button>
                </div>
            `);

            const firstInput = ol.querySelector('.popup-input');
            if (firstInput) {
                firstInput.focus();
                firstInput.select();
            }

            ol.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    hide();
                    resolve(null);
                }
            });

            ol.querySelectorAll('.popup-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.dataset.value === 'null') {
                        hide();
                        resolve(null);
                    } else {
                        const values = {};
                        fields.forEach((f, i) => {
                            values[f.key || f.label] = ol.querySelector(`#popup-field-${i}`).value;
                        });
                        hide();
                        resolve(values);
                    }
                });
            });
        });
    }

    return { info, warn, error, confirm, pick, textbox, forum, hide };
})();

export default Popup;
