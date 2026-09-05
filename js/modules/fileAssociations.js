import FileSystem from './fileSystem.js';

const FileAssociations = (() => {
    const associations = new Map();

    function register(appId, extensions, openFn) {
        extensions.forEach(ext => {
            associations.set(ext.toLowerCase(), { appId, openFn });
        });
    }

    function unregister(appId) {
        associations.forEach((val, key) => {
            if (val.appId === appId) associations.delete(key);
        });
    }

    function getHandler(extension) {
        return associations.get(extension.toLowerCase()) || null;
    }

    function openFile(path) {
        const ext = path[path.length - 1].split('.').pop().toLowerCase();
        const handler = associations.get(ext);
        if (!handler) return false;

        const content = FileSystem.readFile(path);
        if (content === null) return false;

        handler.openFn(path, content);
        return true;
    }

    function getExtension(path) {
        const name = path[path.length - 1];
        const dot = name.lastIndexOf('.');
        return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
    }

    function getSupportedExtensions() {
        return Array.from(associations.keys());
    }

    return { register, unregister, getHandler, openFile, getExtension, getSupportedExtensions };
})();

export default FileAssociations;
