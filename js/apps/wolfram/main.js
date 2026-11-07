// Wolfram Alpha — native query client (uses optional API key).
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const Wolfram = (() => {
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function key(app){try{return app.settings.get('appid')||'';}catch{return '';}}

    function launch(){
        const app=createApp({id:'wolfram',name:'Wolfram Alpha'});
        const win=app.window.create({title:'Wolfram Alpha',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;padding:10px;gap:8px;">
                <div style="display:flex;gap:6px;">
                    <input class="w-q" placeholder="Ask Wolfram Alpha..." style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <button class="w-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Ask</button>
                </div>
                <div style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text-secondary);">
                    <span>AppID (optional):</span>
                    <input class="w-key" type="password" placeholder="Wolfram AppID" style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:4px 8px;font-size:12px;outline:none;">
                </div>
                <div class="w-result" style="flex:1;overflow:auto;border:1px solid var(--window-border);border-radius:6px;padding:10px;font-size:13px;line-height:1.5;">Enter a query above.</div>
            </div>`,width:460,height:520});
        const el=win.element;
        const q=el.querySelector('.w-q');const res=el.querySelector('.w-result');const keyInput=el.querySelector('.w-key');
        keyInput.value=key(app);
        keyInput.addEventListener('change',()=>{try{app.settings.set('appid',keyInput.value);}catch{}});

        async function go(){
            const term=q.value.trim();if(!term) return;
            const k=keyInput.value.trim();
            if(!k){
                res.innerHTML=`<div>No API key provided.</div><div style="margin-top:8px;"><a href="https://www.wolframalpha.com/input?i=${encodeURIComponent(term)}" target="_blank" rel="noopener" style="color:var(--accent-color);">Open in Wolfram Alpha ↗</a></div>`;
                return;
            }
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('Wolfram Alpha');return;}
            res.textContent='Querying...';
            try{
                const r=await fetch(`https://api.wolframalpha.com/v1/result?i=${encodeURIComponent(term)}&appid=${encodeURIComponent(k)}`);
                const text=await r.text();
                if(!r.ok) throw new Error(text||('HTTP '+r.status));
                res.textContent=text||'No result.';
            }catch(e){res.textContent='Failed: '+(e&&e.message?e.message:e);}
        }
        el.querySelector('.w-go').addEventListener('click',go);
        q.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
        q.focus();
    }
    return {launch};
})();
export default Wolfram;
