import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';

const VSCode = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/><path d="M6 12L2.5 9.5 6 12z" fill="#1E90FF"/><path d="M6 12l-3.5 2.5L6 12z" fill="#1E90FF"/><path d="M21 12l-3.5 2.5V9.5L21 12z" fill="#1E90FF"/></svg>`;

    let openTabs = [];
    let activeTab = null;
    let terminalVisible = false;
    let projectRoot = ['/', 'users', 'default'];
    let termCwd = [...projectRoot];
    let termHistory = [];
    let termHistIdx = -1;
    let menuOpen = null;
    let wordWrap = false;
    let minimap = false;
    let refreshFn = null;
    let cleanupFn = null;
    let acVisible = false;
    let acItems = [];
    let acIdx = 0;
    let acWordStart = 0;

    const ICONS = {
        folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#E8A838"/></svg>`,
        folderOpen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#E8A838"/><path d="M3 12H21V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V12Z" fill="#F0C060"/></svg>`,
        file: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#6D8086"/><path d="M14 2V8H20" fill="#4A5568"/></svg>`,
        js: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#F7DF1E"/><text x="12" y="18" text-anchor="middle" fill="#323330" font-size="12" font-weight="bold">JS</text></svg>`,
        json: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#5B5B5B"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">{}</text></svg>`,
        html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#E44D26"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">&lt;/&gt;</text></svg>`,
        css: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#1572B6"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">CSS</text></svg>`,
        txt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#6D8086"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">TXT</text></svg>`,
        md: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#42A5F5"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">MD</text></svg>`
    };

    function getFileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'js') return ICONS.js;
        if (ext === 'json') return ICONS.json;
        if (ext === 'html' || ext === 'htm') return ICONS.html;
        if (ext === 'css') return ICONS.css;
        if (ext === 'md') return ICONS.md;
        if (ext === 'txt') return ICONS.txt;
        return ICONS.file;
    }

    function getLang(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'js') return 'javascript';
        if (ext === 'json') return 'json';
        if (ext === 'html' || ext === 'htm') return 'html';
        if (ext === 'css') return 'css';
        if (ext === 'md') return 'markdown';
        if (ext === 'txt') return 'plaintext';
        return 'plaintext';
    }

    const JS_KEYWORDS = ['abstract','async','await','break','case','catch','class','const','continue','debugger','default','delete','do','else','enum','export','extends','final','finally','for','from','function','if','implements','import','in','instanceof','interface','let','new','of','package','private','protected','public','return','static','super','switch','this','throw','try','typeof','var','void','while','with','yield'];
    const JS_BUILTINS = ['Array','Boolean','Date','Error','Function','JSON','Map','Math','Number','Object','Promise','Proxy','RegExp','Set','String','Symbol','console','document','window','navigator','fetch','setTimeout','setInterval','clearTimeout','clearInterval','parseInt','parseFloat','isNaN','undefined','null','true','false','NaN','Infinity','globalThis'];
    const JS_METHODS = ['log','warn','error','info','debug','table','dir','clear','createElement','getElementById','querySelector','querySelectorAll','addEventListener','removeEventListener','appendChild','removeChild','insertBefore','replaceChild','cloneNode','textContent','innerHTML','outerHTML','style','classList','className','setAttribute','getAttribute','removeAttribute','hasAttribute','closest','matches','scrollIntoView','getBoundingClientRect','focus','blur','click','forEach','map','filter','reduce','find','some','every','includes','indexOf','lastIndexOf','keys','values','entries','push','pop','shift','unshift','splice','slice','concat','join','split','replace','trim','toLowerCase','toUpperCase','charAt','startsWith','endsWith','repeat','padStart','padEnd','substring','toString','parse','stringify','assign','freeze','now','getDate','getDay','getFullYear','getHours','getMinutes','getMonth','getSeconds','getTime','setDate','setFullYear','setHours','setMinutes','setMonth','setSeconds','setTime','toDateString','toISOString','toJSON','toLocaleDateString','toLocaleTimeString'];
    const CSS_PROPERTIES = ['align-content','align-items','align-self','animation','background','background-color','background-image','background-position','background-repeat','background-size','border','border-color','border-radius','border-style','border-width','bottom','box-shadow','box-sizing','clear','clip','color','column-count','column-gap','content','cursor','direction','display','filter','flex','flex-basis','flex-direction','flex-flow','flex-grow','flex-shrink','flex-wrap','float','font','font-family','font-size','font-style','font-weight','gap','grid','grid-area','grid-column','grid-row','grid-template','height','justify-content','left','letter-spacing','line-height','list-style','margin','max-height','max-width','min-height','min-width','opacity','order','outline','overflow','padding','position','resize','right','text-align','text-decoration','text-indent','text-overflow','text-shadow','text-transform','top','transform','transition','vertical-align','visibility','white-space','width','word-break','word-spacing','word-wrap','z-index'];
    const CSS_VALUES = ['auto','inherit','initial','none','normal','center','left','right','top','bottom','solid','dashed','dotted','absolute','relative','fixed','sticky','block','inline','inline-block','flex','grid','hidden','visible','scroll','nowrap','pre','pre-wrap','bold','italic','uppercase','lowercase','capitalize','pointer','default','not-allowed','transparent','currentColor'];
    const HTML_TAGS = ['a','abbr','address','area','article','aside','audio','b','base','bdi','bdo','blockquote','body','br','button','canvas','caption','cite','code','col','colgroup','data','datalist','dd','del','details','dfn','dialog','div','dl','dt','em','embed','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','head','header','hr','html','i','iframe','img','input','ins','kbd','label','legend','li','link','main','map','mark','meta','meter','nav','noscript','object','ol','optgroup','option','output','p','param','picture','pre','progress','q','rp','rt','ruby','s','samp','script','section','select','small','source','span','strong','style','sub','summary','sup','table','tbody','td','template','textarea','tfoot','th','thead','time','title','tr','track','u','ul','var','video','wbr'];
    const HTML_ATTRS = ['accept','action','alt','autocomplete','autofocus','checked','class','cols','colspan','content','controls','crossorigin','data','datetime','default','defer','dir','disabled','download','draggable','enctype','hidden','href','hreflang','id','inputmode','integrity','kind','lang','list','loading','loop','max','maxlength','media','method','min','minlength','multiple','muted','name','novalidate','open','pattern','placeholder','playsinline','poster','preload','readonly','referrerpolicy','rel','required','role','rows','rowspan','sandbox','scope','selected','shape','size','sizes','slot','span','spellcheck','src','srcdoc','srclang','srcset','start','step','style','tabindex','target','title','translate','type','usemap','value','width','wrap'];

    const AC_COLORS = { keyword: '#569CD6', builtin: '#4EC9B0', method: '#DCDCAA', property: '#9CDCFE', value: '#CE9178', tag: '#569CD6', attribute: '#9CDCFE' };

    function getSuggestions(word, lang) {
        if (!word || word.length < 1) return [];
        const lower = word.toLowerCase();
        let items = [];
        if (lang === 'javascript') {
            JS_KEYWORDS.forEach(kw => items.push({ text: kw, type: 'keyword' }));
            JS_BUILTINS.forEach(kw => items.push({ text: kw, type: 'builtin' }));
            JS_METHODS.forEach(kw => items.push({ text: kw, type: 'method' }));
        } else if (lang === 'css') {
            CSS_PROPERTIES.forEach(kw => items.push({ text: kw, type: 'property' }));
            CSS_VALUES.forEach(kw => items.push({ text: kw, type: 'value' }));
        } else if (lang === 'html') {
            HTML_TAGS.forEach(kw => items.push({ text: kw, type: 'tag' }));
            HTML_ATTRS.forEach(kw => items.push({ text: kw, type: 'attribute' }));
        }
        return items.filter(item => item.text.toLowerCase().startsWith(lower)).slice(0, 12);
    }

    function highlightCode(code, lang) {
        if (lang === 'javascript') {
            let result = code;
            result = result.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|new|this|try|catch|throw|async|await|switch|case|break|continue|typeof|instanceof|null|undefined|true|false)\b/g, m => `%%KW%%${m}%%/KW%%`);
            result = result.replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g, m => `%%STR%%${m}%%/STR%%`);
            result = result.replace(/(\/\/[^\n]*)/g, m => `%%CMT%%${m}%%/CMT%%`);
            result = result.replace(/\b(\d+\.?\d*)\b/g, m => `%%NUM%%${m}%%/NUM%%`);
            result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            result = result.replace(/%%KW%%(.*?)%%\/KW%%/g, '<span style="color:#569CD6">$1</span>');
            result = result.replace(/%%STR%%(.*?)%%\/STR%%/g, '<span style="color:#CE9178">$1</span>');
            result = result.replace(/%%CMT%%(.*?)%%\/CMT%%/g, '<span style="color:#6A9955">$1</span>');
            result = result.replace(/%%NUM%%(.*?)%%\/NUM%%/g, '<span style="color:#B5CEA8">$1</span>');
            return result;
        } else if (lang === 'json') {
            let result = code;
            result = result.replace(/("[\w\s]*")\s*:/g, m => `%%KEY%%${m}%%/KEY%%`);
            result = result.replace(/:\s*("(?:[^"\\]|\\.)*")/g, m => `%%STR%%${m}%%/STR%%`);
            result = result.replace(/:\s*(\d+\.?\d*)/g, (m, n) => `: %%NUM%%${n}%%/NUM%%`);
            result = result.replace(/:\s*(true|false|null)/g, (m, kw) => `: %%KW%%${kw}%%/KW%%`);
            result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            result = result.replace(/%%KEY%%(.*?)%%\/KEY%%/g, '<span style="color:#9CDCFE">$1</span>');
            result = result.replace(/%%STR%%(.*?)%%\/STR%%/g, '<span style="color:#CE9178">$1</span>');
            result = result.replace(/%%NUM%%(.*?)%%\/NUM%%/g, '<span style="color:#B5CEA8">$1</span>');
            result = result.replace(/%%KW%%(.*?)%%\/KW%%/g, '<span style="color:#569CD6">$1</span>');
            return result;
        } else if (lang === 'html') {
            let result = code;
            result = result.replace(/(&lt;\/?)([\w-]+)/g, (m, bracket, tag) => `%%TAG%%${bracket}%%/TAG%%%%TN%%${tag}%%/TN%%`);
            result = result.replace(/\s([\w-]+)(=)/g, (m, attr, eq) => ` %%ATTR%%${attr}%%/ATTR%%${eq}`);
            result = result.replace(/"([^"]*)"/g, m => `%%VAL%%${m}%%/VAL%%`);
            result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            result = result.replace(/%%TAG%%(.*?)%%\/TAG%%/g, '<span style="color:#569CD6">$1</span>');
            result = result.replace(/%%TN%%(.*?)%%\/TN%%/g, '<span style="color:#569CD6">$1</span>');
            result = result.replace(/%%ATTR%%(.*?)%%\/ATTR%%/g, '<span style="color:#9CDCFE">$1</span>');
            result = result.replace(/%%VAL%%(.*?)%%\/VAL%%/g, '<span style="color:#CE9178">$1</span>');
            return result;
        } else if (lang === 'css') {
            let result = code;
            result = result.replace(/([\w.-]+)(?=\s*\{)/g, m => `%%SEL%%${m}%%/SEL%%`);
            result = result.replace(/([\w-]+)\s*:/g, (m, prop) => `%%PROP%%${prop}%%/PROP%%:`);
            result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            result = result.replace(/%%SEL%%(.*?)%%\/SEL%%/g, '<span style="color:#D7BA7D">$1</span>');
            result = result.replace(/%%PROP%%(.*?)%%\/PROP%%/g, '<span style="color:#9CDCFE">$1</span>');
            return result;
        } else if (lang === 'markdown') {
            let result = code;
            result = result.replace(/^(#{1,3}\s.+)$/gm, m => `%%HD%%${m}%%/HD%%`);
            result = result.replace(/(\*\*[^*]+\*\*)/g, m => `%%BOLD%%${m}%%/BOLD%%`);
            result = result.replace(/(`[^`]+`)/g, m => `%%CODE%%${m}%%/CODE%%`);
            result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            result = result.replace(/%%HD%%(.*?)%%\/HD%%/g, '<span style="color:#569CD6;font-weight:bold">$1</span>');
            result = result.replace(/%%BOLD%%(.*?)%%\/BOLD%%/g, '<span style="font-weight:bold">$1</span>');
            result = result.replace(/%%CODE%%(.*?)%%\/CODE%%/g, '<span style="color:#CE9178">$1</span>');
            return result;
        }
        return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function buildTree(path) {
        const node = FileSystem.getNode(path);
        if (!node || node.type !== 'folder' || !node.children) return '';
        const entries = [];
        for (const [name, item] of Object.entries(node.children)) {
            if (name.startsWith('.')) continue;
            entries.push({ name, item, path: [...path, name] });
        }
        entries.sort((a, b) => {
            if (a.item.type === 'folder' && b.item.type !== 'folder') return -1;
            if (a.item.type !== 'folder' && b.item.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
        return entries.map(e => {
            if (e.item.type === 'folder') {
                const children = buildTree(e.path);
                return `            <div class="fs-folder" data-path="${e.path.join('/')}">
                    <div class="fs-item fs-folder-toggle" style="display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;font-size:12px;color:#ccc;border-radius:3px;" data-path="${e.path.join('/')}">
                        <span class="fs-arrow" style="font-size:10px;color:#888;transition:transform 0.15s;">&#9654;</span>
                        <span class="fs-icon">${ICONS.folder}</span>
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</span>
                    </div>
                    <div class="fs-children" style="display:none;padding-left:16px;">${children}</div>
                </div>`;
            }
            return `<div class="fs-file fs-item" data-path="${e.path.join('/')}" style="display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;font-size:12px;color:#ccc;border-radius:3px;">
                <span>${getFileIcon(e.name)}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</span>
            </div>`;
        }).join('');
    }

    function launch() {
        if (cleanupFn) cleanupFn();
        openTabs = [];
        activeTab = null;
        terminalVisible = false;
        projectRoot = ['/', 'users', 'default'];
        termCwd = [...projectRoot];
        termHistory = [];
        termHistIdx = -1;
        menuOpen = null;
        wordWrap = false;
        minimap = false;

        const win = WindowManager.createWindow('vscode', 'Visual Studio Code', icon, '', {
            width: 950, height: 620, minWidth: 500, minHeight: 350
        });
        const el = win.element;
        const body = el.querySelector('.window-body');
        body.style.cssText = 'margin:0;padding:0;display:flex;flex-direction:column;height:100%;overflow:hidden;background:#1e1e1e;color:#cccccc;font-family:"Segoe UI",system-ui,sans-serif;font-size:13px;';

        body.innerHTML = `
            <div class="vsc-topbar" style="display:flex;align-items:center;height:32px;background:#323233;border-bottom:1px solid #3c3c3c;padding:0 8px;gap:2px;flex-shrink:0;position:relative;">
                <span class="vsc-menu-item" data-menu="file" style="font-size:11px;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;">File</span>
                <span class="vsc-menu-item" data-menu="edit" style="font-size:11px;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;">Edit</span>
                <span class="vsc-menu-item" data-menu="selection" style="font-size:11px;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;">Selection</span>
                <span class="vsc-menu-item" data-menu="view" style="font-size:11px;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;">View</span>
                <span class="vsc-menu-item" data-menu="run" style="font-size:11px;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;">Run</span>
                <span class="vsc-menu-item" data-menu="help" style="font-size:11px;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;">Help</span>
            </div>
            <div class="vsc-menu-dropdown" style="display:none;position:absolute;top:32px;left:0;background:#252526;border:1px solid #3c3c3c;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.4);z-index:9999;min-width:220px;padding:4px 0;"></div>
            <div class="vsc-main" style="display:flex;flex:1;overflow:hidden;">
                <div class="vsc-activitybar" style="width:48px;background:#333333;display:flex;flex-direction:column;align-items:center;padding-top:4px;flex-shrink:0;border-right:1px solid #3c3c3c;">
                    <div class="vsc-ab-btn active" data-panel="explorer" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-left:2px solid #0078D4;color:#fff;margin-bottom:2px;" title="Explorer">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="currentColor"/></svg>
                    </div>
                    <div class="vsc-ab-btn" data-panel="search" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-left:2px solid transparent;color:#858585;margin-bottom:2px;" title="Search">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    <div style="flex:1;"></div>
                    <div class="vsc-ab-btn" data-panel="settings" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-left:2px solid transparent;color:#858585;" title="Settings">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </div>
                </div>
                <div class="vsc-sidebar" style="width:220px;background:#252526;border-right:1px solid #3c3c3c;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;">
                    <div class="vsc-sidebar-header" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;color:#999;letter-spacing:0.5px;display:flex;align-items:center;justify-content:space-between;">
                        <span class="vsc-project-label">EXPLORER</span>
                        <span class="vsc-project-root" style="font-size:10px;font-weight:400;color:#666;text-transform:none;cursor:pointer;" title="Change project root">~/default</span>
                    </div>
                    <div class="vsc-sidebar-content" style="flex:1;overflow-y:auto;padding:0 4px;"></div>
                </div>
                <div class="vsc-editor-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                    <div class="vsc-tabs" style="display:flex;background:#252526;border-bottom:1px solid #3c3c3c;overflow-x:auto;flex-shrink:0;"></div>
                    <div class="vsc-editor" style="flex:1;overflow:auto;background:#1e1e1e;position:relative;">
                        <div class="vsc-welcome" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#555;gap:12px;">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/></svg>
                            <div style="font-size:18px;font-weight:300;">Visual Studio Code</div>
                            <div style="font-size:12px;color:#444;">Open a file from the explorer to start editing</div>
                        </div>
                    </div>
                    <div class="vsc-terminal-panel" style="display:none;flex-direction:column;border-top:1px solid #3c3c3c;height:200px;flex-shrink:0;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:#1e1e1e;border-bottom:1px solid #3c3c3c;">
                            <div style="display:flex;gap:12px;">
                                <span style="font-size:11px;font-weight:600;color:#ccc;cursor:pointer;border-bottom:2px solid #0078D4;padding-bottom:2px;">Terminal</span>
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button class="vsc-term-clear" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;" title="Clear">⌫</button>
                                <button class="vsc-term-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;" title="Close">✕</button>
                            </div>
                        </div>
                        <div class="vsc-term-output" style="flex:1;overflow-y:auto;padding:8px 12px;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:12px;color:#ccc;white-space:pre-wrap;word-break:break-all;line-height:1.4;"></div>
                        <div style="display:flex;padding:4px 12px 8px;align-items:center;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:12px;">
                            <span class="vsc-term-prompt" style="color:#569CD6;white-space:pre;"></span>
                            <input class="vsc-term-input" type="text" style="flex:1;background:transparent;border:none;outline:none;color:#ccc;font-family:inherit;font-size:inherit;caret-color:#ccc;margin-left:4px;" spellcheck="false" autocomplete="off">
                        </div>
                    </div>
                </div>
            </div>
            <div class="vsc-statusbar" style="height:22px;background:#0078D4;display:flex;align-items:center;padding:0 10px;font-size:11px;color:white;flex-shrink:0;">
                <span class="vsc-status-lang">Plain Text</span>
                <span style="flex:1;"></span>
                <span class="vsc-status-pos">Ln 1, Col 1</span>
            </div>
        `;

        const sidebarContent = body.querySelector('.vsc-sidebar-content');
        sidebarContent.innerHTML = buildTree(projectRoot);

        function refreshTree() {
            sidebarContent.innerHTML = buildTree(projectRoot);
            setupFileTreeEvents(el);
            refreshFn = refreshTree;
        }

        function refreshSidebar(view) {
            const sidebarHeader = el.querySelector('.vsc-sidebar-header');
            if (view === 'explorer') {
                sidebarContent.innerHTML = buildTree(projectRoot);
                setupFileTreeEvents(el);
                sidebarHeader.querySelector('.vsc-project-label').textContent = 'EXPLORER';
            } else if (view === 'search') {
                sidebarContent.innerHTML = `
                    <div style="padding:8px;">
                        <input type="text" placeholder="Search" style="width:100%;padding:6px 10px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;font-size:12px;outline:none;margin-bottom:8px;box-sizing:border-box;">
                        <div style="font-size:11px;color:#888;">Type to search across files</div>
                    </div>
                `;
                sidebarHeader.querySelector('.vsc-project-label').textContent = 'SEARCH';
            }
        }

        setupFileTreeEvents(el);
        setupActivityBar(el, refreshSidebar);
        setupTerminal(el);
        setupEditorEvents(el);
        setupMenus(el);
    }

    function setupFileTreeEvents(el) {
        el.querySelectorAll('.fs-folder-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const arrow = toggle.querySelector('.fs-arrow');
                const icon = toggle.querySelector('.fs-icon');
                const children = toggle.nextElementSibling;
                if (children.style.display === 'none') {
                    children.style.display = 'block';
                    arrow.style.transform = 'rotate(90deg)';
                    if (icon) icon.innerHTML = ICONS.folderOpen;
                } else {
                    children.style.display = 'none';
                    arrow.style.transform = 'rotate(0deg)';
                    if (icon) icon.innerHTML = ICONS.folder;
                }
            });
            toggle.addEventListener('mouseenter', () => toggle.style.background = 'rgba(255,255,255,0.08)');
            toggle.addEventListener('mouseleave', () => toggle.style.background = '');
        });

        el.querySelectorAll('.fs-file').forEach(file => {
            file.addEventListener('click', () => {
                el.querySelectorAll('.fs-file').forEach(f => f.style.background = '');
                file.style.background = 'rgba(255,255,255,0.1)';
                const path = file.dataset.path.split('/').filter(Boolean);
                openFile(el, path);
            });
            file.addEventListener('mouseenter', () => { if (!file.style.background) file.style.background = 'rgba(255,255,255,0.05)'; });
            file.addEventListener('mouseleave', () => { if (file.style.background === 'rgba(255,255,255,0.05)') file.style.background = ''; });
        });
    }

    function openFile(el, pathArr) {
        const pathStr = pathArr.join('/');
        let tab = openTabs.find(t => t.path === pathStr);
        if (!tab) {
            const content = FileSystem.readFile(pathArr) || '';
            tab = { path: pathStr, name: pathArr[pathArr.length - 1], content, original: content, modified: false };
            openTabs.push(tab);
        }
        activeTab = tab;
        renderTabs(el);
        renderEditor(el);
    }

    function renderTabs(el) {
        const tabsContainer = el.querySelector('.vsc-tabs');
        tabsContainer.innerHTML = openTabs.map(t => {
            const isActive = t === activeTab;
            const dot = t.modified ? '<span style="width:6px;height:6px;background:#E8A838;border-radius:50%;margin-left:6px;"></span>' : '';
            return `<div class="vsc-tab" data-path="${t.path}" style="display:flex;align-items:center;gap:6px;padding:0 12px;height:32px;font-size:12px;cursor:pointer;white-space:nowrap;border-right:1px solid #3c3c3c;${isActive ? 'background:#1e1e1e;border-bottom:2px solid #0078D4;color:#fff;' : 'background:#2d2d2d;color:#969696;'}">
                <span>${getFileIcon(t.name)}</span>
                <span>${t.name}</span>
                ${dot}
                <span class="vsc-tab-close" data-path="${t.path}" style="margin-left:4px;color:#888;cursor:pointer;font-size:12px;padding:2px;border-radius:3px;">&times;</span>
            </div>`;
        }).join('');

        tabsContainer.querySelectorAll('.vsc-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('vsc-tab-close')) return;
                const path = tab.dataset.path;
                activeTab = openTabs.find(t => t.path === path);
                renderTabs(el);
                renderEditor(el);
            });
        });

        tabsContainer.querySelectorAll('.vsc-tab-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const path = btn.dataset.path;
                openTabs = openTabs.filter(t => t.path !== path);
                if (activeTab && activeTab.path === path) {
                    activeTab = openTabs[openTabs.length - 1] || null;
                }
                renderTabs(el);
                renderEditor(el);
            });
        });
    }

    function renderEditor(el) {
        const editor = el.querySelector('.vsc-editor');
        const statusLang = el.querySelector('.vsc-status-lang');
        const statusPos = el.querySelector('.vsc-status-pos');

        if (!activeTab) {
            editor.innerHTML = `<div class="vsc-welcome" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#555;gap:12px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/></svg>
                <div style="font-size:18px;font-weight:300;">Visual Studio Code</div>
                <div style="font-size:12px;color:#444;">Open a file from the explorer to start editing</div>
            </div>`;
            statusLang.textContent = 'Plain Text';
            statusPos.textContent = '';
            return;
        }

        const lang = getLang(activeTab.name);
        const lines = activeTab.content.split('\n');
        const highlighted = highlightCode(activeTab.content, lang);

        editor.innerHTML = `<div style="display:flex;height:100%;">
            <div class="vsc-line-numbers" style="padding:8px 0;text-align:right;color:#858585;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:13px;line-height:1.5;min-width:50px;padding-right:12px;padding-left:12px;user-select:none;border-right:1px solid #3c3c3c;overflow:hidden;">${lines.map((_, i) => `<div>${i + 1}</div>`).join('')}</div>
            <div class="vsc-code-wrapper" style="flex:1;overflow:auto;position:relative;">
                <textarea class="vsc-code-input" style="position:absolute;top:0;left:0;width:100%;height:100%;background:transparent;color:transparent;caret-color:#aeafad;border:none;outline:none;resize:none;padding:8px 12px;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:13px;line-height:1.5;white-space:pre;overflow:hidden;tab-size:4;z-index:2;" spellcheck="false" autocomplete="off">${activeTab.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                <pre class="vsc-code-display" style="margin:0;padding:8px 12px;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:13px;line-height:1.5;white-space:pre;overflow:hidden;tab-size:4;z-index:1;pointer-events:none;">${highlighted}</pre>
                <div class="vsc-autocomplete" style="display:none;position:absolute;background:#252526;border:1px solid #454545;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.4);z-index:10;max-height:240px;overflow-y:auto;min-width:220px;font-family:'Cascadia Mono','Consolas',monospace;font-size:13px;"></div>
            </div>
        </div>`;

        statusLang.textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
        statusPos.textContent = `Ln 1, Col 1`;

        const textarea = editor.querySelector('.vsc-code-input');
        const display = editor.querySelector('.vsc-code-display');
        const codeWrapper = editor.querySelector('.vsc-code-wrapper');
        const lineNumbers = el.querySelector('.vsc-line-numbers');
        const acPopup = codeWrapper.querySelector('.vsc-autocomplete');

        function syncScroll() {
            display.scrollTop = textarea.scrollTop;
            display.scrollLeft = textarea.scrollLeft;
            lineNumbers.scrollTop = textarea.scrollTop;
            positionAcPopup(textarea, acPopup);
        }
        textarea.addEventListener('scroll', syncScroll);

        textarea.addEventListener('input', () => {
            activeTab.content = textarea.value;
            activeTab.modified = activeTab.content !== activeTab.original;
            display.innerHTML = highlightCode(activeTab.content, lang);
            const pos = getCursorPos(textarea);
            statusPos.textContent = `Ln ${pos.line}, Col ${pos.col}`;
            renderTabs(el);
            if (lang !== 'plaintext') {
                const ac = getAcWord(textarea);
                acWordStart = ac.start;
                const suggestions = getSuggestions(ac.word, lang);
                if (suggestions.length > 0 && ac.word.length > 0) {
                    showAcPopup(acPopup, suggestions);
                    positionAcPopup(textarea, acPopup);
                } else {
                    hideAcPopup(acPopup);
                }
            }
        });

        textarea.addEventListener('click', () => {
            const pos = getCursorPos(textarea);
            statusPos.textContent = `Ln ${pos.line}, Col ${pos.col}`;
            hideAcPopup(acPopup);
        });

        textarea.addEventListener('keyup', () => {
            const pos = getCursorPos(textarea);
            statusPos.textContent = `Ln ${pos.line}, Col ${pos.col}`;
        });

        textarea.addEventListener('keydown', (e) => {
            if (acVisible) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    acIdx = (acIdx + 1) % acItems.length;
                    renderAcPopup(acPopup);
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    acIdx = (acIdx - 1 + acItems.length) % acItems.length;
                    renderAcPopup(acPopup);
                    return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    insertAcSuggestion(textarea, acPopup);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    hideAcPopup(acPopup);
                    return;
                }
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
                textarea.dispatchEvent(new Event('input'));
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                const ta = el.querySelector('.vsc-code-input');
                if (ta && activeTab) activeTab.content = ta.value;
                saveCurrentFile(el);
            }
        });

        textarea.focus();
    }

    function getCursorPos(textarea) {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        return { line: lines.length, col: lines[lines.length - 1].length + 1 };
    }

    function getAcWord(textarea) {
        const pos = textarea.selectionStart;
        const text = textarea.value;
        let start = pos;
        while (start > 0 && /[\w$]/.test(text[start - 1])) start--;
        return { word: text.substring(start, pos), start };
    }

    function showAcPopup(popup, items) {
        acItems = items;
        acIdx = 0;
        acVisible = true;
        renderAcPopup(popup);
        popup.style.display = 'block';
    }

    function hideAcPopup(popup) {
        acVisible = false;
        acItems = [];
        if (popup) popup.style.display = 'none';
    }

    function renderAcPopup(popup) {
        popup.innerHTML = acItems.map((item, i) => {
            const color = AC_COLORS[item.type] || '#ccc';
            const bg = i === acIdx ? '#094771' : 'transparent';
            const fg = i === acIdx ? '#fff' : color;
            const typeLabel = item.type.charAt(0).toUpperCase();
            return `<div class="vsc-ac-item" data-idx="${i}" style="padding:3px 8px;cursor:pointer;display:flex;align-items:center;gap:6px;background:${bg};color:${fg};font-size:12px;">
                <span style="font-size:9px;color:${i === acIdx ? '#aaa' : '#555'};min-width:14px;text-align:center;border:1px solid ${i === acIdx ? '#555' : '#333'};border-radius:2px;padding:0 2px;">${typeLabel}</span>
                <span>${item.text}</span>
            </div>`;
        }).join('');
        popup.querySelectorAll('.vsc-ac-item').forEach(el => {
            el.addEventListener('mouseenter', () => { acIdx = parseInt(el.dataset.idx); renderAcPopup(popup); });
            el.addEventListener('mousedown', (e) => { e.preventDefault(); acIdx = parseInt(el.dataset.idx); });
        });
    }

    function positionAcPopup(textarea, popup) {
        if (!acVisible || !popup) return;
        const pos = textarea.selectionStart;
        const text = textarea.value.substring(0, pos);
        const lineNum = text.split('\n').length;
        const lineHeight = 19.5;
        let top = 8 + lineNum * lineHeight;
        let left = 62;
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
        const wrapper = textarea.parentElement;
        const visibleBottom = wrapper.scrollTop + wrapper.clientHeight;
        if (top + popup.offsetHeight > visibleBottom) {
            top = 8 + (lineNum - 1) * lineHeight - popup.offsetHeight;
            if (top < wrapper.scrollTop) top = wrapper.scrollTop;
            popup.style.top = top + 'px';
        }
        const visibleRight = wrapper.scrollLeft + wrapper.clientWidth;
        if (left + popup.offsetWidth > visibleRight) {
            left = visibleRight - popup.offsetWidth - 8;
            if (left < 0) left = 8;
            popup.style.left = left + 'px';
        }
    }

    function insertAcSuggestion(textarea, popup) {
        if (!acVisible || acItems.length === 0) return false;
        const item = acItems[acIdx];
        const before = textarea.value.substring(0, acWordStart);
        const after = textarea.value.substring(textarea.selectionStart);
        textarea.value = before + item.text + after;
        textarea.selectionStart = textarea.selectionEnd = acWordStart + item.text.length;
        hideAcPopup(popup);
        textarea.dispatchEvent(new Event('input'));
        return true;
    }

    function saveCurrentFile(el) {
        if (!activeTab) return;
        const pathArr = activeTab.path.split('/').filter(Boolean);
        const parentPath = pathArr.slice(0, -1);
        const fileName = pathArr[pathArr.length - 1];

        if (FileSystem.itemExists(pathArr)) {
            FileSystem.writeFile(pathArr, activeTab.content);
        } else if (FileSystem.itemExists(parentPath)) {
            FileSystem.createFile(parentPath, fileName, activeTab.content);
        }
        activeTab.original = activeTab.content;
        activeTab.modified = false;
        renderTabs(el);
    }

    function setupEditorEvents(el) {
        el.querySelector('.vsc-editor-area').addEventListener('click', (e) => {
            if (e.target.classList.contains('vsc-tab') || e.target.closest('.vsc-tab')) return;
        });
    }

    function setupActivityBar(el, refreshSidebar) {
        el.querySelectorAll('.vsc-ab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.dataset.panel;
                if (panel === 'settings') {
                    const Settings = window._vscodeSettingsRef;
                    if (Settings) Settings.launch();
                    return;
                }
                el.querySelectorAll('.vsc-ab-btn').forEach(b => {
                    b.style.borderLeftColor = 'transparent';
                    b.style.color = '#858585';
                    b.classList.remove('active');
                });
                btn.style.borderLeftColor = '#0078D4';
                btn.style.color = '#fff';
                btn.classList.add('active');
                if (panel === 'explorer' || panel === 'search') {
                    refreshSidebar(panel);
                }
            });
        });
    }

    function setupTerminal(el) {
        const termPanel = el.querySelector('.vsc-terminal-panel');
        const termOutput = el.querySelector('.vsc-term-output');
        const termInput = el.querySelector('.vsc-term-input');
        const termPrompt = el.querySelector('.vsc-term-prompt');

        function toggleTerminal() {
            terminalVisible = !terminalVisible;
            termPanel.style.display = terminalVisible ? 'flex' : 'none';
            if (terminalVisible) {
                termInput.focus();
                updateTermPrompt();
            }
        }

        function updateTermPrompt() {
            const p = termCwd.join('/').replace('//', '/');
            const home = '/users/default';
            const short = p === home ? '~' : '~' + p.replace(home, '');
            termPrompt.textContent = `${short} > `;
        }

        function termPrint(text) {
            termOutput.textContent += text + '\n';
            termOutput.scrollTop = termOutput.scrollHeight;
        }

        function resolveTermPath(input) {
            if (!input) return [...termCwd];
            let parts;
            if (input.startsWith('/')) {
                parts = input.split('/').filter(Boolean);
            } else if (input.startsWith('~/')) {
                parts = ['/', 'users', 'default', ...input.slice(2).split('/').filter(Boolean)];
            } else {
                parts = [...termCwd, ...input.split('/').filter(Boolean)];
            }
            const resolved = [];
            for (const p of parts) {
                if (p === '.') continue;
                if (p === '..') { resolved.pop(); continue; }
                resolved.push(p);
            }
            return resolved;
        }

        termInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = termInput.value.trim();
                termInput.value = '';
                termPrint(`${termPrompt.textContent}${cmd}`);
                if (cmd) {
                    termHistory.push(cmd);
                    termHistIdx = termHistory.length;
                }
                processTermCmd(cmd, el);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (termHistIdx > 0) {
                    termHistIdx--;
                    termInput.value = termHistory[termHistIdx] || '';
                }
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (termHistIdx < termHistory.length - 1) {
                    termHistIdx++;
                    termInput.value = termHistory[termHistIdx] || '';
                } else {
                    termHistIdx = termHistory.length;
                    termInput.value = '';
                }
            }
        });

        el.querySelector('.vsc-term-clear').addEventListener('click', () => {
            termOutput.textContent = '';
        });

        el.querySelector('.vsc-term-close').addEventListener('click', () => {
            terminalVisible = false;
            termPanel.style.display = 'none';
        });

        function processTermCmd(cmd, el) {
            if (!cmd) return;
            const parts = cmd.split(/\s+/);
            const command = parts[0].toLowerCase();
            const args = parts.slice(1);

            switch (command) {
                case 'ls': {
                    const target = args[0] ? resolveTermPath(args[0]) : [...termCwd];
                    const node = FileSystem.getNode(target);
                    if (!node || node.type !== 'folder') { termPrint(`ls: cannot access '${args[0] || '.'}': No such directory`); break; }
                    const items = Object.keys(node.children || {}).filter(n => !n.startsWith('.'));
                    const colored = items.map(n => (node.children[n].type === 'folder') ? `\x1b[34m${n}\x1b[0m` : n);
                    termPrint(colored.join('  '));
                    break;
                }
                case 'cd': {
                    if (!args[0] || args[0] === '~') {
                        termCwd = [...projectRoot];
                    } else if (args[0] === '/') {
                        termCwd = ['/'];
                    } else {
                        const target = resolveTermPath(args[0]);
                        const node = FileSystem.getNode(target);
                        if (!node || node.type !== 'folder') { termPrint(`cd: no such file or directory: ${args[0]}`); break; }
                        termCwd = target;
                    }
                    updateTermPrompt();
                    break;
                }
                case 'pwd':
                    termPrint(termCwd.join('/'));
                    break;
                case 'cat': {
                    if (!args[0]) { termPrint('cat: missing file operand'); break; }
                    const target = resolveTermPath(args[0]);
                    const content = FileSystem.readFile(target);
                    if (content === null) { termPrint(`cat: ${args[0]}: No such file`); break; }
                    termPrint(content);
                    break;
                }
                case 'mkdir': {
                    if (!args[0]) { termPrint('mkdir: missing operand'); break; }
                    const target = resolveTermPath(args[0]);
                    const parent = target.slice(0, -1);
                    const name = target[target.length - 1];
                    if (!FileSystem.itemExists(parent)) { termPrint(`mkdir: cannot create directory '${args[0]}': No such file or directory`); break; }
                    FileSystem.createFolder(parent, name);
                    termPrint(`Created directory: ${args[0]}`);
                    refreshTree();
                    break;
                }
                case 'touch':
                case 'write': {
                    if (!args[0]) { termPrint(`${command}: missing file operand`); break; }
                    const target = resolveTermPath(args[0]);
                    const parent = target.slice(0, -1);
                    const name = target[target.length - 1];
                    const content = args.slice(1).join(' ');
                    if (!FileSystem.itemExists(parent)) { termPrint(`${command}: cannot create '${args[0]}': No such file or directory`); break; }
                    if (FileSystem.itemExists(target)) {
                        FileSystem.writeFile(target, content);
                    } else {
                        FileSystem.createFile(parent, name, content);
                    }
                    termPrint(`Written: ${args[0]}`);
                    refreshTree();
                    break;
                }
                case 'rm': {
                    if (!args[0]) { termPrint('rm: missing operand'); break; }
                    const target = resolveTermPath(args[0]);
                    if (!FileSystem.itemExists(target)) { termPrint(`rm: ${args[0]}: No such file`); break; }
                    FileSystem.deleteItem(target);
                    termPrint(`Removed: ${args[0]}`);
                    openTabs = openTabs.filter(t => t.path !== target.join('/'));
                    if (activeTab && activeTab.path === target.join('/')) {
                        activeTab = openTabs[openTabs.length - 1] || null;
                        renderTabs(el);
                        renderEditor(el);
                    }
                    refreshTree();
                    break;
                }
                case 'clear':
                    termOutput.textContent = '';
                    break;
                case 'echo':
                    termPrint(args.join(' '));
                    break;
                case 'help':
                    termPrint('Available commands: ls, cd, pwd, cat, mkdir, touch, rm, echo, clear, help');
                    break;
                default:
                    termPrint(`${command}: command not found. Type 'help' for available commands.`);
            }
        }

        el.querySelector('.vsc-statusbar').addEventListener('dblclick', toggleTerminal);

        el.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                toggleTerminal();
            }
        });
    }

    function setupMenus(el) {
        const menus = {
            file: [
                { label: 'New File', shortcut: 'Ctrl+N', action: () => promptNewFile(el) },
                { label: 'New Folder', shortcut: 'Ctrl+Shift+N', action: () => promptNewFolder(el) },
                { label: 'Open Folder...', shortcut: 'Ctrl+K Ctrl+O', action: () => promptOpenFolder(el) },
                'separator',
                { label: 'Save', shortcut: 'Ctrl+S', action: () => saveCurrentFile(el) },
                { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => promptSaveAs(el) },
                { label: 'Save All', shortcut: 'Ctrl+K S', action: () => saveAllFiles(el) },
                'separator',
                { label: 'Close Editor', shortcut: 'Ctrl+W', action: () => closeActiveTab(el) },
                { label: 'Close All', shortcut: 'Ctrl+K Ctrl+W', action: () => closeAllTabs(el) }
            ],
            edit: [
                { label: 'Undo', shortcut: 'Ctrl+Z', action: () => document.execCommand('undo') },
                { label: 'Redo', shortcut: 'Ctrl+Y', action: () => document.execCommand('redo') },
                'separator',
                { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
                { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
                { label: 'Paste', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
                'separator',
                { label: 'Find', shortcut: 'Ctrl+F', action: () => {} },
                { label: 'Replace', shortcut: 'Ctrl+H', action: () => {} }
            ],
            selection: [
                { label: 'Select All', shortcut: 'Ctrl+A', action: () => { const ta = el.querySelector('.vsc-code-input'); if (ta) ta.select(); } },
                { label: 'Expand Selection', shortcut: 'Shift+Alt+→', action: () => {} },
                { label: 'Shrink Selection', shortcut: 'Shift+Alt+←', action: () => {} }
            ],
            view: [
                { label: 'Command Palette...', shortcut: 'Ctrl+Shift+P', action: () => {} },
                'separator',
                { label: 'Explorer', shortcut: 'Ctrl+Shift+E', action: () => togglePanel(el, 'explorer') },
                { label: 'Search', shortcut: 'Ctrl+Shift+F', action: () => togglePanel(el, 'search') },
                { label: 'Terminal', shortcut: 'Ctrl+`', action: () => toggleTerminalPanel(el) },
                'separator',
                { label: 'Word Wrap', shortcut: 'Alt+Z', action: () => toggleWordWrap(el), checked: () => wordWrap },
                { label: 'Minimap', action: () => toggleMinimap(el), checked: () => minimap },
                'separator',
                { label: 'Zoom In', shortcut: 'Ctrl+=', action: () => { el.style.fontSize = (parseInt(el.style.fontSize || 13) + 1) + 'px'; } },
                { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => { el.style.fontSize = Math.max(10, parseInt(el.style.fontSize || 13) - 1) + 'px'; } },
                { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: () => { el.style.fontSize = '13px'; } }
            ],
            run: [
                { label: 'Run Without Debugging', shortcut: 'Ctrl+F5', action: () => {} },
                { label: 'Start Debugging', shortcut: 'F5', action: () => {} },
                'separator',
                { label: 'Stop Debugging', shortcut: 'Shift+F5', action: () => {} },
                { label: 'Restart Debugging', shortcut: 'Ctrl+Shift+F5', action: () => {} }
            ],
            help: [
                { label: 'Welcome', action: () => {} },
                { label: 'Documentation', action: () => {} },
                'separator',
                { label: 'Release Notes', action: () => {} },
                'separator',
                { label: 'About Visual Studio Code', action: () => showAbout(el) }
            ]
        };

        const dropdown = el.querySelector('.vsc-menu-dropdown');

        el.querySelectorAll('.vsc-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const menuId = item.dataset.menu;
                if (menuOpen === menuId) {
                    closeMenu();
                    return;
                }
                openMenu(menuId, item, el);
            });
            item.addEventListener('mouseenter', () => {
                if (menuOpen) {
                    const menuId = item.dataset.menu;
                    openMenu(menuId, item, el);
                }
            });
        });

        function openMenu(menuId, anchor, el) {
            menuOpen = menuId;
            const items = menus[menuId];
            if (!items) return;

            el.querySelectorAll('.vsc-menu-item').forEach(mi => {
                mi.style.background = mi.dataset.menu === menuId ? 'rgba(255,255,255,0.1)' : '';
            });

            dropdown.innerHTML = items.map(item => {
                if (item === 'separator') {
                    return '<div style="height:1px;background:#3c3c3c;margin:4px 8px;"></div>';
                }
                const checked = item.checked && item.checked() ? '&#10003; ' : '';
                return `<div class="vsc-menu-entry" style="display:flex;align-items:center;justify-content:space-between;padding:6px 16px;font-size:12px;color:#ccc;cursor:pointer;border-radius:4px;margin:0 4px;" data-action="${item.label}">
                    <span>${checked}${item.label}</span>
                    ${item.shortcut ? `<span style="color:#888;font-size:11px;margin-left:24px;">${item.shortcut}</span>` : ''}
                </div>`;
            }).join('');

            dropdown.querySelectorAll('.vsc-menu-entry').forEach(entry => {
                entry.addEventListener('mouseenter', () => entry.style.background = 'rgba(255,255,255,0.08)');
                entry.addEventListener('mouseleave', () => entry.style.background = '');
                entry.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const actionName = entry.dataset.action;
                    const menuItem = items.find(i => i !== 'separator' && i.label === actionName);
                    if (menuItem && menuItem.action) menuItem.action();
                    closeMenu();
                });
            });

            const rect = anchor.getBoundingClientRect();
            const bodyRect = el.querySelector('.window-body').getBoundingClientRect();
            dropdown.style.left = (rect.left - bodyRect.left) + 'px';
            dropdown.style.display = 'block';
        }

        function closeMenu() {
            menuOpen = null;
            dropdown.style.display = 'none';
            el.querySelectorAll('.vsc-menu-item').forEach(mi => mi.style.background = '');
        }

        document.addEventListener('click', closeMenu);
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        cleanupFn = () => document.removeEventListener('click', closeMenu);

        el.querySelector('.vsc-project-root').addEventListener('click', () => promptOpenFolder(el));
    }

    function togglePanel(el, panel) {
        const btn = el.querySelector(`.vsc-ab-btn[data-panel="${panel}"]`);
        if (btn) btn.click();
    }

    function toggleTerminalPanel(el) {
        const termPanel = el.querySelector('.vsc-terminal-panel');
        terminalVisible = !terminalVisible;
        termPanel.style.display = terminalVisible ? 'flex' : 'none';
        if (terminalVisible) el.querySelector('.vsc-term-input').focus();
    }

    function toggleWordWrap(el) {
        wordWrap = !wordWrap;
        const textarea = el.querySelector('.vsc-code-input');
        const display = el.querySelector('.vsc-code-display');
        if (textarea) textarea.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';
        if (display) display.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';
    }

    function toggleMinimap(el) {
        minimap = !minimap;
    }

    function closeActiveTab(el) {
        if (!activeTab) return;
        openTabs = openTabs.filter(t => t !== activeTab);
        activeTab = openTabs[openTabs.length - 1] || null;
        renderTabs(el);
        renderEditor(el);
    }

    function closeAllTabs(el) {
        openTabs = [];
        activeTab = null;
        renderTabs(el);
        renderEditor(el);
    }

    function saveAllFiles(el) {
        openTabs.forEach(tab => {
            if (tab.modified) {
                const pathArr = tab.path.split('/').filter(Boolean);
                if (FileSystem.itemExists(pathArr)) {
                    FileSystem.writeFile(pathArr, tab.content);
                } else {
                    const parentPath = pathArr.slice(0, -1);
                    if (FileSystem.itemExists(parentPath)) {
                        FileSystem.createFile(parentPath, pathArr[pathArr.length - 1], tab.content);
                    }
                }
                tab.original = tab.content;
                tab.modified = false;
            }
        });
        renderTabs(el);
    }

    function promptNewFile(el) {
        const dropdown = el.querySelector('.vsc-menu-dropdown');
        dropdown.style.display = 'none';
        menuOpen = null;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#252526;border:1px solid #3c3c3c;border-radius:8px;padding:20px;width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="font-size:14px;font-weight:600;color:#ccc;margin-bottom:12px;">New File</div>
                <div style="font-size:12px;color:#888;margin-bottom:8px;">Enter file name (relative to project root):</div>
                <input type="text" class="vsc-new-file-input" style="width:100%;padding:8px 12px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;font-size:13px;outline:none;margin-bottom:12px;box-sizing:border-box;" placeholder="example.js" autofocus>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button class="vsc-new-file-cancel" style="padding:6px 14px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:12px;">Cancel</button>
                    <button class="vsc-new-file-create" style="padding:6px 14px;background:#0078D4;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;font-weight:500;">Create</button>
                </div>
            </div>
        `;
        el.appendChild(overlay);

        const input = overlay.querySelector('.vsc-new-file-input');
        input.focus();

        function close() { overlay.remove(); }

        overlay.querySelector('.vsc-new-file-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('.vsc-new-file-create').addEventListener('click', () => {
            const name = input.value.trim();
            if (!name) return;
            const pathArr = [...projectRoot, ...name.split('/')];
            const parentPath = pathArr.slice(0, -1);
            if (!FileSystem.itemExists(parentPath)) {
                return;
            }
            FileSystem.createFile(parentPath, pathArr[pathArr.length - 1], '');
            close();
            if (refreshFn) refreshFn();
            openFile(el, pathArr);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') overlay.querySelector('.vsc-new-file-create').click();
            if (e.key === 'Escape') close();
        });
    }

    function promptNewFolder(el) {
        const dropdown = el.querySelector('.vsc-menu-dropdown');
        dropdown.style.display = 'none';
        menuOpen = null;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#252526;border:1px solid #3c3c3c;border-radius:8px;padding:20px;width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="font-size:14px;font-weight:600;color:#ccc;margin-bottom:12px;">New Folder</div>
                <div style="font-size:12px;color:#888;margin-bottom:8px;">Enter folder name (relative to project root):</div>
                <input type="text" class="vsc-new-folder-input" style="width:100%;padding:8px 12px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;font-size:13px;outline:none;margin-bottom:12px;box-sizing:border-box;" placeholder="new-folder" autofocus>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button class="vsc-new-folder-cancel" style="padding:6px 14px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:12px;">Cancel</button>
                    <button class="vsc-new-folder-create" style="padding:6px 14px;background:#0078D4;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;font-weight:500;">Create</button>
                </div>
            </div>
        `;
        el.appendChild(overlay);

        const input = overlay.querySelector('.vsc-new-folder-input');
        input.focus();

        function close() { overlay.remove(); }

        overlay.querySelector('.vsc-new-folder-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('.vsc-new-folder-create').addEventListener('click', () => {
            const name = input.value.trim();
            if (!name) return;
            const pathArr = [...projectRoot, ...name.split('/')];
            const parentPath = pathArr.slice(0, -1);
            if (!FileSystem.itemExists(parentPath)) {
                return;
            }
            FileSystem.createFolder(parentPath, pathArr[pathArr.length - 1]);
            close();
            if (refreshFn) refreshFn();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') overlay.querySelector('.vsc-new-folder-create').click();
            if (e.key === 'Escape') close();
        });
    }

    function promptSaveAs(el) {
        if (!activeTab) return;
        const dropdown = el.querySelector('.vsc-menu-dropdown');
        dropdown.style.display = 'none';
        menuOpen = null;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#252526;border:1px solid #3c3c3c;border-radius:8px;padding:20px;width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="font-size:14px;font-weight:600;color:#ccc;margin-bottom:12px;">Save As</div>
                <div style="font-size:12px;color:#888;margin-bottom:8px;">Enter new file path (relative to project root):</div>
                <input type="text" class="vsc-saveas-input" style="width:100%;padding:8px 12px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;font-size:13px;outline:none;margin-bottom:12px;box-sizing:border-box;" value="${activeTab.name.replace(/"/g, '&quot;')}" autofocus>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button class="vsc-saveas-cancel" style="padding:6px 14px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:12px;">Cancel</button>
                    <button class="vsc-saveas-save" style="padding:6px 14px;background:#0078D4;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;font-weight:500;">Save</button>
                </div>
            </div>
        `;
        el.appendChild(overlay);

        const input = overlay.querySelector('.vsc-saveas-input');
        input.focus();
        input.select();

        function close() { overlay.remove(); }

        overlay.querySelector('.vsc-saveas-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('.vsc-saveas-save').addEventListener('click', () => {
            const name = input.value.trim();
            if (!name) return;
            const pathArr = [...projectRoot, ...name.split('/')];
            const parentPath = pathArr.slice(0, -1);
            if (!FileSystem.itemExists(parentPath)) {
                return;
            }
            if (FileSystem.itemExists(pathArr)) {
                FileSystem.writeFile(pathArr, activeTab.content);
            } else {
                FileSystem.createFile(parentPath, pathArr[pathArr.length - 1], activeTab.content);
            }
            activeTab.path = pathArr.join('/');
            activeTab.name = pathArr[pathArr.length - 1];
            activeTab.original = activeTab.content;
            activeTab.modified = false;
            close();
            if (refreshFn) refreshFn();
            renderTabs(el);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') overlay.querySelector('.vsc-saveas-save').click();
            if (e.key === 'Escape') close();
        });
    }

    function promptOpenFolder(el) {
        const dropdown = el.querySelector('.vsc-menu-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        menuOpen = null;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#252526;border:1px solid #3c3c3c;border-radius:8px;padding:20px;width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="font-size:14px;font-weight:600;color:#ccc;margin-bottom:12px;">Open Folder</div>
                <div style="font-size:12px;color:#888;margin-bottom:8px;">Enter folder path to open as project root:</div>
                <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
                    <span class="vsc-folder-shortcut" data-path="/users/default" style="padding:4px 10px;background:#3c3c3c;border:1px solid #555;border-radius:4px;font-size:11px;color:#aaa;cursor:pointer;">~/default</span>
                    <span class="vsc-folder-shortcut" data-path="/users/default/Desktop" style="padding:4px 10px;background:#3c3c3c;border:1px solid #555;border-radius:4px;font-size:11px;color:#aaa;cursor:pointer;">~/Desktop</span>
                    <span class="vsc-folder-shortcut" data-path="/users/default/Documents" style="padding:4px 10px;background:#3c3c3c;border:1px solid #555;border-radius:4px;font-size:11px;color:#aaa;cursor:pointer;">~/Documents</span>
                    <span class="vsc-folder-shortcut" data-path="/users/default/Documents/Projects" style="padding:4px 10px;background:#3c3c3c;border:1px solid #555;border-radius:4px;font-size:11px;color:#aaa;cursor:pointer;">~/Projects</span>
                    <span class="vsc-folder-shortcut" data-path="/" style="padding:4px 10px;background:#3c3c3c;border:1px solid #555;border-radius:4px;font-size:11px;color:#aaa;cursor:pointer;">/ (root)</span>
                </div>
                <input type="text" class="vsc-folder-input" style="width:100%;padding:8px 12px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;font-size:13px;outline:none;margin-bottom:12px;box-sizing:border-box;" value="${projectRoot.join('/').replace(/"/g, '&quot;')}" autofocus>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button class="vsc-folder-cancel" style="padding:6px 14px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:12px;">Cancel</button>
                    <button class="vsc-folder-open" style="padding:6px 14px;background:#0078D4;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;font-weight:500;">Open</button>
                </div>
            </div>
        `;
        el.appendChild(overlay);

        const input = overlay.querySelector('.vsc-folder-input');
        input.focus();
        input.select();

        overlay.querySelectorAll('.vsc-folder-shortcut').forEach(btn => {
            btn.addEventListener('click', () => {
                input.value = btn.dataset.path;
            });
            btn.addEventListener('mouseenter', () => btn.style.background = '#4a4a4a');
            btn.addEventListener('mouseleave', () => btn.style.background = '#3c3c3c');
        });

        function close() { overlay.remove(); }

        overlay.querySelector('.vsc-folder-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('.vsc-folder-open').addEventListener('click', () => {
            const val = input.value.trim();
            if (!val) return;
            const parts = val.split('/').filter(Boolean);
            projectRoot = ['/', ...parts];
            termCwd = [...projectRoot];
            el.querySelector('.vsc-project-root').textContent = val;
            close();
            if (refreshFn) refreshFn();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') overlay.querySelector('.vsc-folder-open').click();
            if (e.key === 'Escape') close();
        });
    }

    function showAbout(el) {
        const dropdown = el.querySelector('.vsc-menu-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        menuOpen = null;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#252526;border:1px solid #3c3c3c;border-radius:8px;padding:24px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.5);text-align:center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin-bottom:12px;"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/></svg>
                <div style="font-size:16px;font-weight:600;color:#ccc;margin-bottom:4px;">Visual Studio Code</div>
                <div style="font-size:12px;color:#888;margin-bottom:12px;">Windows 12 Edition</div>
                <div style="font-size:11px;color:#666;line-height:1.6;">
                    Version 1.0.0<br>
                    Electron: Web Browser<br>
                    OS: Windows 12 Web Simulation
                </div>
                <button class="vsc-about-close" style="margin-top:16px;padding:6px 20px;background:#0078D4;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;">OK</button>
            </div>
        `;
        el.appendChild(overlay);
        overlay.querySelector('.vsc-about-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    return { launch, icon };
})();

export default VSCode;
