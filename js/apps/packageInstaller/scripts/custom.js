// Package Installer — custom UI loader.
//
// An installer can ship "ui": "installer/ui.js" in installer.json. The module
// is imported from a blob URL and must export mount(root, ctx). It runs with
// full page privileges (a package installer is trusted code, exactly like an
// installed app), so it gets the SDK and the install bridge instead of a
// half-sandbox that would only fight the window chrome.
/**
 * @param {HTMLElement} host
 * @param {object} session installer session (main.js)
 * @param {object} sdk the Windows 12 SDK namespace
 */
export async function mountCustom(host, session, sdk) {
    const inspection = session.inspection;
    const conf = inspection.installer;
    if (!conf || !conf.ui) throw new Error('This installer has no custom UI module.');

    const moduleUrl = await session.moduleUrl(conf.ui);
    if (!moduleUrl) throw new Error(`The custom installer UI "${conf.ui}" is missing from the package.`);
    const module = await import(moduleUrl);
    const mount = module.mount || module.default;
    if (typeof mount !== 'function') {
        throw new Error('The custom installer UI must export mount(root, ctx).');
    }

    const root = document.createElement('div');
    root.className = 'pi-custom';
    host.replaceChildren(root);

    const defaults = session.defaultOptions;
    const ctx = {
        sdk,
        app: session.app,
        manifest: inspection.manifest,
        installer: conf,
        inspection,
        existing: session.existing,
        sourceName: session.sourceName,
        userId: session.userId,
        paths: session.paths,
        permissions: inspection.manifest.permissions || [],
        /** Default selection an author's headless flow would use. */
        defaults: {
            scope: defaults.scope,
            features: [...defaults.features],
            fields: { ...defaults.fields },
            shortcuts: { ...defaults.shortcuts }
        },
        /** Resolve a package asset to a blob URL (images, CSS, JSON...). */
        asset: (path) => session.assetUrl(path),
        /** Read a package file as text. */
        text: (path) => session.assetText(path),
        /** Read a package file as bytes. */
        bytes: (path) => session.assetBytes(path),
        /** Import another JS module from the package as a blob module. */
        importModule: (path) => session.importModule(path),
        /** Run the install. Missing options fall back to ctx.defaults. */
        install: (options = {}) => {
            const merged = {
                scope: options.scope || defaults.scope,
                features: Array.isArray(options.features) ? options.features : [...defaults.features],
                fields: { ...defaults.fields, ...(options.fields || {}) },
                shortcuts: { ...defaults.shortcuts, ...(options.shortcuts || {}) },
                allowReplace: !!options.allowReplace,
                onProgress: options.onProgress
            };
            return session.install(merged);
        },
        /** Request cancellation of the running install (staging is discarded). */
        cancelInstall: () => session.cancel(),
        isCancelled: () => session.isCancelled(),
        /** Close the installer window. */
        close: () => session.close(),
        /** Update the window title (e.g. a custom product name). */
        setTitle: (title) => session.setTitle(title),
        /** Register a cleanup function for window close. */
        onClose: (fn) => session.addCleanup(fn)
    };

    const cleanup = await mount(root, ctx);
    if (typeof cleanup === 'function') session.addCleanup(cleanup);
}
