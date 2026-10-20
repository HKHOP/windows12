// Registry Editor - the Windows registry, Windows style.
//
// The left pane is the hive tree (HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER,
// …), the right pane lists the selected key's values (Name, Type, Data), and
// the status bar shows the path of the selected key - exactly like regedit.
//
// Everything the editor changes goes through js/modules/registry.js, so the
// permission rules apply: this app declares the 'registry' permission and
// may therefore edit the whole tree.
import WindowManager from '../../modules/windowManager.js';
import Registry from '../../modules/registry.js';
import AppIcons from '../../modules/appIcons.js';
import ContextMenu from '../../modules/contextMenu.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';

const APP_ID = 'regedit';

const state = {
    // The registry is case insensitive, so the open keys are tracked that way
    // too.
    expanded: new Set(),
    selected: 'HKEY_LOCAL_MACHINE',
    el: null
};

function isOpen(path) {
    return state.expanded.has(String(path || '').toLowerCase());
}

function setOpen(path, open) {
    const key = String(path || '').toLowerCase();
    if (open) state.expanded.add(key);
    else state.expanded.delete(key);
}

const STYLE = `
<style>
.rg-root { display:flex; flex-direction:column; height:100%; font-family:'Segoe UI',Tahoma,sans-serif; font-size:12px; color:var(--text-primary); }
.rg-menubar { display:flex; gap:2px; padding:2px 4px; background:rgba(255,255,255,0.04); border-bottom:1px solid var(--window-border); flex:0 0 auto; }
.rg-menu { padding:4px 10px; border-radius:4px; cursor:default; color:var(--text-primary); }
.rg-menu:hover { background:rgba(255,255,255,0.10); }
.rg-main { flex:1; display:flex; min-height:0; }
.rg-tree { width:340px; min-width:150px; overflow:auto; border-right:1px solid var(--window-border); padding:6px 4px; }
.rg-values { flex:1; overflow:auto; min-width:0; }
.rg-row { display:flex; align-items:center; gap:4px; padding:1px 4px; cursor:default; white-space:nowrap; border-radius:3px; }
.rg-row:hover { background:rgba(255,255,255,0.06); }
.rg-row.sel { background:var(--accent-color); color:#fff; }
.rg-row.sel .rg-icon { filter:brightness(1.6); }
.rg-box { width:13px; height:13px; line-height:12px; text-align:center; font-size:11px; color:var(--text-secondary); flex:0 0 auto; border:1px solid transparent; border-radius:2px; }
.rg-box.has { border-color:var(--text-secondary); }
.rg-box:hover { background:rgba(255,255,255,0.14); }
.rg-icon { flex:0 0 auto; display:inline-flex; width:15px; height:15px; }
.rg-name { overflow:hidden; text-overflow:ellipsis; }
.rg-head { display:flex; position:sticky; top:0; background:var(--window-bg); border-bottom:1px solid var(--window-border); font-weight:600; }
.rg-head > div, .rg-cell { padding:4px 8px; }
.rg-cell.row > div { padding:4px 8px; }
.rg-head > div:first-child, .rg-cell.name { width:34%; }
.rg-head > div:nth-child(2), .rg-cell.type { width:26%; }
.rg-cell { border-bottom:1px solid rgba(255,255,255,0.05); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rg-cell.row { display:flex; }
.rg-cell.row:hover { background:rgba(255,255,255,0.07); }
.rg-cell.row.sel { background:var(--accent-color); color:#fff; }
.rg-status { flex:0 0 auto; padding:4px 10px; font-size:11px; color:var(--text-secondary); border-top:1px solid var(--window-border); background:rgba(255,255,255,0.03); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rg-empty { padding:16px; color:var(--text-secondary); }
</style>`;

function getContent() {
    return `${STYLE}
<div class="rg-root">
    <div class="rg-menubar">
        <div class="rg-menu" data-menu="file">File</div>
        <div class="rg-menu" data-menu="edit">Edit</div>
        <div class="rg-menu" data-menu="view">View</div>
        <div class="rg-menu" data-menu="help">Help</div>
    </div>
    <div class="rg-main">
        <div class="rg-tree"></div>
        <div class="rg-values"></div>
    </div>
    <div class="rg-status">Computer\\HKEY_LOCAL_MACHINE</div>
</div>`;
}

function esc(text) {
    return String(text === undefined || text === null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The folder icon and the key icon, in the OS's own style.
const KEY_ICON = '<svg viewBox="0 0 16 16" fill="none" width="15" height="15"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="#3b82f6"/><path d="M4.5 6.5h7M4.5 9.5h4" stroke="#dbeafe" stroke-width="1.2" stroke-linecap="round"/></svg>';
const HIVE_ICON = '<svg viewBox="0 0 16 16" fill="none" width="15" height="15"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#8b5cf6"/><path d="M4 6h8M4 9.5h5" stroke="#ede9fe" stroke-width="1.2" stroke-linecap="round"/></svg>';

// ---------------------------------------------------------------- rendering

function renderTree() {
    const tree = state.el.querySelector('.rg-tree');
    tree.innerHTML = '';
    for (const hive of Registry.hives()) {
        tree.appendChild(treeRow(hive.name, hive.name, 0, true));
    }
}

function treeRow(path, label, depth, isHive) {
    // The row and its children are siblings: a row is a flex line, so a
    // nested row would be laid out next to it instead of under it.
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'rg-row' + (state.selected === path ? ' sel' : '');
    row.style.paddingLeft = (depth * 13 + 4) + 'px';

    const subkeys = Registry.keys(path);
    const open = isOpen(path);
    const box = document.createElement('span');
    box.className = 'rg-box' + (subkeys.length ? ' has' : '');
    box.textContent = subkeys.length ? (open ? '−' : '+') : '';
    if (subkeys.length) {
        box.addEventListener('click', (e) => {
            e.stopPropagation();
            setOpen(path, !isOpen(path));
            renderTree();
        });
    }

    const icon = document.createElement('span');
    icon.className = 'rg-icon';
    icon.innerHTML = isHive ? HIVE_ICON : KEY_ICON;

    const name = document.createElement('span');
    name.className = 'rg-name';
    name.textContent = label;

    row.appendChild(box);
    row.appendChild(icon);
    row.appendChild(name);
    row.addEventListener('click', () => select(path));
    row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        select(path);
        ContextMenu.show(e.clientX, e.clientY, keyMenuItems(path));
    });
    wrap.appendChild(row);

    if (open) {
        for (const sub of subkeys) {
            wrap.appendChild(treeRow(path + '\\' + sub, sub, depth + 1, false));
        }
    }
    return wrap;
}

function select(path) {
    state.selected = path;
    renderTree();
    renderValues();
    const status = state.el.querySelector('.rg-status');
    if (status) status.textContent = 'Computer\\' + path;
}

function renderValues() {
    const box = state.el.querySelector('.rg-values');
    const info = Registry.keyInfo(state.selected);
    if (!info) {
        box.innerHTML = '<div class="rg-empty">This key does not exist.</div>';
        return;
    }
    if (!info.values.length) {
        box.innerHTML = `<div class="rg-empty">${esc(info.displayPath)}<br><br>This key has no values.</div>`;
        return;
    }
    const rows = info.values.map((value, index) => `
        <div class="rg-cell row ${index === 0 ? 'sel' : ''}" data-name="${esc(value.name)}" data-kind="${esc(value.kind)}">
            <div class="name">${esc(value.name)}</div>
            <div class="type">${esc(Registry.kinds()[value.kind] || value.kind)}</div>
            <div class="data">${esc(formatData(value))}</div>
        </div>`).join('');
    box.innerHTML = `
        <div class="rg-head">
            <div>Name</div><div>Type</div><div>Data</div>
        </div>${rows}`;
    box.querySelectorAll('.rg-cell.row').forEach(row => {
        row.addEventListener('click', () => {
            box.querySelectorAll('.rg-cell.row').forEach(r => r.classList.remove('sel'));
            row.classList.add('sel');
        });
        row.addEventListener('dblclick', () => editValue(row.dataset.name));
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            box.querySelectorAll('.rg-cell.row').forEach(r => r.classList.remove('sel'));
            row.classList.add('sel');
            ContextMenu.show(e.clientX, e.clientY, valueMenuItems(row.dataset.name));
        });
    });
}

function formatData(value) {
    if (value.kind === 'REG_MULTI_SZ' && Array.isArray(value.data)) return value.data.join(', ');
    return String(value.data);
}

// ------------------------------------------------------------------ menus

function keyMenuItems(path) {
    return [
        { label: 'New key…', icon: KEY_ICON, action: () => newKey(path) },
        { label: 'New String value', icon: KEY_ICON, action: () => newValue(path, 'REG_SZ') },
        { label: 'New DWORD value', icon: KEY_ICON, action: () => newValue(path, 'REG_DWORD') },
        { label: 'New Binary value', icon: KEY_ICON, action: () => newValue(path, 'REG_BINARY') },
        { label: 'New Multi-string value', icon: KEY_ICON, action: () => newValue(path, 'REG_MULTI_SZ') },
        'separator',
        { label: 'Export…', action: () => exportKey(path) },
        { label: 'Copy key name', action: () => copyKeyName(path) },
        'separator',
        { label: 'Rename…', action: () => renameKey(path) },
        { label: 'Delete', action: () => deleteKey(path) }
    ];
}

function valueMenuItems(name) {
    return [
        { label: 'Modify…', action: () => editValue(name) },
        { label: 'Rename…', action: () => renameValue(name) },
        { label: 'Delete', action: () => deleteValue(name) },
        'separator',
        { label: 'Copy value name', action: () => copyText(name) }
    ];
}

function menuBarItems(which) {
    if (which === 'file') {
        return [
            { label: 'Import…', action: () => importReg() },
            { label: 'Export…', action: () => exportKey(state.selected) },
            'separator',
            { label: 'Refresh', shortcut: 'F5', action: () => refresh() }
        ];
    }
    if (which === 'edit') {
        return [
            { label: 'New key…', action: () => newKey(state.selected) },
            { label: 'New String value', action: () => newValue(state.selected, 'REG_SZ') },
            { label: 'New DWORD value', action: () => newValue(state.selected, 'REG_DWORD') },
            { label: 'New Binary value', action: () => newValue(state.selected, 'REG_BINARY') },
            { label: 'New Multi-string value', action: () => newValue(state.selected, 'REG_MULTI_SZ') },
            'separator',
            { label: 'Copy key name', action: () => copyKeyName(state.selected) },
            { label: 'Find…', shortcut: 'Ctrl+F', action: () => find() }
        ];
    }
    if (which === 'view') {
        return [
            { label: 'Refresh', shortcut: 'F5', action: () => refresh() },
            { label: 'Expand all', action: () => expandAll() },
            { label: 'Collapse all', action: () => { state.expanded.clear(); renderTree(); } }
        ];
    }
    return [
        { label: 'About the Registry Editor', action: () => about() }
    ];
}

// --------------------------------------------------------------- commands

function refresh() {
    Registry.refresh();
    renderTree();
    renderValues();
}

function expandAll() {
    const walk = (path) => {
        setOpen(path, true);
        for (const sub of Registry.keys(path)) walk(path + '\\' + sub);
    };
    for (const hive of Registry.hives()) walk(hive.name);
    renderTree();
}

async function newKey(parent) {
    const name = await Popup.textbox('New key', 'Enter the name of the new key.', { value: '' });
    if (!name || !name.trim()) return;
    const path = parent + '\\' + name.trim();
    if (Registry.createKey(path)) {
        setOpen(parent, true);
        select(path);
    } else {
        Popup.error('Registry Editor', 'The key could not be created.');
    }
}

async function newValue(path, kind) {
    const fields = [
        { key: 'name', label: 'Value name', type: 'text', value: '' },
        { key: 'data', label: 'Value data', type: 'text', value: '' }
    ];
    const form = await Popup.forum('New ' + (Registry.kinds()[kind] || kind), fields);
    if (!form) return;
    const name = (form.name || '').trim() || Registry.DEFAULT_VALUE;
    if (Registry.set(path, name, kind, form.data)) {
        renderValues();
    } else {
        Popup.error('Registry Editor', 'The value could not be written.');
    }
}

async function editValue(name) {
    const value = Registry.get(state.selected, name);
    if (!value) return;
    const kinds = Registry.kinds();
    const form = await Popup.forum('Edit Value', [
        { key: 'name', label: 'Value name', type: 'text', value: value.name },
        { key: 'kind', label: 'Type', type: 'select', value: value.kind, options: Object.keys(kinds).map(k => ({ value: k, label: k + ' (' + kinds[k] + ')' })) },
        { key: 'data', label: 'Value data', type: 'text', value: formatData(value) }
    ]);
    if (!form) return;
    const newName = (form.name || '').trim() || Registry.DEFAULT_VALUE;
    if (newName !== value.name) Registry.renameValue(state.selected, value.name, newName);
    if (Registry.set(state.selected, newName, form.kind, form.data)) {
        renderValues();
    } else {
        Popup.error('Registry Editor', 'The value could not be written.');
    }
}

async function renameValue(name) {
    const next = await Popup.textbox('Rename Value', 'Enter the new value name.', { value: name });
    if (!next || !next.trim() || next === name) return;
    if (Registry.renameValue(state.selected, name, next.trim())) renderValues();
}

async function deleteValue(name) {
    const ok = await Popup.confirm('Confirm Value Delete', `Are you sure you want to delete the value "${name}"?`);
    if (!ok) return;
    if (Registry.deleteValue(state.selected, name)) renderValues();
}

async function renameKey(path) {
    const old = path.split('\\').pop();
    const next = await Popup.textbox('Rename Key', 'Enter the new name for this key.', { value: old });
    if (!next || !next.trim() || next === old) return;
    const parent = path.slice(0, path.length - old.length - 1);
    if (Registry.renameKey(path, next.trim())) {
        select(parent + '\\' + next.trim());
    }
}

async function deleteKey(path) {
    const ok = await Popup.confirm('Confirm Key Delete', `Are you sure you want to delete the key "${path}"?`);
    if (!ok) return;
    const parent = path.slice(0, path.lastIndexOf('\\'));
    if (Registry.deleteKey(path)) {
        select(parent || 'HKEY_LOCAL_MACHINE');
        renderTree();
    }
}

async function exportKey(path) {
    const text = Registry.exportKey(path);
    if (!text) {
        Popup.error('Registry Editor', 'This key cannot be exported.');
        return;
    }
    const name = await Popup.textbox('Export Registry Key', 'Enter a file name for the export.', { value: path.split('\\').pop() + '.reg' });
    if (!name || !name.trim()) return;
    const target = ['/', 'users', 'default', 'Documents', name.trim()];
    try {
        const dir = target.slice(0, -1);
        if (!FileSystem.itemExists(dir)) FileSystem.createFolder(['/', 'users', 'default'], 'Documents');
        if (FileSystem.itemExists(target)) FileSystem.writeFile(target, text);
        else FileSystem.createFile(dir, target[target.length - 1], text, 'reg');
        Popup.info('Registry Editor', `The key was exported to Documents\\${name.trim()}.`);
    } catch (e) {
        Popup.error('Registry Editor', 'The export could not be written.');
    }
}

async function importReg() {
    const path = await Popup.textbox('Import Registry File', 'Enter the path of a .reg file to import.', { value: '\\users\\default\\Documents\\' });
    if (!path || !path.trim()) return;
    const parts = path.trim().split('\\').filter(Boolean);
    let text = null;
    try {
        text = FileSystem.readFile(['/', ...parts]);
    } catch (e) { text = null; }
    if (typeof text !== 'string' || !text) {
        Popup.error('Registry Editor', 'That file could not be read.');
        return;
    }
    if (Registry.importReg(text)) {
        refresh();
        Popup.info('Registry Editor', 'The registry file was imported.');
    } else {
        Popup.error('Registry Editor', 'Nothing could be imported.');
    }
}

async function find() {
    const term = await Popup.textbox('Find', 'Enter the text to search for.', { value: '' });
    if (!term || !term.trim()) return;
    const hits = Registry.search(term.trim());
    if (!hits.length) {
        Popup.info('Registry Editor', `No matches for "${term.trim()}".`);
        return;
    }
    const body = hits.slice(0, 60).map(hit => `
        <div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
            <div style="flex:1;word-break:break-all;">${esc(hit.path)}${hit.name ? '\\' + esc(hit.name) : ''}</div>
            <div style="color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(hit.kind === 'key' ? '(key)' : hit.kind)}</div>
        </div>`).join('');
    await Popup.custom('Registry Editor', `<div style="max-height:320px;overflow:auto;">${body}</div>`, [{ label: 'OK', value: true, primary: true }], { width: 620, height: 400 });
    if (hits.length) {
        const first = hits[0].path;
        select(first);
    }
}

function copyKeyName(path) {
    copyText(path);
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        try {
            const mod = await import('../../modules/clipboardManager.js');
            mod.default.write(text);
        } catch (e2) { /* no clipboard */ }
    }
}

function about() {
    Popup.info('About the Registry Editor',
        'Windows 12 Registry Editor\n\n' +
        'The registry holds the machine\'s settings: the hives, the keys and the values.\n' +
        'Every app installed on this device is registered here, which is how the ' +
        'system finds an app no matter which folder it lives in.');
}

// ------------------------------------------------------------------- boot

function launch() {
    const icon = AppIcons.get(APP_ID);
    const win = WindowManager.createWindow(APP_ID, 'Registry Editor', icon, getContent(), {
        width: 920, height: 580, minWidth: 620, minHeight: 380
    });
    state.el = win.element;

    // The machine hive is open by default, like regedit.
    setOpen('HKEY_LOCAL_MACHINE', true);
    setOpen('HKEY_LOCAL_MACHINE\\Software', true);
    setOpen('HKEY_LOCAL_MACHINE\\Software\\Windows 12', true);
    select('HKEY_LOCAL_MACHINE');

    win.element.querySelectorAll('.rg-menu').forEach(item => {
        item.addEventListener('click', (e) => {
            const rect = item.getBoundingClientRect();
            ContextMenu.show(rect.left, rect.bottom + 2, menuBarItems(item.dataset.menu));
        });
    });

    win.element.addEventListener('keydown', (e) => {
        if (e.key === 'F5') { e.preventDefault(); refresh(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); find(); }
    });
}

// Opening a .reg file imports it.
async function open(path) {
    let text = '';
    try {
        text = FileSystem.readFile(path) || '';
    } catch (e) {
        text = '';
    }
    if (text && Registry.importReg(text)) {
        refresh();
        Popup.info('Registry Editor', 'The registry file was imported.');
    }
    launch();
}

export default { launch, open, icon: AppIcons.get(APP_ID) };
