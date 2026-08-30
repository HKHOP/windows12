import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';

const Photos = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#0078D4"/><circle cx="9" cy="10" r="2.5" fill="white"/><path d="M3 17L8 12L12 16L16 11L21 17V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V17Z" fill="white"/></svg>`;

    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif'];
    const COLORS = ['#0078D4', '#107C10', '#D83B01', '#B4009E', '#00B7C3', '#E3008C', '#986B0D', '#7A7574', '#008272', '#8764B8'];

    function scanImages(path = ['/', 'users', 'default', 'Pictures']) {
        const images = [];
        const items = FileSystem.getChildren(path);
        for (const item of items) {
            if (item.type === 'folder') {
                images.push(...scanImages([...path, item.name]));
            } else if (item.type === 'file' && IMAGE_EXTS.includes(item.ext.toLowerCase())) {
                images.push({ name: item.name, path: [...path, item.name], ext: item.ext.toLowerCase(), size: item.size });
            }
        }
        return images;
    }

    function getPlaceholderColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return COLORS[Math.abs(hash) % COLORS.length];
    }

    function getThumbnailHTML(image) {
        const color = getPlaceholderColor(image.name);
        const label = image.name.length > 16 ? image.name.substring(0, 14) + '...' : image.name;
        return `
            <div class="photo-thumb" data-name="${image.name}" style="
                aspect-ratio:1;border-radius:6px;overflow:hidden;cursor:pointer;position:relative;
                background:${color};display:flex;align-items:center;justify-content:center;
                transition:transform 0.15s,box-shadow 0.15s;
            ">
                <span style="color:white;font-size:11px;text-align:center;padding:6px;word-break:break-all;line-height:1.3;text-shadow:0 1px 3px rgba(0,0,0,0.5);">${label}</span>
                <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.5);border-radius:3px;padding:1px 5px;font-size:9px;color:#ccc;text-transform:uppercase;">${image.ext}</div>
            </div>`;
    }

    function getEmptyState() {
        return `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#888;gap:16px;padding:40px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style="opacity:0.4;">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="#888" stroke-width="1.5"/>
                    <circle cx="9" cy="10" r="2.5" stroke="#888" stroke-width="1.5"/>
                    <path d="M3 17L8 12L12 16L16 11L21 17V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V17Z" stroke="#888" stroke-width="1.5"/>
                </svg>
                <div style="font-size:15px;font-weight:500;">No photos found</div>
                <div style="font-size:12px;color:#666;text-align:center;">Add images to your Pictures folder to see them here.</div>
            </div>`;
    }

    function getViewerHTML(image) {
        const color = getPlaceholderColor(image.name);
        return `
            <div class="photo-viewer" style="position:absolute;inset:0;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;z-index:10;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;">
                    <span style="color:#ddd;font-size:13px;">${image.name}</span>
                    <button class="photo-viewer-close" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;">&times;</button>
                </div>
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;">
                    <div style="max-width:90%;max-height:90%;aspect-ratio:4/3;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
                        <span style="color:white;font-size:22px;text-align:center;padding:20px;word-break:break-all;text-shadow:0 2px 6px rgba(0,0,0,0.5);">${image.name}</span>
                    </div>
                </div>
                <div style="text-align:center;padding:8px;color:#666;font-size:11px;">${image.ext.toUpperCase()} &middot; ${image.size ? (image.size / 1024).toFixed(1) + ' KB' : 'Unknown size'}</div>
            </div>`;
    }

    function getContent(images) {
        if (images.length === 0) return `<div style="height:100%;overflow-y:auto;">${getEmptyState()}</div>`;

        const thumbs = images.map(img => `
            <div style="min-width:0;">
                ${getThumbnailHTML(img)}
                <div style="font-size:11px;color:#aaa;padding:4px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${img.name}</div>
            </div>`).join('');

        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:13px;color:#aaa;">${images.length} item${images.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="photo-grid" style="flex:1;overflow-y:auto;padding:16px 20px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;">
                        ${thumbs}
                    </div>
                </div>
            </div>`;
    }

    function launch() {
        const images = scanImages();
        const win = WindowManager.createWindow('photos', 'Photos', icon, getContent(images), { width: 700, height: 480 });

        win.element.querySelector('.photo-grid')?.addEventListener('click', (e) => {
            const thumb = e.target.closest('.photo-thumb');
            if (!thumb) return;
            const name = thumb.dataset.name;
            const image = images.find(img => img.name === name);
            if (!image) return;
            const contentEl = win.element.querySelector('.window-content');
            contentEl.insertAdjacentHTML('beforeend', getViewerHTML(image));
            contentEl.querySelector('.photo-viewer-close').addEventListener('click', () => {
                contentEl.querySelector('.photo-viewer')?.remove();
            });
        });
    }

    return { launch };
})();

export default Photos;
