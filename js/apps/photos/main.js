import WindowManager from '../../modules/windowManager.js';
import FileSystem from '../../modules/fileSystem.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';
import SystemConfig from '../../modules/systemConfig.js';
import Notifications from '../../modules/notifications.js';
import Popup from '../../modules/popup.js';

const Photos = (() => {
    const icon = AppIcons.get('photos');

    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];

    // Object URLs handed to the grid and the viewer. They live as long as a
    // Photos window does and are revoked when it closes.
    const urls = new Set();

    function trackUrl(url) {
        urls.add(url);
        return url;
    }

    function revokeUrls() {
        urls.forEach(url => {
            try { URL.revokeObjectURL(url); } catch { /* already gone */ }
        });
        urls.clear();
    }

    window.addEventListener('window-closed', (e) => {
        if (e.detail && e.detail.appId === 'photos') revokeUrls();
    });

    // Camera, Photo Studio and Paint all coexist: Paint stores data URLs,
    // the camera writes real blobs. Both are shown here.
    function scanImages(path = Users.home(['Pictures'])) {
        const images = [];
        const items = FileSystem.getChildren(path);
        for (const item of items) {
            if (item.type === 'folder') {
                images.push(...scanImages([...path, item.name]));
            } else if (item.type === 'file' && IMAGE_EXTS.includes(String(item.ext).toLowerCase())) {
                const full = [...path, item.name];
                const blobRef = item.blobRef || (FileSystem.isBlobFile(full) ? 'blob' : null);
                images.push({
                    name: item.name,
                    path: full,
                    ext: String(item.ext).toLowerCase(),
                    size: item.size,
                    data: blobRef ? null : FileSystem.readFile(full),
                    blobRef,
                    url: null
                });
            }
        }
        return images;
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

    function getContent(images) {
        if (images.length === 0) return `<div style="height:100%;overflow-y:auto;">${getEmptyState()}</div>`;

        const thumbs = images.map((img, i) => `
            <div class="photo-item" data-id="${i}" style="min-width:0;cursor:pointer;border-radius:6px;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s;" 
                 onmouseenter="this.style.transform='scale(1.03)';this.style.boxShadow='0 4px 16px rgba(0,0,0,0.3)'"
                 onmouseleave="this.style.transform='scale(1)';this.style.boxShadow='none'">
                <div class="photo-thumb" style="aspect-ratio:1;overflow:hidden;background:#1a1a1a;display:flex;align-items:center;justify-content:center;">
                    ${img.data ? `<img src="${img.data}" style="width:100%;height:100%;object-fit:cover;" alt="${img.name}">` :
                        `<span style="color:#666;font-size:11px;">Loading…</span>`}
                </div>
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

    // Blob-backed images (camera, Photo Studio) load their bytes lazily, so
    // the window appears instantly and the thumbnails fill in.
    async function hydrate(images, win) {
        const grid = win.element.querySelector('.photo-grid');
        if (!grid) return;
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            if (image.data || !image.blobRef || image.url) continue;
            const blob = await FileSystem.readBlob(image.path);
            if (!blob || !win.element.isConnected) continue;
            image.url = trackUrl(URL.createObjectURL(blob));
            const frame = grid.querySelector(`.photo-item[data-id="${i}"] .photo-thumb`);
            if (frame) {
                frame.innerHTML = `<img src="${image.url}" style="width:100%;height:100%;object-fit:cover;" alt="${image.name}">`;
            }
        }
    }

    function launch(filePath) {
        let images;
        let startInView = false;

        if (filePath) {
            const name = filePath[filePath.length - 1];
            const ext = name.split('.').pop().toLowerCase();
            if (IMAGE_EXTS.includes(ext)) {
                const blobRef = FileSystem.isBlobFile(filePath) ? 'blob' : null;
                images = [{
                    name,
                    path: filePath,
                    ext,
                    size: 0,
                    data: blobRef ? null : FileSystem.readFile(filePath),
                    blobRef,
                    url: null
                }];
                startInView = true;
            } else {
                images = scanImages();
            }
        } else {
            images = scanImages();
        }

        const win = WindowManager.createWindow('photos', 'Photos', icon, getContent(images), { width: 700, height: 480 });

        win.element.querySelector('.photo-grid')?.addEventListener('click', (e) => {
            const item = e.target.closest('.photo-item');
            if (!item) return;
            const image = images[Number(item.dataset.id)];
            if (!image) return;
            openViewer(win, image);
        });

        if (startInView && images.length > 0) {
            hydrate(images, win).then(() => {
                if (win.element.isConnected) openViewer(win, images[0]);
            });
        } else {
            hydrate(images, win);
        }
    }

    async function openViewer(win, image) {
        const contentEl = win.element.querySelector('.window-body');
        if (!contentEl) return;
        if (!image.data && !image.url && image.blobRef) {
            const blob = await FileSystem.readBlob(image.path);
            if (blob) image.url = trackUrl(URL.createObjectURL(blob));
            if (!contentEl.isConnected) return;
        }
        const src = image.url || image.data;
        const viewerHTML = `
            <div class="photo-viewer" style="position:absolute;inset:0;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;z-index:10;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="color:#ddd;font-size:13px;">${image.name}</span>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="photo-viewer-wallpaper" style="background:rgba(255,255,255,0.08);border:none;color:#ddd;font-size:12px;cursor:pointer;padding:6px 12px;border-radius:5px;">Set as desktop background</button>
                        <button class="photo-viewer-close" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;">&times;</button>
                    </div>
                </div>
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;">
                    ${src ?
                        `<img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;" alt="${image.name}">` :
                        `<div style="color:#666;font-size:14px;">No preview available</div>`
                    }
                </div>
                <div style="text-align:center;padding:8px;color:#666;font-size:11px;">${image.ext.toUpperCase()} &middot; ${image.size ? (image.size / 1024).toFixed(1) + ' KB' : 'Unknown size'}</div>
            </div>`;

        contentEl.insertAdjacentHTML('beforeend', viewerHTML);
        const viewer = contentEl.lastElementChild;
        viewer.querySelector('.photo-viewer-close').addEventListener('click', () => viewer.remove());
        viewer.querySelector('.photo-viewer-wallpaper').addEventListener('click', () => {
            if (!SystemConfig.setWallpaperImage(image.path)) {
                Popup.warn('Cannot use image', `"${image.name}" is not a supported image file.`);
                return;
            }
            Notifications.info('Desktop background', `Background set to ${image.name}.`, { appId: 'photos' });
        });
    }

    return { launch };
})();

export default Photos;
