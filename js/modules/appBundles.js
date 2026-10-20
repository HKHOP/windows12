// App bundles — folders that contain a valid manifest.json can run as apps.
//
// A bundle is just a package folder. Installed packages keep using AppLoader's
// canonical id; any other folder (a copy on the Desktop, a portable build in
// Documents, …) launches through AppLoader.launchFromFolder() and is served by
// the service worker under a synthetic /js/apps/<portable-id>/ URL so relative
// imports such as ../../modules/... keep working.
import FileSystem from './fileSystem.js';
import AppLoader from './appLoader.js';
import AppIcons from './appIcons.js';
import UIIcons from './uiIcons.js';

const AppBundles = (() => {
    const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
    const MAX_MANIFEST = 64 * 1024;

    function shell(fn) {
        const g = window._FSGuard;
        return g ? g.asShell(fn)() : fn();
    }

    function entryParts(entry) {
        return String(entry || 'main.js')
            .replace(/\\/g, '/')
            .split('/')
            .filter(p => p && p !== '.' && p !== '..');
    }

    /**
     * Return the folder's manifest when it is runnable, otherwise null.
     * Synchronous: callers render icons/labels in tight loops.
     */
    function manifestForFolder(folderPath) {
        if (!Array.isArray(folderPath) || folderPath.length === 0) return null;
        if (!shell(() => FileSystem.isFolder(folderPath))) return null;
        let raw = null;
        try { raw = shell(() => FileSystem.readFile([...folderPath, 'manifest.json'])); } catch { raw = null; }
        if (typeof raw !== 'string' || raw.length > MAX_MANIFEST) return null;
        let m;
        try { m = JSON.parse(raw); } catch { return null; }
        if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
        if (m.service === true) return null;
        if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return null;
        if (typeof m.name !== 'string' || !m.name.trim()) return null;
        const entry = entryParts(m.entry || 'main.js');
        if (entry.length === 0 || !/\.m?js$/i.test(entry[entry.length - 1])) return null;
        if (!shell(() => FileSystem.itemExists([...folderPath, ...entry]))) return null;
        return m;
    }

    function isAppFolder(folderPath) {
        return !!manifestForFolder(folderPath);
    }

    // Installed packages live at a canonical path and must use their normal
    // module instance (not a duplicate portable import).
    function canonicalAppId(folderPath) {
        if (!Array.isArray(folderPath)) return null;
        const id = folderPath[folderPath.length - 1];
        if (!id) return null;
        if (folderPath.length === 3 && folderPath[0] === '/' && folderPath[1] === 'Program Files') return id;
        if (folderPath.length === 6 && folderPath[0] === '/' && folderPath[1] === 'users'
            && folderPath[3] === 'AppData' && folderPath[4] === 'Programs') return id;
        return null;
    }

    function iconHtml(folderPath, manifest, size = 32) {
        const man = manifest || manifestForFolder(folderPath);
        const canonical = canonicalAppId(folderPath);
        if (canonical && man && canonical === man.id && AppLoader.isLaunchable(canonical)) {
            try {
                return AppIcons.get(canonical);
            } catch { /* fall through to the bundle icon */ }
        }
        const iconPath = String((man && man.icon) || 'assets/icon.svg').replace(/^\/+/, '');
        if (iconPath) {
            const iconParts = iconPath.split('/').filter(p => p && p !== '.' && p !== '..');
            const hasIcon = iconParts.length > 0 && shell(() => FileSystem.itemExists([...folderPath, ...iconParts]));
            if (hasIcon) {
                const id = AppLoader.portableId(folderPath);
                const url = new URL(`../apps/${id}/${iconPath}`, import.meta.url).href;
                const px = Math.max(8, Number(size) || 32);
                return `<img src="${url}" alt="" width="${px}" height="${px}" style="width:${px}px;height:${px}px;object-fit:contain;display:block;">`;
            }
        }
        return UIIcons.folder(man && man.name, size);
    }

    async function launchFolder(folderPath, manifest = null, options = {}) {
        const man = manifest || manifestForFolder(folderPath);
        if (!man) return false;
        const canonical = canonicalAppId(folderPath);
        if (canonical && canonical === man.id && AppLoader.isLaunchable(canonical)) {
            return AppLoader.launch(canonical, options);
        }
        return AppLoader.launchFromFolder(folderPath, man, options);
    }

    async function openFolder(folderPath) {
        return AppLoader.launch('fileExplorer', { path: folderPath });
    }

    return {
        manifestForFolder, isAppFolder, canonicalAppId,
        iconHtml, launchFolder, openFolder
    };
})();

window._AppBundles = AppBundles;

export default AppBundles;
