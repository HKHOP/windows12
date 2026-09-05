import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';
import Popup from '../modules/popup.js';
import FileSystem from '../modules/fileSystem.js';
import ContextMenu from '../modules/contextMenu.js';
import SystemConfig from '../modules/systemConfig.js';
import UserActivity from '../modules/userActivity.js';
import Sounds from '../modules/sounds.js';
import SavePrompt from '../modules/saveprompt.js';

const Words = (() => {
    const APP_ID = 'words';
    const DOCS = ['/', 'users', 'default', 'Documents'];
    const icon = AppIcons.get(APP_ID) || `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="18" height="20" rx="2" fill="#3b82f6"/><path d="M7 7h10M7 11h10M7 15h7" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>`;

    const state = {
        title: 'Untitled document',
        path: null,
        dirty: false,
        zoom: 100,
        theme: 'light',
    };

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escXml(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    function getTheme() {
        return SystemConfig.get('darkMode') ? 'dark' : 'light';
    }

    function applyTheme(win) {
        const root = win.element.querySelector('.words-root');
        if (!root) return;
        state.theme = getTheme();
        root.dataset.theme = state.theme;
    }

    function updateTitle(win) {
        const input = win.element.querySelector('.words-title-input');
        const label = win.element.querySelector('.words-window-title');
        if (input) input.value = state.title;
        if (label) label.textContent = `${state.title}${state.dirty ? ' *' : ''}`;
    }

    function setDirty(win, value = true) {
        state.dirty = value;
        updateTitle(win);
        win.element.querySelector('.words-save-dot')?.classList.toggle('dirty', value);
    }

    function stripHtml(html) {
        const d = document.createElement('div');
        d.innerHTML = html;
        return (d.innerText || d.textContent || '').trim();
    }

    function defaultContent() {
        return '';
    }

    function buildDocumentPayload(win) {
        const editor = win.element.querySelector('.words-editor');
        const objects = [...win.element.querySelectorAll('.words-object')].map(el => ({
            id: el.dataset.objectId,
            type: el.dataset.objectType,
            shape: el.dataset.shape || null,
            src: el.dataset.src || null,
            alt: el.dataset.alt || '',
            left: parseFloat(el.style.left) || 0,
            top: parseFloat(el.style.top) || 0,
            width: parseFloat(el.style.width) || 180,
            height: parseFloat(el.style.height) || 120,
            rotation: parseFloat(el.dataset.rotation) || 0,
            zIndex: parseInt(el.style.zIndex || '2', 10) || 2,
        }));
        const metadata = `<!--WORDS-OBJECTS:${btoa(unescape(encodeURIComponent(JSON.stringify(objects))))}-->`;
        return { html: editor?.innerHTML || '', metadata, objects };
    }

    function parsePayload(raw) {
        const match = String(raw || '').match(/<!--WORDS-OBJECTS:([^-]+)-->/);
        let objects = [];
        if (match) {
            try { objects = JSON.parse(decodeURIComponent(escape(atob(match[1])))); } catch (_) { objects = []; }
        }
        const clean = String(raw || '').replace(/<!--WORDS-OBJECTS:[^-]+-->/, '');
        if (/<!doctype html/i.test(clean) || /<html[\s>]/i.test(clean)) {
            const doc = new DOMParser().parseFromString(clean, 'text/html');
            return { html: doc.querySelector('.page')?.innerHTML || doc.body?.innerHTML || '', objects };
        }
        return { html: `<p>${esc(clean).replace(/\r?\n/g, '</p><p>')}</p>`, objects };
    }

    function htmlDocument(title, body, metadata = '') {
        return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.page{max-width:820px;min-height:1050px;margin:0 auto;padding:82px;box-sizing:border-box;line-height:1.55}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:7px}</style></head><body><div class="page">${body}</div>${metadata}</body></html>`;
    }

    function ensureFolder() {
        if (!FileSystem.itemExists(DOCS)) return false;
        return true;
    }

    function makeCrcTable() {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[i] = c >>> 0;
        }
        return table;
    }

    const crcTable = makeCrcTable();
    const u16 = n => new Uint8Array([n & 255, (n >>> 8) & 255]);
    const u32 = n => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
    function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
    function concat(parts) { const size = parts.reduce((n, p) => n + p.length, 0); const out = new Uint8Array(size); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; }

    function zipStore(entries) {
        const te = new TextEncoder();
        const locals = [], centrals = [];
        let offset = 0;
        for (const e of entries) {
            const name = te.encode(e.name);
            const data = typeof e.data === 'string' ? te.encode(e.data) : e.data;
            const crc = crc32(data);
            const local = concat([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
            const central = concat([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
            locals.push(local); centrals.push(central); offset += local.length;
        }
        const c = concat(centrals); const l = concat(locals);
        return concat([l,c,new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(c.length),u32(l.length),u16(0)]);
    }

    function htmlToDocx(html) {
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        const root = doc.body.firstElementChild;
        const runs = node => {
            if (node.nodeType === Node.TEXT_NODE) return `<w:r><w:t xml:space="preserve">${escXml(node.nodeValue)}</w:t></w:r>`;
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            const tag = node.tagName.toLowerCase();
            const props = `${tag === 'b' || tag === 'strong' ? '<w:b/>' : ''}${tag === 'i' || tag === 'em' ? '<w:i/>' : ''}${tag === 'u' ? '<w:u w:val="single"/>' : ''}`;
            const inner = [...node.childNodes].map(runs).join('');
            return `<w:r>${props}${inner.replace(/^<w:r>|<\/w:r>$/g,'')}</w:r>`;
        };
        const block = node => {
            const tag = node.tagName.toLowerCase();
            const textRuns = [...node.childNodes].map(runs).join('') || '<w:r><w:t></w:t></w:r>';
            let pPr = '';
            if (tag === 'h1') pPr = '<w:pPr><w:pStyle w:val="Title"/></w:pPr>';
            if (tag === 'h2') pPr = '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>';
            if (tag === 'h3') pPr = '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>';
            if (tag === 'blockquote') pPr = '<w:pPr><w:pStyle w:val="Quote"/></w:pPr>';
            if (tag === 'li') pPr = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>';
            return `<w:p>${pPr}${textRuns}</w:p>`;
        };
        const out = [];
        for (const child of [...root.children]) {
            if (/^(p|h1|h2|h3|blockquote|li|div)$/i.test(child.tagName)) out.push(block(child));
            else if (child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol') for (const li of [...child.children]) out.push(block(li));
        }
        if (!out.length && root.textContent.trim()) out.push(`<w:p><w:r><w:t>${escXml(root.textContent)}</w:t></w:r></w:p>`);
        return out.join('') || '<w:p><w:r><w:t></w:t></w:r></w:p>';
    }

    function makeDocx(title, html) {
        const now = new Date().toISOString();
        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${htmlToDocx(html)}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
        const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:rPr><w:i/><w:color w:val="666666"/></w:rPr></w:style></w:styles>`;
        const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
        const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
        const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${escXml(title)}</dc:title><dc:creator>Words</dc:creator><dcterms:created>${now}</dcterms:created><dcterms:modified>${now}</dcterms:modified></cp:coreProperties>`;
        const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
        return new Blob([zipStore([{name:'[Content_Types].xml',data:types},{name:'_rels/.rels',data:rootRels},{name:'word/document.xml',data:documentXml},{name:'word/styles.xml',data:styles},{name:'word/_rels/document.xml.rels',data:docRels},{name:'docProps/core.xml',data:core}])], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    }

    function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

    function updateStats(win) {
        const text = (win.element.querySelector('.words-editor')?.innerText || '').replace(/\u00a0/g,' ').trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;
        win.element.querySelector('.words-status').textContent = `${words.toLocaleString()} words • ${chars.toLocaleString()} characters`;
    }

    function exec(win, command, value = null) {
        const editor = win.element.querySelector('.words-editor'); editor?.focus();
        try { document.execCommand(command, false, value); } catch (_) {}
        editor?.dispatchEvent(new Event('input', {bubbles:true}));
    }

    async function save(win, saveAs = false) {
        if (!ensureFolder()) { await Popup.error('Save failed','The Documents folder is unavailable.'); return false; }
        const {html, metadata} = buildDocumentPayload(win);
        const payload = htmlDocument(state.title, html, metadata);
        if (!saveAs && state.path && FileSystem.itemExists(state.path)) {
            if (!FileSystem.writeFile(state.path, payload)) { await Popup.error('Save failed','Words could not write the document.'); return false; }
            state.dirty=false; updateTitle(win); Sounds.confirm(); return true;
        }
        const result = await SavePrompt.show({defaultName:`${state.title || 'Untitled document'}.html`,defaultPath:DOCS,extensions:[{value:'html',label:'HTML Document'},{value:'txt',label:'Text Document'},{value:'md',label:'Markdown Document'}],parentApp:APP_ID});
        if (!result) return false;
        const full = [...result.path,result.fullName];
        const out = result.ext === 'txt' || result.ext === 'md' ? stripHtml(html) : payload;
        const ok = FileSystem.itemExists(full) ? FileSystem.writeFile(full,out) : FileSystem.createFile(result.path,result.fullName,out,result.ext);
        if (!ok) { await Popup.error('Save failed','Words could not create the document.'); return false; }
        state.path=full; state.title=result.fullName.replace(/\.[^.]+$/,'') || 'Untitled document'; state.dirty=false; updateTitle(win); Sounds.confirm(); UserActivity.trackFileOpen(full,result.fullName); return true;
    }

    async function saveAsExport(win, format) {
        const {html}=buildDocumentPayload(win); const base=(state.title||'Untitled document').replace(/[\\/:*?"<>|]/g,'').trim()||'Untitled document';
        if(format==='docx') download(makeDocx(state.title,html),`${base}.docx`);
        else if(format==='doc') download(new Blob([`\ufeff<html><head><meta charset="utf-8"></head><body>${html}</body></html>`],{type:'application/msword'}),`${base}.doc`);
        else if(format==='html') download(new Blob([htmlDocument(state.title,html)],{type:'text/html'}),`${base}.html`);
        else if(format==='txt') download(new Blob([stripHtml(html)],{type:'text/plain'}),`${base}.txt`);
        Sounds.confirm();
    }

    async function open(win) {
        if(state.dirty){ const r=await Popup.confirm('Unsaved Changes','Save changes before opening another document?'); if(r && !(await save(win))) return; if(!r) return; }
        const children=FileSystem.getChildren(DOCS)||[];
        const candidates=children.filter(x=>x.type!=='folder' && /\.(html?|txt|md|markdown)$/i.test(x.name));
        if(!candidates.length){await Popup.info('Open Document','No supported documents were found in Documents.');return;}
        const pick=await Popup.pick('Open Document','Select a document:',candidates.map(x=>x.name)); if(!pick)return;
        const path=[...DOCS,pick], raw=FileSystem.readFile(path); if(raw==null){await Popup.error('Open failed','Words could not read that file.');return;}
        const payload=parsePayload(raw); win.element.querySelector('.words-editor').innerHTML=payload.html; state.path=path; state.title=pick.replace(/\.[^.]+$/,'')||'Untitled document'; state.dirty=false; updateTitle(win); renderObjects(win,payload.objects); updateStats(win); UserActivity.trackFileOpen(path,pick); Sounds.info();
    }

    async function newDoc(win) {
        if(state.dirty){const r=await Popup.confirm('Unsaved Changes','Save changes before creating a new document?');if(r&&!(await save(win)))return;if(!r)return;}
        state.path=null;state.title='Untitled document';state.dirty=false;win.element.querySelector('.words-editor').innerHTML='';clearObjects(win);updateTitle(win);updateStats(win);win.element.querySelector('.words-editor').focus();
    }

    function renderObjects(win, objects = []) {
        clearObjects(win);
        for(const obj of objects) addObject(win,obj.type,{...obj});
    }

    function clearObjects(win) { win.element.querySelector('.words-object-layer')?.replaceChildren(); }

    function addObject(win,type,opts={}) {
        const layer=win.element.querySelector('.words-object-layer'); if(!layer)return null;
        const el=document.createElement('div'); const id=opts.id||`obj-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        el.className='words-object'; el.dataset.objectId=id; el.dataset.objectType=type; el.dataset.shape=opts.shape||''; el.dataset.src=opts.src||''; el.dataset.alt=opts.alt||''; el.dataset.rotation=String(opts.rotation??0);
        Object.assign(el.style,{left:`${opts.left??120}px`,top:`${opts.top??120}px`,width:`${opts.width??180}px`,height:`${opts.height??120}px`,zIndex:String(opts.zIndex??2),transform:`rotate(${opts.rotation??0}deg)`});
        if(type==='image'){const img=document.createElement('img');img.src=opts.src;img.alt=opts.alt||'Image';img.draggable=false;el.appendChild(img);}else{const shape=document.createElement('div');shape.className=`words-shape words-shape-${opts.shape||'rectangle'}`;el.appendChild(shape);}
        el.insertAdjacentHTML('beforeend','<div class="words-object-controls"><button data-obj="left" title="Rotate left">↶</button><button data-obj="right" title="Rotate right">↷</button><button data-obj="delete" title="Delete">×</button></div><span class="words-resize-handle"></span>');
        layer.appendChild(el); wireObject(win,el); return el;
    }

    function wireObject(win,el){
        let drag=null,resize=null;
        const onDown=e=>{if(e.target.closest('.words-object-controls')||e.target.classList.contains('words-resize-handle'))return;const lr=win.element.querySelector('.words-object-layer').getBoundingClientRect(),er=el.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:er.left-lr.left,top:er.top-lr.top};el.classList.add('selected');e.preventDefault();};
        const onResize=e=>{if(drag){el.style.left=`${Math.max(0,drag.left+e.clientX-drag.x)}px`;el.style.top=`${Math.max(0,drag.top+e.clientY-drag.y)}px`;}if(resize){el.style.width=`${Math.max(40,resize.width+e.clientX-resize.x)}px`;el.style.height=`${Math.max(40,resize.height+e.clientY-resize.y)}px`;}};
        const up=()=>{if(drag||resize){drag=null;resize=null;setDirty(win,true)}};
        const rs=e=>{const r=el.getBoundingClientRect();resize={x:e.clientX,y:e.clientY,width:r.width,height:r.height};e.preventDefault();e.stopPropagation()};
        el.addEventListener('pointerdown',onDown);el.querySelector('.words-resize-handle').addEventListener('pointerdown',rs);window.addEventListener('pointermove',onResize);window.addEventListener('pointerup',up);
        el.querySelector('[data-obj="left"]').addEventListener('click',()=>rotate(win,el,-15));el.querySelector('[data-obj="right"]').addEventListener('click',()=>rotate(win,el,15));el.querySelector('[data-obj="delete"]').addEventListener('click',()=>{el.remove();setDirty(win,true)});
        el._cleanup=()=>{el.removeEventListener('pointerdown',onDown);el.querySelector('.words-resize-handle').removeEventListener('pointerdown',rs);window.removeEventListener('pointermove',onResize);window.removeEventListener('pointerup',up)};
    }

    function rotate(win,el,degrees){const n=(parseFloat(el.dataset.rotation)||0)+degrees;el.dataset.rotation=String(n);el.style.transform=`rotate(${n}deg)`;setDirty(win,true)}
    function selected(win){return win.element.querySelector('.words-object.selected')||win.element.querySelector('.words-object:hover')}
    function anchor(win,where){const el=selected(win);if(!el)return;const layer=win.element.querySelector('.words-object-layer');const w=layer.clientWidth,h=layer.clientHeight,ew=el.offsetWidth,eh=el.offsetHeight,m={TL:[20,20],TC:[(w-ew)/2,20],TR:[w-ew-20,20],C:[(w-ew)/2,(h-eh)/2],BL:[20,h-eh-20],BC:[(w-ew)/2,h-eh-20],BR:[w-ew-20,h-eh-20]};const [x,y]=m[where]||m.TL;el.style.left=`${Math.max(0,x)}px`;el.style.top=`${Math.max(0,y)}px`;setDirty(win,true)}

    function insertImage(win){const input=document.createElement('input');input.type='file';input.accept='image/*';input.addEventListener('change',()=>{const file=input.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>addObject(win,'image',{src:String(reader.result),alt:file.name,width:240,height:160});reader.readAsDataURL(file)});input.click()}
    function insertShape(win){Popup.pick('Insert Shape','Choose a shape:',[{label:'Rectangle'},{label:'Rounded rectangle'},{label:'Circle'},{label:'Ellipse'},{label:'Triangle'},{label:'Arrow'}]).then(v=>{if(!v)return;const label=typeof v==='string'?v:v.label;const shape={Rectangle:'rectangle','Rounded rectangle':'rounded-rectangle',Circle:'circle',Ellipse:'ellipse',Triangle:'triangle',Arrow:'arrow'}[label]||'rectangle';addObject(win,'shape',{shape,width:190,height:120});setDirty(win,true)})}

    function toolbar(){
        const b=(a,t,title='')=>`<button class="words-tool" data-action="${a}" title="${esc(title||a)}">${t}</button>`;
        return `<div class="words-ribbon"><div class="words-toprow"><div class="words-brand"><span class="words-brand-icon">${icon}</span><span>Words</span></div><input class="words-title-input" value="Untitled document"><div class="words-top-actions"><button class="words-top-btn" data-action="new">＋</button><button class="words-top-btn" data-action="open">📂</button><button class="words-top-btn" data-action="save">💾</button><button class="words-top-btn" data-action="saveas">↥</button><button class="words-top-btn" data-action="print">🖨</button><span class="words-save-dot"></span></div></div><div class="words-tabs">${['Home','Insert','Layout','References','Review','View'].map((x,i)=>`<button class="words-tab ${i===0?'active':''}" data-tab="${x}">${x}</button>`).join('')}</div>
        <div class="words-panel" data-panel="Home"><div class="words-group"><label>Clipboard</label><div>${b('cut','✂','Cut')} ${b('copy','⧉','Copy')} ${b('paste','📋','Paste')}</div></div><div class="words-group"><label>Font</label><div class="words-inline"><select data-format="fontName" class="words-select"><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>Courier New</option></select><select data-format="fontSize" class="words-select size"><option>11</option><option>12</option><option>14</option><option selected>16</option><option>18</option><option>20</option><option>24</option><option>28</option><option>32</option><option>36</option></select>${b('bold','<b>B</b>','Bold')} ${b('italic','<i>I</i>','Italic')} ${b('underline','<u>U</u>','Underline')} ${b('strike','<s>S</s>','Strikethrough')}<label class="words-color"><span>A</span><input type="color" data-color="text" value="#111111"></label><label class="words-color"><span class="hl">H</span><input type="color" data-color="highlight" value="#fff59d"></label></div></div><div class="words-group"><label>Paragraph</label><div>${b('justifyLeft','≡','Align left')}${b('justifyCenter','≣','Center')}${b('justifyRight','≡','Align right')}${b('justifyFull','☰','Justify')}${b('bullets','•','Bullets')}${b('numbers','1.','Numbering')}${b('outdent','⇤','Decrease indent')}${b('indent','⇥','Increase indent')}</div></div><div class="words-group"><label>Styles</label><div><select data-format="block" class="words-select"><option value="P">Normal</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option><option value="H3">Heading 3</option><option value="BLOCKQUOTE">Quote</option></select>${b('clear','Tx','Clear formatting')}</div></div><div class="words-group"><label>Edit</label><div>${b('find','🔎','Find')}${b('replace','⇄','Replace')}</div></div></div>
        <div class="words-panel hidden" data-panel="Insert"><div class="words-group"><label>Pages</label><div>${b('pagebreak','↵ Page Break','Page break')} ${b('new','＋ New','New document')}</div></div><div class="words-group"><label>Illustrations</label><div>${b('image','🖼 Images','Insert image')} ${b('shape','◇ Shapes','Insert shape')} ${b('table','▦ Table','Insert table')}</div></div><div class="words-group"><label>Links</label><div>${b('link','🔗 Link','Insert link')}</div></div><div class="words-group"><label>Symbols</label><div>${b('symbol','Ω Symbol','Insert symbol')}</div></div></div>
        <div class="words-panel hidden" data-panel="Layout"><div class="words-group"><label>Page</label><div>${b('margins','▤ Margins','Margins')} ${b('orientation','↕ Orientation','Orientation')} ${b('columns','▥ Columns','Columns')}</div></div><div class="words-group"><label>Arrange</label><div>${b('front','⬆ Front','Bring forward')} ${b('back','⬇ Back','Send backward')} ${b('anchor','⚓ Anchor','Anchor selected object')} </div></div></div>
        <div class="words-panel hidden" data-panel="References"><div class="words-group"><label>References</label><div>${b('toc','☷ TOC','Table of contents')} ${b('footnote','¹ Footnote','Insert footnote')}</div></div></div>
        <div class="words-panel hidden" data-panel="Review"><div class="words-group"><label>Proofing</label><div>${b('count','123 Count','Word count')} ${b('readonly','🔒 Read Only','Toggle read only')}</div></div></div>
        <div class="words-panel hidden" data-panel="View"><div class="words-group"><label>Zoom</label><div>${b('zoomout','− Zoom out')} ${b('zoomin','＋ Zoom in')} ${b('zoomreset','100% Reset')}</div></div><div class="words-group"><label>Export</label><div>${b('export','⇩ Export','Export document')}</div></div></div></div>`;
    }

    function content(){return `<style>
        .words-root{height:100%;display:flex;flex-direction:column;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;--surface:#fff;--surface2:#f5f7f9;--border:#d9dde2;--text:#202124;--muted:#66707a;--accent:#3b82f6;--work:#e9edf1;--paper:#fff;color:var(--text);background:var(--work)}
        .words-root[data-theme=dark]{--surface:#25282d;--surface2:#202327;--border:#3c424a;--text:#f2f4f6;--muted:#aab2bc;--work:#15171a;--paper:#25272a}
        .words-ribbon{flex:none;background:var(--surface);border-bottom:1px solid var(--border);box-shadow:0 1px 4px rgba(0,0,0,.1);z-index:5}.words-toprow{height:45px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--border)}.words-brand{display:flex;gap:7px;align-items:center;min-width:86px;font-weight:700}.words-brand-icon{width:22px;height:22px}.words-brand-icon svg{width:22px;height:22px}.words-title-input{flex:1;max-width:520px;border:1px solid transparent;background:transparent;color:var(--text);padding:6px 8px;border-radius:5px;outline:none}.words-title-input:focus{border-color:#8ab4f8;background:var(--surface2)}.words-top-actions{margin-left:auto;display:flex;align-items:center;gap:3px}.words-top-btn{border:0;background:transparent;color:var(--text);width:30px;height:30px;border-radius:5px;cursor:pointer}.words-top-btn:hover,.words-tool:hover{background:rgba(100,120,140,.12)}.words-save-dot{width:7px;height:7px;border-radius:50%;background:transparent;margin-left:5px}.words-save-dot.dirty{background:var(--accent)}
        .words-tabs{height:34px;display:flex;align-items:end;padding:0 10px;gap:2px}.words-tab{height:34px;padding:7px 16px;border:0;border-bottom:2px solid transparent;border-radius:5px 5px 0 0;background:transparent;color:var(--text);cursor:pointer;font-size:13px}.words-tab.active{border-bottom-color:var(--accent);font-weight:650;background:rgba(59,130,246,.08)}
        .words-panel{min-height:68px;display:flex;gap:12px;padding:5px 10px 7px;overflow:auto}.words-panel.hidden{display:none}.words-group{padding:0 9px;border-right:1px solid var(--border);display:flex;flex-direction:column;justify-content:space-between;min-width:max-content}.words-group:last-child{border-right:0}.words-group>label{font-size:10px;color:var(--muted);text-align:center}.words-group>div{display:flex;align-items:center;gap:3px}.words-inline{display:flex;align-items:center;gap:3px}.words-tool{height:30px;min-width:30px;padding:0 7px;border:1px solid transparent;background:transparent;color:var(--text);border-radius:5px;cursor:pointer}.words-tool.active{background:rgba(59,130,246,.15);border-color:#8ab4f8}.words-select{height:30px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);padding:0 7px}.words-select.size{width:60px}.words-color{width:28px;height:30px;display:grid;place-items:center;position:relative;border-radius:5px}.words-color input{opacity:0;position:absolute;width:1px;height:1px}.words-color span{font-weight:700;border-bottom:3px solid var(--text)}.words-color .hl{background:#fff59d;color:#111;padding:0 3px;border:0}
        .words-workspace{flex:1;overflow:auto;padding:28px;display:flex;justify-content:center;box-sizing:border-box}.words-paper{position:relative;flex:none;width:820px;min-height:1050px;background:var(--paper);box-shadow:0 6px 28px rgba(0,0,0,.16);border:1px solid var(--border);box-sizing:border-box}.words-editor{min-height:1050px;outline:none;padding:82px;box-sizing:border-box;background:var(--paper);color:var(--text);font:16px/1.55 Arial,sans-serif}.words-editor h1{font-size:32px}.words-editor h2{font-size:25px}.words-editor h3{font-size:20px}.words-editor blockquote{border-left:4px solid #8b98a5;background:rgba(120,140,160,.08);padding:8px 14px}.words-editor table{border-collapse:collapse;width:100%}.words-editor td,.words-editor th{border:1px solid #8f99a3;padding:7px}.words-object-layer{position:absolute;inset:0;pointer-events:none}.words-object{position:absolute;box-sizing:border-box;border:1px dashed var(--accent);pointer-events:auto;cursor:move;user-select:none}.words-object.selected{border:2px solid var(--accent)}.words-object img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}.words-object-controls{position:absolute;display:none;left:0;top:-31px;background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:2px;box-shadow:0 3px 9px rgba(0,0,0,.2)}.words-object:hover .words-object-controls,.words-object.selected .words-object-controls{display:flex}.words-object-controls button{border:0;background:transparent;color:var(--text);width:24px;height:24px;cursor:pointer}.words-resize-handle{position:absolute;right:-6px;bottom:-6px;width:10px;height:10px;background:var(--accent);border-radius:2px;border:1px solid #fff;cursor:nwse-resize}.words-shape{width:100%;height:100%;background:#3b82f6;border:3px solid #2563eb;box-sizing:border-box}.words-shape-rounded-rectangle{border-radius:18px}.words-shape-circle,.words-shape-ellipse{border-radius:50%}.words-shape-triangle{border:0;clip-path:polygon(50% 0,100% 100%,0 100%)}.words-shape-arrow{border:0;clip-path:polygon(0 34%,64% 34%,64% 0,100% 50%,64% 100%,64% 66%,0 66%)}
        .words-statusbar{height:28px;flex:none;background:var(--surface2);border-top:1px solid var(--border);display:flex;align-items:center;padding:0 12px;color:var(--muted);font-size:12px}.words-status{flex:1}.words-zoom{display:flex;align-items:center;gap:5px}.words-zoom button{border:0;background:transparent;color:var(--text);cursor:pointer;width:24px;height:22px;border-radius:4px}.words-zoom button:hover{background:rgba(100,120,140,.15)}
        .words-focus-mode .words-ribbon{display:none}.words-focus-mode .words-workspace{padding-top:10px}
        @media(max-width:900px){.words-workspace{padding:10px}.words-paper{width:calc(100vw - 38px)}.words-editor{padding:55px 35px}.words-brand{min-width:auto}.words-brand span:last-child{display:none}}
    </style><div class="words-root" data-theme="light">${toolbar()}<div class="words-workspace"><div class="words-paper"><div class="words-editor" contenteditable="true" spellcheck="true">${defaultContent()}</div><div class="words-object-layer"></div></div></div><div class="words-statusbar"><span class="words-status">0 words • 0 characters</span><span>English</span><div class="words-zoom"><button data-zoom="-">−</button><span class="words-zoom-label">100%</span><button data-zoom="+">+</button></div></div></div>`}

    function insertTable(win){const editor=win.element.querySelector('.words-editor');Popup.forum('Insert Table',[{key:'rows',label:'Rows',type:'number',value:'3'},{key:'cols',label:'Columns',type:'number',value:'3'}]).then(d=>{if(!d)return;const r=Math.min(12,Math.max(1,Number(d.rows)||3)),c=Math.min(12,Math.max(1,Number(d.cols)||3));let rows='';for(let i=0;i<r;i++){rows+=`<tr>${Array.from({length:c},(_,j)=>i===0?`<th>Header ${j+1}</th>`:'<td>&nbsp;</td>').join('')}</tr>`}exec(win,'insertHTML',`<table><tbody>${rows}</tbody></table><p><br></p>`)})}
    function insertLink(win){Popup.forum('Insert Link',[{key:'url',label:'URL',type:'url',placeholder:'https://example.com'},{key:'text',label:'Text'}]).then(d=>{if(!d?.url)return;const text=d.text||d.url;exec(win,'insertHTML',`<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(text)}</a>`)})}

    function wire(win){
        const root=win.element.querySelector('.words-root'),editor=win.element.querySelector('.words-editor'),cleanups=[];
        const on=(el,ev,fn)=>{if(!el)return;el.addEventListener(ev,fn);cleanups.push(()=>el.removeEventListener(ev,fn))};
        root.querySelectorAll('.words-tab').forEach(tab=>on(tab,'click',()=>{root.querySelectorAll('.words-tab').forEach(t=>t.classList.toggle('active',t===tab));root.querySelectorAll('.words-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==tab.dataset.tab))}));
        root.querySelectorAll('[data-action]').forEach(btn=>on(btn,'click',async()=>{
            const a=btn.dataset.action;
            if(a==='new')return newDoc(win);if(a==='open')return open(win);if(a==='save')return save(win);if(a==='saveas')return save(win,true);if(a==='print'){window.print();return}if(a==='image')return insertImage(win);if(a==='shape')return insertShape(win);if(a==='table')return insertTable(win);if(a==='link')return insertLink(win);if(a==='pagebreak')return exec(win,'insertHTML','<div style="break-before:page;page-break-before:always;height:1px"></div><p><br></p>');
            if(a==='cut')return exec(win,'cut');if(a==='copy')return exec(win,'copy');if(a==='paste')return exec(win,'paste');if(a==='bold')return exec(win,'bold');if(a==='italic')return exec(win,'italic');if(a==='underline')return exec(win,'underline');if(a==='strike')return exec(win,'strikeThrough');if(a==='justifyLeft'||a==='justifyCenter'||a==='justifyRight'||a==='justifyFull')return exec(win,a);if(a==='bullets')return exec(win,'insertUnorderedList');if(a==='numbers')return exec(win,'insertOrderedList');if(a==='outdent'||a==='indent')return exec(win,a);if(a==='clear')return exec(win,'removeFormat');
            if(a==='find'){const q=await Popup.textbox('Find','Search for:');if(q)window.find(q);return}if(a==='replace'){const d=await Popup.forum('Replace',[{key:'find',label:'Find'},{key:'with',label:'Replace with'}]);if(d?.find){const text=editor.innerHTML.replaceAll(d.find,d.with||'');editor.innerHTML=text;setDirty(win,true);updateStats(win)}return}
            if(a==='margins'){const v=await Popup.pick('Margins','Select margin:',[{label:'Normal'},{label:'Narrow'},{label:'Wide'}]);if(v){const m={Normal:82,Narrow:45,Wide:125}[typeof v==='string'?v:v.label];editor.style.paddingLeft=`${m}px`;editor.style.paddingRight=`${m}px`;setDirty(win,true)}return}if(a==='orientation'){const v=await Popup.pick('Orientation','Select orientation:',['Portrait','Landscape']);if(v==='Landscape'){win.element.querySelector('.words-paper').style.width='1050px';editor.style.minHeight='820px'}else if(v==='Portrait'){win.element.querySelector('.words-paper').style.width='820px';editor.style.minHeight='1050px'}setDirty(win,true);return}
            if(a==='front'){const el=selected(win);if(el){el.style.zIndex='100';setDirty(win,true)}}if(a==='back'){const el=selected(win);if(el){el.style.zIndex='1';setDirty(win,true)}}if(a==='anchor'){const v=await Popup.pick('Anchor','Position the selected object:',['Top Left','Top Center','Top Right','Center','Bottom Left','Bottom Center','Bottom Right']);if(v)anchor(win,{['Top Left']:'TL',['Top Center']:'TC',['Top Right']:'TR',Center:'C',['Bottom Left']:'BL',['Bottom Center']:'BC',['Bottom Right']:'BR'}[v]||'TL');return}
            if(a==='columns')return Popup.info('Columns','Columns controls are reserved for a future multi-column layout engine.');if(a==='toc')return Popup.info('Table of Contents','Use Heading 1, Heading 2, and Heading 3 styles. Exported DOCX files preserve those styles.');if(a==='footnote')return exec(win,'insertHTML','<sup>[1]</sup>');if(a==='symbol')return Popup.pick('Symbol','Insert a symbol:',['©','®','™','✓','★','→','←','↑','↓','∞','±','§','¶']).then(v=>{if(v)exec(win,'insertText',v)});if(a==='count')return Popup.info('Word Count',win.element.querySelector('.words-status').textContent);if(a==='readonly'){editor.contentEditable=String(editor.contentEditable!=='true');return}if(a==='zoomout')return setZoom(win,state.zoom-10);if(a==='zoomin')return setZoom(win,state.zoom+10);if(a==='zoomreset')return setZoom(win,100);if(a==='export'){return ContextMenu.show(win.element.getBoundingClientRect().left+230,win.element.getBoundingClientRect().top+170,[{label:'Word Document (.docx)',icon:'W',action:()=>saveAsExport(win,'docx')},{label:'Legacy Word (.doc)',icon:'W',action:()=>saveAsExport(win,'doc')},{label:'HTML (.html)',icon:'H',action:()=>saveAsExport(win,'html')},{label:'Plain Text (.txt)',icon:'T',action:()=>saveAsExport(win,'txt')}])}
        }));
        const font=root.querySelector('[data-format="fontName"]'),size=root.querySelector('[data-format="fontSize"]'),block=root.querySelector('[data-format="block"]');on(font,'change',e=>exec(win,'fontName',e.target.value));on(size,'change',e=>{const m={11:2,12:3,14:3,16:4,18:4,20:5,24:5,28:6,32:6,36:7};exec(win,'fontSize',m[e.target.value]||4)});on(block,'change',e=>exec(win,'formatBlock',e.target.value));on(root.querySelector('[data-color="text"]'),'input',e=>exec(win,'foreColor',e.target.value));on(root.querySelector('[data-color="highlight"]'),'input',e=>{try{document.execCommand('hiliteColor',false,e.target.value)}catch(_){document.execCommand('backColor',false,e.target.value)}editor.dispatchEvent(new Event('input',{bubbles:true}))});
        on(editor,'input',()=>{setDirty(win,true);updateStats(win)});on(editor,'keydown',e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();save(win)}if(mod&&e.key.toLowerCase()==='n'){e.preventDefault();newDoc(win)}if(mod&&e.key.toLowerCase()==='o'){e.preventDefault();open(win)}if(mod&&e.key.toLowerCase()==='k'){e.preventDefault();insertLink(win)}});on(editor,'contextmenu',e=>{e.preventDefault();ContextMenu.show(e.clientX,e.clientY,[{label:'Undo',shortcut:'Ctrl+Z',action:()=>exec(win,'undo')},{label:'Redo',shortcut:'Ctrl+Y',action:()=>exec(win,'redo')},'separator',{label:'Insert Image',icon:'🖼',action:()=>insertImage(win)},{label:'Insert Shape',icon:'◇',action:()=>insertShape(win)},{label:'Insert Table',icon:'▦',action:()=>insertTable(win)}])});
        on(root.querySelector('.words-title-input'),'change',e=>{state.title=e.target.value.trim()||'Untitled document';setDirty(win,true)});on(root.querySelector('[data-zoom="-"]'),'click',()=>setZoom(win,state.zoom-10));on(root.querySelector('[data-zoom="+"]'),'click',()=>setZoom(win,state.zoom+10));
        const themeTimer=setInterval(()=>{const t=getTheme();if(t!==state.theme)applyTheme(win)},700);cleanups.push(()=>clearInterval(themeTimer));applyTheme(win);updateStats(win);
        return cleanups;
    }

    function setZoom(win,z){state.zoom=Math.min(200,Math.max(50,z));const ed=win.element.querySelector('.words-editor'),label=win.element.querySelector('.words-zoom-label');if(ed)ed.style.zoom=`${state.zoom/100}`;if(label)label.textContent=`${state.zoom}%`}

    function launch(){
        const win=WindowManager.createWindow(APP_ID,'Words',icon,content(),{width:1120,height:800,minWidth:700,minHeight:540,saveState:true});
        state.title='Untitled document';state.path=null;state.dirty=false;state.zoom=100;UserActivity.trackAppOpen(APP_ID);
        const cleanups=wire(win);setZoom(win,100);
        const close=win.element.querySelector('.close-btn');
        if(close){
            const handler=async e=>{if(!state.dirty)return;e.preventDefault();const ok=await Popup.confirm('Unsaved Changes','Save this document before closing Words?');if(!ok)return;if(await save(win)){cleanups.forEach(f=>f());WindowManager.closeWindow(win.id)}};
            close.addEventListener('click',handler);cleanups.push(()=>close.removeEventListener('click',handler));
        }
        return win;
    }

    return {launch};
})();

export default Words;
