// Tells the service worker that the virtual filesystem changed.
//
// The worker answers app-code requests out of the tree snapshot it read from
// OPFS, and it keeps that snapshot for a short while so a burst of asset
// requests is coalesced. After a change that the shell makes itself - the
// OS core is materialized, an app is installed - the worker is told, so it
// never serves a stale tree.
export function notifyTreeChanged() {
    try {
        const controller = typeof navigator !== 'undefined'
            && navigator.serviceWorker
            && navigator.serviceWorker.controller;
        if (controller) controller.postMessage({ type: 'tree-changed' });
    } catch (e) { /* the worker notices on its own */ }
}

export default notifyTreeChanged;
