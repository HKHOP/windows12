// Windows 12 SDK — FileSystem.
//
// The full virtual filesystem with friendlier names. Paths are string
// arrays starting with '/' (e.g. ['/', 'users', 'default', 'notes.txt']).
// delete() recycles (restorable); destroy() deletes forever. Large media
// should use the blob methods so localStorage never sees the bulk bytes.
// App-scoped storage (the enforced convention) lives on createApp().files;
// this namespace is the raw, explicit-path power tool.
import InternalFS from '../modules/fileSystem.js';
import SavePrompt from '../modules/saveprompt.js';
import { ErrorCodes, SDKError, requireString, requireOptions } from './errors.js';

/**
 * @param {any} path
 * @param {string} name
 * @returns {string[]} validated path array
 * @throws {SDKError} INVALID_ARGS on malformed paths
 */
function needPath(path, name) {
    if (!Array.isArray(path) || path.length === 0 || typeof path[0] !== 'string') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `${name} must be a path array like ['/', 'users', 'default'].`);
    }
    return path;
}

/**
 * Read a text file.
 * @param {string[]} path
 * @returns {string|null} content, or null when missing/unreadable (blob files need readBlob)
 */
function readFile(path) {
    needPath(path, 'path');
    return InternalFS.readFile(path);
}

/**
 * Overwrite an existing text file.
 * @param {string[]} path
 * @param {string} content
 * @returns {boolean}
 */
function writeFile(path, content) {
    needPath(path, 'path');
    if (typeof content !== 'string') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'content must be a string.');
    }
    return InternalFS.writeFile(path, content);
}

/**
 * Create a new text file (fails when the name is taken).
 * @param {string[]} dir parent folder path
 * @param {string} name
 * @param {string} [content]
 * @param {string} [ext]
 * @returns {boolean}
 */
function createFile(dir, name, content, ext) {
    needPath(dir, 'dir');
    requireString(name, 'name');
    return InternalFS.createFile(dir, name, content === undefined ? '' : content, ext || '');
}

/**
 * Create a new folder (fails when the name is taken).
 * @param {string[]} dir parent folder path
 * @param {string} name
 * @returns {boolean}
 */
function createFolder(dir, name) {
    needPath(dir, 'dir');
    requireString(name, 'name');
    return InternalFS.createFolder(dir, name);
}

/**
 * Move to the Recycle Bin (restorable). Alias: remove().
 * @param {string[]} path
 * @returns {boolean}
 */
function deleteFile(path) {
    needPath(path, 'path');
    return InternalFS.deleteItem(path);
}

/**
 * Delete forever, skipping the Recycle Bin. Cannot be undone.
 * @param {string[]} path
 * @returns {boolean}
 */
function destroy(path) {
    needPath(path, 'path');
    return InternalFS.permanentDelete(path);
}

/**
 * Rename within the same folder.
 * @param {string[]} path
 * @param {string} newName
 * @returns {boolean}
 */
function rename(path, newName) {
    needPath(path, 'path');
    requireString(newName, 'newName');
    return InternalFS.renameItem(path, newName);
}

/**
 * Move a file or folder into another folder (keeps its name).
 * @param {string[]} srcPath
 * @param {string[]} destDir
 * @returns {boolean}
 */
function move(srcPath, destDir) {
    needPath(srcPath, 'srcPath');
    needPath(destDir, 'destDir');
    return InternalFS.moveItem(srcPath, destDir);
}

/**
 * @param {string[]} path
 * @returns {boolean}
 */
function exists(path) {
    needPath(path, 'path');
    return InternalFS.itemExists(path);
}

/**
 * @param {string[]} path
 * @returns {boolean}
 */
function isFolder(path) {
    needPath(path, 'path');
    return InternalFS.isFolder(path);
}

/**
 * List a folder's children.
 * @param {string[]} path
 * @returns {Array<{name,type,ext,modified,size,blob}>}
 */
function list(path) {
    needPath(path, 'path');
    return InternalFS.getChildren(path);
}

/**
 * @param {string[]} path
 * @returns {boolean} true when the file stores raw bytes (use readBlob)
 */
function isBlob(path) {
    needPath(path, 'path');
    return InternalFS.isBlobFile(path);
}

/**
 * Store raw bytes (audio/video/images) outside the localStorage budget.
 * @param {string[]} dir
 * @param {string} name
 * @param {Blob} blob
 * @param {string} [ext]
 * @returns {Promise<boolean>}
 */
function writeBlob(dir, name, blob, ext) {
    needPath(dir, 'dir');
    requireString(name, 'name');
    if (!(blob instanceof Blob)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'blob must be a Blob.');
    }
    return InternalFS.writeFileBlob(dir, name, blob, ext || '');
}

/**
 * Load raw bytes previously stored with writeBlob.
 * @param {string[]} path
 * @returns {Promise<Blob|null>}
 */
function readBlob(path) {
    needPath(path, 'path');
    return InternalFS.readFileBlob(path);
}

/**
 * Recycle Bin contents.
 * @returns {Array}
 */
function recycleBin() {
    return InternalFS.getRecycleBinContent();
}

/**
 * Restore one recycled item by its recycleKey.
 * @param {string} recycleKey
 * @returns {boolean}
 */
function restoreFromRecycleBin(recycleKey) {
    requireString(recycleKey, 'recycleKey');
    return InternalFS.restoreFromRecycleBin(recycleKey);
}

/**
 * Permanently delete everything in the Recycle Bin.
 * @returns {boolean}
 */
function emptyRecycleBin() {
    return InternalFS.emptyRecycleBin();
}

/**
 * Storage budget info { used, quota }.
 * @returns {object}
 */
function storageInfo() {
    return InternalFS.storageInfo();
}

/**
 * Native-style Save As dialog. Resolves null when cancelled.
 * @param {object} [options] { defaultName, defaultPath, extensions, parentApp }
 * @returns {Promise<{path,name,fullName,ext}|null>}
 */
function pickSave(options) {
    const opts = requireOptions(options, 'options');
    return SavePrompt.show(opts);
}

export const FileSystem = {
    readFile,
    read: readFile,
    writeFile,
    write: writeFile,
    createFile,
    createFolder,
    deleteFile,
    delete: deleteFile,
    remove: deleteFile,
    destroy,
    rename,
    move,
    exists,
    isFolder,
    list,
    getChildren: list,
    isBlob,
    writeBlob,
    readBlob,
    recycleBin,
    getRecycleBinContent: recycleBin,
    restoreFromRecycleBin,
    emptyRecycleBin,
    storageInfo,
    pickSave,
    saveDialog: pickSave
};

export default FileSystem;
