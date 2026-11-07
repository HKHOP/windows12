// Stack Overflow — native search (Stack Exchange API).
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const StackOverflow = (() => {
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    async function search(q){
        const url=`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=15&filter=withbody`;
        const r=await fetch(url); if(!r.ok)throw new Error('HTTP '+r.status); const d=await r.json(); return d.items||[];
    }
    async function answers(qid){
        const r=await fetch(`https://api.stackexchange.com/2.3/questions/${qid}/answers?order=desc&sort=votes&site=stackoverflow&filter=withbody`);
        if(!r.ok)throw new Error('HTTP '+r.status); const d=await r.json(); return d.items||[];
    }
    function stripHtml(h){const div=document.createElement('div');div.innerHTML=h||'';return div.textContent||div.innerText||'';}

    function launch(){
        const app=createApp({id:'stackOverflow',name:'Stack Overflow'});
        const win=app.window.create({title:'Stack Overflow',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--window-border);display:flex;gap:6px;">
                    <input class="s-q" placeholder="Search questions..." style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <button class="s-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Go</button>
                </div>
                <div class="s-status" style="padding:6px 12px;font-size:12px;color:var(--text-secondary);"></div>
                <div class="s-list" style="flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px;"></div>
            </div>`,width:480,height:640});
        const el=win.element;
        const q=el.querySelector('.s-q'); const list=el.querySelector('.s-list'); const status=el.querySelector('.s-status');

        async function go(){
            const term=q.value.trim(); if(!term) return;
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('Stack Overflow');return;}
            status.textContent='Loading...'; list.innerHTML='';
            try{
                const items=await search(term);
                status.textContent=`${items.length} questions`;
                for(const it of items){
                    const card=document.createElement('div');
                    card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:4px;';
                    card.innerHTML=`<div style="font-weight:600;font-size:14px;">${escapeHtml(stripHtml(it.title))}</div>
                        <div style="font-size:12px;color:var(--text-secondary);">score ${it.score} · answers ${it.answer_count} · ${escapeHtml((it.tags||[]).join(', '))}</div>`;
                    card.addEventListener('click',()=>showQuestion(it));
                    card.addEventListener('mouseenter',()=>card.style.background='rgba(128,128,128,0.08)');
                    card.addEventListener('mouseleave',()=>card.style.background='');
                    list.appendChild(card);
                }
                if(!items.length) list.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">No questions found.</div>';
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);list.innerHTML='';}
        }

        async function showQuestion(qq){
            status.textContent='Loading answers...'; list.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">Loading...</div>';
            try{
                const ans=await answers(qq.question_id);
                let html=`<div style="padding:8px 0;">
                    <h2 style="margin:0 0 8px 0;font-size:15px;">${escapeHtml(stripHtml(qq.title))}</h2>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">score ${qq.score} · ${qq.answer_count} answers · <a href="${escapeHtml(qq.link)}" target="_blank" rel="noopener" style="color:var(--accent-color);">Open ↗</a></div>
                    <div style="font-size:13px;white-space:pre-wrap;line-height:1.5;margin-bottom:12px;border-left:3px solid var(--window-border);padding-left:8px;">${escapeHtml(stripHtml(qq.body||''))}</div>
                    <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Answers (${ans.length})</div>`;
                for(const a of ans){
                    html+=`<div style="padding:8px;border:1px solid var(--window-border);border-radius:8px;margin-bottom:6px;">
                        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">score ${a.score}${a.is_accepted?' · accepted':''}</div>
                        <div style="font-size:13px;white-space:pre-wrap;line-height:1.5;">${escapeHtml(stripHtml(a.body||''))}</div>
                    </div>`;
                }
                html+=`<button class="s-back" style="margin-top:8px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;">← Back</button></div>`;
                list.innerHTML=html;
                status.textContent=stripHtml(qq.title);
                list.querySelector('.s-back').addEventListener('click',go);
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);list.innerHTML='';}
        }
        el.querySelector('.s-go').addEventListener('click',go);
        q.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
        q.focus();
    }
    return {launch};
})();
export default StackOverflow;
