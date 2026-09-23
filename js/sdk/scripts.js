// Windows 12 SDK — Scripts.
//
// Run CMD batch (.bat/.cmd), VBScript (.vbs/.vbe) and PowerShell (.ps1/.psm1)
// from any app: automation, installers, user-authored script files, in-app
// consoles. Thin facades over the OS engines — behavior is identical to
// Terminal / PowerShell because it IS the same code, not a copy.
//
// Scripts run synchronously and return captured output. They execute with
// the calling app's filesystem access (FSGuard attribution still applies),
// the current user's $PROFILE / ExecutionPolicy apply to PowerShell, and
// interactive bits degrade honestly headless (Read-Host yields '', the
// batch `choice` command opens its usual dialog and suspends like Terminal).
import BatchEngine from '../modules/batchEngine.js';
import VBEngine from '../modules/vbsEngine.js';
import PowershellEngine from '../modules/powershellEngine.js';
import Users from '../modules/users.js';
import InternalFS from '../modules/fileSystem.js';
import InternalNotifications from '../modules/notifications.js';
import InternalPermissions from '../modules/permissions.js';
import { ErrorCodes, SDKError, assert, requireString, requireOptions, requireFunction } from './errors.js';

const PS_ERROR_PREFIX = 'PS-ERROR: ';

function needPath(path, name) {
    if (!Array.isArray(path) || path.length === 0 || typeof path[0] !== 'string') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `${name} must be a path array like ['/', 'users', 'default'].`);
    }
    return path;
}

function normalizeOptions(options, what) {
    const o = requireOptions(options, 'options');
    const cwd = o.cwd === undefined ? [...Users.home()] : [...needPath(o.cwd, 'options.cwd')];
    let args = [];
    if (o.args !== undefined) {
        assert(Array.isArray(o.args) && o.args.every(a => typeof a === 'string'),
            ErrorCodes.INVALID_ARGS, `${what}: options.args must be an array of strings.`);
        args = [...o.args];
    }
    let onOutput;
    if (o.onOutput !== undefined) {
        requireFunction(o.onOutput, 'options.onOutput');
        onOutput = o.onOutput;
    }
    return { cwd, args, onOutput, noProfile: o.noProfile === true, allowNetwork: o.allowNetwork === true };
}

function languageOf(leaf) {
    const m = String(leaf).toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!m) return null;
    if (m[1] === 'bat' || m[1] === 'cmd') return 'batch';
    if (m[1] === 'vbs' || m[1] === 'vbe') return 'vbscript';
    if (m[1] === 'ps1' || m[1] === 'psm1') return 'powershell';
    return null;
}

function collectEngine(kind, source, norm, extra, filePath) {
    const output = [];
    const errors = [];
    const emit = (line) => {
        const text = String(line ?? '');
        if (kind === 'powershell' && text.startsWith(PS_ERROR_PREFIX)) {
            const clean = text.slice(PS_ERROR_PREFIX.length);
            errors.push(clean);
            output.push(clean);
            if (norm.onOutput) { try { norm.onOutput(clean); } catch { /* listener must not break scripts */ } }
        } else {
            output.push(text);
            if (norm.onOutput) { try { norm.onOutput(text); } catch { /* listener must not break scripts */ } }
        }
    };
    let cwd = [...norm.cwd];
    const getCwd = () => [...cwd];
    const setCwd = (nc) => { cwd = [...nc]; };
    const ex = extra || {};
    let exitCode = 0;
    if (kind === 'batch') {
        const eng = BatchEngine.create(emit, getCwd, setCwd);
        const rc = eng.run(String(source), norm.args);
        exitCode = typeof rc === 'number' ? rc : 0;
    } else if (kind === 'vbscript') {
        const eng = VBEngine.create(emit, getCwd, setCwd);
        const rc = eng.run(String(source), norm.args);
        exitCode = typeof rc === 'number' ? rc : 0;
    } else {
        const eng = PowershellEngine.create(emit, getCwd, setCwd, {
            shell: 'powershell',
            allowNet: !!ex.allowNet,
            noProfile: norm.noProfile,
            onNotify: ex.onNotify
        });
        if (filePath) {
            try {
                // Nested execution suppresses printing, so the returned
                // values are formatted + emitted here (once, like a shell).
                const vals = eng.runScriptFile(filePath.join('/'), norm.args) || [];
                eng.formatValues(vals).forEach(emit);
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                if (/running scripts is disabled/i.test(msg)) {
                    throw new SDKError(ErrorCodes.PERMISSION_DENIED,
                        `PowerShell refused to run "${filePath[filePath.length - 1]}": ExecutionPolicy is Restricted. The user can allow local scripts with Set-ExecutionPolicy.`,
                        { policy: 'Restricted' });
                }
                throw new SDKError(ErrorCodes.NOT_FOUND, msg);
            }
        } else {
            eng.run(String(source));
        }
        exitCode = eng.lastExit || 0;
    }
    return { output, errors, exitCode, cwd };
}

/**
 * Run a CMD batch source string.
 * @param {string} source batch commands
 * @param {object} [options] { cwd?: string[], args?: string[], onOutput?: (line)=>void }
 * @returns {{output: string[], errors: string[], exitCode: number, cwd: string[]}}
 */
function runBatch(source, options) {
    requireString(source, 'source');
    return collectEngine('batch', source, normalizeOptions(options, 'runBatch'), {});
}

/**
 * Run a VBScript source string (WScript.Echo writes to output).
 * @param {string} source
 * @param {object} [options] { cwd?: string[], args?: string[] (WScript.Arguments), onOutput?: (line)=>void }
 * @returns {{output: string[], errors: string[], exitCode: number, cwd: string[]}}
 */
function runVBScript(source, options) {
    requireString(source, 'source');
    return collectEngine('vbscript', source, normalizeOptions(options, 'runVBScript'), {});
}

/**
 * Run a PowerShell source string (pipelines carry real objects; the final
 * stage is formatted to text lines like the PowerShell app does).
 * @param {string} source
 * @param {object} [options] { cwd?: string[], args?: string[], onOutput?: (line)=>void, noProfile?: boolean, allowNetwork?: boolean }
 * @returns {{output: string[], errors: string[], exitCode: number, cwd: string[]}}
 */
function runPowerShell(source, options) {
    requireString(source, 'source');
    const norm = normalizeOptions(options, 'runPowerShell');
    return collectEngine('powershell', source, norm, { allowNet: norm.allowNetwork });
}

/**
 * Detect the engine for a file name (`'setup.bat'` → `'batch'`).
 * @param {string} name file name or extension
 * @returns {'batch'|'vbscript'|'powershell'|null}
 */
function detectLanguage(name) {
    requireString(name, 'name');
    return languageOf(name.split(/[/\\]/).pop());
}

/** Script extensions the SDK can execute. */
function supportedExtensions() {
    return ['bat', 'cmd', 'vbs', 'vbe', 'ps1', 'psm1'];
}

/**
 * Read a script file and run it with the engine matching its extension
 * (.bat/.cmd → CMD, .vbs/.vbe → VBScript, .ps1/.psm1 → PowerShell with the
 * current user's ExecutionPolicy enforced). File-read permission rules are
 * unchanged: outside your sandbox you need the `filesystem` permission.
 * @param {string[]} path script path array
 * @param {object} [options] { cwd?: string[], args?: string[], onOutput?: (line)=>void, noProfile?: boolean, allowNetwork?: boolean }
 * @returns {{output: string[], errors: string[], exitCode: number, cwd: string[]}}
 * @throws {SDKError} INVALID_ARGS / NOT_FOUND / UNSUPPORTED / PERMISSION_DENIED
 */
function runFile(path, options) {
    needPath(path, 'path');
    const leaf = path[path.length - 1];
    if (typeof leaf !== 'string' || !leaf) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'path must end with a script file name.');
    }
    const lang = languageOf(leaf);
    if (!lang) {
        throw new SDKError(ErrorCodes.UNSUPPORTED,
            `No script engine for "${leaf}" (supported: ${supportedExtensions().map(e => '.' + e).join(' ')}).`);
    }
    const norm = normalizeOptions(options, 'runFile');
    if (lang === 'powershell') {
        return collectEngine('powershell', '', norm, { allowNet: norm.allowNetwork }, path);
    }
    const content = InternalFS.readFile(path);
    if (content === null || content === undefined) {
        throw new SDKError(ErrorCodes.NOT_FOUND, `Script file not found: /${path.slice(1).join('/')}.`);
    }
    return collectEngine(lang, content, norm, {});
}

/**
 * Bound per-app Scripts (used by createApp): identical API, plus PowerShell
 * job-completion toasts are tagged to your app and network access follows
 * your manifest (`network` permission) unless options.allowNetwork says so.
 */
function bindScripts(appId) {
    const notify = (title, message) => {
        try { InternalNotifications.info(title, message, { appId }); } catch { /* toasts unavailable */ }
    };
    const netAllowed = (options) => {
        if (options && options.allowNetwork === true) return true;
        try { return InternalPermissions.isGranted(appId, 'network'); } catch { return false; }
    };
    return {
        runBatch: (source, options) => runBatch(source, options),
        runVBScript: (source, options) => runVBScript(source, options),
        runPowerShell(source, options) {
            requireString(source, 'source');
            const norm = normalizeOptions(options, 'runPowerShell');
            return collectEngine('powershell', source, norm, { allowNet: netAllowed(options), onNotify: notify });
        },
        runFile(path, options) {
            needPath(path, 'path');
            const leaf = path[path.length - 1];
            const lang = typeof leaf === 'string' ? languageOf(leaf) : null;
            if (lang === 'powershell') {
                const norm = normalizeOptions(options, 'runFile');
                return collectEngine('powershell', '', norm, { allowNet: netAllowed(options), onNotify: notify }, path);
            }
            return runFile(path, options);
        },
        detectLanguage,
        supportedExtensions
    };
}

export const Scripts = {
    runBatch,
    runVBScript,
    runPowerShell,
    runFile,
    detectLanguage,
    supportedExtensions
};

export { bindScripts };
export default Scripts;
