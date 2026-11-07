// Hacker News — native feed + comments (Firebase public API).
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const HackerNews = (() => {
    const BASE = 'https://hacker-news.firebaseio.com/v0';
    const FEEDS = { 'Top': 'topstories', 'New': 'newstories', 'Best': 'beststories', 'Ask': 'askstories', 'Show': 'showstories', 'Jobs': 'jobstories' };
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    async function fetchJson(url){const r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
    async function item(id){return fetchJson(`${BASE}/item/${id}.json`);}
    async function feed(type, n=30){const ids=await fetchJson(`${BASE}/${type}.json`);return (ids||[]).slice(0,n);}

    function launch(){
        const app=createApp({id:'hackerNews',name:'Hacker News'});
        const win=app.window.create({title:'Hacker News',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--window-border);display:flex;gap:6px;flex-wrap:wrap;">
                    ${Object.keys(FEEDS).map(k=>`<button class="hn-tab" data-feed="${k}" style="background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">${k}</button>`).join('')}
                </div>
                <div class="hn-status" style="padding:6px 12px;font-size:12px;color:var(--text-secondary);">Loading…</div>
                <div class="hn-list" style="flex:1;overflow:auto;padding:6px 10px;display:flex;flex-direction:column;gap:6px;"></div>
            </div>`,width:460,height:640});
        const el=win.element;
        const status=el.querySelector('.hn-status');
        const list=el.querySelector('.hn-list');
        let currentFeed='Top';

        async function loadFeed(name){
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('Hacker News');return;}
            currentFeed=name;
            status.textContent='Loading…';
            list.innerHTML='';
            try{
                const ids=await feed(FEEDS[name]);
                const items=await Promise.all(ids.map(id=>item(id).catch(()=>null)));
                const valid=items.filter(Boolean);
                status.textContent=`${valid.length} stories`;
                for(const it of valid){
                    const card=document.createElement('div');
                    card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:4px;';
                    const origin=(it.url)?new URL(it.url).hostname:'';
                    card.innerHTML=`<div style="font-weight:600;font-size:14px;">${escapeHtml(it.title)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);">${it.score||0} points · ${it.by||''} · ${it.descendants||0} comments${origin?' · '+escapeHtml(origin):''}</div>`;
                    card.addEventListener('click',()=>showStory(it));
                    card.addEventListener('mouseenter',()=>card.style.background='rgba(128,128,128,0.08)');
                    card.addEventListener('mouseleave',()=>card.style.background='');
                    list.appendChild(card);
                }
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);}
        }

        async function showStory(it){
            status.textContent='Loading comments…';
            list.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">Loading…</div>';
            try{
                const comments=it.kids?await Promise.all(it.kids.slice(0,20).map(id=>item(id).catch(()=>null))):[];
                status.textContent=it.title;
                let html=`<div style="padding:8px 0;">
                    <h2 style="margin:0 0 8px 0;font-size:16px;">${escapeHtml(it.title)}</h2>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">${it.score||0} points · ${it.by||''}</div>
                    ${it.url?`<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener" style="color:var(--accent-color);font-size:13px;">Open link ↗</a>`:''}
                    <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
                `;
                for(const c of comments.filter(Boolean)){
                    html+=`<div style="padding:8px;border-left:2px solid var(--window-border);font-size:13px;">
                        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:2px;">${escapeHtml(c.by||'')} · ${new Date((c.time||0)*1000).toLocaleString()}</div>
                        <div style="white-space:pre-wrap;">${escapeHtml((c.text||'').replace(/<[^>]*>/g,''))}</div>
                    </div>`;
                }
                html+=`</div><button class="hn-back" style="margin-top:12px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;">← Back</button></div>`;
                list.innerHTML=html;
                list.querySelector('.hn-back').addEventListener('click',()=>loadFeed(currentFeed));
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);list.innerHTML='';}
        }

        el.querySelectorAll('.hn-tab').forEach(b=>b.addEventListener('click',()=>loadFeed(b.dataset.feed)));
        const first=el.querySelector('.hn-tab'); if(first) first.style.background='var(--accent-color)'; 
        el.querySelectorAll('.hn-tab').forEach(b=>b.addEventListener('click',()=>{
            el.querySelectorAll('.hn-tab').forEach(x=>x.style.background='rgba(128,128,128,0.12)');
            b.style.background='var(--accent-color)';
        }));
        loadFeed('Top');
    }
    return {launch};
})();
export default HackerNews;
