// Wikipedia — native search + article reader (replaces the iframe wrapper).
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const Wikipedia = (() => {
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    async function search(q) {
        const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=10&namespace=0&format=json&origin=*`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        // [query, titles[], descriptions[], urls[]]
        const titles = data[1] || [];
        const descs = data[2] || [];
        const urls = data[3] || [];
        return titles.map((t, i) => ({ title: t, desc: descs[i] || '', url: urls[i] || '' }));
    }

    async function loadArticle(title) {
        const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=320&titles=${encodeURIComponent(title)}&format=json&origin=*`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const pages = (d.query && d.query.pages) ? Object.values(d.query.pages) : [];
        const p = pages[0] || {};
        return {
            title: p.title || title,
            extract: p.extract || 'No summary available.',
            thumb: (p.thumbnail && p.thumbnail.source) ? p.thumbnail.source : null,
            pageid: p.pageid
        };
    }

    function launch() {
        const app = createApp({ id: 'wikipedia', name: 'Wikipedia' });
        const win = app.window.create({
            title: 'Wikipedia', icon: app.icon(),
            content: `
                <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;">
                    <div style="padding:10px 12px;border-bottom:1px solid var(--window-border);display:flex;gap:8px;">
                        <input class="w-q" placeholder="Search Wikipedia…" style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                        <button class="w-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Search</button>
                    </div>
                    <div class="w-status" style="padding:6px 12px;font-size:12px;color:var(--text-secondary);"></div>
                    <div class="w-results" style="flex:1;overflow:auto;padding:8px 12px;display:flex;flex-direction:column;gap:6px;"></div>
                </div>`,
            width: 420, height: 620
        });
        const el = win.element;
        const q = el.querySelector('.w-q');
        const results = el.querySelector('.w-results');
        const status = el.querySelector('.w-status');

        async function doSearch() {
            const term = q.value.trim();
            if (!term) return;
            if (!NetworkStatus.isOnline()) { NetworkStatus.showError('Wikipedia'); return; }
            status.textContent = 'Searching…';
            results.innerHTML = '';
            try {
                const items = await search(term);
                status.textContent = items.length ? `${items.length} results` : 'No results';
                for (const it of items) {
                    const card = document.createElement('div');
                    card.style.cssText = 'padding:10px;border:1px solid var(--window-border);border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:4px;';
                    card.innerHTML = `<div style="font-weight:600;font-size:14px;">${escapeHtml(it.title)}</div><div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(it.desc)}</div>`;
                    card.addEventListener('click', () => showArticle(it.title));
                    card.addEventListener('mouseenter', () => { card.style.background = 'rgba(128,128,128,0.08)'; });
                    card.addEventListener('mouseleave', () => { card.style.background = ''; });
                    results.appendChild(card);
                }
            } catch (e) {
                status.textContent = 'Search failed: ' + (e && e.message ? e.message : e);
            }
        }

        async function showArticle(title) {
            if (!NetworkStatus.isOnline()) { NetworkStatus.showError('Wikipedia'); return; }
            status.textContent = 'Loading article…';
            results.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px;">Loading…</div>';
            try {
                const a = await loadArticle(title);
                status.textContent = a.title;
                results.innerHTML = `
                    <div style="padding:8px 0;">
                        ${a.thumb ? `<img src="${escapeHtml(a.thumb)}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:10px;">` : ''}
                        <h2 style="margin:0 0 8px 0;font-size:18px;">${escapeHtml(a.title)}</h2>
                        <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(a.extract)}</p>
                        <div style="margin-top:12px;">
                            <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g,'_'))}" target="_blank" rel="noopener" style="color:var(--accent-color);font-size:13px;">Open full article in browser ↗</a>
                        </div>
                        <button class="w-back" style="margin-top:10px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;">← Back to results</button>
                    </div>`;
                const back = results.querySelector('.w-back');
                back.addEventListener('click', () => { q.value = title; doSearch(); });
            } catch (e) {
                status.textContent = 'Load failed: ' + (e && e.message ? e.message : e);
                results.innerHTML = '';
            }
        }

        el.querySelector('.w-go').addEventListener('click', doSearch);
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
        q.focus();
    }

    return { launch };
})();

export default Wikipedia;
