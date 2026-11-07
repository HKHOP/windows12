// Google Translate — native translation via MyMemory (free, no key).
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const GoogleTranslate = (() => {
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    const LANGS = { 'English':'en','Spanish':'es','French':'fr','German':'de','Italian':'it','Portuguese':'pt','Russian':'ru','Japanese':'ja','Korean':'ko','Chinese':'zh','Arabic':'ar','Hindi':'hi','Turkish':'tr','Dutch':'nl','Polish':'pl','Swedish':'sv' };
    async function translate(text, from, to){
        const url=`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
        const r=await fetch(url); if(!r.ok)throw new Error('HTTP '+r.status); const d=await r.json();
        if(d.responseStatus!==200) throw new Error(d.responseDetails||'Translation failed');
        return d.responseData.translatedText;
    }

    function launch(){
        const app=createApp({id:'googleTranslate',name:'Google Translate'});
        const win=app.window.create({title:'Google Translate',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;padding:10px;box-sizing:border-box;gap:8px;">
                <div style="display:flex;gap:6px;align-items:center;">
                    <select class="t-from" style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:6px;font-size:13px;"></select>
                    <button class="t-swap" style="background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:13px;">⇄</button>
                    <select class="t-to" style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:6px;font-size:13px;"></select>
                </div>
                <textarea class="t-in" placeholder="Enter text..." style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px;font-size:13px;resize:none;outline:none;font-family:inherit;"></textarea>
                <button class="t-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;font-size:13px;">Translate</button>
                <textarea class="t-out" readonly placeholder="Translation..." style="flex:1;background:rgba(128,128,128,0.06);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px;font-size:13px;resize:none;outline:none;font-family:inherit;"></textarea>
                <div class="t-status" style="font-size:12px;color:var(--text-secondary);"></div>
            </div>`,width:420,height:520});
        const el=win.element;
        const from=el.querySelector('.t-from'); const to=el.querySelector('.t-to'); const inp=el.querySelector('.t-in');
        const out=el.querySelector('.t-out'); const status=el.querySelector('.t-status');
        for(const [name,code] of Object.entries(LANGS)){
            const o1=document.createElement('option'); o1.value=code; o1.textContent=name; from.appendChild(o1);
            const o2=document.createElement('option'); o2.value=code; o2.textContent=name; to.appendChild(o2);
        }
        from.value='en'; to.value='es';
        el.querySelector('.t-swap').addEventListener('click',()=>{const t=from.value;from.value=to.value;to.value=t;const x=inp.value;inp.value=out.value;out.value=x;});
        el.querySelector('.t-go').addEventListener('click',async()=>{
            const text=inp.value.trim(); if(!text){status.textContent='Enter text to translate.';return;}
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('Google Translate');return;}
            status.textContent='Translating...'; out.value='';
            try{out.value=await translate(text,from.value,to.value); status.textContent='Done';}
            catch(e){status.textContent='Failed: '+(e&&e.message?e.message:e);}
        });
        inp.addEventListener('keydown',e=>{if(e.key==='Enter' && e.ctrlKey) el.querySelector('.t-go').click();});
    }
    return {launch};
})();
export default GoogleTranslate;
