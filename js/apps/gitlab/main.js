// GitLab — native project/repo search (public API).
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const GitLab = (() => {
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    async function fetchJson(url){
        const r=await fetch(url,{headers:{'Accept':'application/json'}});
        if(!r.ok)throw new Error('HTTP '+r.status);return r.json();
    }
    async function searchProjects(q){return fetchJson(`https://gitlab.com/api/v4/projects?search=${encodeURIComponent(q)}&per_page=15&order_by=star_count`);}
    async function user(name){return fetchJson(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(name)}`);}
    async function userProjects(uid){return fetchJson(`https://gitlab.com/api/v4/users/${uid}/projects?per_page=15&order_by=updated_at`);}

    function launch(){
        const app=createApp({id:'gitlab',name:'GitLab'});
        const win=app.window.create({title:'GitLab',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--window-border);display:flex;gap:6px;">
                    <input class="g-q" placeholder="Search projects or @username..." style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <button class="g-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Go</button>
                </div>
                <div class="g-status" style="padding:6px 12px;font-size:12px;color:var(--text-secondary);"></div>
                <div class="g-list" style="flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px;"></div>
            </div>`,width:460,height:640});
        const el=win.element;
        const q=el.querySelector('.g-q');const list=el.querySelector('.g-list');const status=el.querySelector('.g-status');

        async function go(){
            const term=q.value.trim();if(!term) return;
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('GitLab');return;}
            status.textContent='Loading...';list.innerHTML='';
            try{
                if(term.startsWith('@')){
                    const users=await user(term.slice(1));
                    const u=(users&&users[0])?users[0]:null;
                    if(!u){status.textContent='User not found';return;}
                    const repos=await userProjects(u.id);
                    status.textContent=u.username;
                    let html=`<div style="padding:10px;border:1px solid var(--window-border);border-radius:8px;">
                        <div style="display:flex;gap:10px;align-items:center;">
                            ${u.avatar_url?`<img src="${escapeHtml(u.avatar_url)}" width="48" height="48" style="border-radius:50%;">`:''}
                            <div><div style="font-weight:700;font-size:15px;">${escapeHtml(u.name||u.username)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(u.bio||'')}</div></div>
                        </div></div>`;
                    list.innerHTML=html;
                    for(const r of (repos||[])){
                        const card=document.createElement('div');
                        card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;';
                        card.innerHTML=`<div style="font-weight:600;font-size:14px;">${escapeHtml(r.name)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.description||'')}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">⭐ ${r.star_count} · ${escapeHtml(r.default_branch||'')} · <a href="${escapeHtml(r.web_url)}" target="_blank" rel="noopener" style="color:var(--accent-color);">Open ↗</a></div>`;
                        list.appendChild(card);
                    }
                } else {
                    const items=await searchProjects(term);
                    status.textContent=`${items.length} projects`;
                    for(const r of items){
                        const card=document.createElement('div');
                        card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;';
                        card.innerHTML=`<div style="font-weight:600;font-size:14px;">${escapeHtml(r.name_with_namespace||r.name)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.description||'')}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">⭐ ${r.star_count} · <a href="${escapeHtml(r.web_url)}" target="_blank" rel="noopener" style="color:var(--accent-color);">Open ↗</a></div>`;
                        list.appendChild(card);
                    }
                    if(!items.length) list.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">No projects found.</div>';
                }
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);list.innerHTML='';}
        }
        el.querySelector('.g-go').addEventListener('click',go);
        q.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
        q.focus();
    }
    return {launch};
})();
export default GitLab;
