// FileNames — how a file's name is shown in the shell (Settings > Files >
// "Show file name extensions").
//
// Windows hides the extension of a file whose type it knows: Explorer shows
// "report" for report.txt but keeps "backup.7z" for a type nothing can open,
// which is what makes a hidden extension safe — you only lose information the
// system already gives you back (the icon, the opening app). This module is
// the one place that rule lives, so File Explorer and the desktop can never
// disagree about the name of the same file.
//
// Only the *label* changes. Sorting, opening, renaming and the file's real
// path always use the full name (renaming selects the base name, the way
// Windows does).
import SystemConfig from './systemConfig.js';
import FileAssociations from './fileAssociations.js';

const FileNames = (() => {
    // Types the OS itself opens. An installed app adds its own through its
    // manifest (FileAssociations), so those are covered without listing them.
    const BUILTIN_TYPES = new Set([
        // text, code and documents
        'txt', 'md', 'markdown', 'note', 'todo', 'json', 'js', 'html', 'htm',
        'css', 'log', 'cfg', 'ini', 'xml', 'yml', 'yaml', 'csv', 'reg',
        'ps1', 'psm1', 'bat', 'cmd', 'vbs', 'vbe',
        // images
        'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg',
        // audio and video
        'mp3', 'wav', 'ogg', 'oga', 'm4a', 'mp4', 'webm', 'weba',
        // archives, packages and shortcuts
        'zip', 'w12pkg', 'msi', 'lnk',
        // app documents
        'cesheet', 'celsheet', 'sledge', 'sledgepoint', 'mspark'
    ]);

    function extOf(name) {
        const dot = name.lastIndexOf('.');
        // A leading dot is a hidden file's name ('.config'), not an extension.
        if (dot <= 0 || dot === name.length - 1) return '';
        return name.slice(dot + 1).toLowerCase();
    }

    function isKnownType(extension) {
        const ext = String(extension || '').toLowerCase().replace(/^\./, '');
        if (!ext) return false;
        if (BUILTIN_TYPES.has(ext)) return true;
        // An app that claims the type can open it, so the extension is
        // information the user does not need on screen. Boot-safe: the
        // association table may still be empty before the catalog is wired.
        try { return FileAssociations.getCandidates(ext).length > 0; } catch { return false; }
    }

    function showExtensions() {
        try { return SystemConfig.get('showFileExtensions') !== false; } catch { return true; }
    }

    // Accepts a file-system entry ({ name, ext, type }) or a bare name.
    function display(item) {
        const name = typeof item === 'string' ? item : (item && item.name) || '';
        if (!name || showExtensions()) return name;
        if (item && item.type === 'folder') return name;
        const ext = item && item.ext ? String(item.ext).toLowerCase() : extOf(name);
        if (!ext || !isKnownType(ext)) return name;
        return name.slice(0, name.length - ext.length - 1) || name;
    }

    return { display, showExtensions, isKnownType };
})();

export default FileNames;
