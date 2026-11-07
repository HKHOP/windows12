// Reddit — native subreddit feed + comments.
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const Reddit = (() => {
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    async function fetchJson(url){const r=await fetch(url,{headers:{'Accept':'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
    async function feed(sub){return fetchJson(`https://www.reddit.com/r/${encodeURIComponent(sub)}.json?limit=25`);}
    async function comments(permalink){return fetchJson(`https://www.reddit.com${permalink}.json?limit=20`);}

    function launch(){
        const app=createApp({id:'reddit',name:'Reddit'});
        const win=app.window.create({title:'Reddit',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--window-border);display:flex;gap:6px;">
                    <span style="align-self:center;font-size:13px;color:var(--text-secondary);">r/</span>
                    <input class="r-sub" value="all" style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <button class="r-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Go</button>
                </div>
                <div class="r-status" style="padding:6px 12px;font-size:12px;color:var(--text-secondary);"></div>
                <div class="r-list" style="flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px;"></div>
            </div>`,width:460,height:640});
        const el=win.element;
        const sub=el.querySelector('.r-sub'); const list=el.querySelector('.r-list'); const status=el.querySelector('.r-status');

        async function load(s){
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('Reddit');return;}
            status.textContent='Loading...'; list.innerHTML='';
            try{
                const data=await feed(s);
                const posts=(data.data&&data.data.children)||[];
                status.textContent=`r/${s} · ${posts.length} posts`;
                for(const p of posts){
                    const d=p.data;
                    const card=document.createElement('div');
                    card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:4px;';
                    card.innerHTML=`<div style="font-size:11px;color:var(--text-secondary);">r/${escapeHtml(d.subreddit)} · u/${escapeHtml(d.author)} · ${d.score} pts</div>
                        <div style="font-weight:600;font-size:14px;">${escapeHtml(d.title)}</div>
                        ${d.selftext?`<div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(d.selftext.slice(0,180))}${d.selftext.length>180?'…':''}</div>`:''}
                        ${d.thumbnail&&d.thumbnail.startsWith('http')?`<img src="${escapeHtml(d.thumbnail)}" style="max-width:100%;border-radius:6px;margin-top:4px;">`:''}`;
                    card.addEventListener('click',()=>showPost(d));
                    card.addEventListener('mouseenter',()=>card.style.background='rgba(128,128,128,0.08)');
                    card.addEventListener('mouseleave',()=>card.style.background='');
                    list.appendChild(card);
                }
                if(!posts.length) list.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">No posts.</div>';
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);list.innerHTML='';}
        }
        async function showPost(d){
            status.textContent='Loading comments...'; list.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">Loading...</div>';
            try{
                const data=await comments(d.permalink);
                const comments=(data[1]&&data[1].data&&data[1].data.children)||[];
                let html=`<div style="padding:8px 0;">
                    <h2 style="margin:0 0 8px 0;font-size:15px;">${escapeHtml(d.title)}</h2>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">${d.score} pts · u/${escapeHtml(d.author)} · <a href="https://reddit.com${escapeHtml(d.permalink)}" target="_blank" rel="noopener" style="color:var(--accent-color);">Open ↗</a></div>
                    ${d.selftext?`<div style="font-size:13px;white-space:pre-wrap;line-height:1.5;margin-bottom:12px;">${escapeHtml(d.selftext)}</div>`:''}
                    <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Comments (${comments.length})</div>`;
                for(const c of comments){
                    const cd=c.data||{};
                    if(cd.body) html+=`<div style="padding:8px;border-left:2px solid var(--window-border);margin-bottom:6px;">
                        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:2px;">u/${escapeHtml(cd.author||'')} · ${cd.score} pts</div>
                        <div style="font-size:13px;white-space:pre-wrap;">${escapeHtml(cd.body)}</div>
                    </div>`;
                }
                html+=`<button class="r-back" style="margin-top:8px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;">← Back</button></div>`;
                list.innerHTML=html; status.textContent=d.title;
                list.querySelector('.r-back').addEventListener('click',()=>load(sub.value.trim()||'all'));
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);list.innerHTML='';}
        }
        el.querySelector('.r-go').addEventListener('click',()=>load(sub.value.trim()||'all'));
        sub.addEventListener('keydown',e=>{if(e.key==='Enter')load(sub.value.trim()||'all');});
        load('all');
    }
    return {launch};
})();
export default Reddit;
