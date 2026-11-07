// GitHub — native repo search + user profile viewer.
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const GitHub = (() => {
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    async function fetchJson(url){const r=await fetch(url,{headers:{'Accept':'application/vnd.github+json'}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
    async function searchRepos(q){const d=await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=15&sort=stars`);return d.items||[];}
    async function user(login){return fetchJson(`https://api.github.com/users/${encodeURIComponent(login)}`);}
    async function userRepos(login){return fetchJson(`https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=15&sort=updated`);}

    function launch(){
        const app=createApp({id:'github',name:'GitHub'});
        const win=app.window.create({title:'GitHub',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--window-border);display:flex;gap:6px;">
                    <input class="g-q" placeholder="Search repos or @username..." style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <button class="g-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Go</button>
                </div>
                <div class="g-status" style="padding:6px 12px;font-size:12px;color:var(--text-secondary);"></div>
                <div class="g-list" style="flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px;"></div>
            </div>`,width:460,height:640});
        const el=win.element;
        const q=el.querySelector('.g-q'); const list=el.querySelector('.g-list'); const status=el.querySelector('.g-status');

        async function go(){
            const term=q.value.trim();
            if(!term) return;
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('GitHub');return;}
            status.textContent='Loading...'; list.innerHTML='';
            try{
                if(term.startsWith('@')){
                    const login=term.slice(1);
                    const u=await user(login);
                    const repos=await userRepos(login);
                    status.textContent=u.login;
                    list.innerHTML=`<div style="padding:10px;border:1px solid var(--window-border);border-radius:8px;">
                        <div style="display:flex;gap:10px;align-items:center;">
                            ${u.avatar_url?`<img src="${escapeHtml(u.avatar_url)}" width="48" height="48" style="border-radius:50%;">`:''}
                            <div><div style="font-weight:700;font-size:15px;">${escapeHtml(u.name||u.login)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(u.bio||'')}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${u.followers} followers · ${u.public_repos} repos</div></div>
                        </div>
                    </div>`;
                    for(const r of repos){
                        const card=document.createElement('div');
                        card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;';
                        card.innerHTML=`<div style="font-weight:600;font-size:14px;">${escapeHtml(r.name)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.description||'')}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">⭐ ${r.stargazers_count} · ${escapeHtml(r.language||'')} · <a href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener" style="color:var(--accent-color);">Open ↗</a></div>`;
                        list.appendChild(card);
                    }
                } else {
                    const items=await searchRepos(term);
                    status.textContent=`${items.length} repositories`;
                    for(const r of items){
                        const card=document.createElement('div');
                        card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;';
                        card.innerHTML=`<div style="font-weight:600;font-size:14px;">${escapeHtml(r.full_name)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.description||'')}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">⭐ ${r.stargazers_count} · ${escapeHtml(r.language||'')} · <a href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener" style="color:var(--accent-color);">Open ↗</a></div>`;
                        list.appendChild(card);
                    }
                    if(!items.length) list.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">No repositories found.</div>';
                }
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);list.innerHTML='';}
        }
        el.querySelector('.g-go').addEventListener('click',go);
        q.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
        q.focus();
    }
    return {launch};
})();
export default GitHub;
