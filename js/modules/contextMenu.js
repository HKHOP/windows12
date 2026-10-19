import Keyboard from './keyboard.js';
import Scaling from './scaling.js';

const ContextMenu = (() => {
    let menuEl;
    let isVisible = false;
    let pendingClose = null;

    function init() {
        menuEl = document.getElementById('context-menu');
        document.addEventListener('contextmenu', handleGlobalContext);
        // Layered Escape: close the menu when open, otherwise pass the key
        // through so panels/flyouts/apps below can handle it.
        Keyboard.register('ESCAPE', () => {
            if (!isVisible) return false;
            hide();
        }, { system: true, preventDefault: false, description: 'Close context menu' });
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
        // The menu is a child of the zoomed <body>: `left/top` lengths are
        // multiplied by that zoom, while clientX/Y and innerWidth are real
        // viewport pixels. Without this conversion menus opened far away
        // from the pointer whenever body zoom != 1 (phones, small screens).
        const z = Scaling.getUiZoom() || 1;
        const maxX = Math.max(0, (window.innerWidth - menuEl.offsetWidth * z - 4) / z);
        const maxY = Math.max(0, (window.innerHeight - menuEl.offsetHeight * z - 4) / z);
        menuEl.style.left = `${Math.max(0, Math.min(x / z, maxX))}px`;
        menuEl.style.top = `${Math.max(0, Math.min(y / z, maxY))}px`;
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

    function isOpen() {
        return isVisible;
    }

    return { init, show, hide, showForElement, isOpen };
})();

window._ContextMenu = ContextMenu;

export default ContextMenu;
