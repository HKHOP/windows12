// Trello — native offline kanban (replaces iframe wrapper).
import { createApp } from '../../sdk/index.js';

const Trello = (() => {
    const LISTS = ['To Do','Doing','Done'];
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function load(app){try{const raw=app.files.read('board.json');if(raw)return JSON.parse(raw);}catch{}return {lists:LISTS.map(n=>({name:n,cards:[]}))};}
    function save(app,b){app.files.write('board.json',JSON.stringify(b));}

    function launch(){
        const app=createApp({id:'trello',name:'Trello'});
        const board=load(app);
        const win=app.window.create({title:'Trello',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;padding:8px;gap:8px;">
                <div style="display:flex;gap:6px;">
                    <input class="t-in" placeholder="New card..." style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <select class="t-list" style="background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px;font-size:13px;"></select>
                    <button class="t-add" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Add</button>
                </div>
                <div class="t-board" style="flex:1;display:flex;gap:8px;overflow:auto;align-items:flex-start;"></div>
            </div>`,width:640,height:520});
        const el=win.element;
        const input=el.querySelector('.t-in');const listSel=el.querySelector('.t-list');const boardEl=el.querySelector('.t-board');
        for(const l of board.lists){const o=document.createElement('option');o.value=l.name;o.textContent=l.name;listSel.appendChild(o);}

        function render(){
            boardEl.innerHTML='';
            for(const list of board.lists){
                const col=document.createElement('div');
                col.style.cssText='flex:1;min-width:180px;background:rgba(128,128,128,0.08);border:1px solid var(--window-border);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;';
                col.innerHTML=`<div style="font-weight:600;font-size:13px;">${escapeHtml(list.name)}</div>`;
                list.cards.forEach((card, idx) => {
                    const c=document.createElement('div');
                    c.style.cssText='background:var(--window-bg);border:1px solid var(--window-border);border-radius:6px;padding:8px;font-size:13px;';
                    c.textContent=card.text;
                    const mv=document.createElement('select');
                    mv.style.cssText='margin-top:4px;font-size:11px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:4px;padding:2px 4px;';
                    for(const l2 of board.lists){const o=document.createElement('option');o.value=l2.name;o.textContent='→ '+l2.name;if(l2.name===list.name)o.selected=true;mv.appendChild(o);}
                    mv.addEventListener('change',()=>{
                        const target=board.lists.find(x=>x.name===mv.value);
                        if(!target||target===list) return;
                        list.cards.splice(idx,1);
                        target.cards.push({text:card.text});
                        save(app,board);render();
                    });
                    c.appendChild(mv);
                    col.appendChild(c);
                });
                boardEl.appendChild(col);
            }
        }
        // attach object refs
        for(const list of board.lists) for(const c of list.cards) c.obj=c;

        el.querySelector('.t-add').addEventListener('click',()=>{
            const text=input.value.trim();if(!text) return;
            const target=board.lists.find(x=>x.name===listSel.value);
            if(target){target.cards.push({text});save(app,board);input.value='';render();}
        });
        input.addEventListener('keydown',e=>{if(e.key==='Enter')el.querySelector('.t-add').click();});
        render();
        app.shell.activity.trackAppOpen('trello');
    }
    return {launch};
})();
export default Trello;
