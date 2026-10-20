// Shortcut configuration shared by the shortcut layer, the package service and
// the installer UI. Pure data-only helpers: no DOM, no filesystem.
//
// A config is { startMenu, desktop, taskbar }, each destination:
//   { enabled, optional, default, name, icon, arguments, startIn, comment, run, hotkey }
// - enabled  : the destination is allowed at all (false = never create)
// - optional : the installer UI may let the user opt in/out
// - default  : initial checked state / install default
// Installed apps create a Start Menu shortcut by default; desktop and taskbar
// shortcuts are opt-in.

export const DESTINATIONS = ['startMenu', 'desktop', 'taskbar'];

export const DESTINATION_LABELS = {
    startMenu: 'Start Menu',
    desktop: 'Desktop',
    taskbar: 'Taskbar'
};

export const MANIFEST_DEFAULTS = {
    startMenu: { enabled: true, optional: false, default: true },
    desktop: { enabled: false, optional: true, default: false },
    taskbar: { enabled: false, optional: true, default: false }
};

const RUN_STATES = ['normal', 'minimized', 'maximized'];

function normalizeIcon(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.kind === 'app' && typeof raw.id === 'string' && raw.id.trim()) {
        return { kind: 'app', id: raw.id.trim() };
    }
    if (raw.kind === 'builtin' && typeof raw.name === 'string' && raw.name.trim()) {
        return { kind: 'builtin', name: raw.name.trim() };
    }
    if (raw.kind === 'target') return { kind: 'target' };
    return null;
}

function normalizeDestination(raw, base) {
    const out = base ? { ...base } : {};
    if (raw === undefined) return out;
    if (typeof raw === 'boolean') {
        out.enabled = raw;
        out.default = raw;
        out.optional = false;
        return out;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('A shortcut destination must be a boolean or an object.');
    }
    out.enabled = raw.enabled !== false && raw.create !== false;
    out.optional = raw.optional === true;
    out.default = raw.default !== undefined ? !!raw.default : out.enabled;
    if (raw.name !== undefined) out.name = String(raw.name || '').trim().slice(0, 120);
    if (raw.arguments !== undefined) out.arguments = String(raw.arguments || '');
    if (raw.startIn !== undefined) out.startIn = raw.startIn;
    if (raw.comment !== undefined) out.comment = String(raw.comment || '');
    if (raw.run !== undefined) out.run = RUN_STATES.includes(raw.run) ? raw.run : 'normal';
    if (raw.hotkey !== undefined) out.hotkey = typeof raw.hotkey === 'string' ? raw.hotkey.trim() : null;
    if (raw.icon !== undefined) {
        const icon = normalizeIcon(raw.icon);
        if (icon) out.icon = icon;
    }
    return out;
}

/**
 * Normalize a manifest/installer shortcut block. `fallback` supplies defaults
 * for destinations the block does not mention (pass null for installer-only
 * blocks so they stay sparse and can be merged over the manifest).
 */
export function normalizeConfig(raw, fallback = null) {
    const out = {};
    for (const dest of DESTINATIONS) {
        out[dest] = normalizeDestination(undefined, fallback ? fallback[dest] : undefined);
    }
    if (raw === undefined || raw === null) return out;
    if (typeof raw === 'boolean') {
        for (const dest of DESTINATIONS) {
            out[dest] = normalizeDestination(raw, fallback ? fallback[dest] : undefined);
        }
        return out;
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('The shortcuts field must be a boolean or an object.');
    }
    for (const dest of DESTINATIONS) {
        if (raw[dest] !== undefined) {
            out[dest] = normalizeDestination(raw[dest], fallback ? fallback[dest] : undefined);
        }
    }
    return out;
}

export function mergeConfig(...configs) {
    const out = {};
    for (const dest of DESTINATIONS) out[dest] = {};
    for (const cfg of configs) {
        if (!cfg || typeof cfg !== 'object') continue;
        for (const dest of DESTINATIONS) {
            if (cfg[dest] && typeof cfg[dest] === 'object') {
                out[dest] = { ...out[dest], ...cfg[dest] };
            }
        }
    }
    return out;
}

/**
 * Resolve whether each destination should be created. Explicit installer
 * choices win for optional destinations; non-optional destinations are fixed.
 */
export function resolveCreate(config, explicit = null) {
    const out = {};
    for (const dest of DESTINATIONS) {
        const c = (config && config[dest]) || {};
        let create = explicit && typeof explicit[dest] === 'boolean'
            ? explicit[dest]
            : c.default !== undefined ? !!c.default : false;
        if (c.enabled === false) create = false;
        if (c.optional === false && c.enabled !== false) create = c.default !== false;
        out[dest] = create;
    }
    return out;
}

export function manifestConfig(manifest) {
    return normalizeConfig(manifest && manifest.shortcuts, MANIFEST_DEFAULTS);
}

export function installerConfig(installer) {
    if (!installer || installer.shortcuts === undefined) return null;
    return normalizeConfig(installer.shortcuts, null);
}
