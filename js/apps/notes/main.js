// Notes — notebooks, sections and pages with a markdown-lite preview.
//
// Everything is written to this app's own sandbox (per profile), so notes
// survive restarts and need no filesystem permission. Autosave runs as you
// type; Export writes a .md copy wherever you choose.
import { createApp, FileSystem } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';

const STYLE_ID = 'notes-style';
const SAVE_DELAY = 400;

let uidCounter = 0;
function uid() {
    uidCounter++;
    return `${Date.now().toString(36)}${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return out;
}

/**
 * Render the markdown subset Notes supports: headings, lists, quotes,
 * fenced code, rules, bold/italic/strike/code and http(s) links.
 * @param {string} src
 * @returns {string} HTML
 */
export function renderMarkdown(src) {
    const lines = String(src || '').split(/\r?\n/);
    const out = [];
    let list = null;
    let inCode = false;
    let codeLines = [];
    let para = [];

    const flushPara = () => {
        if (para.length) {
            out.push(`<p>${para.map(inline).join(' ')}</p>`);
            para = [];
        }
    };
    const closeList = () => {
        if (list) {
            out.push(`</${list}>`);
            list = null;
        }
    };
    const openList = (kind) => {
        if (list !== kind) {
            closeList();
            out.push(`<${kind}>`);
            list = kind;
        }
    };

    for (const raw of lines) {
        if (/^```/.test(raw)) {
            flushPara();
            closeList();
            if (inCode) {
                out.push(`<pre><code>${codeLines.map(escapeHtml).join('\n')}</code></pre>`);
                codeLines = [];
                inCode = false;
            } else {
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            codeLines.push(raw);
            continue;
        }
        if (!raw.trim()) {
            flushPara();
            closeList();
            continue;
        }
        const heading = raw.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            flushPara();
            closeList();
            const level = heading[1].length;
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }
        if (/^(-{3,}|\*{3,})$/.test(raw.trim())) {
            flushPara();
            closeList();
            out.push('<hr>');
            continue;
        }
        if (/^>\s?/.test(raw)) {
            flushPara();
            closeList();
            out.push(`<blockquote>${inline(raw.replace(/^>\s?/, ''))}</blockquote>`);
            continue;
        }
        const bullet = raw.match(/^[-*]\s+(.*)$/);
        if (bullet) {
            flushPara();
            openList('ul');
            let item = bullet[1];
            const box = item.match(/^\[( |x|X)\]\s+(.*)$/);
            if (box) item = `${box[1].toLowerCase() === 'x' ? '☑' : '☐'} ${box[2]}`;
            out.push(`<li>${inline(item)}</li>`);
            continue;
        }
        const numbered = raw.match(/^\d+\.\s+(.*)$/);
        if (numbered) {
            flushPara();
            openList('ol');
            out.push(`<li>${inline(numbered[1])}</li>`);
            continue;
        }
        closeList();
        para.push(raw);
    }
    if (inCode && codeLines.length) {
        out.push(`<pre><code>${codeLines.map(escapeHtml).join('\n')}</code></pre>`);
    }
    flushPara();
    closeList();
    return out.join('');
}

function sampleBody() {
    return [
        '# Welcome to Notes',
        '',
        'Type on the left of this page; **autosave** keeps every keystroke in this profile.',
        '',
        '## Getting around',
        '',
        '- Pick a notebook on the left, then a section and a page',
        '- **+ Page** adds a page to the current section',
        '- Double-click a notebook or section name to rename it',
        '- Press **Preview** to see the formatted page',
        '',
        '## Markdown',
        '',
        '- `# Heading`, `**bold**`, `*italic*`, `` `code` ``',
        '- `- lists`, `1. numbered lists`, `> quotes`',
        '- `[links](https://example.com)` and fenced code blocks',
        '',
        '> Notes live in this app’s own storage — nothing leaves the device.'
    ].join('\n');
}

function freshData() {
    const now = Date.now();
    const page = { id: uid(), title: 'Welcome to Notes', body: sampleBody(), updated: now };
    const section = { id: uid(), name: 'Notes', pages: [page] };
    const notebook = { id: uid(), name: 'Personal', sections: [section] };
    return {
        version: 1,
        notebooks: [notebook],
        last: { notebook: notebook.id, section: section.id, page: page.id }
    };
}

function normalize(raw) {
    if (!raw || !Array.isArray(raw.notebooks) || !raw.notebooks.length) return null;
    const notebooks = [];
    for (const nb of raw.notebooks) {
        if (!nb || typeof nb !== 'object') continue;
        const sections = [];
        for (const sec of Array.isArray(nb.sections) ? nb.sections : []) {
            if (!sec || typeof sec !== 'object') continue;
            const pages = [];
            for (const page of Array.isArray(sec.pages) ? sec.pages : []) {
                if (!page || typeof page !== 'object') continue;
                pages.push({
                    id: String(page.id || uid()),
                    title: String(page.title || 'Untitled page'),
                    body: String(page.body || ''),
                    updated: Number(page.updated) || Date.now()
                });
            }
            sections.push({ id: String(sec.id || uid()), name: String(sec.name || 'Section'), pages });
        }
        if (!sections.length) sections.push({ id: uid(), name: 'Notes', pages: [] });
        notebooks.push({ id: String(nb.id || uid()), name: String(nb.name || 'Notebook'), sections });
    }
    if (!notebooks.length) return null;
    return { version: 1, notebooks, last: raw.last && typeof raw.last === 'object' ? raw.last : {} };
}

function when(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return sameDay ? time : `${d.getDate()}/${d.getMonth() + 1}`;
}

function getContent() {
    return `
        <style id="${STYLE_ID}">
            .nt-root { display:flex; height:100%; font-family:'Segoe UI',sans-serif; color:#e6e6ea; background:#141418; }
            .nt-nav { width:196px; flex:none; display:flex; flex-direction:column; background:#1a1a20; border-right:1px solid #2a2a32; min-height:0; }
            .nt-search-wrap { padding:8px; border-bottom:1px solid #2a2a32; }
            .nt-search { width:100%; box-sizing:border-box; background:#121216; border:1px solid #33333d; border-radius:5px;
                color:#e6e6ea; padding:6px 8px; font-size:12px; font-family:inherit; }
            .nt-search:focus { outline:none; border-color:var(--accent-color); }
            .nt-nav-head { display:flex; align-items:center; justify-content:space-between; padding:8px 10px 4px;
                font-size:10px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#82828f; }
            .nt-nbs { flex:1; overflow-y:auto; padding:2px 6px 10px; min-height:0; }
            .nt-nb { display:flex; align-items:center; gap:6px; padding:7px 8px; border-radius:6px; cursor:pointer; font-size:12.5px; }
            .nt-nb:hover { background:rgba(255,255,255,0.06); }
            .nt-nb.active { background:rgba(56,189,248,0.18); color:#fff; }
            .nt-nb-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .nt-nb-del, .nt-sec-del, .nt-page-del { background:none; border:none; color:#6f6f7c; cursor:pointer;
                font-size:14px; line-height:1; padding:0 2px; opacity:0; }
            .nt-nb:hover .nt-nb-del, .nt-sec:hover .nt-sec-del, .nt-page-row:hover .nt-page-del { opacity:1; }
            .nt-nb-del:hover, .nt-sec-del:hover, .nt-page-del:hover { color:#f87171; }
            .nt-mid { width:238px; flex:none; display:flex; flex-direction:column; background:#1e1e25; border-right:1px solid #2a2a32; min-height:0; }
            .nt-secs { display:flex; gap:4px; padding:8px 8px 4px; overflow-x:auto; border-bottom:1px solid #2a2a32; flex:none; }
            .nt-sec { display:flex; align-items:center; gap:3px; background:rgba(255,255,255,0.06); border:1px solid transparent;
                border-radius:14px; color:#c8c8d2; padding:3px 9px; font-size:11.5px; cursor:pointer; white-space:nowrap; font-family:inherit; }
            .nt-sec.active { background:var(--accent-color); color:#fff; }
            .nt-sec-del { color:inherit; opacity:.55; }
            .nt-sec.active .nt-sec-del { color:#fff; }
            .nt-mid-head { display:flex; align-items:center; justify-content:space-between; padding:8px 10px 4px;
                font-size:10px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#82828f; }
            .nt-add { background:none; border:none; color:var(--accent-color); cursor:pointer; font-size:11px;
                font-weight:600; letter-spacing:0; text-transform:none; padding:0; }
            .nt-pages { flex:1; overflow-y:auto; padding:2px 6px 10px; min-height:0; }
            .nt-page-row { display:flex; flex-direction:column; gap:2px; padding:7px 8px; border-radius:6px; cursor:pointer; }
            .nt-page-row:hover { background:rgba(255,255,255,0.06); }
            .nt-page-row.active { background:rgba(56,189,248,0.18); }
            .nt-page-title { display:flex; align-items:center; gap:6px; font-size:12.5px; color:#ececf2; }
            .nt-page-title span { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .nt-page-sub { font-size:10.5px; color:#7c7c89; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .nt-empty { padding:18px 10px; font-size:11.5px; color:#6f6f7c; line-height:1.55; }
            .nt-editor { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; background:#17171c; }
            .nt-ed-head { display:flex; align-items:center; gap:8px; padding:10px 14px 8px; border-bottom:1px solid #272730; flex-wrap:wrap; }
            .nt-title { flex:1; min-width:120px; background:transparent; border:none; color:#fff; font-size:17px; font-weight:600;
                font-family:inherit; padding:2px 0; }
            .nt-title:focus { outline:none; }
            .nt-btn { background:rgba(255,255,255,0.08); border:1px solid #34343f; border-radius:5px; color:#dcdce4;
                padding:5px 10px; font-size:11.5px; cursor:pointer; font-family:inherit; }
            .nt-btn:hover { background:rgba(255,255,255,0.15); }
            .nt-btn.on { background:var(--accent-color); border-color:transparent; color:#fff; }
            .nt-body { flex:1; min-height:0; width:100%; box-sizing:border-box; background:transparent; border:none; resize:none;
                color:#dcdce4; font-size:13.5px; line-height:1.65; font-family:'Cascadia Code',Consolas,monospace; padding:14px 18px; }
            .nt-body:focus { outline:none; }
            .nt-preview-body { flex:1; min-height:0; overflow-y:auto; padding:6px 22px 24px; font-size:13.5px; line-height:1.65; color:#dcdce4; }
            .nt-preview-body h1 { font-size:22px; margin:16px 0 8px; }
            .nt-preview-body h2 { font-size:18px; margin:16px 0 6px; }
            .nt-preview-body h3 { font-size:15px; margin:14px 0 4px; }
            .nt-preview-body p { margin:8px 0; }
            .nt-preview-body ul, .nt-preview-body ol { margin:8px 0; padding-left:22px; }
            .nt-preview-body li { margin:3px 0; }
            .nt-preview-body code { background:#26262f; border-radius:3px; padding:1px 4px; font-size:12.5px;
                font-family:'Cascadia Code',Consolas,monospace; }
            .nt-preview-body pre { background:#101014; border:1px solid #2a2a32; border-radius:6px; padding:10px 12px; overflow-x:auto; }
            .nt-preview-body pre code { background:none; padding:0; }
            .nt-preview-body blockquote { border-left:3px solid var(--accent-color); margin:8px 0; padding:2px 0 2px 12px; color:#a9a9b6; }
            .nt-preview-body hr { border:none; border-top:1px solid #34343f; margin:16px 0; }
            .nt-preview-body a { color:#5cc8ff; }
            .nt-status { display:flex; justify-content:space-between; gap:12px; padding:5px 14px; border-top:1px solid #272730;
                font-size:10.5px; color:#71717e; flex:none; }
        </style>
        <div class="nt-root">
            <div class="nt-nav">
                <div class="nt-search-wrap">
                    <input class="nt-search" type="search" placeholder="Search all notes" spellcheck="false">
                </div>
                <div class="nt-nav-head">
                    <span>Notebooks</span>
                    <button class="nt-add nt-add-nb" title="New notebook">+ New</button>
                </div>
                <div class="nt-nbs"></div>
            </div>
            <div class="nt-mid">
                <div class="nt-secs"></div>
                <div class="nt-mid-head">
                    <span class="nt-mid-label">Pages</span>
                    <button class="nt-add nt-add-page" title="New page">+ Page</button>
                </div>
                <div class="nt-pages"></div>
            </div>
            <div class="nt-editor">
                <div class="nt-ed-head">
                    <input class="nt-title" placeholder="Page title" spellcheck="false">
                    <button class="nt-btn nt-preview" title="Show the formatted page">Preview</button>
                    <button class="nt-btn nt-export" title="Save a Markdown copy">Export</button>
                    <button class="nt-btn nt-del-page" title="Delete this page">Delete</button>
                </div>
                <textarea class="nt-body" placeholder="Start writing… Use # for headings, - for lists and **bold** for emphasis." spellcheck="false"></textarea>
                <div class="nt-preview-body" style="display:none;"></div>
                <div class="nt-status">
                    <span class="nt-save-state">Saved</span>
                    <span class="nt-count"></span>
                </div>
            </div>
        </div>`;
}

function launch() {
    const app = createApp({ id: 'notes', name: 'Notes' });
    const win = app.window.create({
        title: 'Notes',
        icon: app.icon(),
        content: getContent(),
        width: 940,
        height: 640,
        minWidth: 620,
        minHeight: 420
    });
    const el = win.element;
    const nbsEl = el.querySelector('.nt-nbs');
    const secsEl = el.querySelector('.nt-secs');
    const pagesEl = el.querySelector('.nt-pages');
    const midLabel = el.querySelector('.nt-mid-label');
    const searchEl = el.querySelector('.nt-search');
    const titleEl = el.querySelector('.nt-title');
    const bodyEl = el.querySelector('.nt-body');
    const previewEl = el.querySelector('.nt-preview-body');
    const previewBtn = el.querySelector('.nt-preview');
    const saveState = el.querySelector('.nt-save-state');
    const countEl = el.querySelector('.nt-count');
    const addPageBtn = el.querySelector('.nt-add-page');

    let data = freshData();
    try {
        const raw = app.files.read('notes.json');
        if (raw) {
            const parsed = normalize(JSON.parse(raw));
            if (parsed) data = parsed;
        }
    } catch { /* start from the sample notebook */ }

    let selNotebook = data.last?.notebook || data.notebooks[0].id;
    let selSection = data.last?.section || '';
    let selPage = data.last?.page || '';
    let loadedPage = '';
    let preview = false;
    let saveTimer = 0;
    let searchTimer = 0;
    let query = '';
    let closed = false;

    // ---------- lookups ----------

    const notebook = () => data.notebooks.find(nb => nb.id === selNotebook) || data.notebooks[0];

    function section() {
        const nb = notebook();
        return nb.sections.find(sec => sec.id === selSection) || nb.sections[0];
    }

    function page() {
        const sec = section();
        return sec ? sec.pages.find(p => p.id === selPage) || null : null;
    }

    function findPage(id) {
        for (const nb of data.notebooks) {
            for (const sec of nb.sections) {
                const found = sec.pages.find(p => p.id === id);
                if (found) return { notebook: nb, section: sec, page: found };
            }
        }
        return null;
    }

    function ensureSelection() {
        let nb = notebook();
        if (!nb) return;
        selNotebook = nb.id;
        if (!nb.sections.length) nb.sections.push({ id: uid(), name: 'Notes', pages: [] });
        let sec = nb.sections.find(s => s.id === selSection);
        if (!sec) { sec = nb.sections[0]; selSection = sec.id; }
        if (!sec.pages.some(p => p.id === selPage)) {
            selPage = sec.pages.length ? sec.pages[0].id : '';
        }
    }

    // ---------- persistence ----------

    function persist() {
        clearTimeout(saveTimer);
        saveTimer = 0;
        if (closed) return;
        data.last = { notebook: selNotebook, section: selSection, page: selPage };
        try {
            app.files.write('notes.json', JSON.stringify(data));
            saveState.textContent = 'Saved';
        } catch {
            saveState.textContent = 'Could not save';
        }
    }

    function markDirty() {
        saveState.textContent = 'Saving…';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = 0;
            persist();
            renderPages();
        }, SAVE_DELAY);
    }

    // ---------- rendering ----------

    function renderNotebooks() {
        nbsEl.innerHTML = data.notebooks.map(nb => `
            <div class="nt-nb ${nb.id === selNotebook ? 'active' : ''}" data-nb="${nb.id}" title="Double-click to rename">
                <span class="nt-nb-name">${escapeHtml(nb.name)}</span>
                <button class="nt-nb-del" data-del-nb="${nb.id}" title="Delete notebook">×</button>
            </div>`).join('');
    }

    function renderSections() {
        const nb = notebook();
        secsEl.innerHTML = nb.sections.map(sec => `
            <button class="nt-sec ${sec.id === selSection ? 'active' : ''}" data-sec="${sec.id}" title="Double-click to rename">
                <span>${escapeHtml(sec.name)}</span>
                <span class="nt-sec-del" data-del-sec="${sec.id}" title="Delete section">×</span>
            </button>`).join('') + '<button class="nt-sec nt-add-sec" title="New section">+</button>';
    }

    function pageRow(pageObj, subtitle) {
        const snippet = pageObj.body.replace(/\s+/g, ' ').trim().slice(0, 60);
        return `
            <div class="nt-page-row ${pageObj.id === selPage && !query ? 'active' : ''}" data-page="${pageObj.id}">
                <div class="nt-page-title">
                    <span>${escapeHtml(pageObj.title || 'Untitled page')}</span>
                    <span style="color:#6f6f7c;font-size:10px;">${when(pageObj.updated)}</span>
                    <button class="nt-page-del" data-del-page="${pageObj.id}" title="Delete page">×</button>
                </div>
                <div class="nt-page-sub">${escapeHtml(subtitle || snippet || 'Empty page')}</div>
            </div>`;
    }

    function searchResults() {
        const q = query.toLowerCase();
        const hits = [];
        for (const nb of data.notebooks) {
            for (const sec of nb.sections) {
                for (const p of sec.pages) {
                    if (`${p.title}\n${p.body}`.toLowerCase().includes(q)) {
                        hits.push({ page: p, where: `${nb.name} / ${sec.name}`, updated: p.updated });
                    }
                }
            }
        }
        hits.sort((a, b) => b.updated - a.updated);
        return hits;
    }

    function renderPages() {
        if (query) {
            const hits = searchResults();
            midLabel.textContent = `Results (${hits.length})`;
            secsEl.style.display = 'none';
            addPageBtn.style.display = 'none';
            pagesEl.innerHTML = hits.length
                ? hits.slice(0, 200).map(hit => pageRow(hit.page, hit.where)).join('')
                : '<div class="nt-empty">No page matches that search.</div>';
            return;
        }
        secsEl.style.display = '';
        addPageBtn.style.display = '';
        midLabel.textContent = 'Pages';
        const sec = section();
        const pages = sec ? [...sec.pages].sort((a, b) => b.updated - a.updated) : [];
        pagesEl.innerHTML = pages.length
            ? pages.map(p => pageRow(p)).join('')
            : '<div class="nt-empty">No pages in this section yet. Use <b>+ Page</b> to start one.</div>';
    }

    function updateCount() {
        const text = bodyEl.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        countEl.textContent = `${words} word${words === 1 ? '' : 's'} · ${bodyEl.value.length} characters`;
    }

    function loadEditor() {
        const current = page();
        if (!current) {
            titleEl.value = '';
            bodyEl.value = '';
            titleEl.disabled = true;
            bodyEl.disabled = true;
            previewEl.innerHTML = '<p style="color:#71717e;">Create or select a page to start writing.</p>';
            loadedPage = '';
            updateCount();
            return;
        }
        titleEl.disabled = false;
        bodyEl.disabled = false;
        titleEl.value = current.title;
        bodyEl.value = current.body;
        loadedPage = current.id;
        if (preview) previewEl.innerHTML = renderMarkdown(current.body) || '<p style="color:#71717e;">Nothing to preview yet.</p>';
        updateCount();
    }

    function render(forceEditor) {
        ensureSelection();
        renderNotebooks();
        renderSections();
        renderPages();
        if (forceEditor || loadedPage !== selPage) loadEditor();
    }

    function openPage(id) {
        const found = findPage(id);
        if (!found) return;
        clearTimeout(saveTimer);
        persist();
        selNotebook = found.notebook.id;
        selSection = found.section.id;
        selPage = found.page.id;
        query = '';
        searchEl.value = '';
        render(true);
    }

    function selectPage(id) {
        if (id === selPage) return;
        clearTimeout(saveTimer);
        persist();
        selPage = id;
        render(true);
    }

    // ---------- actions ----------

    function addNotebook() {
        app.dialogs.text('New notebook', 'Give the notebook a name.', { value: 'Notebook' }).then(name => {
            if (!name) return;
            const nb = { id: uid(), name: name.trim() || 'Notebook', sections: [{ id: uid(), name: 'Notes', pages: [] }] };
            data.notebooks.push(nb);
            selNotebook = nb.id;
            selSection = nb.sections[0].id;
            selPage = '';
            query = '';
            searchEl.value = '';
            render(true);
            persist();
        }).catch(() => {});
    }

    function addSection() {
        app.dialogs.text('New section', 'Name this section.', { value: 'Section' }).then(name => {
            if (!name) return;
            const nb = notebook();
            const sec = { id: uid(), name: name.trim() || 'Section', pages: [] };
            nb.sections.push(sec);
            selSection = sec.id;
            selPage = '';
            render(true);
            persist();
        }).catch(() => {});
    }

    function addPage() {
        const sec = section();
        if (!sec) return;
        clearTimeout(saveTimer);
        persist();
        const newPage = { id: uid(), title: 'Untitled page', body: '', updated: Date.now() };
        sec.pages.unshift(newPage);
        selPage = newPage.id;
        query = '';
        searchEl.value = '';
        render(true);
        persist();
        titleEl.focus();
        titleEl.select();
    }

    function deletePage(id) {
        const found = findPage(id);
        if (!found) return;
        app.dialogs.confirm('Delete page', `Delete “${found.page.title || 'Untitled page'}”? This cannot be undone.`).then(ok => {
            if (!ok) return;
            const list = found.section.pages;
            const index = list.findIndex(p => p.id === id);
            list.splice(index, 1);
            if (selPage === id) {
                selSection = found.section.id;
                selNotebook = found.notebook.id;
                selPage = list[Math.min(index, list.length - 1)]?.id || '';
            }
            render(true);
            persist();
        }).catch(() => {});
    }

    function deleteSection(id) {
        const nb = notebook();
        const sec = nb.sections.find(s => s.id === id);
        if (!sec) return;
        if (nb.sections.length === 1) {
            app.notify.info('Notes', 'A notebook needs at least one section.');
            return;
        }
        app.dialogs.confirm('Delete section', `Delete “${sec.name}” and its ${sec.pages.length} page${sec.pages.length === 1 ? '' : 's'}?`).then(ok => {
            if (!ok) return;
            nb.sections = nb.sections.filter(s => s.id !== id);
            if (selSection === id) {
                selSection = nb.sections[0].id;
                selPage = '';
            }
            render(true);
            persist();
        }).catch(() => {});
    }

    function deleteNotebook(id) {
        if (data.notebooks.length === 1) {
            app.notify.info('Notes', 'You need at least one notebook.');
            return;
        }
        const nb = data.notebooks.find(n => n.id === id);
        if (!nb) return;
        app.dialogs.confirm('Delete notebook', `Delete “${nb.name}” with all of its sections and pages?`).then(ok => {
            if (!ok) return;
            data.notebooks = data.notebooks.filter(n => n.id !== id);
            if (selNotebook === id) {
                selNotebook = data.notebooks[0].id;
                selSection = '';
                selPage = '';
            }
            render(true);
            persist();
        }).catch(() => {});
    }

    function renameNotebook(id) {
        const nb = data.notebooks.find(n => n.id === id);
        if (!nb) return;
        app.dialogs.text('Rename notebook', 'New name', { value: nb.name }).then(name => {
            if (!name || !name.trim()) return;
            nb.name = name.trim();
            render();
            persist();
        }).catch(() => {});
    }

    function renameSection(id) {
        const nb = notebook();
        const sec = nb.sections.find(s => s.id === id);
        if (!sec) return;
        app.dialogs.text('Rename section', 'New name', { value: sec.name }).then(name => {
            if (!name || !name.trim()) return;
            sec.name = name.trim();
            render();
            persist();
        }).catch(() => {});
    }

    function exportPage() {
        const current = page();
        if (!current) return;
        const safe = (current.title || 'Note').replace(/[\\/:*?"<>|]/g, '').trim() || 'Note';
        FileSystem.pickSave({
            defaultName: `${safe}.md`,
            defaultPath: Users.home(['Documents']),
            extensions: [{ value: 'md', label: 'Markdown document' }],
            parentApp: 'notes'
        }).then(q => {
            if (!q) return;
            const text = `# ${current.title || 'Untitled page'}\n\n${current.body}`;
            if (FileSystem.createFile(q.path, q.fullName, text, q.ext || 'md')) {
                app.notify.info('Notes', `Exported ${q.fullName}.`);
            } else {
                app.notify.info('Notes', 'The page could not be exported.');
            }
        }).catch(() => {});
    }

    function togglePreview() {
        preview = !preview;
        previewBtn.classList.toggle('on', preview);
        previewBtn.textContent = preview ? 'Edit' : 'Preview';
        bodyEl.style.display = preview ? 'none' : '';
        previewEl.style.display = preview ? 'block' : 'none';
        if (preview) {
            const current = page();
            previewEl.innerHTML = renderMarkdown(current ? current.body : '')
                || '<p style="color:#71717e;">Nothing to preview yet.</p>';
        }
    }

    // ---------- editor input ----------

    titleEl.addEventListener('input', () => {
        const current = page();
        if (!current) return;
        current.title = titleEl.value;
        current.updated = Date.now();
        markDirty();
    });

    bodyEl.addEventListener('input', () => {
        const current = page();
        if (!current) return;
        current.body = bodyEl.value;
        current.updated = Date.now();
        updateCount();
        markDirty();
    });

    searchEl.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            query = searchEl.value.trim();
            renderPages();
        }, 140);
    });

    // ---------- delegation ----------

    nbsEl.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del-nb]');
        if (del) { e.stopPropagation(); deleteNotebook(del.dataset.delNb); return; }
        const row = e.target.closest('[data-nb]');
        if (!row) return;
        selNotebook = row.dataset.nb;
        const nb = notebook();
        selSection = nb.sections[0]?.id || '';
        selPage = nb.sections[0]?.pages[0]?.id || '';
        render(true);
        persist();
    });
    nbsEl.addEventListener('dblclick', (e) => {
        const row = e.target.closest('[data-nb]');
        if (row) renameNotebook(row.dataset.nb);
    });

    secsEl.addEventListener('click', (e) => {
        if (e.target.closest('.nt-add-sec')) { addSection(); return; }
        const del = e.target.closest('[data-del-sec]');
        if (del) { e.stopPropagation(); deleteSection(del.dataset.delSec); return; }
        const chip = e.target.closest('[data-sec]');
        if (!chip) return;
        selSection = chip.dataset.sec;
        const sec = section();
        selPage = sec?.pages[0]?.id || '';
        render(true);
        persist();
    });
    secsEl.addEventListener('dblclick', (e) => {
        const chip = e.target.closest('[data-sec]');
        if (chip) renameSection(chip.dataset.sec);
    });

    pagesEl.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del-page]');
        if (del) { e.stopPropagation(); deletePage(del.dataset.delPage); return; }
        const row = e.target.closest('[data-page]');
        if (row) openPage(row.dataset.page);
    });

    el.querySelector('.nt-add-nb').addEventListener('click', addNotebook);
    addPageBtn.addEventListener('click', addPage);
    previewBtn.addEventListener('click', togglePreview);
    el.querySelector('.nt-export').addEventListener('click', exportPage);
    el.querySelector('.nt-del-page').addEventListener('click', () => {
        if (selPage) deletePage(selPage);
    });

    // ---------- lifecycle ----------

    const offSave = app.keyboard.register('CTRL+S', () => { persist(); }, { scope: el });

    const onClosed = (e) => {
        if (!e.detail || e.detail.id !== win.id) return;
        window.removeEventListener('window-closed', onClosed);
        clearTimeout(saveTimer);
        clearTimeout(searchTimer);
        persist();
        closed = true;
        app.keyboard.unregister(offSave);
    };
    window.addEventListener('window-closed', onClosed);

    render(true);
    app.shell.activity.trackAppOpen('notes');
}

export default { launch, icon: AppIcons.get('notes') };
