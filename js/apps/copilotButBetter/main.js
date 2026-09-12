// CopilotButBetter — ChatGPT-style AI chat powered by the user's own Gemini API key.
// Features: conversation saving, long-term memory, customizable settings page,
// liquid-glass ChatGPT-like theme. Persistence via FileSystem only.
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import Notifications from '../../modules/notifications.js';

const CopilotButBetter = (() => {
    const APP_ID = 'copilotButBetter';
    const DATA_PATH = ['/', 'system', 'programs data', 'copilotButBetter'];
    const SETTINGS_FILE = 'settings.json';
    const CONVS_FILE = 'conversations.json';

    const DEFAULT_SETTINGS = {
        apiKey: '',
        model: 'gemini-2.0-flash',
        customModel: '',
        systemPrompt: 'You are CopilotButBetter, a helpful, friendly AI assistant. Answer clearly and concisely with markdown formatting where useful.',
        temperature: 0.7,
        maxTokens: 2048,
        memoryEnabled: true,
        memory: [],
        accent: '#10a37f',
        glass: 0.65,
        enterToSend: true
    };

    const MODELS = [
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-flash-lite'
    ];

    const SUGGESTIONS = [
        { title: 'Write', desc: 'a haiku about glass and light' },
        { title: 'Explain', desc: 'quantum computing in simple terms' },
        { title: 'Plan', desc: 'a productive morning routine' },
        { title: 'Debug', desc: 'this JavaScript snippet for me' }
    ];

    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_PATH)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], APP_ID);
        }
    }

    function readJson(name, fallback) {
        try {
            ensureDataDir();
            const raw = FileSystem.readFile([...DATA_PATH, name]);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    function writeJson(name, value) {
        ensureDataDir();
        const json = JSON.stringify(value);
        const p = [...DATA_PATH, name];
        if (FileSystem.itemExists(p)) FileSystem.writeFile(p, json);
        else FileSystem.createFile(DATA_PATH, name, json, 'json');
    }

    function loadSettings() {
        return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
    }

    function saveSettings(s) {
        writeJson(SETTINGS_FILE, s);
    }

    function loadConvs() {
        const c = readJson(CONVS_FILE, []);
        return Array.isArray(c) ? c : [];
    }

    function saveConvs(c) {
        writeJson(CONVS_FILE, c);
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Tiny markdown renderer: code blocks, inline code, bold, italic, headings, lists, links.
    function renderMarkdown(src) {
        let text = String(src || '');
        const blocks = [];
        text = text.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (m, lang, code) => {
            blocks.push({ lang: lang || 'code', code: code.replace(/\n$/, '') });
            return `\u0000BLOCK${blocks.length - 1}\u0000`;
        });
        let html = esc(text);
        html = html
            .replace(/^### (.*)$/gm, '<div class="cbb-h3">$1</div>')
            .replace(/^## (.*)$/gm, '<div class="cbb-h2">$1</div>')
            .replace(/^# (.*)$/gm, '<div class="cbb-h1">$1</div>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
            .replace(/`([^`\n]+)`/g, '<code class="cbb-inline">$1</code>')
            .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/^(?:-|\*) (.+)$/gm, '<div class="cbb-li"><span class="cbb-dot"></span><span>$1</span></div>')
            .replace(/^\d+\. (.+)$/gm, '<div class="cbb-li cbb-num"><span>$1</span></div>');
        html = html.replace(/\n{2,}/g, '<div style="height:8px"></div>').replace(/\n/g, '<br>');
        html = html.replace(/\u0000BLOCK(\d+)\u0000/g, (m, i) => {
            const b = blocks[parseInt(i, 10)];
            return `<div class="cbb-code"><div class="cbb-code-head"><span>${esc(b.lang)}</span>` +
                `<button class="cbb-copy" data-code="${esc(b.code).replace(/&#10;/g, '&#10;')}">Copy</button></div>` +
                `<pre>${esc(b.code)}</pre></div>`;
        });
        return html;
    }

    function effectiveModel(s) {
        return (s.customModel || '').trim() || s.model;
    }

    async function callGemini(settings, messages) {
        const key = (settings.apiKey || '').trim();
        if (!key) throw new Error('No API key set. Open Settings and paste your Gemini API key.');
        const model = effectiveModel(settings);
        const memBlock = (settings.memoryEnabled && settings.memory.length)
            ? `\n\n[Long-term memory about the user — use it to personalize replies]:\n- ${settings.memory.join('\n- ')}`
            : '';
        const sysText = (settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt) + memBlock;
        const contents = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: sysText }] },
                contents,
                generationConfig: {
                    temperature: Number(settings.temperature) || 0.7,
                    maxOutputTokens: Math.max(1, parseInt(settings.maxTokens, 10) || 2048)
                }
            })
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* fall through */ }
        if (!res.ok) {
            const msg = (data && data.error && data.error.message) ? data.error.message : `HTTP ${res.status}`;
            throw new Error(msg);
        }
        const parts = data && data.candidates && data.candidates[0] &&
            data.candidates[0].content && data.candidates[0].content.parts;
        const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '';
        if (!text.trim()) throw new Error('Empty response from the model. Try a different model or prompt.');
        return text;
    }

    function css() {
        return `
        <style>
        .cbb-root{--acc:#10a37f;--glass:0.65;--mx:70%;--my:12%;display:flex;height:100%;background:#212121;color:#ececec;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;}
        .cbb-side{width:264px;flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 40%,rgba(0,0,0,.25)),rgba(23,23,23,.78);backdrop-filter:blur(22px) saturate(170%);-webkit-backdrop-filter:blur(22px) saturate(170%);border-right:1px solid rgba(255,255,255,.12);position:relative;z-index:2;}
        .cbb-side::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.14),transparent 22%);}
        .cbb-brand{display:flex;align-items:center;gap:10px;padding:14px 14px 8px;}
        .cbb-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.45),inset 0 1px 1px rgba(255,255,255,.45);font-size:17px;color:#fff;animation:cbb-breathe 4s ease-in-out infinite;}
        @keyframes cbb-breathe{0%,100%{box-shadow:0 4px 16px rgba(0,0,0,.45),inset 0 1px 1px rgba(255,255,255,.45);}50%{box-shadow:0 4px 26px rgba(255,255,255,.22),inset 0 1px 1px rgba(255,255,255,.55);}}
        .cbb-brand b{font-size:13.5px;letter-spacing:.2px;}
        .cbb-brand small{display:block;color:#b4b4b4;font-size:11px;font-weight:400;}
        .cbb-new{margin:6px 12px 4px;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);cursor:pointer;color:#fff;font-weight:600;font-size:13px;background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.06));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 6px 18px rgba(0,0,0,.35);transition:.15s;}
        .cbb-new:hover{border-color:var(--acc);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 0 0 1px var(--acc),0 8px 22px rgba(0,0,0,.4);}
        .cbb-search{margin:6px 12px;padding:0 10px;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;}
        .cbb-search input{flex:1;background:transparent;border:none;outline:none;color:#ececec;font-size:12.5px;padding:8px 0;}
        .cbb-search input::placeholder{color:#8e8e8e;}
        .cbb-list{flex:1;overflow:auto;padding:6px 8px 12px;display:flex;flex-direction:column;gap:2px;}
        .cbb-date{font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;color:#8e8e8e;padding:10px 8px 4px;}
        .cbb-item{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:10px;cursor:pointer;font-size:13px;color:#d7d7d7;border:1px solid transparent;white-space:nowrap;position:relative;overflow:hidden;transition:background .15s,transform .15s,border-color .15s;}
        .cbb-item span{flex:1;overflow:hidden;text-overflow:ellipsis;}
        .cbb-item:hover{background:rgba(255,255,255,.08);transform:translateX(2px);}
        .cbb-item.active{background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border-color:rgba(255,255,255,.16);backdrop-filter:blur(10px);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);}
        .cbb-item .x{opacity:0;border:none;background:transparent;color:#999;cursor:pointer;font-size:14px;padding:0 2px;border-radius:6px;}
        .cbb-item:hover .x{opacity:1;} .cbb-item .x:hover{color:#ff7b7b;background:rgba(255,255,255,.1);}
        .cbb-foot{padding:10px 12px;border-top:1px solid rgba(255,255,255,.1);display:flex;gap:6px;}
        .cbb-foot button{flex:1;padding:8px 4px;font-size:12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#ddd;cursor:pointer;backdrop-filter:blur(10px);}
        .cbb-foot button:hover{border-color:var(--acc);color:#fff;}
        .cbb-main{flex:1;display:flex;flex-direction:column;min-width:0;background:radial-gradient(900px 480px at 70% -10%,rgba(255,255,255,.06),transparent 60%),#212121;position:relative;overflow:hidden;}
        .cbb-aurora{position:absolute;inset:-15%;pointer-events:none;z-index:0;background:radial-gradient(460px 460px at var(--mx) var(--my),rgba(255,255,255,.08),transparent 62%),radial-gradient(700px 500px at 15% 110%,rgba(255,255,255,.045),transparent 60%);filter:blur(6px);transition:background .12s linear;}
        .cbb-main>*:not(.cbb-aurora){position:relative;z-index:1;}
        .cbb-top{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.09);background:rgba(33,33,33,calc(var(--glass) * .55));backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);position:relative;z-index:2;}
        .cbb-top::after{content:'';position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);}
        .cbb-modelpill{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:linear-gradient(135deg,rgba(255,255,255,.18),rgba(255,255,255,.05));backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}
        .cbb-modelpill i{width:8px;height:8px;border-radius:50%;background:var(--acc);box-shadow:0 0 10px var(--acc);}
        .cbb-title{flex:1;text-align:center;font-size:13px;color:#b4b4b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .cbb-iconbtn{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#e6e6e6;cursor:pointer;font-size:16px;backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;}
        .cbb-iconbtn:hover{border-color:var(--acc);}
        .cbb-msgs{flex:1;overflow:auto;padding:26px 18px 10px;}
        .cbb-col{max-width:780px;margin:0 auto;display:flex;flex-direction:column;gap:18px;padding-bottom:10px;}
        .cbb-hero{text-align:center;padding:38px 10px 6px;animation:cbb-fade .5s ease both;}
        @keyframes cbb-fade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
        .cbb-hero .big{width:64px;height:64px;margin:0 auto 14px;border-radius:20px;background:linear-gradient(135deg,rgba(255,255,255,.28),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.3);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;font-size:30px;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.5),inset 0 2px 2px rgba(255,255,255,.5);animation:cbb-breathe 4s ease-in-out infinite;transition:transform .15s ease-out;will-change:transform;}
        .cbb-hero h1{font-size:30px;font-weight:600;margin:0 0 18px;letter-spacing:-.5px;background:linear-gradient(180deg,#ffffff,#a9a9a9);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .cbb-sugg{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:640px;margin:0 auto;text-align:left;perspective:600px;}
        .cbb-sugg button{padding:13px 15px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(135deg,rgba(255,255,255,.13),rgba(255,255,255,.03));backdrop-filter:blur(14px);color:#ececec;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.25);transition:border-color .15s,transform .15s ease-out,box-shadow .15s;text-align:left;position:relative;overflow:hidden;will-change:transform;}
        .cbb-sugg button:hover{border-color:rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 10px 28px rgba(0,0,0,.45);}
        .cbb-sugg b{display:block;font-size:13.5px;} .cbb-sugg span{font-size:12.5px;color:#a8a8a8;}
        .cbb-row{display:flex;gap:12px;align-items:flex-start;animation:cbb-in .38s cubic-bezier(.2,.7,.3,1) both;}
        @keyframes cbb-in{from{opacity:0;transform:translateY(10px) scale(.99);}to{opacity:1;transform:none;}}
        .cbb-col>.cbb-row:nth-child(2){animation-delay:.04s;} .cbb-col>.cbb-row:nth-child(3){animation-delay:.08s;}
        .cbb-col>.cbb-row:nth-child(4){animation-delay:.12s;} .cbb-col>.cbb-row:nth-child(n+5){animation-delay:.16s;}
        .cbb-row.user{justify-content:flex-end;}
        .cbb-avatar{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;background:linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.07));border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.45),0 4px 14px rgba(0,0,0,.4);}
        .cbb-ubub{max-width:75%;padding:11px 16px;border-radius:20px 20px 6px 20px;font-size:14.5px;line-height:1.55;background:linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.07));border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 24px rgba(0,0,0,.3);word-wrap:break-word;position:relative;overflow:hidden;transition:border-color .15s,transform .15s;}
        .cbb-abub{flex:1;min-width:0;padding:14px 18px;border-radius:6px 20px 20px 20px;font-size:14.5px;line-height:1.65;background:linear-gradient(135deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(calc(10px + var(--glass) * 10px));-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 8px 24px rgba(0,0,0,.25);word-wrap:break-word;position:relative;overflow:hidden;transition:border-color .15s;}
        .cbb-abub::after,.cbb-ubub::after,.cbb-sugg button::after,.cbb-box::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s;background:radial-gradient(240px 240px at var(--bx,50%) var(--by,50%),rgba(255,255,255,.16),transparent 65%);}
        .cbb-abub:hover::after,.cbb-ubub:hover::after,.cbb-sugg button:hover::after,.cbb-box:hover::after,.cbb-box:focus-within::after{opacity:1;}
        .cbb-abub:hover{border-color:rgba(255,255,255,.26);} .cbb-ubub:hover{border-color:rgba(255,255,255,.34);}
        .cbb-abub::before{content:'';position:absolute;top:0;left:12px;right:12px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);pointer-events:none;}
        .cbb-abub.error{border-color:rgba(255,90,90,.5);}
        .cbb-h1{font-size:19px;font-weight:700;margin:8px 0 4px;} .cbb-h2{font-size:17px;font-weight:700;margin:8px 0 4px;} .cbb-h3{font-size:15px;font-weight:700;margin:8px 0 4px;}
        .cbb-inline{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);padding:1px 6px;border-radius:6px;font-family:Consolas,monospace;font-size:13px;}
        .cbb-li{display:flex;gap:8px;margin:4px 0;} .cbb-dot{width:6px;height:6px;border-radius:50%;background:var(--acc);margin-top:8px;flex-shrink:0;}
        .cbb-code{margin:10px 0;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.5);}
        .cbb-code-head{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;font-size:11.5px;color:#a8a8a8;background:rgba(255,255,255,.06);}
        .cbb-copy{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#ddd;border-radius:7px;font-size:11px;padding:3px 10px;cursor:pointer;}
        .cbb-copy:hover{border-color:var(--acc);color:#fff;}
        .cbb-code pre{margin:0;padding:12px 14px;overflow:auto;font-family:Consolas,monospace;font-size:13px;line-height:1.5;color:#e8e8e8;}
        .cbb-msgacts{display:flex;gap:4px;margin-top:8px;}
        .cbb-msgacts button{border:none;background:transparent;color:#8e8e8e;cursor:pointer;font-size:12px;padding:4px 8px;border-radius:7px;}
        .cbb-msgacts button:hover{background:rgba(255,255,255,.1);color:#fff;}
        .cbb-typing{display:flex;gap:5px;padding:16px 4px;}
        .cbb-typing i{width:8px;height:8px;border-radius:50%;background:#b4b4b4;animation:cbb-b 1.2s infinite;}
        .cbb-typing i:nth-child(2){animation-delay:.15s;} .cbb-typing i:nth-child(3){animation-delay:.3s;}
        @keyframes cbb-b{0%,60%,100%{transform:none;opacity:.4;}30%{transform:translateY(-5px);opacity:1;}}
        .cbb-compwrap{padding:10px 18px 6px;} .cbb-comp{max-width:780px;margin:0 auto;}
        .cbb-box{display:flex;align-items:flex-end;gap:10px;padding:10px 10px 10px 18px;border-radius:28px;border:1px solid rgba(255,255,255,.22);background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.05));backdrop-filter:blur(24px) saturate(170%);-webkit-backdrop-filter:blur(24px) saturate(170%);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -1px 0 rgba(0,0,0,.2),0 12px 34px rgba(0,0,0,.4);position:relative;overflow:hidden;transition:border-color .15s,box-shadow .15s,transform .15s;}
        .cbb-box:focus-within{border-color:var(--acc);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 0 0 1px var(--acc),0 12px 34px rgba(0,0,0,.45);}
        .cbb-box textarea{flex:1;background:transparent;border:none;outline:none;resize:none;color:#ececec;font-size:14.5px;font-family:inherit;max-height:160px;padding:6px 0;line-height:1.5;}
        .cbb-box textarea::placeholder{color:#8e8e8e;}
        .cbb-send{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.35);cursor:pointer;font-size:16px;color:#fff;background:linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.08));box-shadow:0 4px 14px rgba(0,0,0,.4),inset 0 1px 1px rgba(255,255,255,.45);flex-shrink:0;transition:transform .12s,box-shadow .15s,border-color .15s;}
        .cbb-send:hover:not(:disabled){border-color:var(--acc);box-shadow:0 4px 18px rgba(0,0,0,.45),0 0 14px color-mix(in srgb,var(--acc) 60%,transparent),inset 0 1px 1px rgba(255,255,255,.5);transform:translateY(-1px);}
        .cbb-send:active:not(:disabled){transform:scale(.9);}
        .cbb-new:active,.cbb-mini:active,.cbb-iconbtn:active{transform:scale(.94);}
        .cbb-new,.cbb-mini,.cbb-iconbtn{transition:transform .12s,border-color .15s,box-shadow .15s;}
        .cbb-send:disabled{opacity:.4;cursor:default;}
        .cbb-stop{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font-size:13px;flex-shrink:0;}
        .cbb-hint{text-align:center;font-size:11.5px;color:#8e8e8e;padding:6px 0 10px;}
        .cbb-set{position:absolute;inset:0;z-index:5;display:flex;background:rgba(15,15,15,.55);backdrop-filter:blur(6px);}
        .cbb-set.hidden{display:none;}
        .cbb-panel{width:520px;max-width:92%;margin:auto;max-height:88%;overflow:auto;border-radius:20px;padding:24px 26px;background:linear-gradient(150deg,rgba(60,60,60,.92),rgba(30,30,30,.94));border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(30px) saturate(170%);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 30px 80px rgba(0,0,0,.6);position:relative;}
        .cbb-panel::before{content:'';position:absolute;top:0;left:24px;right:24px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);}
        .cbb-panel h2{margin:0 0 2px;font-size:18px;} .cbb-panel .sub{font-size:12.5px;color:#a8a8a8;margin-bottom:16px;}
        .cbb-sec{margin-bottom:18px;padding:14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);}
        .cbb-sec h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.7px;color:var(--acc);}
        .cbb-sec label{display:block;font-size:12.5px;color:#c9c9c9;margin:10px 0 5px;}
        .cbb-sec input[type=text],.cbb-sec input[type=password],.cbb-sec select,.cbb-sec textarea{width:100%;box-sizing:border-box;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:10px;color:#ececec;font-size:13px;padding:9px 11px;outline:none;font-family:inherit;}
        .cbb-sec input:focus,.cbb-sec select:focus,.cbb-sec textarea:focus{border-color:var(--acc);}
        .cbb-sec select option{background:#2b2b2b;}
        .cbb-rowline{display:flex;gap:8px;} .cbb-rowline>*{flex:1;}
        .cbb-keyrow{display:flex;gap:8px;} .cbb-keyrow input{flex:1;}
        .cbb-mini{padding:8px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#eee;cursor:pointer;font-size:12.5px;white-space:nowrap;}
        .cbb-mini:hover{border-color:var(--acc);} .cbb-mini.danger:hover{border-color:#ff6b6b;color:#ffb3b3;}
        .cbb-mini.primary{background:linear-gradient(135deg,var(--acc),#0ea5e9);border:none;font-weight:600;}
        input[type=range].cbb-range{width:100%;accent-color:var(--acc);}
        .cbb-swatches{display:flex;gap:8px;margin-top:6px;}
        .cbb-sw{width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid transparent;}
        .cbb-sw.sel{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.3);}
        .cbb-mem{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:7px 10px;font-size:12.5px;margin-top:6px;}
        .cbb-mem span{flex:1;} .cbb-mem button{border:none;background:transparent;color:#888;cursor:pointer;font-size:14px;} .cbb-mem button:hover{color:#ff7b7b;}
        .cbb-toggle{display:flex;align-items:center;justify-content:space-between;font-size:13px;}
        .cbb-toggle input{width:18px;height:18px;accent-color:var(--acc);}
        .cbb-setfoot{display:flex;gap:8px;justify-content:flex-end;margin-top:6px;}
        .cbb-link{color:var(--acc);font-size:12px;text-decoration:none;} .cbb-link:hover{text-decoration:underline;}
        @media (max-width:720px){.cbb-side{position:absolute;left:0;top:0;bottom:0;transform:translateX(-100%);transition:.2s;box-shadow:20px 0 60px rgba(0,0,0,.5);} .cbb-side.open{transform:none;} .cbb-sugg{grid-template-columns:1fr;}}
        </style>`;
    }

    function shellHTML(settings) {
        const model = esc(effectiveModel(settings));
        return `
        <div class="cbb-root">
            <div class="cbb-side">
                <div class="cbb-brand"><div class="cbb-logo">✦</div><div><b>CopilotButBetter</b><small>Gemini · glass edition</small></div></div>
                <button class="cbb-new">＋ New chat</button>
                <div class="cbb-search"><span style="color:#8e8e8e;font-size:13px;">⌕</span><input class="cbb-q" type="text" placeholder="Search chats"></div>
                <div class="cbb-list"></div>
                <div class="cbb-foot">
                    <button class="cbb-export">Export</button>
                    <button class="cbb-settings-btn">⚙ Settings</button>
                </div>
            </div>
            <div class="cbb-main">
                <div class="cbb-aurora"></div>
                <div class="cbb-top">
                    <button class="cbb-iconbtn cbb-menu" title="Chats">☰</button>
                    <div class="cbb-modelpill"><i></i><span class="cbb-modelname">${model}</span></div>
                    <div class="cbb-title"></div>
                    <button class="cbb-iconbtn cbb-settings-btn2" title="Settings">⚙</button>
                </div>
                <div class="cbb-msgs"><div class="cbb-col"></div></div>
                <div class="cbb-compwrap"><div class="cbb-comp">
                    <div class="cbb-box">
                        <textarea rows="1" placeholder="Message CopilotButBetter…"></textarea>
                        <button class="cbb-stop" title="Stop" style="display:none;">■</button>
                        <button class="cbb-send" title="Send">↑</button>
                    </div>
                    <div class="cbb-hint">CopilotButBetter can make mistakes. Check important info. · Bring-your-own Gemini key</div>
                </div></div>
            </div>
            <div class="cbb-set hidden"><div class="cbb-panel"></div></div>
        </div>`;
    }

    function groupLabel(ts) {
        const d = new Date(ts), now = new Date();
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diff = Math.round((today - day) / 86400000);
        if (diff <= 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        if (diff < 7) return 'Previous 7 days';
        if (diff < 30) return 'Previous 30 days';
        return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    function launch() {
        const icon = AppIcons.get(APP_ID);
        let settings = loadSettings();
        let convs = loadConvs();
        let activeId = convs.length ? convs[0].id : null;
        let generating = false;
        let stopFlag = false;

        const win = WindowManager.createWindow(APP_ID, 'CopilotButBetter', icon,
            css() + shellHTML(settings), { width: 1020, height: 700, minWidth: 640, minHeight: 460 });
        const el = win.element;
        const root = el.querySelector('.cbb-root');

        const listEl = el.querySelector('.cbb-list');
        const colEl = el.querySelector('.cbb-col');
        const msgsEl = el.querySelector('.cbb-msgs');
        const titleEl = el.querySelector('.cbb-title');
        const modelNameEl = el.querySelector('.cbb-modelname');
        const ta = el.querySelector('.cbb-box textarea');
        const sendBtn = el.querySelector('.cbb-send');
        const stopBtn = el.querySelector('.cbb-stop');
        const setWrap = el.querySelector('.cbb-set');
        const panel = el.querySelector('.cbb-panel');
        const side = el.querySelector('.cbb-side');
        applyTheme();

        function applyTheme() {
            root.style.setProperty('--acc', settings.accent || '#10a37f');
            root.style.setProperty('--glass', String(settings.glass == null ? 0.65 : settings.glass));
            modelNameEl.textContent = effectiveModel(settings);
        }

        function getActive() {
            return convs.find(c => c.id === activeId) || null;
        }

        function persist() {
            saveConvs(convs);
        }

        // ---------- sidebar ----------
        function renderSidebar(filter) {
            const q = (filter || '').toLowerCase();
            const items = convs.filter(c => !q || (c.title || '').toLowerCase().includes(q) ||
                c.messages.some(m => m.content.toLowerCase().includes(q)));
            if (!items.length) {
                listEl.innerHTML = `<div style="padding:18px 12px;color:#8e8e8e;font-size:12.5px;text-align:center;">${q ? 'No matches.' : 'No conversations yet.<br>Start a new chat ✦'}</div>`;
                return;
            }
            let html = '', lastGroup = '';
            for (const c of items) {
                const g = groupLabel(c.updatedAt);
                if (g !== lastGroup) { html += `<div class="cbb-date">${esc(g)}</div>`; lastGroup = g; }
                html += `<div class="cbb-item${c.id === activeId ? ' active' : ''}" data-id="${c.id}" title="${esc(c.title)}">` +
                    `<span>${esc(c.title || 'New chat')}</span><button class="x" data-del="${c.id}" title="Delete">×</button></div>`;
            }
            listEl.innerHTML = html;
            listEl.querySelectorAll('.cbb-item').forEach(n => {
                n.addEventListener('click', (e) => {
                    const del = e.target.closest('[data-del]');
                    if (del) { e.stopPropagation(); deleteConv(del.dataset.del); return; }
                    activeId = n.dataset.id;
                    renderAll();
                    if (window.innerWidth < 720) side.classList.remove('open');
                });
                n.addEventListener('dblclick', () => renameConv(n.dataset.id));
                n.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    renameConv(n.dataset.id);
                });
            });
        }

        async function renameConv(id) {
            const c = convs.find(x => x.id === id);
            if (!c) return;
            const name = await Popup.textbox('Rename chat', 'Conversation title:', { value: c.title || '' });
            if (name && name.trim()) { c.title = name.trim().slice(0, 80); c.updatedAt = Date.now(); persist(); renderAll(); }
        }

        async function deleteConv(id) {
            const ok = await Popup.confirm('Delete chat', 'Delete this conversation permanently?');
            if (!ok) return;
            convs = convs.filter(c => c.id !== id);
            if (activeId === id) activeId = convs.length ? convs[0].id : null;
            persist(); renderAll();
        }

        function newChat() {
            const c = { id: uid(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
            convs.unshift(c);
            activeId = c.id;
            persist(); renderAll();
            ta.focus();
        }

        // ---------- messages ----------
        function renderMessages() {
            const c = getActive();
            titleEl.textContent = c ? (c.title || 'New chat') : 'CopilotButBetter';
            if (!c || !c.messages.length) {
                colEl.innerHTML = `
                <div class="cbb-hero"><div class="big">✦</div><h1>What can I help with?</h1>
                <div class="cbb-sugg">${SUGGESTIONS.map((s, i) =>
                    `<button data-s="${i}"><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></button>`).join('')}</div></div>`;
                colEl.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
                    const s = SUGGESTIONS[parseInt(b.dataset.s, 10)];
                    ta.value = `${s.title} ${s.desc}`;
                    autosize(); send();
                }));
                return;
            }
            colEl.innerHTML = c.messages.map((m, i) => {
                if (m.role === 'user') {
                    return `<div class="cbb-row user"><div class="cbb-ubub">${esc(m.content)}</div></div>`;
                }
                const errCls = m.error ? ' error' : '';
                return `<div class="cbb-row"><div class="cbb-avatar">✦</div><div class="cbb-abub${errCls}">` +
                    `${renderMarkdown(m.content)}` +
                    `<div class="cbb-msgacts"><button data-copy="${i}">⧉ Copy</button>` +
                    `<button data-mem="${i}">✦ Remember</button></div></div></div>`;
            }).join('');
            if (generating) colEl.insertAdjacentHTML('beforeend',
                `<div class="cbb-row cbb-live"><div class="cbb-avatar">✦</div><div class="cbb-abub"><div class="cbb-typing"><i></i><i></i><i></i></div></div></div>`);
            colEl.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
                const m = getActive().messages[parseInt(b.dataset.copy, 10)];
                if (!m) return;
                if (navigator.clipboard) navigator.clipboard.writeText(m.content).catch(() => { });
                b.textContent = '✓ Copied';
                setTimeout(() => { b.textContent = '⧉ Copy'; }, 1200);
            }));
            colEl.querySelectorAll('[data-mem]').forEach(b => b.addEventListener('click', () => {
                const m = getActive().messages[parseInt(b.dataset.mem, 10)];
                if (!m) return;
                rememberText(m.content);
            }));
            colEl.querySelectorAll('.cbb-copy').forEach(b => b.addEventListener('click', () => {
                const pre = b.closest('.cbb-code').querySelector('pre');
                const txt = pre ? pre.innerText : '';
                if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => { });
                b.textContent = 'Copied';
                setTimeout(() => { b.textContent = 'Copy'; }, 1200);
            }));
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }

        async function rememberText(text) {
            const snippet = text.length > 220 ? text.slice(0, 220) + '…' : text;
            const fact = await Popup.textbox('Save to memory', 'CopilotButBetter will remember this in future chats:', { value: snippet });
            if (fact && fact.trim()) {
                settings.memory.push(fact.trim().slice(0, 500));
                saveSettings(settings);
                Notifications.info('Memory saved', 'CopilotButBetter will use this in future replies.', { appId: APP_ID });
                renderSettings();
            }
        }

        function renderAll() {
            renderSidebar(el.querySelector('.cbb-q').value);
            renderMessages();
        }

        function autosize() {
            ta.style.height = 'auto';
            ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
        }

        async function send() {
            const text = ta.value.trim();
            if (!text || generating) return;
            if (!(settings.apiKey || '').trim()) {
                const go = await Popup.confirm('API key needed',
                    'CopilotButBetter needs your Gemini API key first (free at Google AI Studio). Open Settings now?');
                if (go) openSettings();
                return;
            }
            let c = getActive();
            if (!c) {
                c = { id: uid(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
                convs.unshift(c); activeId = c.id;
            }
            c.messages.push({ role: 'user', content: text, time: Date.now() });
            if (c.messages.length === 1 || c.title === 'New chat') {
                c.title = text.length > 42 ? text.slice(0, 42) + '…' : text;
            }
            c.updatedAt = Date.now();
            ta.value = ''; autosize();
            generating = true; stopFlag = false;
            sendBtn.style.display = 'none'; stopBtn.style.display = '';
            persist(); renderAll();
            try {
                const history = c.messages;
                const reply = await callGemini(settings, history);
                if (stopFlag) return;
                c.messages.push({ role: 'assistant', content: reply, time: Date.now() });
                c.updatedAt = Date.now();
            } catch (e) {
                if (!stopFlag) {
                    c.messages.push({ role: 'assistant', content: `⚠️ **Request failed:** ${e.message}`, time: Date.now(), error: true });
                }
            } finally {
                generating = false;
                sendBtn.style.display = ''; stopBtn.style.display = 'none';
                persist(); renderAll();
            }
        }

        // ---------- settings ----------
        function renderSettings() {
            const s = settings;
            const memHtml = s.memory.length
                ? s.memory.map((m, i) => `<div class="cbb-mem"><span>${esc(m)}</span><button data-mdel="${i}" title="Forget">×</button></div>`).join('')
                : `<div style="font-size:12.5px;color:#8e8e8e;margin-top:6px;">Nothing remembered yet. Use “✦ Remember” under any reply.</div>`;
            panel.innerHTML = `
                <h2>Settings</h2><div class="sub">API key, model, memory &amp; glass — stored locally in the virtual filesystem.</div>
                <div class="cbb-sec"><h3>Gemini API</h3>
                    <label>Paste your key — get one free at <a class="cbb-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></label>
                    <div class="cbb-keyrow"><input type="password" class="s-key" value="${esc(s.apiKey)}" placeholder="AIza…"><button class="cbb-mini s-show">Show</button></div>
                    <label>Model</label>
                    <div class="cbb-rowline"><select class="s-model">${MODELS.map(m => `<option ${m === s.model ? 'selected' : ''}>${m}</option>`).join('')}</select>
                    <input type="text" class="s-custom" value="${esc(s.customModel)}" placeholder="Custom model id (optional)"></div>
                </div>
                <div class="cbb-sec"><h3>Behavior</h3>
                    <label>System prompt (personality)</label>
                    <textarea class="s-sys" rows="3">${esc(s.systemPrompt)}</textarea>
                    <label>Creativity (temperature): <b class="s-tval">${esc(String(s.temperature))}</b></label>
                    <input type="range" class="cbb-range s-temp" min="0" max="2" step="0.1" value="${esc(String(s.temperature))}">
                    <label>Max output tokens</label>
                    <select class="s-max"><option ${s.maxTokens === 1024 ? 'selected' : ''}>1024</option><option ${s.maxTokens === 2048 ? 'selected' : ''}>2048</option><option ${s.maxTokens === 4096 ? 'selected' : ''}>4096</option><option ${s.maxTokens === 8192 ? 'selected' : ''}>8192</option></select>
                    <label class="cbb-toggle" style="margin-top:10px;">Send with Enter (Shift+Enter = newline)<input type="checkbox" class="s-enter" ${s.enterToSend ? 'checked' : ''}></label>
                </div>
                <div class="cbb-sec"><h3>Memory</h3>
                    <label class="cbb-toggle">Long-term memory (facts are sent with every request)<input type="checkbox" class="s-memon" ${s.memoryEnabled ? 'checked' : ''}></label>
                    ${memHtml}
                    <div class="cbb-keyrow" style="margin-top:8px;"><input type="text" class="s-newmem" placeholder="e.g. My favorite language is Python"><button class="cbb-mini s-addmem">Add</button></div>
                </div>
                <div class="cbb-sec"><h3>Appearance · liquid glass</h3>
                    <label>Accent</label>
                    <div class="cbb-swatches">${['#10a37f', '#0ea5e9', '#a78bfa', '#f472b6', '#f59e0b', '#ef4444'].map(c =>
                        `<div class="cbb-sw${c === s.accent ? ' sel' : ''}" data-acc="${c}" style="background:${c}"></div>`).join('')}</div>
                    <label>Glass intensity: <b class="s-gval">${Math.round((s.glass == null ? 0.65 : s.glass) * 100)}%</b></label>
                    <input type="range" class="cbb-range s-glass" min="0.2" max="1" step="0.05" value="${s.glass == null ? 0.65 : s.glass}">
                </div>
                <div class="cbb-sec"><h3>Data</h3>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="cbb-mini s-export">Export chats (JSON)</button>
                        <button class="cbb-mini danger s-clear">Delete all chats</button>
                    </div>
                </div>
                <div class="cbb-setfoot"><button class="cbb-mini s-close">Close</button><button class="cbb-mini primary s-save">Save</button></div>`;

            panel.querySelector('.s-show').addEventListener('click', (e) => {
                const inp = panel.querySelector('.s-key');
                inp.type = inp.type === 'password' ? 'text' : 'password';
                e.target.textContent = inp.type === 'password' ? 'Show' : 'Hide';
            });
            panel.querySelector('.s-temp').addEventListener('input', (e) => {
                panel.querySelector('.s-tval').textContent = e.target.value;
            });
            panel.querySelector('.s-glass').addEventListener('input', (e) => {
                panel.querySelector('.s-gval').textContent = Math.round(e.target.value * 100) + '%';
            });
            panel.querySelectorAll('[data-acc]').forEach(n => n.addEventListener('click', () => {
                panel.querySelectorAll('[data-acc]').forEach(x => x.classList.remove('sel'));
                n.classList.add('sel');
            }));
            panel.querySelector('.s-addmem').addEventListener('click', () => {
                const v = panel.querySelector('.s-newmem').value.trim();
                if (v) { settings.memory.push(v.slice(0, 500)); saveSettings(settings); renderSettings(); }
            });
            panel.querySelectorAll('[data-mdel]').forEach(b => b.addEventListener('click', () => {
                settings.memory.splice(parseInt(b.dataset.mdel, 10), 1);
                saveSettings(settings); renderSettings();
            }));
            panel.querySelector('.s-export').addEventListener('click', () => exportChats());
            panel.querySelector('.s-clear').addEventListener('click', async () => {
                const ok = await Popup.confirm('Delete all chats', 'Permanently delete every conversation?');
                if (ok) { convs = []; activeId = null; persist(); renderAll(); renderSettings(); }
            });
            panel.querySelector('.s-close').addEventListener('click', () => setWrap.classList.add('hidden'));
            panel.querySelector('.s-save').addEventListener('click', () => {
                const selAcc = panel.querySelector('[data-acc].sel');
                settings = {
                    ...settings,
                    apiKey: panel.querySelector('.s-key').value.trim(),
                    model: panel.querySelector('.s-model').value,
                    customModel: panel.querySelector('.s-custom').value.trim(),
                    systemPrompt: panel.querySelector('.s-sys').value,
                    temperature: parseFloat(panel.querySelector('.s-temp').value) || 0.7,
                    maxTokens: parseInt(panel.querySelector('.s-max').value, 10) || 2048,
                    enterToSend: panel.querySelector('.s-enter').checked,
                    memoryEnabled: panel.querySelector('.s-memon').checked,
                    accent: selAcc ? selAcc.dataset.acc : settings.accent,
                    glass: parseFloat(panel.querySelector('.s-glass').value)
                };
                saveSettings(settings);
                applyTheme();
                setWrap.classList.add('hidden');
                Notifications.info('Settings saved', 'CopilotButBetter preferences updated.', { appId: APP_ID });
            });
        }

        function openSettings() {
            renderSettings();
            setWrap.classList.remove('hidden');
        }

        function exportChats() {
            const blob = new Blob([JSON.stringify(convs, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'copilotbutbetter-chats.json';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        }

        // ---------- wire up ----------
        el.querySelector('.cbb-new').addEventListener('click', newChat);
        el.querySelector('.cbb-menu').addEventListener('click', () => side.classList.toggle('open'));
        el.querySelector('.cbb-q').addEventListener('input', (e) => renderSidebar(e.target.value));
        el.querySelector('.cbb-export').addEventListener('click', exportChats);
        el.querySelector('.cbb-settings-btn').addEventListener('click', openSettings);
        el.querySelector('.cbb-settings-btn2').addEventListener('click', openSettings);
        setWrap.addEventListener('click', (e) => { if (e.target === setWrap) setWrap.classList.add('hidden'); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Escape') setWrap.classList.add('hidden'); });

        ta.addEventListener('input', autosize);
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend) { e.preventDefault(); send(); }
        });
        sendBtn.addEventListener('click', send);
        stopBtn.addEventListener('click', () => { stopFlag = true; });

        // Mouse-reactive layer: ambient glow follows the cursor, spotlights light up
        // the hovered bubble/card/composer, hero logo + suggestion cards tilt in 3D.
        let mouseRaf = null;
        root.addEventListener('mousemove', (e) => {
            if (mouseRaf) return;
            mouseRaf = requestAnimationFrame(() => {
                mouseRaf = null;
                const rr = root.getBoundingClientRect();
                root.style.setProperty('--mx', ((e.clientX - rr.left) / rr.width * 100).toFixed(2) + '%');
                root.style.setProperty('--my', ((e.clientY - rr.top) / rr.height * 100).toFixed(2) + '%');
                const t = e.target.closest('.cbb-abub,.cbb-ubub,.cbb-sugg button,.cbb-box');
                if (t) {
                    const b = t.getBoundingClientRect();
                    t.style.setProperty('--bx', (e.clientX - b.left).toFixed(1) + 'px');
                    t.style.setProperty('--by', (e.clientY - b.top).toFixed(1) + 'px');
                    if (t.closest('.cbb-sugg')) {
                        const px = (e.clientX - b.left) / b.width - 0.5;
                        const py = (e.clientY - b.top) / b.height - 0.5;
                        t.style.transform = `perspective(600px) rotateY(${(px * 7).toFixed(2)}deg) rotateX(${(-py * 7).toFixed(2)}deg) translateY(-2px)`;
                    }
                }
                root.querySelectorAll('.cbb-sugg button').forEach(b => { if (b !== t) b.style.transform = ''; });
                const big = root.querySelector('.cbb-hero .big');
                if (big) {
                    const b = big.getBoundingClientRect();
                    const px = (e.clientX - (b.left + b.width / 2)) / Math.max(b.width, 1);
                    const py = (e.clientY - (b.top + b.height / 2)) / Math.max(b.height, 1);
                    const cl = Math.max(-1, Math.min(1, px)), ct = Math.max(-1, Math.min(1, py));
                    big.style.transform = `perspective(500px) rotateY(${(cl * 14).toFixed(2)}deg) rotateX(${(-ct * 14).toFixed(2)}deg)`;
                }
            });
        });
        root.addEventListener('mouseleave', () => {
            const big = root.querySelector('.cbb-hero .big');
            if (big) big.style.transform = '';
            root.querySelectorAll('.cbb-sugg button').forEach(b => { b.style.transform = ''; });
        });

        renderAll();
        autosize();
    }

    return { launch };
})();

export default CopilotButBetter;
