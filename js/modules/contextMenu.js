const ContextMenu = (() => {
    let menuEl;
    let isVisible = false;
    let pendingClose = null;

    function init() {
        menuEl = document.getElementById('context-menu');
        document.addEventListener('contextmenu', handleGlobalContext);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hide();
        });
        menuEl.addEventListener('click', (e) => e.stopPropagation());
    }

    function handleGlobalContext(e) {
        if (e.target.closest('#desktop') || e.target.closest('#taskbar') || e.target.closest('.app-window')) {
            e.preventDefault();
        }
    }

    function removePendingClose() {
        if (pendingClose) {
            document.removeEventListener('click', pendingClose);
            pendingClose = null;
        }
    }

    function show(x, y, items) {
        removePendingClose();
        menuEl.innerHTML = '';
        items.forEach(item => {
            if (item === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'ctx-separator';
                menuEl.appendChild(sep);
                return;
            }
            const el = document.createElement('div');
            el.className = 'ctx-item' + (item.disabled ? ' disabled' : '');
            el.innerHTML = `
                <span class="ctx-icon">${item.icon || ''}</span>
                <span class="ctx-label">${item.label}</span>
                <span class="ctx-shortcut">${item.shortcut || ''}</span>
            `;
            if (!item.disabled && item.action) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hide();
                    item.action();
                });
            }
            menuEl.appendChild(el);
        });

        menuEl.classList.remove('hidden');
        const rect = menuEl.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 4;
        const maxY = window.innerHeight - rect.height - 4;
        menuEl.style.left = `${Math.min(x, maxX)}px`;
        menuEl.style.top = `${Math.min(y, maxY)}px`;
        isVisible = true;

        requestAnimationFrame(() => {
            pendingClose = () => hide();
            document.addEventListener('click', pendingClose, { once: true });
        });
    }

    function hide() {
        removePendingClose();
        menuEl.classList.add('hidden');
        isVisible = false;
    }

    function showForElement(element, x, y, items) {
        show(x, y, items);
    }

    return { init, show, hide, showForElement };
})();

window._ContextMenu = ContextMenu;

export default ContextMenu;
