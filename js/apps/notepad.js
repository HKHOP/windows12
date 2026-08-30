import WindowManager from '../modules/windowManager.js';

const Notepad = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/></svg>`;

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;gap:2px;padding:4px 8px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">File</button>
                    <button style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">Edit</button>
                    <button style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">View</button>
                </div>
                <textarea class="notepad-textarea" style="flex:1;background:transparent;border:none;color:#ddd;padding:12px 16px;resize:none;outline:none;font-family:'Consolas','Courier New',monospace;font-size:14px;line-height:1.6;" placeholder="Start typing..." spellcheck="false"></textarea>
                <div style="padding:4px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#666;">
                    <span class="notepad-status">Ln 1, Col 1</span>
                    <span>UTF-8</span>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('notepad', 'Untitled - Notepad', icon, getContent(), { width: 650, height: 450 });
        const textarea = win.element.querySelector('.notepad-textarea');
        const status = win.element.querySelector('.notepad-status');

        textarea.addEventListener('input', () => {
            updateStatus(textarea, status);
        });
        textarea.addEventListener('click', () => {
            updateStatus(textarea, status);
        });
        textarea.addEventListener('keyup', () => {
            updateStatus(textarea, status);
        });
    }

    function updateStatus(textarea, status) {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        const ln = lines.length;
        const col = lines[lines.length - 1].length + 1;
        status.textContent = `Ln ${ln}, Col ${col}`;
    }

    return { launch };
})();

export default Notepad;
